import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { openPlan } from './open.js';

test('opens documents and folders, only reveals anything that could run', () => {
  const d = mkdtempSync(join(tmpdir(), 'ao-open-'));
  for (const f of ['report.html', 'run.command', 'tool.sh', 'noext']) writeFileSync(join(d, f), '');
  mkdirSync(join(d, 'Evil.app'));
  assert.deepEqual(openPlan(join(d, 'report.html')), { args: [join(d, 'report.html')], revealed: false });
  assert.deepEqual(openPlan(d), { args: [d], revealed: false });
  for (const f of ['run.command', 'tool.sh', 'noext', 'Evil.app']) assert.deepEqual(openPlan(join(d, f)).args, ['-R', join(d, f)], f);
  assert.deepEqual(openPlan('~/report.html', d), { args: [join(d, 'report.html')], revealed: false });
  assert.match(openPlan(join(d, 'missing.pdf')).error, /Not found/);
  assert.match(openPlan('relative/x.html').error, /absolute/);
  assert.match(openPlan(42).error, /Invalid/);
});
