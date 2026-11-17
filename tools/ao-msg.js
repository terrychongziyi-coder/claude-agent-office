#!/usr/bin/env node
/**
 * ao-msg — send a message to another worker's Claude Code session.
 *
 * Usage (call from a Claude Code instruction or hook):
 *
 *   node /path/to/tools/ao-msg.js <to-worker-name> "<message>" [options]
 *
 * Options:
 *   --hop N          Current hop count (backend rejects at N >= 3). Pass the
 *                    value received from the prefix when forwarding a message.
 *   --from <id>      Sending session_id. Not needed inside agent-office: the server sets
 *                    AO_WORKER_ID for each worker, and the recipient sees the sender's name.
 *
 * Rate limit: 10 messages per 60 seconds, enforced via a local timestamp file.
 * Hop guard:  the backend rejects chains with 3 or more hops; set --hop N to
 *             carry the count through a relay chain so the guard activates.
 *
 * Config: reads token and port from config.json at CONFIG_PATH or ./config.json.
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// config.json is one level up from tools/
const CONFIG_PATH = process.env.CONFIG_PATH
  ?? resolve(__dir, '../config.json');

const RL_FILE = '/tmp/ao-msg-rl.json';
const RL_MAX  = 10;    // messages
const RL_WIN  = 60_000; // ms window

// ── Args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

if (argv.length < 2 || argv[0] === '--help' || argv[0] === '-h') {
  console.log('Usage: ao-msg <to-worker-name> "<message>" [--hop N] [--from <session-id>]');
  process.exit(0);
}

const toName  = argv[0];
const text    = argv[1];
const hopIdx  = argv.indexOf('--hop');
const fromIdx = argv.indexOf('--from');
const hop     = hopIdx  >= 0 ? Number(argv[hopIdx  + 1] ?? 0) : 0;
const fromId  = fromIdx >= 0 ? argv[fromIdx + 1] : undefined;

if (!toName || !text) {
  console.error('Error: to-worker-name and message are required.');
  process.exit(1);
}

// ── Rate limit ────────────────────────────────────────────────────────────────
async function checkRateLimit() {
  let rl = { ts: [] };
  try { rl = JSON.parse(await readFile(RL_FILE, 'utf8')); } catch { /* first run */ }

  const now = Date.now();
  rl.ts = (rl.ts ?? []).filter(t => now - t < RL_WIN);

  if (rl.ts.length >= RL_MAX) {
    console.error(`ao-msg: rate limit hit (${RL_MAX} messages per ${RL_WIN / 1000}s). Try again later.`);
    process.exit(1);
  }

  rl.ts.push(now);
  await writeFile(RL_FILE, JSON.stringify(rl), 'utf8');
}

// ── Load config ───────────────────────────────────────────────────────────────
async function loadConfig() {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  } catch {
    console.error(`ao-msg: cannot read config at ${CONFIG_PATH}`);
    console.error('  Set CONFIG_PATH or run from the agent-office directory.');
    process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
await checkRateLimit();

const cfg   = await loadConfig();
const token = cfg.token;
const port  = cfg.port ?? 4000;

if (!token) {
  console.error('ao-msg: no token in config — is agent-office running?');
  process.exit(1);
}

let res, body;
try {
  res  = await fetch(`http://127.0.0.1:${port}/api/message?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to_worker_name:  toName,
      text,
      hop,
      from_session_id: fromId,
      from_worker_id:  process.env.AO_WORKER_ID,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  body = await res.json();
} catch (e) {
  console.error('ao-msg: network error —', e.message);
  process.exit(1);
}

if (res.status === 429 || body.error === 'max_hops_exceeded') {
  console.error('ao-msg: hop limit reached (max 3 hops per chain). Message not sent.');
  process.exit(2);
}

if (res.status === 404) {
  console.error(`ao-msg: worker "${toName}" not found or has no session bound.`);
  process.exit(1);
}

if (!body.ok) {
  console.error('ao-msg: send failed —', body.error ?? JSON.stringify(body));
  process.exit(1);
}

console.log(`ao-msg: sent to "${toName}".`);
