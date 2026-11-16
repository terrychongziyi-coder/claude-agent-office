import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);

export async function sendToPane(pane, text) {
  if (!pane) return { ok: false, error: 'no tmux pane bound to this session' };
  if (!text || typeof text !== 'string') return { ok: false, error: 'empty text' };
  try {
    // -l sends the text literally so tmux key names inside it are not interpreted.
    await exec('tmux', ['send-keys', '-t', pane, '-l', text]);
    await exec('tmux', ['send-keys', '-t', pane, 'Enter']);
    return { ok: true };
  } catch (e) {
    const msg = String(e.stderr || e.message || e);
    if (msg.includes("can't find pane") || msg.includes('no such pane')) return { ok: false, error: 'pane_gone' };
    return { ok: false, error: msg.trim() };
  }
}
