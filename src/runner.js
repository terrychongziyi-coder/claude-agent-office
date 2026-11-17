// Runs one headless Claude Code process per worker and maps its stream-json
// output onto the shared session state the UI already understands.
import { spawn } from 'child_process';
import { statSync } from 'fs';
import { isAbsolute } from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { getState, broadcast } from './state.js';
import { UPLOADS } from './upload.js';

export const MODES = ['auto', 'manual', 'plan', 'acceptEdits'];
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']; // claude --effort; unset = the user's default
const runners = new Map(); // worker id -> Runner
const AO_MSG = fileURLToPath(new URL('../tools/ao-msg.js', import.meta.url));
export const NAME_RE = /^[\p{L}\p{N}_-]{1,20}$/u; // single word, so "@Name" and "Name," can address it

// ponytail: teammate list is fixed at process start; it refreshes on the next restart, not live.
function identityPrompt(w) {
  const mates = getState().workers.filter(x => x.id !== w.id && x.cwd).map(x => `${x.name} (${x.role || 'no role'})`);
  return [
    `You are ${w.name}${w.role ? `, the ${w.role},` : ''} a worker in agent-office, a shared office of Claude Code sessions run by one user.`,
    `When the user addresses "${w.name}", they mean you. Answer as ${w.name}.`,
    mates.length ? `Your teammates: ${mates.join(', ')}.` : 'You have no teammates yet.',
    `To hand a teammate work, run: node ${AO_MSG} <teammate-name> "<message>". Only do this when the user asks you to involve a teammate.`,
  ].join('\n');
}

const ts = () => new Date().toISOString();
const clip = (s, max) => { s = typeof s === 'string' ? s : JSON.stringify(s ?? ''); return s.length > max ? s.slice(0, max) + '…' : s; };

export function folderError(cwd) {
  if (!cwd || !isAbsolute(cwd)) return 'Project folder must be an absolute path.';
  try { if (!statSync(cwd).isDirectory()) return 'Project folder is not a directory.'; } catch { return 'Project folder does not exist.'; }
  return null;
}

// Values become CLI arguments, so nothing may look like a flag.
export function validateWorker(w) {
  const folder = folderError(w.cwd);
  if (folder) return folder;
  if (!NAME_RE.test(w.name ?? '')) return 'Name must be one word of up to 20 letters, digits, _ or -.';
  if (w.mode && !MODES.includes(w.mode)) return 'Unknown permission mode.';
  if (w.effort && !EFFORTS.includes(w.effort)) return 'Unknown effort level.';
  if (w.model && !/^[A-Za-z0-9][A-Za-z0-9._\-[\]]{0,63}$/.test(w.model)) return 'Invalid model name.';
  if (w.session_id && !/^[0-9a-f-]{36}$/i.test(w.session_id)) return 'Invalid session id.';
  return null;
}

// One conversation per worker per folder: park the current one, then pick up the folder's own (or start one).
// Mutates w; the caller saves config and calls workerChanged().
export function moveWorker(w, cwd) {
  if (w.cwd === cwd) return false;
  const sessions = { ...w.sessions };
  if (w.cwd && w.session_id) sessions[w.cwd] = { session_id: w.session_id, resumable: w.resumable, resume_id: w.resume_id };
  const next = sessions[cwd] ?? { session_id: randomUUID() };
  delete sessions[cwd];
  Object.assign(w, { cwd, sessions, session_id: next.session_id, resumable: next.resumable, resume_id: next.resume_id });
  for (const k of ['resumable', 'resume_id']) if (!w[k]) delete w[k];
  if (!Object.keys(w.sessions).length) delete w.sessions;
  return true;
}

