'use strict';
// Prodtick "task done" hook for Claude Code.
//
// Claude Code invokes this on the `Stop` event via:
//   { "type": "command", "command": "node", "args": ["<abs>/hooks/prodtick-done.js", "--inbox", "<dir>"] }
// and pipes the event JSON on stdin. When a session that actually edited files
// finishes a turn, we write a per-session record into Prodtick's inbox folder;
// the running app drains it into a COMPLETED task (creating it the first time,
// updating it on later iterations of the same session).
//
// IRON RULES (mirrors psst):
//   1. ALWAYS exit 0 and never throw — a Stop hook that errors could block Claude.
//   2. Everything is best-effort; any failure just means no task is logged.
//
// Zero dependencies (Node built-ins only), so it runs under the user's own node.

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;
const TAIL_BYTES = 512 * 1024;
const HEAD_BYTES = 128 * 1024;
const MAX_FULL_BYTES = 4 * 1024 * 1024; // read whole transcript up to this size
const DIGEST_BUDGET = 6000; // chars of assistant text fed to the summarizer
const MAX_TITLE = 2000;
const SUMMARY_MODEL = process.env.PRODTICK_SUMMARY_MODEL || 'claude-haiku-4-5';

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

// --- inbox dir: --inbox arg wins, then env, else default Windows userData ---
function inboxDir() {
  // electron-store productName = "Prodtick" -> %APPDATA%\Prodtick.
  return (
    argValue('--inbox') ||
    process.env.PRODTICK_INBOX ||
    path.join(os.homedir(), 'AppData', 'Roaming', 'Prodtick', 'inbox')
  );
}

// Pull a single KEY=value out of a .env-style file (quotes stripped). Used to
// reuse an existing ANTHROPIC_API_KEY (e.g. psst's .env) without duplicating the
// secret into the system environment. Best-effort — returns null on any problem.
function readEnvFileKey(file, name) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && m[1] === name) {
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v || null;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

// The environment Claude Code runs hooks in usually won't have ANTHROPIC_API_KEY,
// so fall back to an --env-file (baked by the installer, e.g. a sibling psst/.env).
function resolveApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const envFile = argValue('--env-file') || process.env.PRODTICK_ENV_FILE;
  return envFile ? readEnvFileKey(envFile, 'ANTHROPIC_API_KEY') : null;
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve(data);
      }
    };
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (c) => (data += c));
      process.stdin.on('end', done);
      process.stdin.on('error', done);
      setTimeout(done, 5000).unref();
    } catch {
      done();
    }
  });
}

// Read the transcript for scanning. Whole file when small enough; otherwise the
// head (holds the original request) plus the tail (holds recent work + edits),
// so a cumulative summary never loses how the session started. A partial line at
// the head/tail seam just fails JSON.parse and is skipped.
function readForScan(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const { size } = fs.fstatSync(fd);
    if (size <= MAX_FULL_BYTES) {
      const buf = Buffer.alloc(size);
      fs.readSync(fd, buf, 0, size, 0);
      return buf.toString('utf8');
    }
    const head = Buffer.alloc(HEAD_BYTES);
    fs.readSync(fd, head, 0, HEAD_BYTES, 0);
    const tail = Buffer.alloc(TAIL_BYTES);
    fs.readSync(fd, tail, 0, TAIL_BYTES, size - TAIL_BYTES);
    let tailText = tail.toString('utf8');
    const nl = tailText.indexOf('\n');
    if (nl !== -1) tailText = tailText.slice(nl + 1);
    return head.toString('utf8') + '\n' + tailText;
  } finally {
    fs.closeSync(fd);
  }
}

function isAssistant(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.type === 'assistant') return true;
  if (obj.message && obj.message.role === 'assistant') return true;
  return false;
}

function isUser(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.type === 'user') return true;
  if (obj.message && obj.message.role === 'user') return true;
  return false;
}

function contentBlocks(obj) {
  const message = obj.message || obj;
  return Array.isArray(message.content) ? message.content : [];
}

function extractText(obj) {
  const message = obj.message || obj;
  const content = message.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (typeof block === 'string') parts.push(block);
    else if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
  }
  return parts.join('\n').trim();
}

// Scan the whole session (top to bottom). Returns the original request
// (`firstUser`), every assistant text turn (`assistantTexts`), the latest one
// (`lastMessage`), and whether any turn edited files (`edited`). Scanning the
// full session — not just the last turn — is what lets an iteration's summary
// reflect the original task instead of replacing it.
function scanTranscript(transcriptPath) {
  const out = { edited: false, firstUser: null, assistantTexts: [], lastMessage: null };
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return out;
    const lines = readForScan(transcriptPath).split('\n');
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (isUser(obj)) {
        if (!out.firstUser) {
          const text = extractText(obj); // tool-result-only user turns yield '' and are skipped
          if (text) out.firstUser = text;
        }
        continue;
      }
      if (!isAssistant(obj)) continue;
      for (const block of contentBlocks(obj)) {
        if (block && block.type === 'tool_use' && EDIT_TOOLS.has(block.name)) {
          out.edited = true;
          break;
        }
      }
      const text = extractText(obj);
      if (text) {
        out.assistantTexts.push(text);
        out.lastMessage = text;
      }
    }
  } catch {
    /* best-effort */
  }
  return out;
}

