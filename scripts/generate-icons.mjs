/**
 * Generates CalDrop's app icons as PNG files with no image dependencies.
 *
 *   node scripts/generate-icons.mjs
 *
 * The mark: a calendar page with a single drop resting in it - "drop anything,
 * it's on your calendar". Shapes are rendered with 4x4 supersampling for
 * anti-aliased edges and encoded with node:zlib.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const INK = [17, 24, 39];
const PAPER = [250, 250, 249];
const HEADER = [214, 211, 209];

const SUPERSAMPLE = 4;

// ---- geometry (normalised 0..1 coordinates) --------------------------------

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

const CARD = { x0: 0.24, y0: 0.28, x1: 0.76, y1: 0.76, r: 0.07 };
const HEADER_BOTTOM = 0.385;
const DROP = { cx: 0.5, cy: 0.605, r: 0.085, tipY: 0.435 };

function inDrop(x, y) {
  const { cx, cy, r, tipY } = DROP;
  if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
  // Cone from the tip, tangent to the circle.
  const d = cy - tipY;
  const sinA = r / d;
  const tanA = sinA / Math.sqrt(1 - sinA * sinA);
  const tangentY = cy - r * sinA;
  return y >= tipY && y <= tangentY && Math.abs(x - cx) <= (y - tipY) * tanA;
}

/** Colour of the design at a normalised point. */
function sample(x, y) {
  if (inRoundedRect(x, y, CARD.x0, CARD.y0, CARD.x1, CARD.y1, CARD.r)) {
    if (inDrop(x, y)) return INK;
    if (y < HEADER_BOTTOM) return HEADER;
    return PAPER;
  }
  return INK;
}

// ---- rasterise --------------------------------------------------------------

function render(size, contentScale) {
  const rgba = Buffer.alloc(size * size * 4);
  const n = SUPERSAMPLE * SUPERSAMPLE;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const u = (px + (sx + 0.5) / SUPERSAMPLE) / size;
          const v = (py + (sy + 0.5) / SUPERSAMPLE) / size;
          // Scale the design about the centre (maskable icons need a safe zone).
          const [cr, cg, cb] = sample(0.5 + (u - 0.5) / contentScale, 0.5 + (v - 0.5) / contentScale);
          r += cr;
          g += cg;
          b += cb;
        }
      }
      const i = (py * size + px) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

// ---- PNG encoding -----------------------------------------------------------

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    rows[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- outputs ----------------------------------------------------------------

// Scale 1 keeps the card's corners within the maskable safe zone (a circle of
// radius 0.4); plain icons are never cropped, so the mark can be larger there.
const OUTPUTS = [
  { file: 'public/icons/icon-192.png', size: 192, scale: 1.15 },
  { file: 'public/icons/icon-512.png', size: 512, scale: 1.15 },
  { file: 'public/icons/icon-maskable-512.png', size: 512, scale: 1 },
  { file: 'public/icons/apple-touch-icon.png', size: 180, scale: 1.15 },
  { file: 'src/app/icon.png', size: 64, scale: 1.3 },
];

for (const { file, size, scale } of OUTPUTS) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePng(size, render(size, scale)));
  console.log(`wrote ${file} (${size}x${size})`);
}