class Runner {
  constructor(worker, onSessionStarted) {
    this.worker = { ...worker }; // settings this process was started with; workerChanged() compares against them
    this.sid = worker.session_id;
    this.onSessionStarted = onSessionStarted;
    this.pending = new Map(); // request_id -> tool input
    this.interrupting = false;
    this.restartWhenIdle = false;
    this.busy = false;
    this.toolsThisTurn = false;
    this.stderr = '';
    this.buf = '';
    const w = worker;
    const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--include-partial-messages', '--permission-prompts', 'host', '--permission-prompt-tool', 'stdio',
      '--permission-mode', w.mode || 'auto',
      // Handoffs need no permission prompt; ao-msg is rate-limited and hop-guarded.
      // ponytail: rule breaks if the install path contains spaces; quote-aware rule if that happens
      '--allowedTools', `Bash(node ${AO_MSG} *)`,
      '--add-dir', UPLOADS, // files dropped into chat
      // snapshot off: identity applies to conversations started before it existed, and to renames
      '--append-system-prompt', identityPrompt(w), '--system-prompt-snapshot', 'off'];
    if (w.model) args.push('--model', w.model);
    if (w.effort) args.push('--effort', w.effort);
    args.push(...(w.resumable ? ['--resume', w.resume_id || this.sid] : ['--session-id', this.sid]));
    this.toolNames = new Map(); // tool_use_id -> tool name
    // AO_WORKER_ID tells ao-msg who is sending.
    this.proc = spawn('claude', args, { cwd: w.cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, AO_WORKER_ID: w.id } });
    this.proc.stdout.on('data', d => this.onData(d));
    this.proc.stderr.on('data', d => { this.stderr = (this.stderr + d).slice(-2000); });
    this.proc.on('error', e => this.onExit(null, e.message));
    this.proc.on('exit', code => this.onExit(code));
    this.proc.stdin.on('error', () => {});
    const s = getState().session(this.sid);
    s.cwd = w.cwd;
  }

  write(obj) { if (this.proc.stdin.writable) this.proc.stdin.write(JSON.stringify(obj) + '\n'); }

  setStatus(status) {
    getState().session(this.sid).status = status;
    broadcast({ type: 'status', session_id: this.sid, status });
  }

  push(entry) {
    entry.t ??= ts();
    getState().pushOutput(this.sid, entry);
    broadcast({ type: 'output', session_id: this.sid, entry });
  }

  send(text) {
    this.busy = true;
    this.toolsThisTurn = false;
    this.write({ type: 'user', message: { role: 'user', content: text } });
    this.setStatus('working');
  }

  interrupt() {
    if (!this.busy) return false;
    this.interrupting = true;
    for (const id of [...this.pending.keys()]) this.decide(id, 'deny');
    this.write({ type: 'control_request', request_id: `int-${Date.now()}`, request: { subtype: 'interrupt' } });
    return true;
  }

  decide(request_id, behavior, answers) {
    const input = this.pending.get(request_id);
    if (input === undefined) return false;
    this.pending.delete(request_id);
    const response = behavior === 'allow'
      ? { behavior: 'allow', updatedInput: answers ? { ...input, answers } : input }
      : { behavior: 'deny', message: 'Denied by the user in agent-office.' };
    this.write({ type: 'control_response', response: { subtype: 'success', request_id, response } });
    const s = getState().session(this.sid);
    s.pending_permission = null;
    s.status = behavior === 'allow' ? 'working' : (this.busy ? 'working' : 'idle');
    broadcast({ type: 'permission_resolved', session_id: this.sid, request_id, behavior, status: s.status });
    return true;
  }

  onData(d) {
    this.buf += d;
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i);
      this.buf = this.buf.slice(i + 1);
      if (!line.trim()) continue;
      let m;
      try { m = JSON.parse(line); } catch { continue; }
      this.onMessage(m);
    }
  }

  onMessage(m) {
    switch (m.type) {
      case 'system':
        if (m.subtype === 'init') this.onSessionStarted(this.worker, m.session_id);
        return;
      case 'stream_event': {
        const d = m.event?.delta;
        if (d?.type === 'text_delta' && !m.parent_tool_use_id) broadcast({ type: 'delta', session_id: this.sid, text: d.text });
        return;
      }
      case 'assistant':
        if (m.parent_tool_use_id) return; // subagent internals
        for (const b of m.message?.content ?? []) {
          if (b.type === 'text' && b.text?.trim()) this.push({ kind: 'text', message: clip(b.text, 20_000) });
          if (b.type === 'tool_use') { this.toolsThisTurn = true; this.toolNames.set(b.id, b.name); this.push({ kind: 'tool_start', tool_name: b.name, input: clip(b.input, 300) }); }
        }
        return;
      case 'user':
        if (m.parent_tool_use_id) return;
        for (const b of Array.isArray(m.message?.content) ? m.message.content : []) {
          if (b.type !== 'tool_result') continue;
          const content = Array.isArray(b.content) ? b.content.map(c => c.text ?? '').join('\n') : b.content;
          this.push({ kind: b.is_error ? 'tool_fail' : 'tool_done', tool_name: this.toolNames.get(b.tool_use_id) ?? '', output: clip(content, 300) });
        }
        return;
      case 'control_request':
        if (m.request?.subtype === 'can_use_tool') {
          const r = m.request;
          this.pending.set(m.request_id, r.input ?? {});
          const perm = { request_id: m.request_id, tool_name: r.tool_name, tool_input: r.input ?? null, cwd: this.worker.cwd, requested_at: ts() };
          const s = getState().session(this.sid);
          s.pending_permission = perm;
          s.status = 'waiting';
          broadcast({ type: 'status', session_id: this.sid, status: 'waiting' });
          broadcast({ type: 'permission_request', session_id: this.sid, ...perm });
        } else {
          // ponytail: other host requests are not supported; answer so Claude does not hang
          this.write({ type: 'control_response', response: { subtype: 'error', request_id: m.request_id, error: 'unsupported' } });
        }
        return;
      case 'result': {
        this.busy = false;
        if (this.interrupting) {
          this.interrupting = false;
          this.push({ kind: 'notification', message: 'Stopped by you.' });
          this.setStatus('idle');
        } else if (m.is_error) {
          this.push({ kind: 'tool_fail', tool_name: '', output: clip((m.errors ?? []).join('; ') || m.subtype, 300) });
          this.setStatus('error');
        } else {
          this.setStatus(this.toolsThisTurn ? 'done' : 'idle');
        }
        if (this.restartWhenIdle) this.proc.kill();
        return;
      }
      default:
    }
  }

  onExit(code, err) {
    if (runners.get(this.worker.id) === this) runners.delete(this.worker.id);
    const s = getState().session(this.sid);
    s.pending_permission = null;
    if (this.restartWhenIdle && !err) return; // restarts on the next instruction with new settings
    if (code === 0 && !this.busy) return;
    const why = err || this.stderr.trim().split('\n').pop() || `exit code ${code}`;
    this.push({ kind: 'tool_fail', tool_name: '', output: clip(`Claude session ended: ${why}`, 300) });
    this.setStatus('error');
  }
}

export function sendToWorker(worker, text, onSessionStarted) {
  let r = runners.get(worker.id);
  if (!r) { r = new Runner(worker, onSessionStarted); runners.set(worker.id, r); }
  r.send(text);
}

export const interruptWorker = id => runners.get(id)?.interrupt() ?? false;

export function decide(request_id, behavior, answers) {
  for (const r of runners.values()) if (r.decide(request_id, behavior, answers)) return true;
  return false;
}

// Model, effort, mode, folder, name or role changed: restart on the next instruction (resuming the conversation).
export function workerChanged(worker) {
  const r = runners.get(worker.id);
  if (!r) return;
  const o = r.worker;
  if (['model', 'effort', 'mode', 'cwd', 'name', 'role'].every(k => (o[k] || '') === (worker[k] || ''))) return;
  r.restartWhenIdle = true;
  if (!r.busy) stopWorker(worker.id); // drop it now so an instruction sent right after starts a fresh process
}

export const isBusy = id => !!runners.get(id)?.busy;

export function stopWorker(id) {
  const r = runners.get(id);
  if (!r) return;
  r.restartWhenIdle = true;
  r.proc.kill();
  runners.delete(id);
}

export function stopAll() { for (const r of runners.values()) r.proc.kill(); }
