// Post-build: for every HTML page in dist/, emit a sibling .md file
// containing the page's <article class="page"> content converted to
// clean markdown. This gives us two ways to serve markdown to agents:
//
//   1. Direct URL access — `curl https://.../faq.md` works.
//   2. Accept-header negotiation via functions/_middleware.ts — agents
//      sending `Accept: text/markdown` for `/faq` get the .md sibling.
//
// We deliberately strip nav/header/footer/script/style chrome — agents
// care about the article content, not site navigation. Code blocks are
// preserved as fenced markdown; tables get GFM pipe syntax.

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'node-html-parser';
import TurndownService from 'turndown';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DIST = join(SCRIPT_DIR, '..', 'dist');

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '_',
  strongDelimiter: '**',
  linkStyle: 'inlined',
});

// GFM tables — turndown doesn't ship table support by default; add it.
turndown.addRule('table', {
  filter: 'table',
  replacement(content, node) {
    const rows = node.querySelectorAll('tr');
    if (!rows.length) return '';
    const cellsOf = (row) =>
      row
        .querySelectorAll('th,td')
        .map((c) => c.textContent.trim().replace(/\s+/g, ' ').replace(/\|/g, '\\|'));
    const out = [];
    const header = cellsOf(rows[0]);
    if (!header.length) return '';
    out.push('| ' + header.join(' | ') + ' |');
    out.push('| ' + header.map(() => '---').join(' | ') + ' |');
    for (let i = 1; i < rows.length; i++) {
      const cells = cellsOf(rows[i]);
      if (cells.length) out.push('| ' + cells.join(' | ') + ' |');
    }
    return '\n\n' + out.join('\n') + '\n\n';
  },
});

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip well-known and _astro — they have no human article content.
      if (entry.name.startsWith('.well-known') || entry.name === '_astro') continue;
      yield* walk(full);
    } else if (entry.isFile() && full.endsWith('.html')) {
      yield full;
    }
  }
}

function extractFrontmatter(root, htmlPath) {
  const titleEl = root.querySelector('title');
  const descEl = root.querySelector('meta[name="description"]');
  const canonicalEl = root.querySelector('link[rel="canonical"]');
  const lines = ['---'];
  if (titleEl) lines.push(`title: ${JSON.stringify(titleEl.textContent.trim())}`);
  if (descEl?.getAttribute('content')) {
    lines.push(`description: ${JSON.stringify(descEl.getAttribute('content'))}`);
  }
  if (canonicalEl?.getAttribute('href')) {
    lines.push(`canonical: ${canonicalEl.getAttribute('href')}`);
  }
  lines.push(`source: ${relative(DIST, htmlPath)}`);
  lines.push('---');
  return lines.join('\n');
}

function articleHtml(root) {
  // Prefer <article class="page">; fall back to <main>.
  const article = root.querySelector('article.page') || root.querySelector('main');
  if (!article) return null;
  // Strip <script> and <style> defensively.
  for (const el of article.querySelectorAll('script,style,noscript')) el.remove();
  return article.innerHTML;
}

async function convertOne(htmlPath) {
  const html = await readFile(htmlPath, 'utf8');
  const root = parse(html);
  const inner = articleHtml(root);
  if (!inner) return null;
  const fm = extractFrontmatter(root, htmlPath);
  const md = turndown.turndown(inner);
  return `${fm}\n\n${md}\n`;
}

async function main() {
  let count = 0;
  for await (const htmlPath of walk(DIST)) {
    const md = await convertOne(htmlPath);
    if (!md) continue;
    const mdPath = htmlPath.replace(/\.html$/, '.md');
    await writeFile(mdPath, md, 'utf8');
    count++;
  }
  process.stdout.write(`build-markdown: wrote ${count} .md siblings\n`);
}

main().catch((err) => {
  process.stderr.write(`build-markdown: ${err.stack || err.message}\n`);
  process.exit(1);
});
