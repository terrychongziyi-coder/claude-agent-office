import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressees, directives, fromUser, handoff } from './chat.js';
import { moveWorker } from './runner.js';

const W = [{ name: 'David' }, { name: 'Amy' }, { name: 'Zi_Yi' }];
const names = text => addressees(text, W).targets?.map(w => w.name);

test('routes by name', () => {
  assert.deepEqual(names('@David fix the login bug'), ['David']);
  assert.deepEqual(names('@david, @Amy please pair on this'), ['David', 'Amy']);
  assert.deepEqual(names('@David @David once'), ['David']);
  assert.deepEqual(names('David, please make changes in billing'), ['David']);
  assert.deepEqual(names('Zi_Yi: run the tests'), ['Zi_Yi']);
  assert.deepEqual(names('@Amy\nmulti\nline'), ['Amy']);
});

test('rejects what it cannot route', () => {
  assert.match(addressees('fix the login bug', W).error, /Start with a name/);
  assert.match(addressees('Hello, team', W).error, /Start with a name/); // "Hello" is not a worker
  assert.match(addressees('@Bob do X', W).error, /No worker named Bob/);
  assert.match(addressees('@David', W).error, /Add a message/);
  assert.match(addressees('David,   ', W).error, /Add a message/);
});

const P = [{ name: 'billing-api', cwd: '/p/billing' }, { name: 'web', cwd: '/p/web' }];

test('picks up a #project right after the names', () => {
  const r = addressees('David, #Billing-API please fix the invoice total', W, P);
  assert.deepEqual([r.targets.map(w => w.name), r.project?.cwd], [['David'], '/p/billing']);
  assert.equal(addressees('@David @Amy #web pair on checkout', W, P).project.name, 'web');
  assert.equal(addressees('@David fix issue #42 in #web', W, P).project, null); // not right after the names
  assert.match(addressees('@David #nope do X', W, P).error, /No project named nope. Projects: #billing-api, #web/);
  assert.match(addressees('@David #web', W, P).error, /Add a message/);
});

test('keeps one conversation per worker per folder', () => {
  const w = { name: 'David', cwd: '/p/billing', session_id: 'S1', resumable: true };
  assert.equal(moveWorker(w, '/p/billing'), false);
  assert.equal(moveWorker(w, '/p/web'), true);
  assert.equal(w.cwd, '/p/web');
  assert.notEqual(w.session_id, 'S1');
  assert.equal(w.resumable, undefined);
  assert.deepEqual(w.sessions['/p/billing'], { session_id: 'S1', resumable: true, resume_id: undefined });
  const webSid = w.session_id;
  moveWorker(w, '/p/billing'); // back: resumes S1, parks the web one
  assert.deepEqual([w.session_id, w.resumable, w.sessions['/p/web'].session_id], ['S1', true, webSid]);
  assert.equal(w.sessions['/p/billing'], undefined);
  const fresh = { name: 'New' };
  moveWorker(fresh, '/p/web');
  assert.ok(fresh.session_id && !fresh.sessions);
});

test('reads /model after the names, with or without #project and a message', () => {
  const r = addressees('@David /model Sonnet', W, P);
  assert.deepEqual([r.model, r.message], ['claude-sonnet-5-5', '']);
  const b = addressees('@David @Amy #web /model haiku fix the header', W, P);
  assert.deepEqual([b.targets.length, b.project.name, b.model, b.message], [2, 'web', 'claude-haiku-5-5', 'fix the header']);
  assert.equal(addressees('David, /model opus #web go', W, P).project.name, 'web'); // either order
  assert.equal(addressees('@David /model default', W, P).model, '');
  assert.equal(addressees('@David /model claude-fable-5-2', W, P).model, 'claude-fable-5-2');
  assert.match(addressees('@David /model gpt-9', W, P).error, /Unknown model gpt-9. Use one of: default, fable/);
  assert.equal(addressees('@David explain what /model sonnet does', W, P).model, undefined); // not right after the names
});

test('worker panel: /model only, "#" stays plain text', () => {
  assert.deepEqual(directives('/model sonnet fix it', null), { project: null, model: 'claude-sonnet-5-5', effort: undefined, rest: ' fix it' });
  assert.deepEqual(directives('#42 is broken', null), { project: null, model: undefined, effort: undefined, rest: '#42 is broken' });
});

test('reads /effort alongside /model and #project', () => {
  const r = addressees('@David /effort MAX', W, P);
  assert.deepEqual([r.effort, r.model, r.message], ['max', undefined, '']);
  const b = addressees('@David /effort low #web /model haiku fix it', W, P);
  assert.deepEqual([b.effort, b.model, b.project.name, b.message], ['low', 'claude-haiku-5-5', 'web', 'fix it']);
  assert.equal(addressees('@David /effort default', W, P).effort, '');
  assert.match(addressees('@David /effort ultra', W, P).error, /Unknown effort ultra. Use one of: default, low, medium, high, xhigh, max/);
  assert.equal(directives('/effort high do it', null).effort, 'high');
});

test('hop guard ends a handoff loop after MAX_HOPS handoffs', () => {
  fromUser('D');
  assert.equal(handoff('D', 'A'), true);   // hop 1
  assert.equal(handoff('A', 'D'), true);   // hop 2
  assert.equal(handoff('D', 'A'), true);   // hop 3
  assert.equal(handoff('A', 'D'), false);  // 4th handoff refused
  fromUser('A');                           // the user talks to Amy: her chain starts over
  assert.equal(handoff('A', 'C'), true);
  fromUser('X');
  assert.equal(handoff('X', 'Y', 3), false); // a higher legacy --hop still counts
  assert.equal(handoff(undefined, 'Y'), true); // unknown sender starts at 0
});

test('/model accepts the 1M-context, opusplan and best options', () => {
  assert.equal(addressees('@David /model opus[1m] go', W, P).model, 'claude-opus-5-5[1m]');
  assert.equal(addressees('@David /model Sonnet[1M]', W, P).model, 'claude-sonnet-5-5[1m]');
  assert.equal(addressees('@David /model opusplan', W, P).model, 'opusplan');
  assert.equal(addressees('@David /model best', W, P).model, 'best');
  assert.equal(addressees('@David /model claude-fable-5-2[1m]', W, P).model, 'claude-fable-5-2[1m]');
});
