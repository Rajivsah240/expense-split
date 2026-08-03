/**
 * Generates the PWA icon set into public/icons.
 *
 * Written from scratch (no image dependency): shapes are evaluated as signed
 * distance fields per pixel for clean anti-aliasing at any size, then encoded as
 * PNG with Node's built-in zlib.
 *
 * The mark is a disc split into three wedges — the app's whole idea in one glyph.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BRAND_TOP = [110, 92, 247];
const BRAND_BOTTOM = [71, 54, 217];
const WEDGE_ALPHA = [1, 0.86, 0.72];

// ── PNG encoding ─────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  // Each scanline is prefixed with filter type 0 (none).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Geometry ─────────────────────────────────────────────────────────────────

const clamp01 = value => (value < 0 ? 0 : value > 1 ? 1 : value);
/** Convert a signed distance (negative = inside) into 1px-wide anti-aliased coverage. */
const coverage = distance => clamp01(0.5 - distance);

function roundedRectDistance(x, y, width, height, radius) {
  const dx = Math.abs(x - width / 2) - (width / 2 - radius);
  const dy = Math.abs(y - height / 2) - (height / 2 - radius);
  const outsideX = Math.max(dx, 0);
  const outsideY = Math.max(dy, 0);
  return Math.min(Math.max(dx, dy), 0) + Math.hypot(outsideX, outsideY) - radius;
}

/** Distance from a point to the segment running from the centre out to `angle`. */
function rayDistance(px, py, cx, cy, angle, length) {
  const ex = cx + Math.cos(angle) * length;
  const ey = cy + Math.sin(angle) * length;
  const vx = ex - cx;
  const vy = ey - cy;
  const wx = px - cx;
  const wy = py - cy;
  const t = clamp01((wx * vx + wy * vy) / (vx * vx + vy * vy));
  return Math.hypot(wx - vx * t, wy - vy * t);
}

function blend(target, offset, rgb, alpha) {
  if (alpha <= 0) return;
  const inverse = 1 - alpha;
  target[offset] = Math.round(rgb[0] * alpha + target[offset] * inverse);
  target[offset + 1] = Math.round(rgb[1] * alpha + target[offset + 1] * inverse);
  target[offset + 2] = Math.round(rgb[2] * alpha + target[offset + 2] * inverse);
  target[offset + 3] = Math.round(255 * alpha + target[offset + 3] * inverse);
}

/**
 * @param size    pixel dimensions of the square canvas
 * @param maskable full-bleed background with the mark inside the 80% safe zone
 */
function renderIcon(size, maskable) {
  const rgba = Buffer.alloc(size * size * 4, 0);

  const cornerRadius = maskable ? 0 : size * 0.225;
  const markRadius = size * (maskable ? 0.28 : 0.335);
  const gapWidth = size * (maskable ? 0.05 : 0.058);
  const cx = size / 2;
  const cy = size / 2;

  // Wedge boundaries at 90°, 210° and 330° — a three-way split.
  const rays = [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 + (4 * Math.PI) / 3];

  for (let y = 0; y < size; y += 1) {
    const py = y + 0.5;
    // Vertical brand gradient, computed once per row.
    const mix = py / size;
    const background = [
      BRAND_TOP[0] + (BRAND_BOTTOM[0] - BRAND_TOP[0]) * mix,
      BRAND_TOP[1] + (BRAND_BOTTOM[1] - BRAND_TOP[1]) * mix,
      BRAND_TOP[2] + (BRAND_BOTTOM[2] - BRAND_TOP[2]) * mix,
    ];

    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const offset = (y * size + x) * 4;

      const backgroundAlpha = maskable
        ? 1
        : coverage(roundedRectDistance(px, py, size, size, cornerRadius));
      blend(rgba, offset, background, backgroundAlpha);
      if (backgroundAlpha <= 0) continue;

      // Which wedge does this pixel belong to?
      let angle = Math.atan2(py - cy, px - cx) - Math.PI / 2;
      while (angle < 0) angle += Math.PI * 2;
      const wedge = Math.min(2, Math.floor(angle / ((Math.PI * 2) / 3)));

      const discCoverage = coverage(Math.hypot(px - cx, py - cy) - markRadius);
      if (discCoverage <= 0) continue;

      // Carve the gaps out of the disc.
      let gapCoverage = 0;
      for (const ray of rays) {
        gapCoverage = Math.max(gapCoverage, coverage(rayDistance(px, py, cx, cy, ray, markRadius) - gapWidth / 2));
      }

      const alpha = discCoverage * (1 - gapCoverage) * WEDGE_ALPHA[wedge] * backgroundAlpha;
      blend(rgba, offset, [255, 255, 255], alpha);
    }
  }

  return encodePng(size, size, rgba);
}

const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6e5cf7"/>
      <stop offset="1" stop-color="#4736d9"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14.4" fill="url(#b)"/>
  <g fill="#fff" stroke="url(#b)" stroke-width="3.7">
    <path d="M32 32 L32 10.6 A21.4 21.4 0 0 1 50.5 42.7 Z" opacity="1"/>
    <path d="M32 32 L50.5 42.7 A21.4 21.4 0 0 1 13.5 42.7 Z" opacity=".86"/>
    <path d="M32 32 L13.5 42.7 A21.4 21.4 0 0 1 32 10.6 Z" opacity=".72"/>
  </g>
</svg>
`;

fs.mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['maskable-192.png', 192, true],
  ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
  ['favicon-32.png', 32, false],
];

for (const [name, size, maskable] of targets) {
  fs.writeFileSync(path.join(OUT_DIR, name), renderIcon(size, maskable));
  console.log(`  icons/${name} (${size}×${size})`);
}

fs.writeFileSync(path.join(OUT_DIR, 'favicon.svg'), FAVICON_SVG);
console.log('  icons/favicon.svg');
