// Markdown-for-agents content negotiation, implemented as a Cloudflare
// Pages middleware. When a client sends `Accept: text/markdown` and a
// .md sibling exists for the requested HTML path, serve the markdown.
// Browsers (which send `Accept: text/html,...`) fall through to the
// default static HTML serving.
//
// This is the open-source equivalent of Cloudflare's gated "Markdown
// for Agents" Pages setting. We do it with one middleware + the .md
// siblings emitted by scripts/build-markdown.mjs.
//
// RFC 7231 §5.3.1 / §5.3.2 semantics: a media-range with q=0 is
// "explicitly unacceptable" — we honor that as a hard exclusion.
// Whitespace inside parameters (`type/sub; q=0.9`) is OWS per the
// header grammar; we tolerate it. We require strict `mdQ > htmlQ`
// (not `>=`) so a tied preference stays HTML by default; the only
// way to opt in to markdown is to send it with higher preference than
// HTML (or send no HTML at all).

const MD_HTML_PATHS = /^\/(?:|[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)$/;

function parseQ(paramsRest) {
  for (const p of paramsRest) {
    // Tolerate OWS around `=`: `q = 0.9`, `q=0.9`, etc.
    const m = p.match(/^q\s*=\s*([\d.]+)\s*$/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return 1;
}

function acceptPrefersMarkdown(accept) {
  if (!accept) return false;
  const lower = accept.toLowerCase();
  if (!lower.includes('text/markdown')) return false;

  let mdQ = -1;
  let htmlQ = -1;
  let starQ = -1;
  let textStarQ = -1;
  for (const raw of lower.split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const [type, ...params] = part.split(';').map((s) => s.trim());
    const q = parseQ(params);
    if (type === 'text/markdown') mdQ = Math.max(mdQ, q);
    else if (type === 'text/html') htmlQ = Math.max(htmlQ, q);
    else if (type === 'text/*') textStarQ = Math.max(textStarQ, q);
    else if (type === '*/*') starQ = Math.max(starQ, q);
  }

  // q=0 means "explicitly unacceptable" per RFC 7231 — never serve it.
  if (mdQ === 0) return false;
  if (mdQ < 0) return false;

  // RFC 7231 §5.3.2: more specific media ranges take precedence over
  // less specific ones at the same q. So we compare against the *most
  // specific* HTML signal available, and on ties:
  //   - Tied with `text/html` (same specificity as `text/markdown`):
  //     HTML wins (a browser sending both means "I render either" with
  //     a strong real preference for HTML; we keep behavior conservative).
  //   - Tied with `text/*` or `*/*` (wildcards): markdown wins because
  //     the client named it specifically and the wildcard is just a
  //     fallback.
  if (htmlQ >= 0) {
    return mdQ > htmlQ;
  }
  if (textStarQ >= 0) {
    return mdQ >= textStarQ;
  }
  if (starQ >= 0) {
    return mdQ >= starQ;
  }
  return true; // markdown is acceptable, HTML isn't even covered
}

function pathToMarkdown(pathname) {
  if (pathname === '/' || pathname === '') return '/index.md';
  // Normalize trailing slash so `/faq/` (which Astro 308-redirects to
  // `/faq`) resolves to `/faq.md` rather than `/faq/index.md`.
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  if (pathname.endsWith('.html')) return pathname.replace(/\.html$/, '.md');
  return pathname + '.md';
}

function mergeVary(existing, value) {
  if (!existing) return value;
  const tokens = existing
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tokens.some((t) => t.toLowerCase() === value.toLowerCase())) return existing;
  return [...tokens, value].join(', ');
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  let path = url.pathname;

  // Treat a single trailing slash as equivalent to its bare form for the
  // "looks like a content page" check, since Astro 308-redirects either
  // way and an agent sending Accept: text/markdown should not have to
  // care about the redirect.
  const probePath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  const looksLikeContentPage =
    MD_HTML_PATHS.test(probePath) || probePath.endsWith('.html');

  if (looksLikeContentPage && acceptPrefersMarkdown(request.headers.get('accept'))) {
    const mdPath = pathToMarkdown(path);
    const mdUrl = new URL(mdPath, url.origin);
    try {
      const mdResponse = await env.ASSETS.fetch(new Request(mdUrl.toString(), request));
      if (mdResponse.ok) {
        const headers = new Headers(mdResponse.headers);
        headers.set('Content-Type', 'text/markdown; charset=utf-8');
        headers.set('Vary', mergeVary(headers.get('Vary'), 'Accept'));
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
    headers.set('Vary', mergeVary(headers.get('Vary'), 'Accept'));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  return response;
}
