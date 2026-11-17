#!/usr/bin/env node
// Removes the hooks older versions of agent-office asked you to add to a Claude Code settings file.
// Usage: node tools/remove-hooks.js [--apply] [--settings <path>]
// Without --apply it only prints the result. With --apply it writes a timestamped backup first.
// Only agent-office entries are touched; other hooks and settings are kept.

import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const si = args.indexOf('--settings');
const settingsPath = si >= 0 ? resolve(args[si + 1]) : resolve(homedir(), '.claude/settings.json');

if (!existsSync(settingsPath)) { console.log(`${settingsPath} does not exist. Nothing to remove.`); process.exit(0); }
const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

const isOurUrl = u => /^http:\/\/(127\.0\.0\.1|localhost):\d+\/hook(\?|$)/.test(String(u ?? ''));
const isOurs = h => String(h.command ?? '').endsWith('/hooks/register-pane.sh') || (h.type === 'http' && isOurUrl(h.url));

let removed = 0;
for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
  if (!Array.isArray(groups)) continue;
  const kept = [];
  for (const g of groups) {
    const hooks = (g.hooks ?? []).filter(h => !isOurs(h));
    removed += (g.hooks ?? []).length - hooks.length;
    if (hooks.length) kept.push({ ...g, hooks });
  }
  if (kept.length) settings.hooks[event] = kept; else delete settings.hooks[event];
}
if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;

if (Array.isArray(settings.allowedHttpHookUrls)) {
  const urls = settings.allowedHttpHookUrls.filter(u => !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(u));
  removed += settings.allowedHttpHookUrls.length - urls.length;
  if (urls.length) settings.allowedHttpHookUrls = urls; else delete settings.allowedHttpHookUrls;
}

if (!removed) { console.log(`No agent-office hooks found in ${settingsPath}.`); process.exit(0); }

const out = JSON.stringify(settings, null, 2) + '\n';
if (!apply) {
  console.log(out.replace(/token=[A-Za-z0-9]+/g, 'token=<TOKEN>'));
  console.log(`Preview: ${removed} agent-office entries would be removed. Run with --apply to write ${settingsPath}`);
  process.exit(0);
}
const backup = `${settingsPath}.bak-${Date.now()}`;
copyFileSync(settingsPath, backup);
writeFileSync(settingsPath, out);
console.log(`Removed ${removed} agent-office entries from ${settingsPath}`);
console.log(`Backup: ${backup}`);
