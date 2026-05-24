/**
 * Generates static SVG and PNG assets for sharing, press, and embeds.
 *
 * Outputs (relative to public/):
 *   - og-image.png                       1200x630, used by og:image / twitter:image
 *   - assets/cpac-graphic.svg            standalone SVG
 *   - assets/cpac-graphic.png            1200x504, 2x of the on-site render
 *   - assets/verification-triangle.svg
 *   - assets/verification-triangle.png   720x660
 *   - assets/mark.svg
 *   - assets/mark.png                    512x512
 *   - assets/post-hook-square.png        1200x1200 (social post image)
 *   - assets/post-hook-portrait.png      1080x1350 (LinkedIn-optimal)
 *
 * Run with: node scripts/generate-assets.mjs
 *
 * Fonts: Source Serif 4 (Adobe, OFL) is bundled via @fontsource and loaded
 * into resvg's font config below, so PNG rendering is byte-stable on every
 * host OS. System fonts remain available for the Helvetica UI labels.
 */

import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import wawoff2 from 'wawoff2';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const ASSETS_DIR = join(PUBLIC_DIR, 'assets');

// Self-hosted Source Serif 4 (via @fontsource). resvg-js only accepts TTF/OTF
// font buffers, so we decompress the @fontsource woff2 files to TTF in
// memory at script startup and hand the TTF buffers to resvg. This ensures
// PNG rendering uses the bundled font (not whatever system serif happens to
// be installed) so output is byte-stable on every host.
const SOURCE_SERIF_DIR = join(
  __dirname,
  '..',
  'node_modules',
  '@fontsource',
  'source-serif-4',
  'files',
);
const WOFF2_FILES = [
  'source-serif-4-latin-400-normal.woff2',
  'source-serif-4-latin-400-italic.woff2',
  'source-serif-4-latin-600-normal.woff2',
  'source-serif-4-latin-600-italic.woff2',
];

let cachedFontBuffers = null;
async function loadFontBuffers() {
  if (cachedFontBuffers) return cachedFontBuffers;
  cachedFontBuffers = await Promise.all(
    WOFF2_FILES.map(async (name) => {
      const woff2 = readFileSync(join(SOURCE_SERIF_DIR, name));
      const ttf = await wawoff2.decompress(woff2);
      return Buffer.from(ttf);
    }),
  );
  return cachedFontBuffers;
}

/**
 * Assert that the bundled Source Serif 4 is actually being used by resvg.
 *
 * Background: resvg-js (verified through 2.6.2) silently drops woff/woff2
 * files passed via fontFiles or fontBuffers — only TTF/OTF are accepted.
 * Without this check, a regression in font handling (different resvg
 * version, broken decompression, wrong format) would silently fall back
 * to a system font and produce subtly wrong PNGs without raising any error.
 *
 * The check: render the same SVG twice — once with our bundled fonts, once
 * with nothing. If the outputs are byte-equal, the font load failed and
 * the script aborts loudly instead of shipping wrong assets.
 */
async function assertFontsLoaded() {
  const testSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" width="200" height="60"><text x="10" y="40" font-family="Source Serif 4" font-size="30" fill="black">test</text></svg>`;

  const fontBuffers = await loadFontBuffers();
  const withFonts = new Resvg(testSvg, {
    font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: 'Source Serif 4' },
  })
    .render()
    .asPng();
  const withoutFonts = new Resvg(testSvg, {
    font: { loadSystemFonts: false, defaultFontFamily: 'Source Serif 4' },
  })
    .render()
    .asPng();

  if (Buffer.compare(withFonts, withoutFonts) === 0) {
    throw new Error(
      'Font assertion failed: Source Serif 4 fontBuffers produced byte-identical output ' +
        'to a no-fonts render. resvg-js may have silently dropped the buffers. ' +
        'Check that wawoff2 decompressed to valid TTF (resvg only accepts TTF/OTF, never ' +
        'woff/woff2). PNGs would have shipped with the wrong font.',
    );
  }
  console.log(
    `✓ Source Serif 4 confirmed loaded (with-font render: ${withFonts.length} B, no-font: ${withoutFonts.length} B)`,
  );
}

