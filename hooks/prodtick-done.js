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
// Generous, because a single tool_result line can be megabytes and would
// otherwise push this turn's prompt out of the window.
const TAIL_BYTES = 1024 * 1024;
const DIGEST_BUDGET = 6000; // chars of assistant text fed to the summarizer
const MAX_TITLE = 2000;
// A gap longer than this between turns of one session starts a new task.
const SPLIT_GAP_HOURS = Number(process.env.PRODTICK_SPLIT_HOURS) || 6;
const SPLIT_GAP_MS = SPLIT_GAP_HOURS * 60 * 60 * 1000;
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

// Read only the tail of a (potentially enormous — 100MB+) JSONL transcript.
// NEVER stitch a head sample onto the tail: the seam reads as a huge time gap
// and the sample slides forward as the file grows, which would make any segment
// boundary derived from it unstable. Segment identity comes from the state file
// instead; the tail is used only for best-effort recent context.
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
      if (nl !== -1) text = text.slice(nl + 1); // drop partial first line
    }
    return text;
  } finally {
    fs.closeSync(fd);
  }
}

// --- per-session hook state -------------------------------------------------
// Kept OUTSIDE the inbox (the app ingests and deletes every *.json in there).
// Holds the current segment's identity and context so neither survives a
// transcript re-scan: { segmentStart, lastTs, edited, firstUser, lastSummary }.
function stateDir() {
  return path.join(path.dirname(inboxDir()), 'hook-state');
}

function readState(sessionId) {
  try {
    const raw = fs.readFileSync(path.join(stateDir(), sessionId + '.json'), 'utf8');
    const s = JSON.parse(raw);
    return s && typeof s === 'object' ? s : null;
  } catch {
    return null;
  }
}

function writeState(sessionId, state) {
  try {
    const dir = stateDir();
    fs.mkdirSync(dir, { recursive: true });
    const finalPath = path.join(dir, sessionId + '.json');
    const tmpPath = path.join(dir, sessionId + '.' + process.pid + '.tmp');
    fs.writeFileSync(tmpPath, JSON.stringify(state), 'utf8');
    fs.renameSync(tmpPath, finalPath);
  } catch {
    /* best-effort */
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

// Collect the user/assistant turns of a transcript in order, each with its
// timestamp (ms), text, and whether it edited files.
function collectEntries(transcriptPath) {
  const entries = [];
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return entries;
  const lines = readTail(transcriptPath).split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const user = isUser(obj);
    const assistant = !user && isAssistant(obj);
    if (!user && !assistant) continue;
    const ts = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
    let hasEdit = false;
    if (assistant) {
      for (const block of contentBlocks(obj)) {
        if (block && block.type === 'tool_use' && EDIT_TOOLS.has(block.name)) {
          hasEdit = true;
          break;
        }
      }
    }
    entries.push({ role: user ? 'user' : 'assistant', ts, text: extractText(obj), hasEdit });
  }
  return entries;
}

// Read the transcript tail once and expose everything the decision needs:
// the latest turn (its prompt, timestamps, assistant texts) plus the ordered
// entries so the caller can also ask "did anything in THIS SEGMENT edit files?"
// — not just the latest turn. That segment-wide check is what lets a session
// still log when the hook starts tracking it after its editing turn (e.g. the
// hook was updated mid-session), instead of being stuck at edited:false forever.
function scanTail(transcriptPath) {
  const out = { promptTs: NaN, nowTs: NaN, prompt: null, texts: [], entries: [] };
  try {
    const entries = collectEntries(transcriptPath);
    out.entries = entries;
    if (entries.length === 0) return out;

    for (let i = entries.length - 1; i >= 0; i--) {
      if (Number.isFinite(entries[i].ts)) {
        out.nowTs = entries[i].ts;
        break;
      }
    }
    // The turn starts at the last real user prompt (tool-result entries are also
    // role 'user' but carry no text, so they never match).
    let startIdx = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].role === 'user' && entries[i].text) {
        startIdx = i;
        out.prompt = entries[i].text;
        out.promptTs = entries[i].ts;
        break;
      }
    }
    for (const e of entries.slice(startIdx)) {
      if (e.role === 'assistant' && e.text) out.texts.push(e.text);
    }
  } catch {
    /* best-effort */
  }
  return out;
}

// Did any turn edit files at or after the segment start? Entries without a
// timestamp count (best-effort — never suppress on missing data).
function segmentEdited(entries, segmentStart) {
  return entries.some(
    (e) => e.hasEdit && (!Number.isFinite(e.ts) || !Number.isFinite(segmentStart) || e.ts >= segmentStart)
  );
}

// Earliest user prompt at/after the segment start — the segment's own original
// request, recovered from the transcript even on the hook's first run for it.
function segmentFirstUser(entries, segmentStart) {
  for (const e of entries) {
    if (e.role !== 'user' || !e.text) continue;
    if (!Number.isFinite(e.ts) || !Number.isFinite(segmentStart) || e.ts >= segmentStart) return e.text;
  }
  return null;
}

