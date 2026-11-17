// Decides how to open a path from a chat link with macOS `open`.
// Documents open in their default app; anything else (scripts, apps, unknown types) is only
// revealed in Finder, so a link in a reply can never run a program.
import { statSync } from 'fs';
import { isAbsolute, normalize, basename, extname } from 'path';
import { homedir } from 'os';

const DOCS = new Set(['html', 'htm', 'pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'md', 'txt', 'log', 'json', 'csv', 'tsv',
  'xlsx', 'xls', 'docx', 'doc', 'pptx', 'ppt', 'yaml', 'yml', 'xml', 'mp4', 'mov', 'webm']);
// Folders macOS treats as programs or installers: reveal, never open.
const BUNDLE = /\.(app|appex|bundle|framework|plugin|kext|pkg|mpkg|workflow|prefpane|saver|xpc)$/i;

// Returns { args, revealed } for `open`, or { error }.
export function openPlan(raw, home = homedir()) {
  if (typeof raw !== 'string' || !raw || raw.length > 4096) return { error: 'Invalid path.' };
  const p = normalize(raw.startsWith('~/') ? home + raw.slice(1) : raw);
  if (!isAbsolute(p)) return { error: 'Only absolute paths can be opened.' };
  let st;
  try { st = statSync(p); } catch { return { error: `Not found: ${p}` }; }
  const safe = st.isDirectory() ? !BUNDLE.test(basename(p)) : st.isFile() && DOCS.has(extname(p).slice(1).toLowerCase());
  return safe ? { args: [p], revealed: false } : { args: ['-R', p], revealed: true };
}
