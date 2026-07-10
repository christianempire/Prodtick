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

// Read only the tail of a (potentially huge) JSONL transcript.
function readTail(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const { size } = fs.fstatSync(fd);
    const start = Math.max(0, size - TAIL_BYTES);
    const length = size - start;
    const buf = Buffer.alloc(length);
    fs.readSync(fd, buf, 0, length, start);
    let text = buf.toString('utf8');
    if (start > 0) {
      const nl = text.indexOf('\n');
      if (nl !== -1) text = text.slice(nl + 1);
    }
    return text;
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

// Scan the transcript tail. Returns { edited, lastMessage } where `edited` is
// true if any assistant turn in the tail used a file-editing tool. Because Stop
// fires each turn, the edit turn's own tail always contains its tool_use, so a
// task is reliably created on the first edit turn.
function scanTranscript(transcriptPath) {
  const out = { edited: false, lastMessage: null };
  try {
    if (!transcriptPath || !fs.existsSync(transcriptPath)) return out;
    const lines = readTail(transcriptPath).split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (!isAssistant(obj)) continue;
      if (!out.edited) {
        for (const block of contentBlocks(obj)) {
          if (block && block.type === 'tool_use' && EDIT_TOOLS.has(block.name)) {
            out.edited = true;
            break;
          }
        }
      }
      if (!out.lastMessage) {
        const text = extractText(obj);
        if (text) out.lastMessage = text;
      }
    }
  } catch {
    /* best-effort */
  }
  return out;
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
      max_tokens: 60,
      system:
        'You turn a coding assistant transcript into ONE concise past-tense task line ' +
        'describing what was accomplished, at most 16 words. No quotes, no markdown, no trailing period.',
      messages: [{ role: 'user', content: 'Summarize what was done:\n\n' + text.slice(0, 6000) }]
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
  const body = fromPayload || scan.lastMessage || '';
  if (!body) return;

  const summarized = await summarize(body);
  const title = (summarized || body).slice(0, MAX_TITLE);

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