const COLORS = {
  ink: '#1a1a1a',
  inkMuted: '#5a5a5a',
  paper: '#fbfaf6',
  paperTint: '#f3efe5',
  accent: '#7a1d1d',
  accentSoft: 'rgba(122, 29, 29, 0.08)',
  rule: '#d8d4cc',
};

// ----- Mark (stacked $/AC fraction) ------------------------------------

const markSvg = (color = COLORS.accent, bg = 'none') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  ${bg !== 'none' ? `<rect width="64" height="64" fill="${bg}"/>` : ''}
  <text x="32" y="27" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="22" font-weight="600" fill="${color}">$</text>
  <line x1="12" y1="33" x2="52" y2="33" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>
  <text x="32" y="53" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="18" font-weight="600" fill="${color}">AC</text>
</svg>`;

// ----- CPAC Graphic (the formula stamp) --------------------------------

const cpacGraphicSvg = (color = COLORS.accent) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 252" width="600" height="252">
  <rect x="6" y="6" width="588" height="240" fill="none" stroke="${color}" stroke-width="0.8" rx="2"/>
  <rect x="14" y="14" width="572" height="224" fill="none" stroke="${color}" stroke-width="0.4" opacity="0.4" rx="1"/>
  <text x="300" y="44" text-anchor="middle" font-family="Helvetica" font-size="10" font-weight="700" letter-spacing="3.2" fill="${color}" opacity="0.7">COST PER ACCEPTED CHANGE</text>
  <line x1="220" y1="54" x2="278" y2="54" stroke="${color}" stroke-width="0.5" opacity="0.45"/>
  <line x1="322" y1="54" x2="380" y2="54" stroke="${color}" stroke-width="0.5" opacity="0.45"/>
  <circle cx="300" cy="54" r="1.4" fill="${color}" opacity="0.55"/>
  <text x="300" y="103" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="15" font-style="italic" fill="${color}">model cost · infrastructure · engineering time · review · rework</text>
  <line x1="76" y1="124" x2="524" y2="124" stroke="${color}" stroke-width="1.6"/>
  <text x="300" y="150" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="15" font-style="italic" fill="${color}">accepted change units</text>
  <text x="300" y="170" text-anchor="middle" font-family="Helvetica" font-size="9" fill="${color}" opacity="0.55">( reached production and stayed there )</text>
  <g transform="translate(282, 185)" fill="${color}">
    <text x="18" y="14" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="13" font-weight="600">$</text>
    <line x1="4" y1="19" x2="32" y2="19" stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
    <text x="18" y="33" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="11" font-weight="600">AC</text>
  </g>
  <text x="300" y="232" text-anchor="middle" font-family="Helvetica" font-size="9" letter-spacing="1.6" fill="${color}" opacity="0.6">THE COST OF DELIVERED SOFTWARE THAT STAYED DELIVERED</text>
</svg>`;

// ----- Verification Triangle -------------------------------------------