// Keep the head and tail of a long string, dropping the middle — preserves both
// how the session started and where it ended up within the token budget.
function clip(s, max) {
  if (s.length <= max) return s;
  const half = Math.max(0, Math.floor(max / 2) - 2);
  return s.slice(0, half) + '\n…\n' + s.slice(s.length - half);
}

// Compose the summarizer input from the original request plus everything the
// assistant reported across the session, so the summary is cumulative.
function buildDigest(scan) {
  const parts = [];
  if (scan.firstUser) parts.push('Original request:\n' + scan.firstUser.slice(0, 1500));
  if (scan.assistantTexts.length) {
    parts.push(
      'What the assistant reported across the session (oldest to newest):\n' +
        clip(scan.assistantTexts.join('\n---\n'), DIGEST_BUDGET)
    );
  }
  return parts.join('\n\n');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '<br>');
}

// Optional AI title. Resolves to null on no key / any failure, so the caller
// falls back to the raw last message. Uses a plain Messages API call.
function summarize(text) {
  return new Promise((resolve) => {
    const key = resolveApiKey();
    if (!key || !text) return resolve(null);
    const payload = JSON.stringify({
      model: SUMMARY_MODEL,
      max_tokens: 90,
      system:
        'You summarize an entire coding session for a task tracker. Given the original request and ' +
        'what the assistant did across one or more iterations, write ONE concise past-tense line naming ' +
        'the overall task and what was accomplished. Anchor on the original goal and fold in later ' +
        'iterations; do not describe only the most recent change. At most ~25 words. ' +
        'No quotes, no markdown, no trailing period.',
      messages: [{ role: 'user', content: text.slice(0, 8000) }]
    });
    let settled = false;
    const finish = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const req = https.request(
        {
          method: 'POST',
          hostname: 'api.anthropic.com',
          path: '/v1/messages',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'content-length': Buffer.byteLength(payload)
          }
        },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            if (res.statusCode < 200 || res.statusCode >= 300) return finish(null);
            try {
              const json = JSON.parse(body);
              const block = Array.isArray(json.content)
                ? json.content.find((b) => b && b.type === 'text')
                : null;
              const line = block && typeof block.text === 'string'
                ? block.text.split('\n').map((l) => l.trim()).find(Boolean)
                : null;
              finish(line ? line.replace(/^["'*`\s]+|["'*`\s]+$/g, '') : null);
            } catch {
              finish(null);
            }
          });
        }
      );
      req.on('error', () => finish(null));
      req.setTimeout(8000, () => {
        req.destroy();
        finish(null);
      });
      req.write(payload);
      req.end();
    } catch {
      finish(null);
    }
  });
}

async function main() {
  const raw = await readStdin();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

  if (data.hook_event_name && data.hook_event_name !== 'Stop') return;
  if (data.stop_hook_active) return; // re-entrant Stop -> avoid loops
  if (data.agent_id || data.agent_type) return; // subagent, not a real finish

  const sessionId = typeof data.session_id === 'string' ? data.session_id : '';
  if (!sessionId || !SESSION_ID_RE.test(sessionId)) return;
  const project = data.cwd ? path.basename(data.cwd) : 'unknown';

  const scan = scanTranscript(data.transcript_path);
  if (!scan.edited) return; // skip pure Q&A / read-only sessions

  const fromPayload =
    typeof data.last_assistant_message === 'string' && data.last_assistant_message.trim()
      ? data.last_assistant_message.trim()
      : null;
  if (fromPayload && !scan.lastMessage) scan.lastMessage = fromPayload;

  // AI summarizes the whole session (original request + all iterations). Without
  // a key, fall back to the original request so the first task is never lost;
  // only if there is none do we use the latest message.
  const digest = buildDigest(scan);
  const fallback = scan.firstUser || scan.lastMessage || fromPayload || '';
  const summarized = await summarize(digest || fallback);
  const title = (summarized || fallback).slice(0, MAX_TITLE);
  if (!title) return;

  const record = {
    version: 1,
    source: { kind: 'claude-code', sessionId, project },
    html: escapeHtml(title),
    completedAt: Date.now()
  };

  try {
    const dir = inboxDir();
    fs.mkdirSync(dir, { recursive: true });
    const finalPath = path.join(dir, sessionId + '.json');
    const tmpPath = path.join(dir, sessionId + '.' + process.pid + '.tmp');
    fs.writeFileSync(tmpPath, JSON.stringify(record), 'utf8');
    fs.renameSync(tmpPath, finalPath); // atomic on same volume; overwrites prior turn
  } catch {
    /* swallow */
  }
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
