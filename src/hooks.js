import { randomUUID } from 'crypto';
import { getState, broadcast } from './state.js';

// Keyed by request_id. Each entry: { resolve: fn }.
// The PermissionRequest handler holds an open HTTP response until
// the UI sends a decision to POST /api/decision.
export const pendingDecisions = new Map();

// How long (ms) to wait for the user before auto-denying a permission request.
// ASSUMPTION: Claude Code's HTTP client for hooks allows this duration.
// Set timeout=120000 in the hook config to match.
const PERM_TIMEOUT_MS = 110_000;

export async function handleHook(payload, res) {
  const {
    hook_event_name,
    session_id,
    cwd,
    transcript_path,
    tool_name,
    tool_input,
    tool_response,
    last_assistant_message,
    message,
  } = payload ?? {};

  if (!session_id) return res.json({});

  const st = getState();
  const sess = st.session(session_id);
  if (cwd) sess.cwd = cwd;
  if (transcript_path) sess.transcript_path = transcript_path;

  switch (hook_event_name) {

    case 'SessionStart': {
      sess.status = 'idle';
      sess.had_tool_activity = false;
      broadcast({ type: 'status', session_id, status: 'idle', cwd });
      return res.json({});
    }

    case 'PreToolUse': {
      sess.status = 'working';
      sess.had_tool_activity = true;
      const entry = {
        t: ts(),
        kind: 'tool_start',
        tool_name,
        input: summarise(tool_input),
      };
      st.pushOutput(session_id, entry);
      broadcast({ type: 'status', session_id, status: 'working' });
      broadcast({ type: 'output', session_id, entry });
      return res.json({});
    }

    case 'PostToolUse': {
      const entry = {
        t: ts(),
        kind: 'tool_done',
        tool_name,
        output: summarise(tool_response),
      };
      st.pushOutput(session_id, entry);
      broadcast({ type: 'output', session_id, entry });
      return res.json({});
    }

    case 'PostToolUseFailure': {
      sess.status = 'error';
      const entry = {
        t: ts(),
        kind: 'tool_fail',
        tool_name,
        output: summarise(tool_response),
      };
      st.pushOutput(session_id, entry);
      broadcast({ type: 'status', session_id, status: 'error' });
      broadcast({ type: 'output', session_id, entry });
      return res.json({});
    }

    case 'PermissionRequest': {
      const request_id = randomUUID();
      const perm = {
        request_id,
        tool_name,
        tool_input: tool_input ?? null,
        cwd: cwd ?? sess.cwd,
        requested_at: ts(),
      };

      sess.status = 'waiting';
      sess.pending_permission = perm;
      broadcast({ type: 'status', session_id, status: 'waiting' });
      broadcast({ type: 'permission_request', session_id, ...perm });

      // Block the HTTP connection until the user decides or timeout fires.
      const behavior = await new Promise(resolve => {
        const timer = setTimeout(() => {
          pendingDecisions.delete(request_id);
          resolve('deny');
        }, PERM_TIMEOUT_MS);

        pendingDecisions.set(request_id, {
          resolve: (b) => { clearTimeout(timer); resolve(b); },
        });
      });

      sess.pending_permission = null;
      sess.status = behavior === 'allow' ? 'working' : 'idle';
      broadcast({
        type: 'permission_resolved',
        session_id,
        request_id,
        behavior,
        status: sess.status,
      });

      // Return the decision to Claude Code.
      return res.json({
        hookSpecificOutput: {
          decision: { behavior },
        },
      });
    }

    case 'Notification': {
      const entry = { t: ts(), kind: 'notification', message: message ?? '' };
      st.pushOutput(session_id, entry);
      broadcast({ type: 'output', session_id, entry });
      return res.json({});
    }

    case 'Stop': {
      const new_status = sess.had_tool_activity ? 'done' : 'idle';
      sess.had_tool_activity = false;
      sess.status = new_status;
      if (last_assistant_message) {
        const entry = {
          t: ts(),
          kind: 'summary',
          message: truncate(last_assistant_message, 20_000),
        };
        st.pushOutput(session_id, entry);
        broadcast({ type: 'output', session_id, entry });
      }
      broadcast({ type: 'status', session_id, status: new_status });
      return res.json({});
    }

    case 'StopFailure': {
      sess.status = 'error';
      broadcast({ type: 'status', session_id, status: 'error' });
      return res.json({});
    }

    case 'SessionEnd': {
      sess.status = 'idle';
      broadcast({ type: 'status', session_id, status: 'idle' });
      return res.json({});
    }

    default:
      return res.json({});
  }
}

function ts() { return new Date().toISOString(); }

function truncate(s, max) {
  if (typeof s !== 'string') s = String(s ?? '');
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function summarise(val) {
  if (val == null) return null;
  if (typeof val === 'string') return truncate(val, 300);
  try { return truncate(JSON.stringify(val), 300); } catch { return '[object]'; }
}