const triangleSvg = (color = COLORS.ink, highlight = 'cost') => {
  const r = (v) => (highlight === v ? 10 : 5);
  const f = (v) => (highlight === v ? color : 'transparent');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 220" width="240" height="220">
  <line x1="120" y1="34" x2="34" y2="180" stroke="${color}" stroke-width="1.4" opacity="0.55"/>
  <line x1="120" y1="34" x2="206" y2="180" stroke="${color}" stroke-width="1.4" opacity="0.55"/>
  <line x1="34" y1="180" x2="206" y2="180" stroke="${color}" stroke-width="1.4" opacity="0.55"/>
  <circle cx="120" cy="34" r="${r('intent')}" fill="${f('intent')}" stroke="${color}" stroke-width="1.6"/>
  <text x="120" y="20" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="13" font-weight="600" fill="${color}">Intent clarity</text>
  <circle cx="34" cy="180" r="${r('eval')}" fill="${f('eval')}" stroke="${color}" stroke-width="1.6"/>
  <text x="34" y="204" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="13" font-weight="600" fill="${color}">Eval quality</text>
  <circle cx="206" cy="180" r="${r('cost')}" fill="${f('cost')}" stroke="${color}" stroke-width="1.6"/>
  <text x="206" y="204" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="13" font-weight="600" fill="${color}">Cost</text>
  <text x="120" y="118" text-anchor="middle" font-family="Helvetica" font-size="9" font-weight="600" letter-spacing="2" fill="${color}" opacity="0.55">THE VERIFICATION</text>
  <text x="120" y="132" text-anchor="middle" font-family="Helvetica" font-size="9" font-weight="600" letter-spacing="2" fill="${color}" opacity="0.55">TRIANGLE</text>
</svg>`;
};

// ----- OG / Twitter card image (1200x630) ------------------------------

const ogImageSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="${COLORS.paper}"/>

  <!-- Outer hairline frame -->
  <rect x="32" y="32" width="1136" height="566" fill="none" stroke="${COLORS.accent}" stroke-width="1.2" opacity="0.35" rx="4"/>

  <!-- Eyebrow -->
  <text x="600" y="120" text-anchor="middle" font-family="Helvetica" font-size="18" font-weight="700" letter-spacing="6" fill="${COLORS.accent}" opacity="0.8">A CANONICAL DEFINITION</text>

  <!-- Main title -->
  <text x="600" y="200" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="68" font-weight="600" fill="${COLORS.ink}">Cost per accepted change</text>

  <!-- Subtitle -->
  <text x="600" y="252" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="22" font-style="italic" fill="${COLORS.inkMuted}">The fully-loaded cost of producing software that stayed in production.</text>

  <!-- Formula block -->
  <rect x="200" y="300" width="800" height="220" fill="none" stroke="${COLORS.accent}" stroke-width="1.4" rx="3"/>
  <rect x="208" y="308" width="784" height="204" fill="none" stroke="${COLORS.accent}" stroke-width="0.6" opacity="0.4" rx="2"/>

  <text x="600" y="380" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="22" font-style="italic" fill="${COLORS.accent}">model cost · infrastructure · engineering time · review · rework</text>

  <line x1="260" y1="405" x2="940" y2="405" stroke="${COLORS.accent}" stroke-width="2.4"/>

  <text x="600" y="440" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="22" font-style="italic" fill="${COLORS.accent}">accepted change units</text>

  <text x="600" y="475" text-anchor="middle" font-family="Helvetica" font-size="14" fill="${COLORS.accent}" opacity="0.6">( reached production and stayed there )</text>

  <!-- Footer / domain -->
  <text x="600" y="565" text-anchor="middle" font-family="Helvetica" font-size="20" font-weight="700" letter-spacing="4" fill="${COLORS.ink}">COSTPERACCEPTEDCHANGE.ORG</text>

  <text x="600" y="590" text-anchor="middle" font-family="Helvetica" font-size="12" letter-spacing="2.5" fill="${COLORS.inkMuted}">DEFINED IN THE DELIVERY GAP · BRENN HILL · 2026</text>
</svg>`;

// ----- Post images (for LinkedIn / X / Bluesky / etc.) -----------------

/**
 * Reusable formula-stamp fragment. Positions the bordered card with
 * the numerator, division bar, denominator, and parenthetical inside
 * a (cx, cy)-centered box of given width and height.
 */
function formulaStampFragment({ cx, cy, width, height }) {
  const x = cx - width / 2;
  const y = cy - height / 2;
  const numeratorY = y + height * 0.35;
  const barY = y + height * 0.48;
  const denominatorY = y + height * 0.66;
  const subY = y + height * 0.82;
  return `
  <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="${COLORS.accent}" stroke-width="1.4" rx="3"/>
  <rect x="${x + 8}" y="${y + 8}" width="${width - 16}" height="${height - 16}" fill="none" stroke="${COLORS.accent}" stroke-width="0.6" opacity="0.4" rx="2"/>
  <text x="${cx}" y="${numeratorY}" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="22" font-style="italic" fill="${COLORS.accent}">model · infrastructure · engineering · review · rework</text>
  <line x1="${x + 40}" y1="${barY}" x2="${x + width - 40}" y2="${barY}" stroke="${COLORS.accent}" stroke-width="2.4"/>
  <text x="${cx}" y="${denominatorY}" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="22" font-style="italic" fill="${COLORS.accent}">accepted change units</text>
  <text x="${cx}" y="${subY}" text-anchor="middle" font-family="Helvetica" font-size="13" fill="${COLORS.accent}" opacity="0.6">( reached production and stayed there )</text>`;
}

/**
 * Provocative post image — square 1200x1200, universal social size.
 * Lead hook: "AI made code generation faster. Not delivery."
 */
const postHookSquareSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" width="1200" height="1200">
  <rect width="1200" height="1200" fill="${COLORS.paper}"/>

  <!-- Outer hairline frame -->
  <rect x="40" y="40" width="1120" height="1120" fill="none" stroke="${COLORS.accent}" stroke-width="1" opacity="0.3" rx="4"/>

  <!-- Eyebrow -->
  <text x="600" y="150" text-anchor="middle" font-family="Helvetica" font-size="22" font-weight="700" letter-spacing="6" fill="${COLORS.accent}" opacity="0.8">THE DELIVERY GAP</text>

  <!-- Headline (two lines) -->
  <text x="600" y="320" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="92" font-weight="600" fill="${COLORS.ink}">AI made code</text>
  <text x="600" y="425" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="92" font-weight="600" fill="${COLORS.ink}">generation faster.</text>

  <!-- Counter line -->
  <text x="600" y="540" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="68" font-style="italic" font-weight="600" fill="${COLORS.accent}">Not delivery.</text>

  <!-- Decorative rule -->
  <line x1="540" y1="600" x2="660" y2="600" stroke="${COLORS.accent}" stroke-width="1.2" opacity="0.55"/>

  <!-- Body -->
  <text x="600" y="660" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="28" font-style="italic" fill="${COLORS.inkMuted}">Cost per accepted change. The bottom-line metric</text>
  <text x="600" y="703" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="28" font-style="italic" fill="${COLORS.inkMuted}">for AI-augmented software delivery.</text>

  <!-- Formula stamp -->
  ${formulaStampFragment({ cx: 600, cy: 880, width: 880, height: 220 })}

  <!-- Domain -->
  <text x="600" y="1080" text-anchor="middle" font-family="Helvetica" font-size="26" font-weight="700" letter-spacing="5" fill="${COLORS.ink}">COSTPERACCEPTEDCHANGE.ORG</text>

  <!-- Byline -->
  <text x="600" y="1120" text-anchor="middle" font-family="Helvetica" font-size="14" letter-spacing="3" fill="${COLORS.inkMuted}">DEFINED IN THE DELIVERY GAP · BRENN HILL · 2026</text>
</svg>`;

/**
 * LinkedIn-optimal portrait, 1080x1350 (4:5 aspect). Same hook, repositioned.
 */
const postHookPortraitSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350">
  <rect width="1080" height="1350" fill="${COLORS.paper}"/>

  <!-- Outer hairline frame -->
  <rect x="36" y="36" width="1008" height="1278" fill="none" stroke="${COLORS.accent}" stroke-width="1" opacity="0.3" rx="4"/>

  <!-- Eyebrow -->
  <text x="540" y="160" text-anchor="middle" font-family="Helvetica" font-size="22" font-weight="700" letter-spacing="6" fill="${COLORS.accent}" opacity="0.8">THE DELIVERY GAP</text>

  <!-- Headline (two lines) -->
  <text x="540" y="340" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="88" font-weight="600" fill="${COLORS.ink}">AI made code</text>
  <text x="540" y="445" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="88" font-weight="600" fill="${COLORS.ink}">generation faster.</text>

  <!-- Counter -->
  <text x="540" y="570" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="68" font-style="italic" font-weight="600" fill="${COLORS.accent}">Not delivery.</text>

  <!-- Decorative rule -->
  <line x1="480" y1="630" x2="600" y2="630" stroke="${COLORS.accent}" stroke-width="1.2" opacity="0.55"/>

  <!-- Body -->
  <text x="540" y="700" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="28" font-style="italic" fill="${COLORS.inkMuted}">Cost per accepted change. The bottom-line metric</text>
  <text x="540" y="743" text-anchor="middle" font-family="Source Serif 4, Iowan Old Style, Charter, Georgia, serif" font-size="28" font-style="italic" fill="${COLORS.inkMuted}">for AI-augmented software delivery.</text>

  <!-- Formula stamp -->
  ${formulaStampFragment({ cx: 540, cy: 945, width: 820, height: 220 })}

  <!-- Domain -->
  <text x="540" y="1210" text-anchor="middle" font-family="Helvetica" font-size="26" font-weight="700" letter-spacing="5" fill="${COLORS.ink}">COSTPERACCEPTEDCHANGE.ORG</text>

  <!-- Byline -->
  <text x="540" y="1250" text-anchor="middle" font-family="Helvetica" font-size="14" letter-spacing="3" fill="${COLORS.inkMuted}">DEFINED IN THE DELIVERY GAP · BRENN HILL · 2026</text>
</svg>`;

// ----- Render helpers --------------------------------------------------

function writeSvg(path, content) {
  writeFileSync(path, content);
  console.log(`wrote ${path}`);
}

async function renderPng(svgString, outPath, fitWidth) {
  const fontBuffers = await loadFontBuffers();
  const resvg = new Resvg(svgString, {
    fitTo: fitWidth ? { mode: 'width', value: fitWidth } : undefined,
    background: 'rgba(255,255,255,0)',
    font: {
      // TTF buffers from the bundled Source Serif 4 woff2 files (decompressed
      // at startup). System fonts still load for the Helvetica UI labels.
      fontBuffers,
      loadSystemFonts: true,
      defaultFontFamily: 'Source Serif 4',
    },
  });
  const png = resvg.render().asPng();
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath}`);
}

// ----- Build -----------------------------------------------------------

async function build() {
  // Prove the bundled font is actually rendering before producing any
  // user-facing PNG. Aborts loudly if resvg silently dropped the buffers.
  await assertFontsLoaded();

  // Mark
  const markStandalone = markSvg(COLORS.accent, COLORS.paper);
  writeSvg(join(ASSETS_DIR, 'mark.svg'), markStandalone);
  await renderPng(markStandalone, join(ASSETS_DIR, 'mark.png'), 512);

  // CPAC graphic
  const cpac = cpacGraphicSvg(COLORS.accent);
  writeSvg(join(ASSETS_DIR, 'cpac-graphic.svg'), cpac);
  await renderPng(cpac, join(ASSETS_DIR, 'cpac-graphic.png'), 1200);

  // Verification Triangle
  const triangle = triangleSvg(COLORS.ink, 'cost');
  writeSvg(join(ASSETS_DIR, 'verification-triangle.svg'), triangle);
  await renderPng(triangle, join(ASSETS_DIR, 'verification-triangle.png'), 720);

  // OG image (1200x630, render at intrinsic size)
  const og = ogImageSvg();
  writeSvg(join(ASSETS_DIR, 'og-image.svg'), og);
  await renderPng(og, join(PUBLIC_DIR, 'og-image.png'), 1200);

  // Social post image — square (universal: X, Bluesky, LinkedIn, Mastodon)
  const postSquare = postHookSquareSvg();
  writeSvg(join(ASSETS_DIR, 'post-hook-square.svg'), postSquare);
  await renderPng(postSquare, join(ASSETS_DIR, 'post-hook-square.png'), 1200);

  // Social post image — portrait (LinkedIn-optimal 4:5)
  const postPortrait = postHookPortraitSvg();
  writeSvg(join(ASSETS_DIR, 'post-hook-portrait.svg'), postPortrait);
  await renderPng(postPortrait, join(ASSETS_DIR, 'post-hook-portrait.png'), 1080);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
