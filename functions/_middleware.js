// Markdown-for-agents content negotiation, implemented as a Cloudflare
// Pages middleware. When a client sends `Accept: text/markdown` and a
// .md sibling exists for the requested HTML path, serve the markdown.
// Browsers (which send `Accept: text/html,...`) fall through to the
// default static HTML serving.
//
// This is the open-source equivalent of Cloudflare's gated "Markdown
// for Agents" Pages setting. We do it with one middleware + the .md
// siblings emitted by scripts/build-markdown.mjs.

const MD_HTML_PATHS = /^\/(?:|[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)$/;

function acceptPrefersMarkdown(accept) {
  if (!accept) return false;
  const lower = accept.toLowerCase();
  if (!lower.includes('text/markdown')) return false;
  // The simplest reasonable parse: tokenize on commas, extract a q-value
  // per type, prefer markdown only if its q is at least equal to html's.
  let mdQ = -1;
  let htmlQ = -1;
  for (const raw of lower.split(',')) {
    const part = raw.trim();
    const [type, ...params] = part.split(';').map((s) => s.trim());
    let q = 1;
    for (const p of params) {
      const m = p.match(/^q=([\d.]+)$/);
      if (m) q = Number(m[1]);
    }
    if (type === 'text/markdown') mdQ = Math.max(mdQ, q);
    else if (type === 'text/html') htmlQ = Math.max(htmlQ, q);
    else if (type === 'text/*' && htmlQ < 0) htmlQ = q;
    else if (type === '*/*' && htmlQ < 0 && mdQ < 0) {
      htmlQ = q;
    }
  }
  if (mdQ < 0) return false;
  if (htmlQ < 0) return true;
  return mdQ >= htmlQ;
}

function pathToMarkdown(pathname) {
  if (pathname === '/' || pathname === '') return '/index.md';
  if (pathname.endsWith('/')) return pathname + 'index.md';
  if (pathname.endsWith('.html')) return pathname.replace(/\.html$/, '.md');
  return pathname + '.md';
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  const looksLikeContentPage = MD_HTML_PATHS.test(path) || path.endsWith('.html');

  if (looksLikeContentPage && acceptPrefersMarkdown(request.headers.get('accept'))) {
    const mdPath = pathToMarkdown(path);
    const mdUrl = new URL(mdPath, url.origin);
    try {
      const mdResponse = await env.ASSETS.fetch(new Request(mdUrl.toString(), request));
      if (mdResponse.ok) {
        const headers = new Headers(mdResponse.headers);
        headers.set('Content-Type', 'text/markdown; charset=utf-8');
        headers.set('Vary', 'Accept');
        headers.set('X-Content-Variant', 'markdown');
        return new Response(mdResponse.body, {
          status: 200,
          statusText: 'OK',
          headers,
        });
      }
    } catch {
      // Fall through to the default response on any negotiation error.
    }
  }

  const response = await next();
  const ct = response.headers.get('content-type') || '';
  if (ct.startsWith('text/html')) {
    const headers = new Headers(response.headers);
    headers.set('Vary', 'Accept');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  return response;
}
