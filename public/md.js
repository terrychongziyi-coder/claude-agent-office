// Minimal Markdown for Claude's replies: tables, code blocks, headings, lists, rules, bold, italic, inline code.
// Every piece of text is HTML-escaped before markup is added, so a reply can never inject HTML.
// ponytail: no [text](url) links, images or nested lists; swap in marked + DOMPurify if replies need them.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Links: http(s) URLs open in a new tab; absolute or ~/ paths become .path links that the app
// opens through the server (/api/open). ponytail: paths containing spaces are not detected.
const URL_RE = String.raw`https?:\/\/[^\s<>"'\`]*[^\s<>"'\`.,;:!?)\]]`;
const ABS_RE = String.raw`(?<![\w/.~:])\/(?:[\w.@+-]+\/)+[\w.@+-]*[\w@+-]`;
const HOME_RE = String.raw`(?<![\w/.~])~\/(?:[\w.@+-]+\/)*[\w.@+-]*[\w@+-]`;
const LINK = new RegExp(`(${URL_RE}|${ABS_RE}|${HOME_RE})`, 'g');
const WHOLE_LINK = new RegExp(`^(?:${URL_RE}|${ABS_RE}|${HOME_RE})$`);
const link = (target, inner = esc(target)) => /^https?:/.test(target)
  ? `<a href="${esc(target)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
  : `<a href="#" class="path" data-path="${esc(target)}" title="Open on this Mac">${inner}</a>`;

// Inline code first, so `**x**` inside backticks stays literal. Links are swapped for \0n\0
// placeholders before escaping and emphasis, then restored.
const inline = s => String(s).replace(/\0/g, '').split(/(`[^`\n]+`)/).map((p, i) => {
  if (i % 2) {
    const code = p.slice(1, -1);
    return WHOLE_LINK.test(code) ? link(code, `<code>${esc(code)}</code>`) : `<code>${esc(code)}</code>`;
  }
  const links = [];
  const text = p.replace(LINK, m => `\0${links.push(m) - 1}\0`);
  return esc(text).replace(/\*\*(?=\S)(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*(?=\S)([^*]+?)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/\0(\d+)\0/g, (_, n) => link(links[n]));
}).join('');

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const ITEM = /^\s*([-*+]|\d+[.)])\s+(.*)$/;
const RULE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const isRow = l => /^\s*\|.*\|\s*$/.test(l ?? '');
const isSep = l => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l ?? '');
const cells = l => l.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
const special = (l, next) => FENCE.test(l) || HEADING.test(l) || ITEM.test(l) || RULE.test(l) || (isRow(l) && isSep(next));

export function md(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    const fence = l.match(FENCE);
    if (fence) {
      const body = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) body.push(lines[i]);
      i++; // closing fence (absent while a reply is still streaming)
      out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
    } else if (isRow(l) && isSep(lines[i + 1])) {
      const head = cells(l);
      const align = cells(lines[i + 1]).map(c => c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : '');
      const rows = [];
      for (i += 2; i < lines.length && isRow(lines[i]); i++) rows.push(cells(lines[i]));
      const cell = (tag, c, j) => `<${tag}${align[j] ? ` style="text-align:${align[j]}"` : ''}>${inline(c ?? '')}</${tag}>`;
      out.push(`<div class="md-table"><table><thead><tr>${head.map((c, j) => cell('th', c, j)).join('')}</tr></thead>`
        + `<tbody>${rows.map(r => `<tr>${head.map((_, j) => cell('td', r[j], j)).join('')}</tr>`).join('')}</tbody></table></div>`);
    } else if (RULE.test(l)) {
      out.push('<hr>');
      i++;
    } else if (HEADING.test(l)) {
      const [, hashes, text] = l.match(HEADING);
      const n = Math.min(6, hashes.length + 3); // replies sit inside panels: keep headings small
      out.push(`<h${n}>${inline(text)}</h${n}>`);
      i++;
    } else if (ITEM.test(l)) {
      const ordered = /\d/.test(l.match(ITEM)[1]);
      const items = [];
      for (let m; i < lines.length && (m = lines[i].match(ITEM)) && /\d/.test(m[1]) === ordered; i++) items.push(m[2]);
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map(x => `<li>${inline(x)}</li>`).join('')}</${tag}>`);
    } else if (!l.trim()) {
      i++;
    } else {
      const para = [];
      for (; i < lines.length && lines[i].trim() && !special(lines[i], lines[i + 1]); i++) para.push(lines[i]);
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    }
  }
  return out.join('');
}
