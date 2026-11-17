import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { loadConfig, saveConfig } from './config.js';
import { getState, broadcast } from './state.js';
import { execFile } from 'child_process';
import { openPlan } from './open.js';
import { mkdir, writeFile } from 'fs/promises';
import { dirname as dirOf } from 'path';
import { uploadPath, MAX_UPLOAD } from './upload.js';
import { addressees, directives, MODEL_IDS, fromUser, handoff } from './chat.js';
import { validateWorker, folderError, moveWorker, isBusy, NAME_RE, sendToWorker, interruptWorker, decide, workerChanged, stopWorker, stopAll } from './runner.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const cfg = await loadConfig();
const TOKEN = cfg.token;
const PORT = Number(process.env.PORT ?? cfg.port ?? 4000);

const ALLOWED_ORIGINS = [
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
];

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(join(__dir, '../public')));

function authToken(req, res, next) {
  const t = req.query.token ?? req.headers['x-ao-token'] ?? '';
  if (t !== TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// Any web page can reach localhost, and these routes drive Claude sessions.
// Non-browser callers (ao-msg) send no Origin header and pass.
function authOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: 'forbidden origin' });
  next();
}

app.use('/api', authToken, authOrigin);

app.get('/api/state', (req, res) => {
  res.json(getState().snapshot());
});

// Records that a worker's conversation exists on disk, so later starts resume it.
async function onSessionStarted(worker, claudeSid) {
  const st = getState();
  const w = st.workers.find(x => x.id === worker.id);
  if (!w) return;
  let changed = false;
  if (!w.resumable) { w.resumable = true; changed = true; }
  if (claudeSid && claudeSid !== w.session_id && claudeSid !== w.resume_id) { w.resume_id = claudeSid; changed = true; }
  if (!changed) return;
  await saveConfig({ workers: st.workers });
  broadcast({ type: 'workers_updated', workers: st.workers });
}

app.post('/api/workers', async (req, res) => {
  const { op, worker } = req.body ?? {};
  const st = getState();
  let saved = null;
  if (op === 'upsert' && worker?.id) {
    if (!worker.cwd) return res.status(400).json({ error: 'Project folder is required.' });
    const prev = st.workers.find(w => w.id === worker.id);
    // Session identity and resume state are owned by the server, not the browser.
    // A worker without a folder came from the tmux version; its old id belongs to that session.
    const own = prev?.cwd ? prev : null;
    if (own && own.cwd !== worker.cwd && isBusy(own.id)) {
      return res.status(409).json({ error: `${own.name} is busy. Stop the task or wait before changing the folder.` });
    }
    const w = { ...worker, cwd: own?.cwd, session_id: own?.session_id, resumable: own?.resumable, resume_id: own?.resume_id, sessions: own?.sessions };
    for (const k of ['cwd', 'session_id', 'resumable', 'resume_id', 'sessions', 'pane']) if (!w[k]) delete w[k];
    moveWorker(w, worker.cwd); // a different folder gets its own conversation
    const err = validateWorker(w);
    if (err) return res.status(400).json({ error: err });
    // Names route chat messages, so they must be unique (case-insensitive).
    if (st.workers.some(x => x.id !== w.id && x.name?.toLowerCase() === w.name.toLowerCase())) {
      return res.status(400).json({ error: `A worker named ${w.name} already exists.` });
    }
    st.upsertWorker(w);
    workerChanged(w);
    saved = w;
  } else if (op === 'delete' && worker?.id) {
    stopWorker(worker.id);
    st.deleteWorker(worker.id);
  } else {
    return res.status(400).json({ error: 'unknown op' });
  }
  await saveConfig({ workers: st.workers });
  broadcast({ type: 'workers_updated', workers: st.workers });
  res.json(saved ? { ok: true, worker: saved } : { ok: true });
});

const note = (w, message) => {
  const entry = { kind: 'notification', message, t: new Date().toISOString() };
  getState().pushOutput(w.session_id, entry);
  broadcast({ type: 'output', session_id: w.session_id, entry });
};
const modelName = id => id ? Object.entries(MODEL_IDS).find(([, v]) => v === id)?.[0] ?? id : 'default';

// settings: { model?, effort? }, undefined = leave as is. A change restarts Claude, which would
// drop a running task, so busy workers are refused.
const differs = (w, settings) => Object.entries(settings).filter(([k, v]) => v !== undefined && (w[k] || '') !== v);

function settingsBlocker(targets, settings) {
  const busy = targets.find(w => differs(w, settings).length && isBusy(w.id));
  return busy && `${busy.name} is busy. Wait or press Stop before changing the ${differs(busy, settings).map(([k]) => k).join(' and ')}.`;
}

