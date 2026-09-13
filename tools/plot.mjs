// Render each circuit to a PNG (top view, north = up) with fraction labels,
// direction arrows, and print a curvature-peak table for corner calibration.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const { CIRCUITS } = await import('../src/data/circuits.js');

// ---------- minimal PNG encoder (truecolor, no filter) ----------
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function savePNG(path, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolor
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
}

// ---------- raster helpers ----------
class Raster {
  constructor(w, h) { this.w = w; this.h = h; this.buf = Buffer.alloc(w * h * 3); }
  fill(r, g, b) { for (let i = 0; i < this.w * this.h; i++) { this.buf[i * 3] = r; this.buf[i * 3 + 1] = g; this.buf[i * 3 + 2] = b; } }
  px(x, y, r, g, b) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 3;
    this.buf[i] = r; this.buf[i + 1] = g; this.buf[i + 2] = b;
  }
  dot(x, y, rad, r, g, b) { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad) this.px(x + dx, y + dy, r, g, b); }
  line(x0, y0, x1, y1, r, g, b, th = 1) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const steps = Math.max(dx, dy, 1);
    for (let i = 0; i <= steps; i++) {
      const x = x0 + (x1 - x0) * i / steps, y = y0 + (y1 - y0) * i / steps;
      if (th <= 1) this.px(x, y, r, g, b); else this.dot(x, y, th, r, g, b);
    }
  }
}
const FONT = { // 3x5 digit font
  '0': ['111','101','101','101','111'], '1': ['010','110','010','010','111'],
  '2': ['111','001','111','100','111'], '3': ['111','001','111','001','111'],
  '4': ['101','101','111','001','001'], '5': ['111','100','111','001','111'],
  '6': ['111','100','111','101','111'], '7': ['111','001','010','010','010'],
  '8': ['111','101','111','101','111'], '9': ['111','101','111','001','111'],
};
function text(im, str, x, y, r, g, b, s = 2) {
  let cx = x;
  for (const ch of str) {
    const glyph = FONT[ch];
    if (glyph) for (let gy = 0; gy < 5; gy++) for (let gx = 0; gx < 3; gx++)
      if (glyph[gy][gx] === '1') for (let sy = 0; sy < s; sy++) for (let sx = 0; sx < s; sx++)
        im.px(cx + gx * s + sx, y + gy * s + sy, r, g, b);
    cx += 4 * s;
  }
}

// ---------- per-circuit plot + curvature analysis ----------
mkdirSync('tools/out', { recursive: true });
for (const [id, c] of Object.entries(CIRCUITS)) {
  const P = c.pts, n = P.length;
  const cum = [0];
  for (let i = 1; i <= n; i++) {
    const p = P[i - 1], q = P[i % n];
    cum.push(cum[i - 1] + Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  const total = cum[n];
  const at = s => { // point at arc length s
    s = ((s % total) + total) % total;
    let i = 0;
    while (cum[i + 1] < s) i++;
    const t = (s - cum[i]) / (cum[i + 1] - cum[i] || 1);
    const p = P[i], q = P[(i + 1) % n];
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  };

  // winding (shoelace; screen coords y down: positive area => clockwise on screen)
  let area = 0;
  for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
  console.log(`\n=== ${id}: len=${Math.round(total)} m, winding(screen)=${area > 0 ? 'CW' : 'CCW'} (net, fig-8 may cancel)`);

  // curvature at 4 m steps via heading change over ±10 m
  const step = 4, m = Math.floor(total / step), kappa = [];
  for (let i = 0; i < m; i++) {
    const s = i * step;
    const a = at(s - 10), b0 = at(s), d = at(s + 10);
    const h1 = Math.atan2(b0[1] - a[1], b0[0] - a[0]);
    const h2 = Math.atan2(d[1] - b0[1], d[0] - b0[0]);
    let dh = h2 - h1;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    kappa.push(dh / 20); // rad per meter, signed (+ = turning right on screen)
  }
  // find local |kappa| peaks with min separation 30 m
  const peaks = [];
  for (let i = 0; i < m; i++) {
    const k = Math.abs(kappa[i]);
    if (k < 0.008) continue;
    let isPeak = true;
    for (let j = -7; j <= 7; j++) if (Math.abs(kappa[(i + j + m) % m]) > k) { isPeak = false; break; }
    if (isPeak) peaks.push({ frac: i * step / total, radius: 1 / k, dir: kappa[i] > 0 ? 'R' : 'L' });
  }
  peaks.sort((a, b) => a.frac - b.frac);
  const merged = [];
  for (const p of peaks) if (!merged.length || (p.frac - merged[merged.length - 1].frac) * total > 25) merged.push(p);
  console.log('corner peaks (frac / radius m / dir-on-screen):');
  console.log(merged.map(p => `${p.frac.toFixed(3)} r=${p.radius.toFixed(0)} ${p.dir}`).join('\n'));

  // ---------- draw ----------
  const W = 720, H = 720, im = new Raster(W, H);
  im.fill(24, 26, 33);
  const xs = P.map(p => p[0]), zs = P.map(p => p[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), minz = Math.min(...zs), maxz = Math.max(...zs);
  const sc = 640 / Math.max(maxx - minx, maxz - minz);
  const ox = (W - (maxx - minx) * sc) / 2, oz = (H - (maxz - minz) * sc) / 2;
  const S = p => [ox + (p[0] - minx) * sc, oz + (p[1] - minz) * sc];

  for (let s = 0; s < total; s += 2) {
    const [x0, y0] = S(at(s)), [x1, y1] = S(at(s + 2));
    im.line(x0, y0, x1, y1, 90, 160, 220, 2);
  }
  for (let f = 0; f < 1; f += 0.01) { // fine ticks
    const [x, y] = S(at(f * total));
    im.dot(x, y, 1, 150, 150, 90);
  }
  for (let f = 0; f < 1 - 1e-9; f += 0.05) {
    const [x, y] = S(at(f * total));
    im.dot(x, y, 3, 255, 210, 74);
    text(im, String(Math.round(f * 100)).padStart(2, '0'), x + 6, y - 6, 255, 210, 74, 2);
    if (Math.round(f * 100) % 10 === 0) { // direction arrow
      const [x2, y2] = S(at(f * total + 25));
      const a = Math.atan2(y2 - y, x2 - x);
      im.line(x, y, x2, y2, 255, 80, 80, 1);
      im.line(x2, y2, x2 + Math.cos(a + 2.7) * 9, y2 + Math.sin(a + 2.7) * 9, 255, 80, 80, 2);
      im.line(x2, y2, x2 + Math.cos(a - 2.7) * 9, y2 + Math.sin(a - 2.7) * 9, 255, 80, 80, 2);
    }
  }
  const [sx, sy] = S(P[0]);
  im.dot(sx, sy, 6, 80, 255, 120); // index-0 marker (green)
  savePNG(`tools/out/${id}.png`, W, H, im.buf);
  console.log(`wrote tools/out/${id}.png`);
}
