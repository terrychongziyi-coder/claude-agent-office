#!/usr/bin/env node
// Adds the agent-office hooks to a Claude Code settings file.
// Usage: node tools/install-hooks.js [--apply] [--settings <path>]
// Without --apply it only prints the merged result. With --apply it writes a
// timestamped backup first. Re-running replaces earlier agent-office entries.

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const si = args.indexOf('--settings');
const settingsPath = si >= 0 ? resolve(args[si + 1]) : resolve(homedir(), '.claude/settings.json');

const cfg = JSON.parse(readFileSync(resolve(root, 'config.json'), 'utf8'));
if (!cfg.token) { console.error('No token in config.json. Start agent-office once first (npm start).'); process.exit(1); }
const port = Number(process.env.AO_PORT ?? cfg.port ?? 4000);
const base = `http://127.0.0.1:${port}`;
const hookUrl = `${base}/hook?token=${cfg.token}`;
const paneScript = resolve(root, 'hooks/register-pane.sh');

const http = (timeout = 10000) => ({ type: 'http', url: hookUrl, timeout });
const ours = {
  SessionStart: { hooks: [{ type: 'command', command: paneScript }] },
  PreToolUse: { matcher: '*', hooks: [http()] },
  PostToolUse: { matcher: '*', hooks: [http()] },
  PostToolUseFailure: { matcher: '*', hooks: [http()] },
  PermissionRequest: { hooks: [http(120000)] },
  Notification: { hooks: [http()] },
  Stop: { hooks: [http()] },
  StopFailure: { hooks: [http()] },
  SessionEnd: { hooks: [http()] },
};
const isOurs = group => (group.hooks ?? []).some(h => h.command === paneScript || String(h.url ?? '').startsWith(`${base}/hook`));

const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
settings.hooks ??= {};
for (const [event, group] of Object.entries(ours)) {
  settings.hooks[event] = (settings.hooks[event] ?? []).filter(g => !isOurs(g)).concat(group);
}
settings.allowedHttpHookUrls = [...new Set([...(settings.allowedHttpHookUrls ?? []), base])];

const out = JSON.stringify(settings, null, 2) + '\n';
if (!apply) {
  console.log(out.replaceAll(cfg.token, '<TOKEN>'));
  console.log(`Preview only (token hidden). Run with --apply to write ${settingsPath}`);
  process.exit(0);
}
if (existsSync(settingsPath)) {
  const backup = `${settingsPath}.bak-${Date.now()}`;
  copyFileSync(settingsPath, backup);
  console.log(`Backup: ${backup}`);
}
writeFileSync(settingsPath, out);
console.log(`Hooks written to ${settingsPath}. Restart Claude Code sessions to load them.`);
