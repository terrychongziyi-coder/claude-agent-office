import { test } from 'node:test';
import assert from 'node:assert/strict';
import { md } from '../public/md.js';

test('renders a table with alignment and inline markup', () => {
  const html = md('Results:\n\n| Name | Count |\n|:-----|------:|\n| **a** | `1` |\n| b \\| c | 2 |\n\nDone.');
  assert.equal(html, '<p>Results:</p><div class="md-table"><table><thead><tr><th>Name</th><th style="text-align:right">Count</th></tr></thead>' // ":---" is left, the default
    + '<tbody><tr><td><b>a</b></td><td style="text-align:right"><code>1</code></td></tr><tr><td>b | c</td><td style="text-align:right">2</td></tr></tbody></table></div><p>Done.</p>');
});

test('never lets reply text become HTML', () => {
  const html = md('<img src=x onerror=alert(1)>\n\n| <b>x</b> |\n|---|\n| <script> |\n\n```\n<script>\n```\n`<i>`');
  assert.ok(!/<(img|script|b>x)/.test(html), html);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
});

test('code blocks, headings, lists, rules', () => {
  assert.equal(md('```js\nconst a = **1**;\n```'), '<pre><code>const a = **1**;</code></pre>');
  assert.equal(md('```\nstill streaming'), '<pre><code>still streaming</code></pre>');
  assert.equal(md('## Plan\n- one\n- *two*\n1. first\n---\nline 1\nline 2'),
    '<h5>Plan</h5><ul><li>one</li><li><i>two</i></li></ul><ol><li>first</li></ol><hr><p>line 1<br>line 2</p>');
  assert.equal(md('a | b without a separator'), '<p>a | b without a separator</p>');
  assert.equal(md('2 * 3 * 4'), '<p>2 * 3 * 4</p>');
});

test('links URLs and file paths, without letting them inject HTML', () => {
  const p = '/Users/me/proj/.archify/arch-20261117/knowledge.html';
  assert.equal(md(`Saved to ${p}.`), `<p>Saved to <a href="#" class="path" data-path="${p}" title="Open on this Mac">${p}</a>.</p>`);
  assert.equal(md(`\`${p}\``), `<p><a href="#" class="path" data-path="${p}" title="Open on this Mac"><code>${p}</code></a></p>`);
  assert.equal(md('See https://example.com/a?b=1&c=2, ok'), '<p>See <a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">https://example.com/a?b=1&amp;c=2</a>, ok</p>');
  assert.equal(md('**~/notes/plan.md**'), '<p><b><a href="#" class="path" data-path="~/notes/plan.md" title="Open on this Mac">~/notes/plan.md</a></b></p>');
  assert.equal(md('and/or, /model sonnet, a/b/c'), '<p>and/or, /model sonnet, a/b/c</p>'); // not paths
  assert.ok(!md('https://x.com/"><script>').includes('<script'));
  assert.ok(!md('javascript:alert(1)').includes('<a'));
});