// Returns whether anything changed; the caller saves config.
function applySettings(targets, settings) {
  let changed = false;
  for (const w of targets) {
    const diff = differs(w, settings);
    if (!diff.length) continue;
    for (const [k, v] of diff) w[k] = v;
    workerChanged(w); // restarts Claude on the next instruction, keeping the conversation
    note(w, diff.map(([k, v]) => k === 'model' ? `Model set to ${modelName(v)}` : `Effort set to ${v || 'default'}`).join(' · '));
    changed = true;
  }
  return changed;
}

async function saveWorkers() {
  const st = getState();
  await saveConfig({ workers: st.workers });
  broadcast({ type: 'workers_updated', workers: st.workers });
}

// Worker panel. A leading "/model x" or "/effort x" changes settings; "#" stays plain text here.
app.post('/api/send', async (req, res) => {
  const { worker_id, text } = req.body ?? {};
  if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text required' });
  const w = getState().workers.find(x => x.id === worker_id);
  if (!w) return res.status(404).json({ error: 'worker not found' });
  if (!w.cwd) return res.status(400).json({ error: 'Set a project folder for this worker first.' });
  const { model, effort, rest, error } = directives(text, null);
  if (error) return res.status(400).json({ error });
  const blocked = settingsBlocker([w], { model, effort });
  if (blocked) return res.status(409).json({ error: blocked });
  if (applySettings([w], { model, effort })) await saveWorkers();
  if (rest.trim()) { fromUser(w.id); sendToWorker(w, model === undefined && effort === undefined ? text : rest.trim(), onSessionStarted); }
  res.json({ ok: true });
});

// Group chat: the message goes, word for word, to every worker named at its start,
// after moving them to the "#project" if one follows the names.
app.post('/api/chat', async (req, res) => {
  const { text } = req.body ?? {};
  if (!text || typeof text !== 'string' || text.length > 20_000) return res.status(400).json({ error: 'text required (max 20000 characters)' });
  const st = getState();
  const { targets, project, model, effort, message, error } = addressees(text, st.workers, st.projects);
  if (error) return res.status(400).json({ error });
  const blocked = settingsBlocker(targets, { model, effort });
  if (blocked) return res.status(409).json({ error: blocked });
  // All or nothing: check every target before delivering to any.
  for (const w of targets) {
    if (!project && !w.cwd) return res.status(400).json({ error: `${w.name} has no project folder. Name a #project or set a folder in Manage workers.` });
    if (st.sessions.get(w.session_id)?.pending_permission) return res.status(409).json({ error: `${w.name} is waiting for your answer. Respond in ${w.name}'s panel first.` });
    // ponytail: rejects instead of queueing; add a per-worker queue if waiting by hand gets tedious
    if (project && w.cwd !== project.cwd && isBusy(w.id)) return res.status(409).json({ error: `${w.name} is busy in another folder. Wait or press Stop before moving them to #${project.name}.` });
  }
  if (project) {
    const err = folderError(project.cwd);
    if (err) return res.status(400).json({ error: `#${project.name}: ${err}` });
    const moved = targets.filter(w => moveWorker(w, project.cwd));
    for (const w of moved) { workerChanged(w); note(w, `Moved to #${project.name} (${project.cwd})`); }
    if (moved.length) await saveWorkers();
  }
  if (applySettings(targets, { model, effort })) await saveWorkers();
  const entry = { kind: 'you', message: text, chat_id: randomUUID(), t: new Date().toISOString() };
  for (const w of targets) {
    st.pushOutput(w.session_id, entry);
    broadcast({ type: 'output', session_id: w.session_id, entry });
    // ponytail: the full text (names and directives included) goes through, so each worker sees who else was asked
    if (message) { fromUser(w.id); sendToWorker(w, text, onSessionStarted); }
  }
  // Two busy workers in one folder can overwrite each other's edits; warn, don't block.
  const warnings = [...new Set(targets.map(w => w.cwd))].map(cwd => st.workers.filter(x => x.cwd === cwd && isBusy(x.id)).map(x => x.name))
    .filter(names => names.length > 1).map(names => `${names.join(' and ')} are working in the same folder; their edits can collide.`);
  res.json({ ok: true, to: targets.map(w => w.name), warnings });
});

// File dropped or pasted into a message box. Body is the raw file; ?name= is the original name.
app.post('/api/upload', express.raw({ type: () => true, limit: MAX_UPLOAD }), async (req, res) => {
  if (!Buffer.isBuffer(req.body)) return res.status(400).json({ error: 'Empty file.' });
  const path = uploadPath(req.query.name);
  await mkdir(dirOf(path), { recursive: true });
  await writeFile(path, req.body, { flag: 'wx' });
  res.json({ ok: true, path });
});

// Opens a path from a chat link on this Mac: documents in their default app, anything else revealed in Finder.
app.post('/api/open', (req, res) => {
  if (process.platform !== 'darwin') return res.status(501).json({ error: 'Opening files is supported on macOS only.' });
  const plan = openPlan(req.body?.path);
  if (plan.error) return res.status(400).json({ error: plan.error });
  execFile('open', plan.args, err => err
    ? res.status(500).json({ error: `Could not open: ${err.message}` })
    : res.json({ ok: true, revealed: plan.revealed }));
});

