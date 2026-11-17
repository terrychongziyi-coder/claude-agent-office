import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname } from 'path';
import { safeName, uploadPath, UPLOADS } from './upload.js';

test('upload names cannot escape the uploads folder or contain spaces', () => {
  assert.equal(safeName('Q4 report (final).xlsx'), 'Q4_report_final_.xlsx');
  assert.equal(safeName('../../etc/passwd'), 'passwd');
  assert.equal(safeName('..'), 'file');
  assert.equal(safeName('.bashrc'), 'bashrc');
  assert.equal(safeName('截图 1.png'), '截图_1.png');
  assert.equal(safeName(''), 'file');
  const p = uploadPath('a b.png', new Date('2026-11-17T10:27:24Z'));
  assert.equal(dirname(dirname(p)), UPLOADS);
  assert.match(p, /\/20261117-102724-[0-9a-f]{6}\/a_b\.png$/);
  assert.notEqual(uploadPath('x'), uploadPath('x'));
});
