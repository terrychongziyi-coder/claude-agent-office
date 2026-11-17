// Works out who a group-chat message is for.
// Accepted forms: "@David @Amy do X" (one or more leading mentions) or "David, do X" / "David: do X".
// A "#project" right after the names moves the workers to that project first: "@David #billing fix X".
// Only that position counts, so "#42" later in the text stays plain text.
// A "/model <name>" there switches the model: "@David /model sonnet", "@David #web /model haiku fix X".
// "/effort <level>" works the same way: "@David /effort max".
const NAME = '[\\p{L}\\p{N}_-]+';
const MENTIONS = new RegExp(`^\\s*((?:@${NAME}[\\s,]*)+)([\\s\\S]*)$`, 'u');
const VOCATIVE = new RegExp(`^\\s*(${NAME})\\s*[,:]([\\s\\S]*)$`, 'u');
const PROJECT = new RegExp(`^\\s*#(${NAME})([\\s\\S]*)$`, 'u');
const MODEL = /^\s*\/model\s+(\S+)([\s\S]*)$/i;
const EFFORT = /^\s*\/effort\s+(\S+)([\s\S]*)$/i;
// Same list as runner.js EFFORTS; 'default' clears it.
export const EFFORT_LEVELS = ['default', 'low', 'medium', 'high', 'xhigh', 'max'];
// Short names for the models offered in the worker editor; '' means the user's Claude Code default.
export const MODEL_IDS = { default: '', fable: 'claude-fable-5-2', opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5' };

// Strips leading "#project", "/model x" and "/effort x" (any order). projects = null: "#" is plain text (worker panel).
export function directives(rest, projects) {
  let project = null, model, effort;
  for (;;) {
    const p = projects && !project && rest.match(PROJECT);
    if (p) {
      project = projects.find(x => x.name.toLowerCase() === p[1].toLowerCase());
      if (!project) return { error: `No project named ${p[1]}. ${projects.length ? `Projects: ${projects.map(x => '#' + x.name).join(', ')}.` : 'Add projects in Manage workers.'}` };
      rest = p[2];
      continue;
    }
    const m = model === undefined && rest.match(MODEL);
    if (m) {
      const key = m[1].toLowerCase();
      model = MODEL_IDS[key] ?? (Object.values(MODEL_IDS).includes(key) ? key : undefined);
      if (model === undefined) return { error: `Unknown model ${m[1]}. Use one of: ${Object.keys(MODEL_IDS).join(', ')}.` };
      rest = m[2];
      continue;
    }
    const e = effort === undefined && rest.match(EFFORT);
    if (e) {
      const level = e[1].toLowerCase();
      if (!EFFORT_LEVELS.includes(level)) return { error: `Unknown effort ${e[1]}. Use one of: ${EFFORT_LEVELS.join(', ')}.` };
      effort = level === 'default' ? '' : level;
      rest = e[2];
      continue;
    }
    return { project, model, effort, rest };
  }
}

export function addressees(text, workers, projects = []) {
  const byName = n => workers.find(w => w.name?.toLowerCase() === n.toLowerCase());
  let names, rest;
  const at = text.match(MENTIONS);
  if (at) {
    names = at[1].match(new RegExp(`@${NAME}`, 'gu')).map(s => s.slice(1));
    rest = at[2];
  } else {
    const v = text.match(VOCATIVE);
    if (!v || !byName(v[1])) return { error: 'Start with a name, e.g. "@David fix the login bug" or "David, fix the login bug".' };
    names = [v[1]];
    rest = v[2];
  }
  const unknown = names.filter(n => !byName(n));
  if (unknown.length) return { error: `No worker named ${unknown.join(', ')}.` };
  const d = directives(rest, projects);
  if (d.error) return d;
  // "/model x" or "/effort x" alone is a complete command; anything else needs a message.
  const message = d.rest.trim();
  if (!message && d.model === undefined && d.effort === undefined) return { error: 'Add a message after the name.' };
  return { targets: [...new Set(names.map(byName))], project: d.project, model: d.model, effort: d.effort, message };
}

// Hop guard for worker-to-worker handoffs. Each worker carries the hop count of the last message it
// received: 0 from the user, sender's count + 1 from a teammate. A worker whose count has reached
// MAX_HOPS cannot hand off, so a chain (or a loop) ends after MAX_HOPS handoffs.
// ponytail: in memory; a server restart also stops every worker, so no chain outlives it.
export const MAX_HOPS = 3;
const hops = new Map(); // worker id -> hop count of its latest message

export const fromUser = workerId => hops.set(workerId, 0);

// claimed: the legacy --hop value; the higher of it and the server's own count wins.
export function handoff(fromId, toId, claimed) {
  const current = Math.max(hops.get(fromId) ?? 0, Number(claimed) || 0);
  if (current >= MAX_HOPS) return false;
  hops.set(toId, current + 1);
  return true;
}
