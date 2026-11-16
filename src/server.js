import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadConfig, saveConfig } from './config.js';
import { handleHook, pendingDecisions } from './hooks.js';
import { getState, broadcast } from './state.js';
import { sendToPane } from './tmux.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const cfg = await loadConfig();
const TOKEN = cfg.token;
const PORT = Number(process.env.PORT ?? cfg.port ?? 4000);

// Allowed origins: browser will send one of these; hook HTTP calls will not
// send Origin at all, which we also allow on the hook endpoint only.
const ALLOWED_ORIGINS = [
  `http://127.0.0.1:${PORT}`,
  `http://localhost:${PORT}`,
];

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(join(__dir, '../public')));

// Token check for all requests.
function authToken(req, res, next) {
  const t = req.query.token ?? req.headers['x-ao-token'] ?? '';
  if (t !== TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// Origin check for browser-originated requests.
// Hook calls (from Claude Code or register-pane.sh) do not send Origin.
function authOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'forbidden origin' });
  }
  next();
}

// Hook endpoint — receives events from Claude Code (HTTP hooks) and
// from register-pane.sh (pane registration).
// No Origin check: these are non-browser callers on localhost.
app.post('/hook', authToken, async (req, res) => {
  try {
    await handleHook(req.body, res);
  } catch (err) {
    console.error('Hook handler error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'internal' });
  }
});

// Pane registration from register-pane.sh.
app.post('/api/pane', authToken, (req, res) => {
  const { session_id, pane, cwd } = req.body ?? {};
  if (!session_id || !pane) return res.status(400).json({ error: 'session_id and pane required' });
  getState().registerPane(session_id, pane, cwd);
  broadcast({ type: 'pane_registered', session_id, pane, cwd });
  res.json({ ok: true });
});

// Full state snapshot (browser uses this on reconnect).
app.get('/api/state', authToken, authOrigin, (req, res) => {
  res.json(getState().snapshot());
});

// Worker configuration CRUD.
app.post('/api/workers', authToken, authOrigin, async (req, res) => {
  const { op, worker } = req.body ?? {};
  if (!op) return res.status(400).json({ error: 'op required' });
  const st = getState();
  if (op === 'upsert' && worker) st.upsertWorker(worker);
  else if (op === 'delete' && worker?.id) st.deleteWorker(worker.id);
  else return res.status(400).json({ error: 'unknown op' });
  await saveConfig({ workers: st.workers });
  broadcast({ type: 'workers_updated', workers: st.workers });
  res.json({ ok: true });
});

// Assign a detected session to a worker.
app.post('/api/assign', authToken, authOrigin, async (req, res) => {
  const { worker_id, session_id } = req.body ?? {};
  if (!worker_id || !session_id) return res.status(400).json({ error: 'worker_id and session_id required' });
  const st = getState();
  const w = st.workers.find(x => x.id === worker_id);
  if (!w) return res.status(404).json({ error: 'worker not found' });
  w.session_id = session_id;
  await saveConfig({ workers: st.workers });
  broadcast({ type: 'workers_updated', workers: st.workers });
  res.json({ ok: true });
});

// Send instruction to a session via tmux.
app.post('/api/send', authToken, authOrigin, async (req, res) => {
  const { session_id, text } = req.body ?? {};
  if (!session_id || !text) return res.status(400).json({ error: 'session_id and text required' });
  const pane = getState().getPane(session_id);
  if (!pane) return res.status(404).json({ error: 'no pane bound; start session inside tmux' });
  const result = await sendToPane(pane, text);
  res.json(result);
});

// Inter-agent message (M4).
app.post('/api/message', authToken, authOrigin, async (req, res) => {
  const { from_session_id, to_worker_name, text, hop } = req.body ?? {};
  if (!to_worker_name || !text) return res.status(400).json({ error: 'to_worker_name and text required' });

  // Loop guard: max 3 hops per message chain.
  const hopCount = Number(hop ?? 0);
  if (hopCount >= 3) return res.status(429).json({ error: 'max_hops_exceeded' });

  const st = getState();
  const target = st.workers.find(w =>
    w.name?.toLowerCase() === to_worker_name.toLowerCase() && w.session_id
  );
  if (!target) return res.status(404).json({ error: 'worker not found or not bound' });
  const pane = st.getPane(target.session_id);
  if (!pane) return res.status(404).json({ error: 'target pane not bound' });

  const prefix = from_session_id ? `[${from_session_id.slice(0, 6)}->] ` : '[msg] ';
  const result = await sendToPane(pane, prefix + text);
  res.json(result);
});

// Permission decision from the browser.
app.post('/api/decision', authToken, authOrigin, (req, res) => {
  const { request_id, behavior } = req.body ?? {};
  if (!request_id) return res.status(400).json({ error: 'request_id required' });
  const pending = pendingDecisions.get(request_id);
  if (!pending) return res.status(404).json({ error: 'no pending request with that id' });
  pending.resolve(behavior === 'allow' ? 'allow' : 'deny');
  pendingDecisions.delete(request_id);
  res.json({ ok: true });
});

// WebSocket
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://127.0.0.1`);

  // Token check
  if (url.searchParams.get('token') !== TOKEN) {
    ws.close(4001, 'unauthorized');
    return;
  }

  // Origin check
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    ws.close(4003, 'forbidden');
    return;
  }

  const st = getState();
  st.addClient(ws);

  // Send full state immediately on connect.
  ws.send(JSON.stringify({ type: 'state', ...st.snapshot() }));

  ws.on('close', () => st.removeClient(ws));
  ws.on('error', () => st.removeClient(ws));
});

// Load persisted workers from config.
if (Array.isArray(cfg.workers)) {
  for (const w of cfg.workers) getState().upsertWorker(w);
}

server.listen(PORT, '127.0.0.1', () => {
  const hookUrl = `http://127.0.0.1:${PORT}/hook?token=${TOKEN}`;
  const uiUrl   = `http://127.0.0.1:${PORT}/?token=${TOKEN}`;

  console.log('');
  console.log('agent-office started');
  console.log(`  UI:       ${uiUrl}`);
  console.log(`  Hook URL: ${hookUrl}`);
  console.log(`  Token:    ${TOKEN}`);
  console.log('');
  console.log('Add the following to your Claude Code settings');
  console.log('(~/.claude/settings.json or .claude/settings.local.json):');
  console.log('');
  console.log(JSON.stringify({
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: join(__dir, '../hooks/register-pane.sh') }] }],
      PreToolUse:        [{ matcher: '*', hooks: [{ type: 'http', url: hookUrl, timeout: 10000 }] }],
      PostToolUse:       [{ matcher: '*', hooks: [{ type: 'http', url: hookUrl, timeout: 10000 }] }],
      PostToolUseFailure:[{ matcher: '*', hooks: [{ type: 'http', url: hookUrl, timeout: 10000 }] }],
      PermissionRequest: [{ hooks: [{ type: 'http', url: hookUrl, timeout: 120000 }] }],
      Notification:      [{ hooks: [{ type: 'http', url: hookUrl, timeout: 10000 }] }],
      Stop:              [{ hooks: [{ type: 'http', url: hookUrl, timeout: 10000 }] }],
      StopFailure:       [{ hooks: [{ type: 'http', url: hookUrl, timeout: 10000 }] }],
      SessionEnd:        [{ hooks: [{ type: 'http', url: hookUrl, timeout: 10000 }] }],
    },
    allowedHttpHookUrls: [`http://127.0.0.1:${PORT}`],
  }, null, 2));
  console.log('');
});
