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
 *
 * Run with: node scripts/generate-assets.mjs
 */

import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const ASSETS_DIR = join(PUBLIC_DIR, 'assets');

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
  <text x="32" y="27" text-anchor="middle" font-family="Iowan Old Style, Charter, Georgia, serif" font-size="22" font-weight="600" fill="${color}">$</text>
  <line x1="12" y1="33" x2="52" y2="33" stroke="${color}" stroke-width="2.4" stroke-linecap="round"/>
  <text x="32" y="53" text-anchor="middle" font-family="Iowan Old Style, Charter, Georgia, serif" font-size="18" font-weight="600" fill="${color}">AC</text>
</svg>`;

// ----- CPAC Graphic (the formula stamp) --------------------------------

const cpacGraphicSvg = (color = COLORS.accent) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 252" width="600" height="252">
  <rect x="6" y="6" width="588" height="240" fill="none" stroke="${color}" stroke-width="0.8" rx="2"/>
  <rect x="14" y="14" width="572" height="224" fill="none" stroke="${color}" stroke-width="0.4" opacity="0.4" rx="1"/>
  <text x="300" y="44" text-anchor="middle" font-family="Helvetica" font-size="10" font-weight="700" letter-spacing="3.2" fill="${color}" opacity="0.7">COST PER ACCEPTED CHANGE</text>
  <line x1="220" y1="54" x2="278" y2="54" stroke="${color}" stroke-width="0.5" opacity="0.45"/>
  <line x1="322" y1="54" x2="380" y2="54" stroke="${color}" stroke-width="0.5" opacity="0.45"/>
  <circle cx="300" cy="54" r="1.4" fill="${color}" opacity="0.55"/>
  <text x="300" y="103" text-anchor="middle" font-family="Iowan Old Style, Charter, Georgia, serif" font-size="15" font-style="italic" fill="${color}">model cost · infrastructure · engineering time · review · rework</text>
  <line x1="76" y1="124" x2="524" y2="124" stroke="${color}" stroke-width="1.6"/>
  <text x="300" y="150" text-anchor="middle" font-family="Iowan Old Style, Charter, Georgia, serif" font-size="15" font-style="italic" fill="${color}">accepted change units</text>
  <text x="300" y="170" text-anchor="middle" font-family="Helvetica" font-size="9" fill="${color}" opacity="0.55">( reached production and stayed there )</text>
  <g transform="translate(282, 185)" fill="${color}">
    <text x="18" y="14" text-anchor="middle" font-family="Iowan Old Style, Charter, Georgia, serif" font-size="13" font-weight="600">$</text>
    <line x1="4" y1="19" x2="32" y2="19" stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>
    <text x="18" y="33" text-anchor="middle" font-family="Iowan Old Style, Charter, Georgia, serif" font-size="11" font-weight="600">AC</text>
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
  <text x="120" y="20" text-anchor="middle" font-family="Iowan Old Style, Charter, Georgia, serif" font-size="13" font-weight="600" fill="${color}">Intent clarity</text>
  <circle cx="34" cy="180" r="${r('eval')}" fill="${f('eval')}" stroke="${color}" stroke-width="1.6"/>
  <text x="34" y="204" text-anchor="middle" font-family="Iowan Old Style, Charter, Georgia, serif" font-size="13" font-weight="600" fill="${color}">Eval quality</text>
  <circle cx="206" cy="180" r="${r('cost')}" fill="${f('cost')}" stroke="${color}" stroke-width="1.6"/>
  <text x="206" y="204" text-anchor="middle" font-family="Iowan Old Style, Charter, Georgia, serif" font-size="13" font-weight="600" fill="${color}">Cost</text>
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
  <text x="600" y="200" text-anchor="middle" font-family="Iowan Old Style, Charter, Georgia, serif" font-size="68" font-weight="600" fill="${COLORS.ink}">Cost per accepted change</text>

  <!-- Subtitle -->
  <text x="600" y="252" text-anchor="middle" font-family="Iowan Old Style, Charter, Georgia, serif" font-size="22" font-style="italic" fill="${COLORS.inkMuted}">The fully-loaded cost of producing software that stayed in production.</text>

  <!-- Formula block -->
  <rect x="200" y="300" width="800" height="220" fill="none" stroke="${COLORS.accent}" stroke-width="1.4" rx="3"/>
  <rect x="208" y="308" width="784" height="204" fill="none" stroke="${COLORS.accent}" stroke-width="0.6" opacity="0.4" rx="2"/>

  <text x="600" y="380" text-anchor="middle" font-family="Iowan Old Style, Charter, Georgia, serif" font-size="22" font-style="italic" fill="${COLORS.accent}">model cost · infrastructure · engineering time · review · rework</text>

  <line x1="260" y1="405" x2="940" y2="405" stroke="${COLORS.accent}" stroke-width="2.4"/>

  <text x="600" y="440" text-anchor="middle" font-family="Iowan Old Style, Charter, Georgia, serif" font-size="22" font-style="italic" fill="${COLORS.accent}">accepted change units</text>

  <text x="600" y="475" text-anchor="middle" font-family="Helvetica" font-size="14" fill="${COLORS.accent}" opacity="0.6">( reached production and stayed there )</text>

  <!-- Footer / domain -->
  <text x="600" y="565" text-anchor="middle" font-family="Helvetica" font-size="20" font-weight="700" letter-spacing="4" fill="${COLORS.ink}">COSTPERACCEPTEDCHANGE.ORG</text>

  <text x="600" y="590" text-anchor="middle" font-family="Helvetica" font-size="12" letter-spacing="2.5" fill="${COLORS.inkMuted}">DEFINED IN THE DELIVERY GAP · BRENN HILL · 2026</text>
</svg>`;

// ----- Render helpers --------------------------------------------------

function writeSvg(path, content) {
  writeFileSync(path, content);
  console.log(`wrote ${path}`);
}

function renderPng(svgString, outPath, fitWidth) {
  const resvg = new Resvg(svgString, {
    fitTo: fitWidth ? { mode: 'width', value: fitWidth } : undefined,
    background: 'rgba(255,255,255,0)',
    font: {
      loadSystemFonts: true,
    },
  });
  const png = resvg.render().asPng();
  writeFileSync(outPath, png);
  console.log(`wrote ${outPath}`);
}

// ----- Build -----------------------------------------------------------

function build() {
  // Mark
  const markStandalone = markSvg(COLORS.accent, COLORS.paper);
  writeSvg(join(ASSETS_DIR, 'mark.svg'), markStandalone);
  renderPng(markStandalone, join(ASSETS_DIR, 'mark.png'), 512);

  // CPAC graphic
  const cpac = cpacGraphicSvg(COLORS.accent);
  writeSvg(join(ASSETS_DIR, 'cpac-graphic.svg'), cpac);
  renderPng(cpac, join(ASSETS_DIR, 'cpac-graphic.png'), 1200);

  // Verification Triangle
  const triangle = triangleSvg(COLORS.ink, 'cost');
  writeSvg(join(ASSETS_DIR, 'verification-triangle.svg'), triangle);
  renderPng(triangle, join(ASSETS_DIR, 'verification-triangle.png'), 720);

  // OG image (1200x630, render at intrinsic size)
  const og = ogImageSvg();
  writeSvg(join(ASSETS_DIR, 'og-image.svg'), og);
  renderPng(og, join(PUBLIC_DIR, 'og-image.png'), 1200);
}

build();
