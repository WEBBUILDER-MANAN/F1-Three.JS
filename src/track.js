import * as THREE from 'three';
import { CIRCUITS } from './data/circuits.js';

const UP = new THREE.Vector3(0, 1, 0);

// Pre-allocated temporary vectors to eliminate garbage collection pauses during geometry generation and queries
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = {};

/**
 * Zero-allocation array smoothing using double buffering.
 */
function smoothArrayInPlace(arr, radius, passes = 1, circular = true) {
  const n = arr.length;
  let src = arr instanceof Float64Array ? arr : Float64Array.from(arr);
  let out = new Float64Array(n);

  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let j = -radius; j <= radius; j++) {
        const k = circular ? (i + j + n) % n : Math.min(n - 1, Math.max(0, i + j));
        sum += src[k]; 
        cnt++;
      }
      out[i] = sum / cnt;
    }
    // Swap buffers without reallocation
    const temp = src;
    src = out;
    out = temp;
  }
  return src;
}

export class Track {
  constructor(cfg) {
    this.cfg = cfg;
    this.width = cfg.width;
    this.group = new THREE.Group();
    this.build();
  }

  build() {
    const cfg = this.cfg;
    const raw = CIRCUITS[cfg.id].pts;
    const pts3 = raw.map(p => new THREE.Vector3(p[0], 0, p[1]));
    if (cfg.reverse) pts3.reverse();
    
    const curve = new THREE.CatmullRomCurve3(pts3, true, 'centripetal', 0.5);
    curve.arcLengthDivisions = 3000;

    const approxLen = curve.getLength();
    const N = this.N = Math.round(approxLen / 2.5);

    // Sample centerline starting at the Start/Finish line
    const pos = new Array(N);
    for (let i = 0; i < N; i++) {
      const u = (cfg.startFrac + i / N) % 1;
      pos[i] = curve.getPointAt(u);
    }

    // Process Elevation Profile
    const elev = cfg.elevation;
    const M = elev.length;
    const cp = i => {
      const k = ((i % M) + M) % M;
      const lap = Math.floor(i / M);
      return [elev[k][0] + lap, elev[k][1]];
    };

    const elevAt = f => {
      let i = 0;
      while (i < M && !(f >= cp(i)[0] && f <= cp(i + 1)[0])) i++;
      if (i >= M) i = M - 1;
      const p0 = cp(i - 1), p1 = cp(i), p2 = cp(i + 1), p3 = cp(i + 2);
      const t = (f - p1[0]) / (p2[0] - p1[0] || 1);
      
      const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0] || 1)) * (p2[0] - p1[0]);
      const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0] || 1)) * (p2[0] - p1[0]);
      
      const t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1
           + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
    };

    let ys = new Float64Array(N);
    for (let i = 0; i < N; i++) ys[i] = elevAt(cfg.elevation[0][0] + i / N);
    ys = smoothArrayInPlace(ys, 8, 2);
    for (let i = 0; i < N; i++) pos[i].y = ys[i];

    // Compute Arc Lengths, Tangents, and Normals
    const s = new Float64Array(N + 1);
    s[0] = 0;
    for (let i = 1; i <= N; i++) {
      s[i] = s[i - 1] + pos[i - 1].distanceTo(pos[i % N]);
    }
    this.length = s[N];

    const samples = this.samples = new Array(N);
    for (let i = 0; i < N; i++) {
      const prev = pos[(i - 1 + N) % N], next = pos[(i + 1) % N];
      const dx = next.x - prev.x;
      const dz = next.z - prev.z;
      const horiz = Math.hypot(dx, dz) || 1;
      
      const t = new THREE.Vector3(dx / horiz, 0, dz / horiz);
      const n = new THREE.Vector3(-t.z, 0, t.x);
      
      samples[i] = {
        p: pos[i], t, n, 
        s: s[i], frac: s[i] / this.length,
        dyds: (next.y - prev.y) / (horiz + Math.abs(next.y - prev.y) * 0.2),
        kappa: 0, kerb: false, wallL: 0, wallR: 0, vT: 0, idx: i,
      };
    }

    // Compute Curvature
    let kappa = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const t1 = samples[i].t, t2 = samples[(i + 1) % N].t;
      const cross = t1.z * t2.x - t1.x * t2.z;
      const dot = THREE.MathUtils.clamp(t1.dot(t2), -1, 1);
      const ang = Math.asin(THREE.MathUtils.clamp(cross, -1, 1)) * Math.sign(dot >= 0 ? 1 : 1);
      const ds = (s[i + 1] - s[i]) || 1;
      kappa[i] = ang / ds;
    }
    
    kappa = smoothArrayInPlace(kappa, 4, 2);
    for (let i = 0; i < N; i++) {
      samples[i].kappa = kappa[i];
      if (Math.abs(kappa[i]) > cfg.kerbThreshold) {
        for (let j = -5; j <= 5; j++) samples[(i + j + N) % N].kerb = true;
      }
    }

    // Map Track Proximity
    const baseWallDist = this.width / 2 + cfg.wallDist;
    const skipApron = new Array(N).fill(false);
    for (let i = 0; i < N; i++) { 
      samples[i].wallL = baseWallDist; 
      samples[i].wallR = baseWallDist; 
    }
    
    const crossPairs = [];
    const minOther = new Float64Array(N).fill(Infinity);
    
    for (let i = 0; i < N; i += 2) {
      const a = samples[i];
      for (let j = i + 28; j < N; j += 2) {
        if ((N - (j - i)) < 28) continue;
        const b = samples[j];
        const dx = a.p.x - b.p.x, dz = a.p.z - b.p.z;
        const d2 = dx * dx + dz * dz;
        
        if (d2 > 16900) continue;
        
        const d = Math.sqrt(d2);
        if (d < minOther[i]) { 
            minOther[i] = d; 
            if (i + 1 < N) minOther[i + 1] = Math.min(minOther[i + 1], d + 2.5); 
        }
        if (d < minOther[j]) { 
            minOther[j] = d; 
            if (j + 1 < N) minOther[j + 1] = Math.min(minOther[j + 1], d + 2.5); 
        }
        
        const dy = Math.abs(a.p.y - b.p.y);
        if (d < this.width + 4 && dy > 3.5) {
          crossPairs.push([i, j, d]);
          for (let k = -10; k <= 10; k++) { 
              skipApron[(i + k + N) % N] = true; 
              skipApron[(j + k + N) % N] = true; 
          }
          continue;
        }
        
        if (dy < 3.5 && d < baseWallDist * 2 + this.width) {
          const room = Math.max(1.4, (d - this.width) / 2 - 0.6);
          a.wallL = Math.min(a.wallL, room); a.wallR = Math.min(a.wallR, room);
          b.wallL = Math.min(b.wallL, room); b.wallR = Math.min(b.wallR, room);
          a.neighborH = b.p.y; b.neighborH = a.p.y;
        }
      }
    }

    const wArr = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const clear = (Math.min(minOther[i], minOther[(i + 1) % N], minOther[(i - 1 + N) % N]) - this.width) / 2 - 1;
      wArr[i] = Math.max(1.2, Math.min(cfg.apron, clear));
    }
    
    const sw = smoothArrayInPlace(wArr, 6, 1);
    for (let i = 0; i < N; i++) samples[i].apronW = sw[i];

    this.crossings = [];
    if (crossPairs.length > 0) {
      crossPairs.sort((p, q) => p[2] - q[2]);
      const used = [];
      for (const [i, j] of crossPairs) {
        if (used.some(([a, b]) => Math.abs(a - i) < 40 && Math.abs(b - j) < 40)) continue;
        used.push([i, j]);
        this.crossings.push({ 
            lowIdx: samples[i].p.y < samples[j].p.y ? i : j, 
            highIdx: samples[i].p.y < samples[j].p.y ? j : i 
        });
      }
    }
    this.skipApron = skipApron;

    for (let i = 0; i < N; i++) {
      const sm = samples[i];
      sm.wallL = Math.min(sm.wallL, samples[(i + 1) % N].wallL + 0.5, samples[(i - 1 + N) % N].wallL + 0.5);
      sm.wallR = Math.min(sm.wallR, samples[(i + 1) % N].wallR + 0.5, samples[(i - 1 + N) % N].wallR + 0.5);
    }

    // Spatial Hash Grid
    this.cell = 12;
    this.grid = new Map();
    for (let i = 0; i < N; i++) {
      const sm = samples[i];
      const k = `${Math.floor(sm.p.x / this.cell)},${Math.floor(sm.p.z / this.cell)}`;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(i);
    }

    this.computeProfile();
    this.computeRacingLine();

    // Generate Geometry
    this.buildRoad();
    this.buildKerbs();
    this.buildWalls();
    this.buildStartLine();

    this.minimap = [];
    for (let i = 0; i < N; i += 4) {
        this.minimap.push([samples[i].p.x, samples[i].p.z]);
    }
  }

  computeProfile() {
    const { samples, N } = this;
    const mu = 1.72, m = 798, kDF = 3.15, g = 9.81, vCap = 92;
    const v = new Float64Array(N);
    
    for (let i = 0; i < N; i++) {
      const k = Math.abs(samples[i].kappa);
      const denom = k - (mu * kDF / m) * 0.92;
      v[i] = denom > 1e-5 ? Math.min(Math.sqrt(mu * g * 0.92 / denom), vCap) : vCap;
    }
    
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const j = (i + 1) % N;
        const ds = ((samples[j].s - samples[i].s) + this.length) % this.length;
        const aBrake = mu * (g + kDF * v[j] * v[j] / m) * 0.80;
        v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * aBrake * ds));
      }
    }
    
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const ds = ((samples[j].s - samples[i].s) + this.length) % this.length;
        const aAcc = Math.min(735000 / Math.max(v[i], 8) / m, 13);
        v[j] = Math.min(v[j], Math.sqrt(v[i] * v[i] + 2 * aAcc * ds));
      }
    }
    
    for (let i = 0; i < N; i++) samples[i].vT = v[i];
  }

  computeRacingLine() {
    const { samples, N } = this;
    const off = new Float64Array(N);
    const lim = new Float32Array(N);
    const px = new Float64Array(N), pz = new Float64Array(N);
    
    for (let i = 0; i < N; i++) {
      const sm = samples[i];
      lim[i] = Math.max(0.6, Math.min(this.width / 2 - 1.35, sm.wallL - 1.2, sm.wallR - 1.2));
      px[i] = sm.p.x; pz[i] = sm.p.z;
    }
    
    const rinv = (a, b, c) => {
      const x1 = px[b] - px[a], z1 = pz[b] - pz[a];
      const x2 = px[c] - px[a], z2 = pz[c] - pz[a];
      const x3 = px[c] - px[b], z3 = pz[c] - pz[b];
      const d = Math.sqrt((x1 * x1 + z1 * z1) * (x2 * x2 + z2 * z2) * (x3 * x3 + z3 * z3));
      return d > 1e-9 ? 2 * (x1 * z2 - z1 * x2) / d : 0;
    };

    for (let step = 32; step >= 1; step >>= 1) {
      const passes = step > 1 ? 22 : 70;
      for (let pass = 0; pass < passes; pass++) {
        for (let i = 0; i < N; i++) {
          const ip = (i - step + N) % N, inx = (i + step) % N;
          const ipp = (i - 2 * step + N) % N, inn = (i + 2 * step) % N;
          const kT = (rinv(ipp, ip, i) + rinv(i, inx, inn)) * 0.5;
          
          const b = samples[i];
          const x1 = px[i] - px[ip], z1 = pz[i] - pz[ip];
          const x2 = px[inx] - px[ip], z2 = pz[inx] - pz[ip];
          const x3 = px[inx] - px[i], z3 = pz[inx] - pz[i];
          const d = Math.sqrt((x1 * x1 + z1 * z1) * (x2 * x2 + z2 * z2) * (x3 * x3 + z3 * z3));
          
          if (d < 1e-9) continue;
          
          const det = x1 * z2 - z1 * x2;
          const slope = b.n.x * z2 - b.n.z * x2;
          
          if (Math.abs(slope) < 1e-6) continue;
          
          const dOff = (kT * d / 2 - det) / slope;
          const next = THREE.MathUtils.clamp(off[i] + dOff * 0.55, -lim[i], lim[i]);
          
          px[i] += b.n.x * (next - off[i]); 
          pz[i] += b.n.z * (next - off[i]);
          off[i] = next;
        }
      }
    }
    
    const sm2 = smoothArrayInPlace(off, 2, 1);
    const line = this.line = new Array(N);
    
    for (let i = 0; i < N; i++) {
      const sm = samples[i];
      line[i] = {
        off: sm2[i],
        x: sm.p.x + sm.n.x * sm2[i],
        z: sm.p.z + sm.n.z * sm2[i],
        y: sm.p.y,
        kappa: 0, vT: 0,
      };
    }
    
    let kap = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const a = line[(i - 1 + N) % N], b = line[i], c = line[(i + 1) % N];
      const v1x = b.x - a.x, v1z = b.z - a.z;
      const v2x = c.x - b.x, v2z = c.z - b.z;
      const l1 = Math.hypot(v1x, v1z) || 1, l2 = Math.hypot(v2x, v2z) || 1;
      const cross = (v1x * v2z - v1z * v2x) / (l1 * l2);
      kap[i] = Math.asin(THREE.MathUtils.clamp(cross, -1, 1)) / ((l1 + l2) / 2) * -1;
    }
    kap = smoothArrayInPlace(kap, 3, 2);
    
    const mu = 1.78, m = 798, kDF = 3.15, g = 9.81, vCapLine = 95;
    const v = new Float64Array(N);
    
    for (let i = 0; i < N; i++) {
      line[i].kappa = kap[i];
      const k = Math.abs(kap[i]);
      const denom = k - (mu * kDF / m) * 0.92;
      v[i] = denom > 1e-5 ? Math.min(Math.sqrt(mu * g * 0.92 / denom), vCapLine) : vCapLine;
    }
    
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const j = (i + 1) % N;
        const ds = Math.hypot(line[j].x - line[i].x, line[j].z - line[i].z);
        const aBrake = mu * (g + kDF * v[j] * v[j] / m) * 0.82;
        v[i] = Math.min(v[i], Math.sqrt(v[j] * v[j] + 2 * aBrake * ds));
      }
    }
    
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const ds = Math.hypot(line[j].x - line[i].x, line[j].z - line[i].z);
        const aAcc = Math.min(735000 / Math.max(v[i], 8) / m, 13);
        v[j] = Math.min(v[j], Math.sqrt(v[i] * v[i] + 2 * aAcc * ds));
      }
    }
    
    for (let i = 0; i < N; i++) line[i].vT = v[i];
  }

  lineAt(s) {
    return this.line[this.sampleAt(s).idx];
  }

  addMesh(geo, opts = {}) {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, 
      roughness: opts.roughness ?? 1, 
      metalness: 0,
      side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = opts.receiveShadow ?? true;
    mesh.castShadow = opts.castShadow ?? false;
    this.group.add(mesh);
    return mesh;
  }

  ribbonGeometry(rows, colors) {
    const nRows = rows.length, nCols = rows[0].length;
    const posArr = [], colArr = [], idx = [];
    
    for (let i = 0; i < nRows; i++) {
        for (let c = 0; c < nCols; c++) {
            const pos = rows[i][c];
            posArr.push(pos.x, pos.y, pos.z);
            const col = colors[i][c];
            colArr.push(col.r, col.g, col.b);
        }
    }
    
    for (let i = 0; i < nRows; i++) {
      const j = (i + 1) % nRows;
      for (let c = 0; c < nCols - 1; c++) {
        const a = i * nCols + c, b = i * nCols + c + 1, d = j * nCols + c, e = j * nCols + c + 1;
        idx.push(a, b, d, b, e, d);
      }
    }
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  inTunnel(frac) {
    const t = this.cfg.tunnel;
    if (!t) return false;
    return t[0] < t[1] ? (frac >= t[0] && frac <= t[1]) : (frac >= t[0] || frac <= t[1]);
  }

  buildRoad() {
    const { samples } = this;
    const w2 = this.width / 2, lw = 0.32;
    const rows = [], colors = [];
    const asphalt = new THREE.Color(0x3a3e45), white = new THREE.Color(0xd8dadf);
    
    for (const sm of samples) {
      const j = 0.94 + ((sm.idx * 7919) % 13) / 13 * 0.12;
      let road = asphalt.clone().multiplyScalar(j);
      if (this.inTunnel(sm.frac)) road.multiplyScalar(0.95);
      
      const edge = white.clone().multiplyScalar(this.inTunnel(sm.frac) ? 0.8 : 1);
      
      rows.push([
        sm.p.clone().addScaledVector(sm.n, w2),
        sm.p.clone().addScaledVector(sm.n, w2 - lw),
        sm.p.clone().addScaledVector(sm.n, -w2 + lw),
        sm.p.clone().addScaledVector(sm.n, -w2),
      ]);
      colors.push([edge, road, road.clone().multiplyScalar(0.985), edge]);
    }
    this.addMesh(this.ribbonGeometry(rows, colors), { roughness: 0.96 });
  }

  buildKerbs() {
    const { samples, N } = this;
    const w2 = this.width / 2;
    const posArr = [], colArr = [], idx = [];
    const red = new THREE.Color(0xc8202a), wht = new THREE.Color(0xe8e8ea);
    const h = 0.055, kw = 1.15;
    
    for (let side = -1; side <= 1; side += 2) {
      let run = null;
      for (let i = 0; i <= N; i++) {
        const sm = samples[i % N];
        const active = sm.kerb && i < N;
        if (active && !run) run = [];
        if (run && active) run.push(sm);
        if (run && (!active || i === N)) {
          if (run.length > 3) {
            for (let k = 0; k < run.length - 1; k++) {
              const a = run[k], b = run[k + 1];
              const col = Math.floor(a.s / 2.6) % 2 === 0 ? red : wht;
              const base = posArr.length / 3;
              
              _v1.copy(a.p).addScaledVector(a.n, side * (w2 - 0.05));
              _v2.copy(a.p).addScaledVector(a.n, side * (w2 + kw));
              const pa0 = [ _v1.x, _v1.y, _v1.z ];
              const pa1 = [ _v2.x, _v2.y, _v2.z ];
              
              _v1.copy(b.p).addScaledVector(b.n, side * (w2 - 0.05));
              _v2.copy(b.p).addScaledVector(b.n, side * (w2 + kw));
              const pb0 = [ _v1.x, _v1.y, _v1.z ];
              const pb1 = [ _v2.x, _v2.y, _v2.z ];
              
              const points = [
                  [pa0, h], [pa1, h * 0.4], [pb0, h], [pb1, h * 0.4], [pa1, -0.12], [pb1, -0.12]
              ];
              
              for (const [p, lift] of points) {
                posArr.push(p[0], p[1] + lift, p[2]);
                colArr.push(col.r, col.g, col.b);
              }
              idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
              idx.push(base + 1, base + 4, base + 3, base + 4, base + 5, base + 3);
            }
          }
          run = null;
        }
      }
    }
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.addMesh(geo, { roughness: 0.9 });
  }

  buildWalls() {
    const { samples, cfg } = this;
    const street = cfg.walls === 'street';
    const steel = new THREE.Color(0xaeb4bc), steelD = new THREE.Color(0x878d96);
    const blue = new THREE.Color(0x2a5db0), whiteB = new THREE.Color(0xdfe4ea);
    const heights = street ? [0, 0.18, 0.3, 0.45, 0.6, 0.72, 0.95] : [0, 0.45, 0.55, 1.0];
    
    for (const side of [1, -1]) {
      const rows = [], colors = [];
      for (const sm of samples) {
        const dist = side > 0 ? sm.wallL : sm.wallR;
        _v1.copy(sm.p).addScaledVector(sm.n, side * dist);
        
        const row = [], colRow = [];
        heights.forEach((hh, k) => {
          row.push(new THREE.Vector3(_v1.x, _v1.y + hh, _v1.z));
          if (street) colRow.push(k % 2 === 0 ? steelD : steel);
          else colRow.push(hh < 0.5 ? blue : whiteB);
        });
        rows.push(row); 
        colors.push(colRow);
      }
      this.addMesh(this.ribbonGeometry(rows, colors), { doubleSide: true, castShadow: true, roughness: 0.7 });
    }
  }

  buildStartLine() {
    const { samples } = this;
    const w2 = this.width / 2;
    const sm = samples[0];
    const posArr = [], colArr = [], idx = [];
    const cols = 12, rowsN = 2;
    const dark = new THREE.Color(0x101013), light = new THREE.Color(0xf2f3f5);
    
    for (let r = 0; r < rowsN; r++) {
      for (let c = 0; c < cols; c++) {
        const l0 = -w2 + (c / cols) * this.width, l1 = -w2 + ((c + 1) / cols) * this.width;
        const t0 = r * 1.0, t1 = (r + 1) * 1.0;
        const col = (r + c) % 2 === 0 ? dark : light;
        const base = posArr.length / 3;
        
        for (const [lat, ss] of [[l0, t0], [l1, t0], [l0, t1], [l1, t1]]) {
          _v1.copy(sm.p).addScaledVector(sm.n, lat).addScaledVector(sm.t, ss);
          posArr.push(_v1.x, _v1.y + 0.015, _v1.z);
          colArr.push(col.r, col.g, col.b);
        }
        idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
    
    const white = new THREE.Color(0xe8e9ec);
    for (let slot = 0; slot < 10; slot++) {
      const sBack = -9 - slot * 9;
      const lat = (slot % 2 === 0 ? 1 : -1) * this.width * 0.22;
      const at = this.sampleAt(((sBack / this.length) % 1 + 1) % 1 * this.length);
      
      for (const [dl, ds, wq, lq] of [[-1.4, 0, 2.8, 0.25], [-1.4, 0, 0.25, 2.2], [1.15, 0, 0.25, 2.2]]) {
        const base = posArr.length / 3;
        for (const [a, b] of [[0, 0], [wq, 0], [0, lq], [wq, lq]]) {
          _v1.copy(at.p).addScaledVector(at.n, lat + dl + a).addScaledVector(at.t, ds - b - 2);
          posArr.push(_v1.x, _v1.y + 0.013, _v1.z);
          colArr.push(white.r, white.g, white.b);
        }
        idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    }
    
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colArr, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.addMesh(geo, { roughness: 0.85 });
  }

  sampleAt(s) {
    s = ((s % this.length) + this.length) % this.length;
    let lo = 0, hi = this.N - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.samples[mid].s <= s) lo = mid; else hi = mid - 1;
    }
    return this.samples[lo];
  }

  query(pos, hint = 0) {
    const { samples, N } = this;
    let best = -1, bd = Infinity;
    
    const scan = (i) => {
      const sm = samples[i];
      const dx = sm.p.x - pos.x, dz = sm.p.z - pos.z;
      const d2 = dx * dx + dz * dz;
      const dy = sm.p.y - pos.y;
      const dd = d2 + dy * dy * 6;
      if (dd < bd) { bd = dd; best = i; }
    };
    
    for (let j = -50; j <= 50; j++) scan((hint + j + N * 4) % N);
    
    if (bd > 784) {
      for (let i = 0; i < N; i += 3) scan(i);
    }
    
    const a = samples[best];
    const b = samples[(best + 1) % N];
    const c = samples[(best - 1 + N) % N];
    let s0 = a, s1 = b;
    const abx = b.p.x - a.p.x, abz = b.p.z - a.p.z;
    let tt = ((pos.x - a.p.x) * abx + (pos.z - a.p.z) * abz) / (abx * abx + abz * abz || 1);
    
    if (tt < 0) {
      s0 = c; s1 = a;
      const cbx = a.p.x - c.p.x, cbz = a.p.z - c.p.z;
      tt = ((pos.x - c.p.x) * cbx + (pos.z - c.p.z) * cbz) / (cbx * cbx + cbz * cbz || 1);
    }
    
    tt = THREE.MathUtils.clamp(tt, 0, 1);
    const px = s0.p.x + (s1.p.x - s0.p.x) * tt;
    const py = s0.p.y + (s1.p.y - s0.p.y) * tt;
    const pz = s0.p.z + (s1.p.z - s0.p.z) * tt;
    
    const nx = s0.n.x + (s1.n.x - s0.n.x) * tt, nz = s0.n.z + (s1.n.z - s0.n.z) * tt;
    const nl = Math.hypot(nx, nz) || 1;
    const lat = ((pos.x - px) * nx + (pos.z - pz) * nz) / nl;
    
    let ss = (s0.s + (((s1.s - s0.s) + this.length) % this.length) * tt) % this.length;
    
    _q.idx = s0.idx; _q.s = ss; _q.frac = ss / this.length;
    _q.lat = lat; _q.y = py;
    _q.t = s0.t; _q.n = s0.n; _q.dyds = s0.dyds + (s1.dyds - s0.dyds) * tt;
    _q.kerbL = s0.kerb; _q.kerbR = s0.kerb;
    _q.wallL = s0.wallL; _q.wallR = s0.wallR;
    _q.kappa = s0.kappa; _q.vT = s0.vT;
    
    return _q;
  }

  inDrsZone(frac) {
    for (const [a, b] of (this.cfg.drs || [])) {
      if (a < b ? (frac >= a && frac <= b) : (frac >= a || frac <= b)) return true;
    }
    return false;
  }

  placeAt(frac, lat, y = 0) {
    const sm = this.sampleAt(((frac % 1) + 1) % 1 * this.length);
    const p = sm.p.clone().addScaledVector(sm.n, lat);
    p.y = sm.p.y + y;
    return { p, t: sm.t.clone(), n: sm.n.clone(), heading: Math.atan2(sm.t.x, sm.t.z), sm };
  }

  dispose() {
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { Array.isArray(o.material) ? o.material.forEach(m => m.dispose()) : o.material.dispose(); }
    });
  }
}