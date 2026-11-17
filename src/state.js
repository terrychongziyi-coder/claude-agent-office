import { WebSocket } from 'ws';

const MAX_OUTPUT = 200;

class RingBuffer {
  constructor(max) { this.max = max; this.buf = []; }
  push(item) { this.buf.push(item); if (this.buf.length > this.max) this.buf.shift(); }
  toArray() { return this.buf.slice(); }
}

class Session {
  constructor(id) {
    this.session_id = id;
    this.status = 'idle';
    this.cwd = null;
    this.output = new RingBuffer(MAX_OUTPUT);
    this.pending_permission = null;
    this.first_seen = new Date().toISOString();
    this.last_event = new Date().toISOString();
  }
  toJSON() {
    return {
      session_id: this.session_id,
      status: this.status,
      cwd: this.cwd,
      output: this.output.toArray(),
      pending_permission: this.pending_permission,
      first_seen: this.first_seen,
      last_event: this.last_event,
    };
  }
}

class AppState {
  constructor() {
    this.sessions = new Map();
    this.workers = [];
    this.projects = []; // { name, cwd }
    this.clients = new Set();
  }

  session(id) {
    if (!this.sessions.has(id)) this.sessions.set(id, new Session(id));
    const s = this.sessions.get(id);
    s.last_event = new Date().toISOString();
    return s;
  }

  pushOutput(session_id, entry) {
    this.session(session_id).output.push(entry);
  }

  upsertWorker(w) {
    const i = this.workers.findIndex(x => x.id === w.id);
    if (i >= 0) this.workers[i] = w; else this.workers.push(w);
  }

  deleteWorker(id) {
    this.workers = this.workers.filter(w => w.id !== id);
  }

  addClient(ws) { this.clients.add(ws); }
  removeClient(ws) { this.clients.delete(ws); }

  snapshot() {
    return {
      sessions: [...this.sessions.values()].map(s => s.toJSON()),
      workers: this.workers,
      projects: this.projects,
    };
  }
}

const _state = new AppState();
export function getState() { return _state; }

export function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of _state.clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}
