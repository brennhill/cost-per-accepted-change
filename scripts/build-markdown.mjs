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
// Recurse the turndown converter on each cell's innerHTML so inline
// formatting (links, bold, em, code) survives. Only emit a header row
// when the table actually has a <thead> — headerless tables (no <thead>)
// previously promoted their first data row to a column header, which
// silently mangled the homepage's worked-example table.
// Turndown's internal DOM (domino) returns NodeLists that aren't
// iterable with `for...of`, so we wrap every querySelectorAll result
// in Array.from() before processing.
const qsa = (root, sel) => Array.from(root.querySelectorAll(sel));

turndown.addRule('table', {
  filter: 'table',
  replacement(content, node) {
    const renderCell = (cell) => {
      const md = turndown.turndown(cell.innerHTML || '').trim();
      // Markdown tables can't contain newlines or unescaped pipes in cells.
      return md.replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|');
    };
    const cellsOf = (row) => qsa(row, 'th,td').map(renderCell);

    const headSection = node.querySelector('thead');
    const headRows = headSection ? qsa(headSection, 'tr') : [];
    let bodyRows;
    if (headSection) {
      const tbody = node.querySelector('tbody');
      if (tbody) {
        bodyRows = qsa(tbody, 'tr');
      } else {
        bodyRows = qsa(node, 'tr').filter((r) => !headSection.contains(r));
      }
    } else {
      bodyRows = qsa(node, 'tr');
    }

    const renderedBody = [];
    let columnCount = 0;
    for (const row of bodyRows) {
      const cells = cellsOf(row);
      if (!cells.length) continue;
      columnCount = Math.max(columnCount, cells.length);
      renderedBody.push('| ' + cells.join(' | ') + ' |');
    }

    const out = [];
    if (headRows.length) {
      const header = cellsOf(headRows[0]);
      columnCount = Math.max(columnCount, header.length);
      if (header.length) {
        out.push('| ' + header.join(' | ') + ' |');
        out.push('| ' + header.map(() => '---').join(' | ') + ' |');
      }
    } else if (columnCount > 0) {
      // GFM requires a header separator for tables to render. Emit an
      // empty header row so the data is recognized as a table — the
      // first data row stays as data (not promoted to a header).
      out.push('| ' + Array(columnCount).fill('').map(() => ' ').join(' | ') + ' |');
      out.push('| ' + Array(columnCount).fill('---').join(' | ') + ' |');
    }
    out.push(...renderedBody);
    if (!out.length) return '';
    return '\n\n' + out.join('\n') + '\n\n';
  },
});

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip well-known and _astro — they have no human article content.
      if (entry.name === '.well-known' || entry.name === '_astro') continue;
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
  const htmlPaths = [];
  for await (const p of walk(DIST)) htmlPaths.push(p);

  const results = await Promise.all(
    htmlPaths.map(async (htmlPath) => {
      const md = await convertOne(htmlPath);
      if (!md) {
        return { htmlPath, written: false, reason: 'no article.page or main' };
      }
      const mdPath = htmlPath.replace(/\.html$/, '.md');
      await writeFile(mdPath, md, 'utf8');
      return { htmlPath, written: true };
    }),
  );

  const written = results.filter((r) => r.written).length;
  const skipped = results.filter((r) => !r.written);
  for (const s of skipped) {
    process.stderr.write(
      `build-markdown: skipped ${relative(DIST, s.htmlPath)} — ${s.reason}\n`,
    );
  }
  process.stdout.write(
    `build-markdown: wrote ${written} .md sibling${written === 1 ? '' : 's'}` +
      (skipped.length ? ` (${skipped.length} skipped)` : '') +
      '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`build-markdown: ${err.stack || err.message}\n`);
  process.exit(1);
});