// First run for a session (no saved state): reconstruct where the current
// segment began from the transcript tail by walking back over gaps <= the split
// window. Used ONLY to bootstrap; once state exists it pins segmentStart, so
// this never re-runs per turn (which is what made an earlier version unstable on
// huge, tail-truncated transcripts).
function bootstrapSegmentStart(entries, fallbackTs) {
  const ts = entries.map((e) => e.ts).filter(Number.isFinite);
  if (ts.length === 0) return fallbackTs;
  let start = ts[0];
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] - ts[i - 1] > SPLIT_GAP_MS) start = ts[i]; // last idle gap wins
  }
  return start;
}

// Keep the head and tail of a long string, dropping the middle — preserves both
// how the session started and where it ended up within the token budget.
function clip(s, max) {
  if (s.length <= max) return s;
  const half = Math.max(0, Math.floor(max / 2) - 2);
  return s.slice(0, half) + '\n…\n' + s.slice(s.length - half);
}

// Compose the summarizer input. Carrying the segment's original request and the
// previous summary forward in state keeps the title cumulative without ever
// re-reading a huge transcript.
function buildDigest({ firstUser, lastSummary, texts }) {
  const parts = [];
  if (firstUser) parts.push('Original request that started this task:\n' + firstUser.slice(0, 1500));
  if (lastSummary) parts.push('Summary of the work so far:\n' + lastSummary);
  if (texts.length) {
    parts.push('New work in the latest iteration:\n' + clip(texts.join('\n---\n'), DIGEST_BUDGET));
  }
  return parts.join('\n\n');
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

  const turn = scanTail(data.transcript_path);
  const fromPayload =
    typeof data.last_assistant_message === 'string' && data.last_assistant_message.trim()
      ? data.last_assistant_message.trim()
      : null;
  if (fromPayload && turn.texts.length === 0) turn.texts.push(fromPayload);

  // Everything must stay on ONE clock. A turn's prompt line can be pushed out of
  // the tail by megabyte tool_results, so when it's missing fall back to the
  // turn's END (still transcript time) rather than Date.now() — mixing wall-clock
  // with transcript time compares different clocks and splits on every prompt.
  const nowTs = Number.isFinite(turn.nowTs) ? turn.nowTs : Date.now();
  const promptTs = Number.isFinite(turn.promptTs) ? turn.promptTs : nowTs;

  // Continue the current segment when this prompt arrived within the gap window
  // of the last activity; otherwise this prompt becomes the base of a NEW
  // segment. The window is rolling — every prompt inside it restarts the
  // countdown, so only a real idle gap splits the task.
  const prev = readState(sessionId);
  const continuing = prev && Number.isFinite(prev.lastTs) && promptTs - prev.lastTs <= SPLIT_GAP_MS;

  // segmentStart precedence: pinned by state while continuing; a real >6h gap
  // from known state starts a new segment at this prompt; with NO state at all,
  // reconstruct the current segment from the transcript so edits earlier in it
  // still count on the hook's first run for this session.
  const segmentStart = continuing
    ? prev.segmentStart
    : prev
      ? promptTs
      : bootstrapSegmentStart(turn.entries, promptTs);
  // Prefer the segment's original request recovered from the transcript so the
  // first run for a session doesn't lose how it started.
  const firstUser =
    (continuing && prev.firstUser) || segmentFirstUser(turn.entries, segmentStart) || turn.prompt || null;
  // edited is sticky via state AND checked segment-wide from the transcript, so
  // an editing turn earlier in this segment still counts even if the hook only
  // started tracking the session now (or this particular turn only talked).
  const edited = (continuing && prev.edited === true) || segmentEdited(turn.entries, segmentStart);

  const state = {
    segmentStart,
    lastTs: nowTs,
    edited,
    firstUser,
    lastSummary: continuing ? prev.lastSummary || null : null
  };

  // Always persist state, even when not logging, so the rolling gap stays accurate.
  if (!edited) {
    writeState(sessionId, state);
    return; // pure Q&A / read-only so far
  }

  const digest = buildDigest({ firstUser, lastSummary: state.lastSummary, texts: turn.texts });
  const fallback = firstUser || turn.texts[turn.texts.length - 1] || fromPayload || '';
  const summarized = await summarize(digest || fallback);
  const title = (summarized || fallback).slice(0, MAX_TITLE);
  if (!title) {
    writeState(sessionId, state);
    return;
  }

  // Carry the summary forward so the next iteration builds on it cumulatively
  // without re-reading the transcript.
  if (summarized) state.lastSummary = summarized;
  writeState(sessionId, state);

  // Write the title as raw plain text. Prodtick's inbox treats this field as
  // untrusted and does the one authoritative HTML-escape on ingest; escaping
  // here too would double-escape (e.g. `"` -> `&quot;` -> `&amp;quot;`, which
  // renders as a literal `&quot;`).
  const record = {
    version: 1,
    source: { kind: 'claude-code', sessionId, project, segmentStart },
    html: title,
    completedAt: Date.now()
  };

  try {
    const dir = inboxDir();
    fs.mkdirSync(dir, { recursive: true });
    // One file per (session, segment); each turn in the segment overwrites it.
    const base = sessionId + '-' + segmentStart;
    const finalPath = path.join(dir, base + '.json');
    const tmpPath = path.join(dir, base + '.' + process.pid + '.tmp');
    fs.writeFileSync(tmpPath, JSON.stringify(record), 'utf8');
    fs.renameSync(tmpPath, finalPath); // atomic on same volume; overwrites prior turn
  } catch {
    /* swallow */
  }
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
