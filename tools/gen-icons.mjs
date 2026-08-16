import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'icons');
const S = 128;

const crc32 = (buf) => {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

const encodePNG = (w, h, rgba) => {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

const px = (size) => {
  const buf = Buffer.alloc(size * size * 4);
  const put = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  };
  const f = size / S;
  // white sheet
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, 0xfd, 0xfd, 0xfb);
  // blueprint grid
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (y % 8 === 0 || x % 8 === 0) {
        put(x, y, 0x7a, 0xa2, 0xe3);
      }
    }
  }
  // ink step bars: 3 horizontal lines
  for (let i = 0; i < 3; i++) {
    const y0 = (26 + i * 30) * f;
    for (let y = 0; y < 4 * f; y++) {
      for (let x = 12 * f; x < 116 * f; x++) {
        put(Math.round(x), Math.round(y0 + y), 0x0f, 0x17, 0x2a);
      }
    }
  }
  // orange stamp square
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x / f - 40), dy = (y / f - 78);
      if (dx < 14 && dx > -14 && dy < 14 && dy > -14 && ((x + y) % 4 !== 0)) put(x, y, 0xff, 0x8c, 0x1a);
    }
  }
  // stamp border
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x / f - 40), dy = (y / f - 78);
      if ((Math.abs(dx) === 14 || Math.abs(dy) === 14)) put(x, y, 0xff, 0x8c, 0x1a);
    }
  }
  return buf;
};

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 48, 128]) {
  const p = path.join(OUT_DIR, `icon${size}.png`);
  fs.writeFileSync(p, encodePNG(size, size, px(size)));
  console.log('icon: ' + p);
}