app.post('/api/projects', async (req, res) => {
  const { op, project } = req.body ?? {};
  const st = getState();
  const name = String(project?.name ?? '').trim();
  const same = p => p.name.toLowerCase() === name.toLowerCase();
  if (op === 'upsert') {
    const cwd = String(project?.cwd ?? '').trim();
    const err = !NAME_RE.test(name) ? 'Project name must be one word of up to 20 letters, digits, _ or -.' : folderError(cwd);
    if (err) return res.status(400).json({ error: err });
    const i = st.projects.findIndex(same);
    if (i >= 0) st.projects[i] = { name, cwd }; else st.projects.push({ name, cwd });
  } else if (op === 'delete') {
    st.projects = st.projects.filter(p => !same(p));
  } else {
    return res.status(400).json({ error: 'unknown op' });
  }
  await saveConfig({ projects: st.projects });
  broadcast({ type: 'projects_updated', projects: st.projects });
  res.json({ ok: true });
});

app.post('/api/interrupt', (req, res) => {
  const { worker_id } = req.body ?? {};
  if (!worker_id) return res.status(400).json({ error: 'worker_id required' });
  res.json(interruptWorker(worker_id) ? { ok: true } : { ok: false, error: 'not running' });
});

// Inter-agent message (tools/ao-msg.js). Hop count guards against message loops.
app.post('/api/message', (req, res) => {
  const { from_worker_id, from_session_id, to_worker_name, text, hop } = req.body ?? {};
  if (!to_worker_name || !text || typeof text !== 'string' || text.length > 20_000) return res.status(400).json({ error: 'to_worker_name and text (max 20000 characters) required' });
  const st = getState();
  const target = st.workers.find(w => w.name?.toLowerCase() === String(to_worker_name).toLowerCase() && w.cwd);
  if (!target) return res.status(404).json({ error: 'worker not found or has no project folder' });
  if (st.sessions.get(target.session_id)?.pending_permission) {
    return res.status(409).json({ error: `${target.name} is waiting for the user's answer to a permission prompt. Try again later.` });
  }
  const from = st.workers.find(w => (from_worker_id && w.id === from_worker_id) || (from_session_id && w.session_id === from_session_id));
  if (!handoff(from?.id, target.id, hop)) return res.status(429).json({ error: 'max_hops_exceeded' });
  const header = from ? `[Message from ${from.name}${from.role ? ` (${from.role})` : ''}, your teammate in agent-office]` : '[Message via agent-office]';
  const entry = { kind: 'handoff', from: from?.name ?? null, to: target.name, message: text, t: new Date().toISOString() };
  st.pushOutput(target.session_id, entry);
  broadcast({ type: 'output', session_id: target.session_id, entry });
  sendToWorker(target, `${header}\n${text}`, onSessionStarted);
  res.json({ ok: true });
});

// Permission or question answer from the browser.
app.post('/api/decision', (req, res) => {
  const { request_id, behavior, answers } = req.body ?? {};
  if (!request_id) return res.status(400).json({ error: 'request_id required' });
  // answers: { [question text]: chosen label(s) } for AskUserQuestion.
  const okAnswers = answers && typeof answers === 'object' && !Array.isArray(answers)
    && Object.values(answers).every(v => typeof v === 'string' && v.length <= 2000);
  if (answers != null && !okAnswers) return res.status(400).json({ error: 'answers must map question text to a string' });
  if (!decide(request_id, behavior === 'allow' ? 'allow' : 'deny', answers ?? undefined)) {
    return res.status(404).json({ error: 'no pending request with that id' });
  }
  res.json({ ok: true });
});

// Body too large (uploads over MAX_UPLOAD, JSON over 2 MB) or malformed: answer in JSON for the UI.
app.use((err, req, res, next) => {
  if (!err) return next();
  res.status(err.status || 500).json({ error: err.type === 'entity.too.large' ? `File too large (max ${MAX_UPLOAD / 1024 / 1024} MB).` : err.message });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.searchParams.get('token') !== TOKEN) { ws.close(4001, 'unauthorized'); return; }
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) { ws.close(4003, 'forbidden'); return; }
  const st = getState();
  st.addClient(ws);
  ws.send(JSON.stringify({ type: 'state', ...st.snapshot() }));
  ws.on('close', () => st.removeClient(ws));
  ws.on('error', () => st.removeClient(ws));
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopAll(); process.exit(0); });

if (Array.isArray(cfg.projects)) getState().projects = cfg.projects;
if (Array.isArray(cfg.workers)) {
  for (const w of cfg.workers) getState().upsertWorker(w);
}

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('agent-office started');
  console.log(`  UI: http://127.0.0.1:${PORT}/?token=${TOKEN}`);
  console.log('');
});
