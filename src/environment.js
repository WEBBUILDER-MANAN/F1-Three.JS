// Per-track environments with physically-inspired lighting: atmospheric
// scattering sky (THREE.Sky) whose radiance also drives the scene's
// image-based lighting via PMREM, a night system for Singapore (star dome,
// floodlight pools, emissive skyline, bloom-ready emissives), terrain
// heightfields, conifer forests, city skylines — plus all track furniture:
// grandstands with crowds, tire stacks, catch fences, sponsor boards,
// corner boards, start gantry, pit buildings, tunnels, bridges and wheels.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { tvPodSpots } from './cameras.js';

// ---------------------------------------------------------------- utilities
const FACE_SHADE = { px: 0.84, nx: 0.78, py: 1.0, ny: 0.5, pz: 0.92, nz: 0.7 };

// TV-pod sight lines: segments from each broadcast mast to the road at
// several points of its watch window. Tree planters reject anything tall
// standing inside this corridor so spectator shots never film a canopy.
const _sightCache = new WeakMap();
function sightLines(track) {
  let lines = _sightCache.get(track);
  if (lines) return lines;
  lines = [];
  for (const { p, s } of tvPodSpots(track)) {
    for (let d = -100; d <= 320; d += 24) {
      const sm = track.sampleAt(s + d);
      lines.push({ ax: p.x, ay: p.y, az: p.z, bx: sm.p.x, by: sm.p.y + 1.0, bz: sm.p.z });
    }
  }
  _sightCache.set(track, lines);
  return lines;
}
function blocksSight(lines, x, z, topY, radius = 7.0) {
  for (const L of lines) {
    const dx = L.bx - L.ax, dz = L.bz - L.az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1) continue;
    const t = ((x - L.ax) * dx + (z - L.az) * dz) / len2;
    if (t < 0.02 || t > 0.98) continue;
    const ddx = x - (L.ax + dx * t), ddz = z - (L.az + dz * t);
    if (ddx * ddx + ddz * ddz > radius * radius) continue;
    if (L.ay + (L.by - L.ay) * t < topY + 1.2) return true;
  }
  return false;
}

class Mesher {
  constructor() { this.pos = []; this.col = []; this.idx = []; }
  pushBox(cx, cy, cz, sx, sy, sz, color, rotY = 0, jitter = 0) {
    const c = new THREE.Color(color);
    if (jitter) c.multiplyScalar(1 + (Math.random() - 0.5) * jitter);
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const cosR = Math.cos(rotY), sinR = Math.sin(rotY);
    const rot = (x, z) => [cx + x * cosR + z * sinR, cz - x * sinR + z * cosR];
    const faces = [
      ['px', [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]]],
      ['nx', [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]]],
      ['py', [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]]],
      ['ny', [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]]],
      ['pz', [[hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [-hx, -hy, hz]]],
      ['nz', [[-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [hx, -hy, -hz]]],
    ];
    for (const [dir, corners] of faces) {
      const shade = FACE_SHADE[dir];
      const base = this.pos.length / 3;
      for (const [x, y, z] of corners) {
        const [wx, wz] = rot(x, z);
        this.pos.push(wx, cy + y, wz);
        this.col.push(c.r * shade, c.g * shade, c.b * shade);
      }
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  build(opts = {}) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setIndex(this.idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.92, metalness: opts.metalness ?? 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = opts.castShadow ?? true;
    mesh.receiveShadow = opts.receiveShadow ?? true;
    return mesh;
  }
}

function textTexture(lines, { w = 512, h = 128, bg = '#ffffff', fg = '#111111', border, font, pad = 0 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = h * 0.07; ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth); }
  ctx.fillStyle = fg;
  const arr = Array.isArray(lines) ? lines : [lines];
  const fh = (h - pad * 2) / arr.length;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  arr.forEach((line, i) => {
    ctx.font = font || `900 ${Math.floor(fh * 0.62)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(line, w / 2, pad + fh * (i + 0.5), w * 0.94);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ---------------------------------------------------------------- sky
// Day: THREE.Sky atmospheric scattering, also PMREM'd into the scene envmap
// so cars and asphalt reflect the actual sky. Night: star-field dome.
export function sunDirFrom(cfg) {
  const el = THREE.MathUtils.degToRad(cfg.sunEl ?? 40);
  const az = THREE.MathUtils.degToRad(cfg.sunAz ?? 180);
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
}

function makeNightDome() {
  const geo = new THREE.SphereGeometry(3200, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir;
      float hash(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.05, 1.0);
        vec3 col = mix(vec3(0.10, 0.13, 0.22), vec3(0.012, 0.02, 0.05), pow(clamp(h, 0.0, 1.0), 0.42));
        col = mix(vec3(0.16, 0.14, 0.17), col, smoothstep(-0.05, 0.12, d.y)); // city glow at horizon
        // stars
        vec3 sp = floor(d * 220.0);
        float star = step(0.9982, hash(sp));
        float tw = 0.6 + 0.4 * hash(sp + 7.0);
        col += vec3(0.9, 0.95, 1.0) * star * tw * smoothstep(0.10, 0.35, d.y);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  return mesh;
}

function makeSkySystem(cfg, renderer) {
  const isNight = cfg.type === 'night';
  let mesh;
  if (isNight) {
    mesh = makeNightDome();
  } else {
    mesh = new Sky();
    mesh.scale.setScalar(3000);
    const u = mesh.material.uniforms;
    u.turbidity.value = cfg.turbidity ?? 6;
    u.rayleigh.value = cfg.rayleigh ?? 2.5;
    u.mieCoefficient.value = 0.0045;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(sunDirFrom(cfg));
  }
  // bake the sky into an environment map (image-based lighting)
  let envTex = null;
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const tmp = new THREE.Scene();
    tmp.add(mesh);
    envTex = pmrem.fromScene(tmp, 0.06).texture;
    tmp.remove(mesh);
    pmrem.dispose();
  }
  return { mesh, envTex, isNight };
}

// ---------------------------------------------------------------- pieces
function makeClouds(center) {
  const m = new Mesher();
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, r = rand(250, 1400);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = rand(140, 260);
    const s = rand(18, 44);
    const puffs = 3 + Math.floor(Math.random() * 3);
    for (let p = 0; p < puffs; p++) {
      m.pushBox(x + rand(-s, s), y + rand(-3, 5), z + rand(-s * 0.5, s * 0.5), rand(s * 0.7, s * 1.4), rand(5, 9), rand(s * 0.5, s), 0xffffff, 0, 0.05);
    }
  }
  const mesh = m.build({ castShadow: false, receiveShadow: false, roughness: 1 });
  mesh.material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, transparent: true, opacity: 0.92 });
  const grp = new THREE.Group();
  grp.position.set(center.x, 0, center.z);
  mesh.position.set(-center.x, 0, -center.z);
  grp.add(mesh);
  return grp;
}

// ---------------------------------------------------------------- terrain
// value-noise fbm
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const sx = xf * xf * (3 - 2 * xf), sz = zf * zf * (3 - 2 * zf);
  const h = (a, b) => {
    let n = (a * 374761393 + b * 668265263) | 0;
    n = (n ^ (n >> 13)) * 1274126177;
    return (((n ^ (n >> 16)) >>> 0) % 10000) / 10000;
  };
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
function fbm(x, z) {
  return vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 13, z * 2.1 + 7) * 0.28 + vnoise(x * 4.3 + 41, z * 4.3 + 23) * 0.17;
}

// ---------------------------------------------------------------- ground
// Two cooperating layers, no visible seams:
//  1) a NEAR sweep anchored exactly to the road edge (seam-free contact),
//     whose outer band dives BELOW layer 2;
//  2) a global corridor-aware far terrain: its height is a single-valued
//     function of (x,z) that is clamped ~2.2 m below the nearest road
//     anywhere near the circuit — so it can never poke through any track
//     section, including the figure-8 infield.
const SWEEP_OPEN = [5, 12, 22, 35, 50, 68, 90];
const SWEEP_STREET = [5, 10, 16, 24, 34, 48, 90];

// coarse distance field + local minimum track height (window past nearest)
function makeTrackDF(track, margin = 1500, res = 112) {
  const S = track.samples;
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity, hGlobal = Infinity;
  for (const s of S) {
    minx = Math.min(minx, s.p.x); maxx = Math.max(maxx, s.p.x);
    minz = Math.min(minz, s.p.z); maxz = Math.max(maxz, s.p.z);
    hGlobal = Math.min(hGlobal, s.p.y);
  }
  const x0 = minx - margin, z0 = minz - margin, w = (maxx - minx) + margin * 2, d = (maxz - minz) + margin * 2;
  const g = new Float32Array(res * res);
  const hg = new Float32Array(res * res);
  for (let iz = 0; iz < res; iz++) {
    for (let ix = 0; ix < res; ix++) {
      const px = x0 + (ix + 0.5) / res * w, pz = z0 + (iz + 0.5) / res * d;
      let best = Infinity;
      for (let i = 0; i < S.length; i += 3) {
        const dx = S[i].p.x - px, dz = S[i].p.z - pz;
        const dd = dx * dx + dz * dz;
        if (dd < best) best = dd;
      }
      const win = Math.sqrt(best) + 45, win2 = win * win;
      let hMin = Infinity;
      for (let i = 0; i < S.length; i += 3) {
        const dx = S[i].p.x - px, dz = S[i].p.z - pz;
        if (dx * dx + dz * dz < win2 && S[i].p.y < hMin) hMin = S[i].p.y;
      }
      g[iz * res + ix] = Math.sqrt(best);
      hg[iz * res + ix] = hMin === Infinity ? hGlobal : hMin;
    }
  }
  const bilinear = arr => (px, pz) => {
    const fx = THREE.MathUtils.clamp((px - x0) / w * res - 0.5, 0, res - 1.001);
    const fz = THREE.MathUtils.clamp((pz - z0) / d * res - 0.5, 0, res - 1.001);
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
    const i00 = arr[iz * res + ix], i10 = arr[iz * res + ix + 1];
    const i01 = arr[(iz + 1) * res + ix], i11 = arr[(iz + 1) * res + ix + 1];
    return (i00 * (1 - tx) + i10 * tx) * (1 - tz) + (i01 * (1 - tx) + i11 * tx) * tz;
  };
  return { dist: bilinear(g), h: bilinear(hg), hGlobal, bounds: { x0, z0, w, d } };
}

// corridor-aware terrain height — single-valued in (x,z), never above
// (nearest road - 2.2) near any track section
function terrainYAt(df, amp, px, pz) {
  const dist = df.dist(px, pz);
  const t = THREE.MathUtils.smoothstep(dist, 52, 215);
  const near = df.h(px, pz) - 2.2;
  const baseY = df.hGlobal - 1.25;
  const far = baseY + (fbm(px * 0.0021, pz * 0.0021) - 0.42) * amp * 2.2;
  let y = THREE.MathUtils.lerp(near, far, t);
  y = THREE.MathUtils.lerp(y, baseY, THREE.MathUtils.smoothstep(dist, 700, 1100)); // meet the horizon plane
  return y + (fbm(px * 0.011 + 99, pz * 0.011 + 55) - 0.5) * 0.9 * t;
}

function makeFarTerrain(track, cfg, df) {
  const pal = TERRAIN_PALETTES[cfg.env] || TERRAIN_PALETTES.silverstone;
  const { x0, z0, w, d } = df.bounds;
  const seg = 170;
  const geo = new THREE.PlaneGeometry(w, d, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(x0 + w / 2, 0, z0 + d / 2);
  const pos = geo.attributes.position;
  const colA = new Float32Array(pos.count * 3);
  const cLow = new THREE.Color(pal.low).convertSRGBToLinear();
  const cHigh = new THREE.Color(pal.high).convertSRGBToLinear();
  const cDry = new THREE.Color(pal.dry).convertSRGBToLinear();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), pz = pos.getZ(i);
    pos.setY(i, terrainYAt(df, pal.amp, px, pz));
    const n = fbm(px * 0.0021, pz * 0.0021);
    const n2 = fbm(px * 0.011 + 99, pz * 0.011 + 55);
    c.copy(cLow).lerp(cHigh, THREE.MathUtils.clamp(n * 1.35 - 0.18, 0, 1));
    c.lerp(cDry, THREE.MathUtils.clamp(n2 * n2 * 1.15 - 0.28, 0, 0.75));
    c.multiplyScalar(0.94 + 0.12 * vnoise(px * 0.08, pz * 0.08));
    colA[i * 3] = c.r; colA[i * 3 + 1] = c.g; colA[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.receiveShadow = true;
  return mesh;
}

function makeGroundCtx(track, cfg) {
  const pal = TERRAIN_PALETTES[cfg.env] || TERRAIN_PALETTES.silverstone;
  const street = cfg.walls === 'street';
  const minY = Math.min(...track.samples.map(s => s.p.y));
  const night = cfg.sky && cfg.sky.type === 'night';
  return {
    street, pal, amp: pal.amp, minY,
    flatY: minY - 1.40,
    discY: street ? (cfg.env === 'monaco' ? minY - 4.1 : minY - 5.5) : minY - 1.40,
    cfgApron: cfg.apron,
    cols: street ? SWEEP_STREET : SWEEP_OPEN,
    night,
    df: makeTrackDF(track),
  };
}

// ground height at lateral `dist` from sample sm on `side` — the single
// source of truth shared by the mesh, prop placement and vegetation
function sweepHeight(track, g, sm, side, dist) {
  const wall = side > 0 ? sm.wallL : sm.wallR;
  const roadY = sm.p.y - 0.02;
  if (dist <= wall + 0.05) return roadY;
  let maxLat = Infinity;
  if (track.skipApron[sm.idx]) maxLat = wall + 0.05;
  else if (sm.apronW < g.cfgApron - 0.01) maxLat = wall + sm.apronW;
  const dd = Math.min(dist, maxLat);
  if (maxLat < 900) {
    // pinched between two roads (or under the crossover): blend to mid-gap
    const midY = ((sm.p.y + (sm.neighborH ?? sm.p.y)) / 2) - 0.05;
    return THREE.MathUtils.lerp(roadY, midY, THREE.MathUtils.smoothstep(dd, wall + 1.5, Math.max(wall + 2.5, maxLat)));
  }
  if (g.street) {
    return THREE.MathUtils.lerp(roadY, g.discY, THREE.MathUtils.smoothstep(dd, wall + 4, wall + 80));
  }
  // open circuits: visible shoulder, then dive below the corridor-aware
  // far terrain (which hugs ~roadY-2.2 here) — overlap by construction
  const px = sm.p.x + sm.n.x * side * dd, pz = sm.p.z + sm.n.z * side * dd;
  const jitter = (fbm(px * 0.013, pz * 0.013) - 0.5) * 0.5;
  const t = THREE.MathUtils.smoothstep(dd, wall + 4, wall + 88);
  return THREE.MathUtils.lerp(roadY, sm.p.y - 6.4, t) + jitter * t;
}

function buildGroundSweep(track, cfg) {
  const g = makeGroundCtx(track, cfg);
  track.groundCtx = g;
  const { samples } = track;
  const N = samples.length;
  const step = N > 1800 ? 2 : 1;
  const rowsIdx = [];
  for (let i = 0; i < N; i += step) rowsIdx.push(i);
  const nRows = rowsIdx.length;
  const w2 = track.width / 2;

  const grass1 = new THREE.Color(0x4d8a3d).convertSRGBToLinear();
  const grass2 = new THREE.Color(0x447c36).convertSRGBToLinear();
  const gravel = new THREE.Color(0xc9b184).convertSRGBToLinear();
  const conc1 = new THREE.Color(0x9b9da1).convertSRGBToLinear();
  const conc2 = new THREE.Color(0x8b8d92).convertSRGBToLinear();
  const nightG = new THREE.Color(0x2a2e38).convertSRGBToLinear();
  const cLow = new THREE.Color(g.pal.low).convertSRGBToLinear();
  const cHigh = new THREE.Color(g.pal.high).convertSRGBToLinear();
  const cDry = new THREE.Color(g.pal.dry).convertSRGBToLinear();
  const c = new THREE.Color();

  const group = new THREE.Group();
  for (const side of [1, -1]) {
    const nCols = 4 + g.cols.length;
    const pos = new Float32Array(nRows * nCols * 3);
    const col = new Float32Array(nRows * nCols * 3);
    const idx = [];
    for (let r = 0; r < nRows; r++) {
      const sm = samples[rowsIdx[r]];
      const wall = side > 0 ? sm.wallL : sm.wallR;
      const jit = 0.93 + ((sm.idx * 2654435761) % 17) / 17 * 0.14;
      for (let ci = 0; ci < nCols; ci++) {
        let lat;
        if (ci === 0) lat = w2 - 0.3;
        else if (ci === 1) lat = w2 + (wall - w2) * 0.34;
        else if (ci === 2) lat = w2 + (wall - w2) * 0.67;
        else if (ci === 3) lat = wall;
        else lat = wall + g.cols[ci - 4];
        // clamp pinched/crossover columns
        let maxLat = Infinity;
        if (track.skipApron[sm.idx]) maxLat = wall + 0.05;
        else if (sm.apronW < g.cfgApron - 0.01) maxLat = wall + sm.apronW;
        lat = Math.min(lat, maxLat);
        const y = sweepHeight(track, g, sm, side, lat);
        const o = (r * nCols + ci) * 3;
        pos[o] = sm.p.x + sm.n.x * side * lat;
        pos[o + 1] = y;
        pos[o + 2] = sm.p.z + sm.n.z * side * lat;
        // color
        if (ci <= 3) {
          if (g.street) c.copy(g.night ? nightG : (sm.idx % 2 ? conc1 : conc2)).multiplyScalar(jit);
          else if (Math.abs(sm.kappa) > 0.010 && Math.sign(sm.kappa) !== Math.sign(side)) c.copy(gravel).multiplyScalar(jit);
          else c.copy(sm.idx % 2 ? grass1 : grass2).multiplyScalar(jit);
        } else if (g.street) {
          c.copy(g.night ? nightG : conc2).multiplyScalar(0.9 * jit);
        } else {
          const n = fbm(pos[o] * 0.0021, pos[o + 2] * 0.0021);
          const n2 = fbm(pos[o] * 0.011 + 99, pos[o + 2] * 0.011 + 55);
          c.copy(cLow).lerp(cHigh, THREE.MathUtils.clamp(n * 1.35 - 0.18, 0, 1));
          c.lerp(cDry, THREE.MathUtils.clamp(n2 * n2 * 1.15 - 0.28, 0, 0.75));
          c.multiplyScalar(0.94 + 0.12 * vnoise(pos[o] * 0.08, pos[o + 2] * 0.08));
        }
        col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
      }
      const r2 = (r + 1) % nRows;
      for (let ci = 0; ci < nCols - 1; ci++) {
        const a = r * nCols + ci, b = r * nCols + ci + 1;
        const d2 = r2 * nCols + ci, e = r2 * nCols + ci + 1;
        if (side > 0) idx.push(a, d2, b, b, d2, e);
        else idx.push(a, b, d2, b, e, d2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // far terrain (open circuits): corridor-aware, passes under every road
  if (!g.street) group.add(makeFarTerrain(track, cfg, g.df));

  // horizon plane, met by the far terrain's outer blend
  const planeY = g.street ? g.discY : g.flatY;
  const planeCol = g.street ? (g.night ? 0x14161c : 0x8b8d90) : g.pal.low;
  const plane = new THREE.Mesh(
    new THREE.CircleGeometry(3000, 48),
    new THREE.MeshStandardMaterial({ color: planeCol, roughness: 1 })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = planeY - 0.05;
  plane.receiveShadow = true;
  group.add(plane);
  return group;
}

const TERRAIN_PALETTES = {
  silverstone: { low: 0x4d8a3d, high: 0x6fae52, dry: 0x9aa860, amp: 13 },
  suzuka: { low: 0x477e38, high: 0x6da24e, dry: 0x8f9c58, amp: 24 },
  spa: { low: 0x2f5e2e, high: 0x497c3c, dry: 0x5e7a44, amp: 40 },
  monza: { low: 0x5f7a3a, high: 0x8a9450, dry: 0xb08e4e, amp: 9 },
};

// dense conifer forest (Spa) — instanced pines
function makeConifers(track, count, cfg) {
  const sight = sightLines(track);
  const trunk = new THREE.CylinderGeometry(0.22, 0.34, 3.4, 5);
  trunk.translate(0, 1.7, 0);
  const cones = (() => {
    const a = new THREE.ConeGeometry(2.3, 4.4, 7); a.translate(0, 4.6, 0);
    const b = new THREE.ConeGeometry(1.7, 3.6, 7); b.translate(0, 7.0, 0);
    const cc = new THREE.ConeGeometry(1.1, 2.8, 7); cc.translate(0, 9.2, 0);
    const pos = [], idx = [];
    let off = 0;
    for (const gg of [a, b, cc]) {
      const p = gg.attributes.position.array;
      pos.push(...p);
      const ii = gg.index.array;
      for (const v of ii) idx.push(v + off);
      off += gg.attributes.position.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const tM = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 1 }), count);
  const cM = new THREE.InstancedMesh(cones, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), count);
  cM.castShadow = true;
  const mtx = new THREE.Matrix4(), col = new THREE.Color();
  let placed = 0, guard = 0;
  while (placed < count && guard++ < count * 25) {
    const at = track.placeAt(Math.random(), 0);
    const side = Math.random() > 0.5 ? 1 : -1;
    const wall = side > 0 ? at.sm.wallL : at.sm.wallR;
    const dist = wall + 6 + Math.pow(Math.random(), 0.6) * 210;
    const p = at.p.clone().addScaledVector(at.n, side * dist);
    // keep clear of every road segment (figure-8 aware), then drop onto the
    // unified ground surface
    const q = track.query(p, at.sm.idx);
    const qWall = q.lat > 0 ? q.wallL : q.wallR;
    if (Math.abs(q.lat) < qWall + 4) continue;
    p.y = groundYAt(track, at.sm, side, dist) - 0.15;
    const s = 0.75 + Math.random() * 1.15;
    if (blocksSight(sight, p.x, p.z, p.y + 10.6 * s * 1.25)) continue;
    mtx.makeRotationY(Math.random() * 6.28).scale(new THREE.Vector3(s, s * (0.9 + Math.random() * 0.35), s)).setPosition(p);
    tM.setMatrixAt(placed, mtx);
    cM.setMatrixAt(placed, mtx);
    col.setHSL(0.335 + Math.random() * 0.03, 0.45 + Math.random() * 0.2, 0.115 + Math.random() * 0.085);
    cM.setColorAt(placed, col);
    placed++;
  }
  tM.count = placed; cM.count = placed;
  return [tM, cM];
}

// distant forested ridges (Spa horizon) — placed beyond the track's extent
function makeRidges(track, center, count = 7) {
  let maxR = 0;
  for (const s of track.samples) {
    const dr = Math.hypot(s.p.x - center.x, s.p.z - center.z);
    if (dr > maxR) maxR = dr;
  }
  const m = new Mesher();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand(-0.3, 0.3);
    const r = rand(maxR + 450, maxR + 1050);
    const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
    const w = rand(420, 900), h = rand(55, 130);
    for (let k = 0; k < 7; k++) {
      const t = k / 6 - 0.5;
      m.pushBox(x + t * w * 0.9, h * (0.5 - Math.abs(t) * 0.42), z + rand(-40, 40),
        w * (0.32 - Math.abs(t) * 0.1), h * (1 - Math.abs(t) * 0.75), rand(180, 300),
        0x27452a, a + Math.PI / 2, 0.10);
    }
  }
  const mesh = m.build({ castShadow: false, receiveShadow: false, roughness: 1 });
  return mesh;
}

// night city skyline ring + lit windows (Singapore)
function makeSkyline(center, opts = {}) {
  const group = new THREE.Group();
  const bodyM = new Mesher();
  // shared lit-window texture
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 256;
  const ctx2 = cv.getContext('2d');
  ctx2.fillStyle = '#06080e'; ctx2.fillRect(0, 0, 128, 256);
  for (let y = 4; y < 252; y += 7) for (let x = 4; x < 124; x += 8) {
    if (Math.random() < 0.42) {
      ctx2.fillStyle = ['#ffd9a0', '#cfe4ff', '#fff2cc', '#9fd8ff'][Math.floor(Math.random() * 4)];
      ctx2.globalAlpha = 0.5 + Math.random() * 0.5;
      ctx2.fillRect(x, y, 5, 4);
      ctx2.globalAlpha = 1;
    }
  }
  const winTex = new THREE.CanvasTexture(cv);
  winTex.colorSpace = THREE.SRGBColorSpace;
  const winMat = new THREE.MeshBasicMaterial({ map: winTex, toneMapped: false });
  winMat.color.setScalar(1.35); // feeds bloom slightly
  const towers = [];
  const N = opts.count ?? 64;
  let placed = 0, tries = 0;
  while (placed < N && tries++ < N * 12) {
    const a = rand(0, Math.PI * 2);
    const r = rand(620, 1350);
    const x = center.x + Math.cos(a) * r, z = center.z + Math.sin(a) * r;
    if (opts.df && opts.df.dist(x, z) < 100) continue; // never on/near the circuit
    const w = rand(28, 62), dep = rand(28, 62), h = rand(70, 300);
    bodyM.pushBox(x, h / 2 - 2, z, w, h, dep, 0x0a0d16, rand(0, 3.14), 0.08);
    towers.push({ x, z, w, dep, h, rot: 0 });
    placed++;
  }
  group.add(bodyM.build({ castShadow: false, receiveShadow: false, roughness: 0.9 }));
  // window planes on two faces per tower
  const geos = [];
  for (const t of towers) {
    for (const side of [1, -1]) {
      const plane = new THREE.PlaneGeometry(t.w * 0.94, t.h * 0.96);
      plane.rotateY(side > 0 ? 0 : Math.PI);
      plane.translate(t.x, t.h / 2 - 2, t.z + side * (t.dep / 2 + 0.5));
      geos.push(plane);
    }
  }
  const merged = mergeGeometries(geos);
  const win = new THREE.Mesh(merged, winMat);
  group.add(win);
  return group;
}

function groundYAt(track, sm, side, dist) {
  // near band: sweep surface; beyond: corridor-aware far terrain
  const g = track.groundCtx;
  if (!g) return sm.p.y - 0.02;
  const wall = side > 0 ? sm.wallL : sm.wallR;
  if (g.street || dist <= wall + 36) return sweepHeight(track, g, sm, side, dist);
  const px = sm.p.x + sm.n.x * side * dist, pz = sm.p.z + sm.n.z * side * dist;
  return terrainYAt(g.df, g.amp, px, pz);
}

// floodlight pylons (night street race) + positions for the light pool
function makeFloodlights(track, ctx) {
  const m = new Mesher();
  const heads = new Mesher();
  const positions = [];
  const step = 52;
  for (let s = 0; s < track.length; s += step) {
    const frac = s / track.length;
    const at = track.placeAt(frac, 0);
    const side = (Math.floor(s / step) % 2) * 2 - 1;
    const wall = side > 0 ? at.sm.wallL : at.sm.wallR;
    const p = at.p.clone().addScaledVector(at.n, side * (wall + 2.2));
    m.pushBox(p.x, at.p.y + 6, p.z, 0.42, 12, 0.42, 0x2a2e36, 0);
    const hp = p.clone().addScaledVector(at.n, -side * 1.6);
    m.pushBox(hp.x, at.p.y + 12.2, hp.z, 0.3, 0.3, 3.6, 0x22252c, at.heading);
    for (let k = -1; k <= 1; k++) {
      const lp = hp.clone().addScaledVector(at.t, k * 1.1);
      heads.pushBox(lp.x, at.p.y + 12.0, lp.z, 0.9, 0.42, 0.9, 0xfff6de, 0);
    }
    positions.push(new THREE.Vector3(hp.x, at.p.y + 11.2, hp.z));
  }
  const struct = m.build({ castShadow: false, roughness: 0.7 });
  const headMesh = heads.build({ castShadow: false, receiveShadow: false });
  headMesh.material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  headMesh.material.color.setScalar(2.8); // hot pixels for bloom
  ctx.floodPositions = positions;
  const g = new THREE.Group();
  g.add(struct, headMesh);
  return g;
}

// tire barrier stacks at heavy braking corners
function makeTireStacks(track) {
  const geo = new THREE.CylinderGeometry(0.42, 0.42, 0.72, 9);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
  const spots = [];
  const S = track.samples;
  for (let i = 0; i < S.length; i += 4) {
    const ahead = S[(i + 24) % S.length];
    if (S[i].vT - ahead.vT > 30 && S[i].vT > 65) {
      if (!spots.some(s => Math.abs(S[s].s - S[i].s) < 260)) spots.push(i);
    }
  }
  const items = [];
  for (const idx of spots.slice(0, 8)) {
    const apex = S[(idx + 30) % S.length];
    const side = -Math.sign(apex.kappa || 1);
    for (let k = 0; k < 10; k++) {
      const sm = S[(idx + 16 + k * 3) % S.length];
      const wall = side > 0 ? sm.wallL : sm.wallR;
      if (wall > 22) continue;
      const p = sm.p.clone().addScaledVector(sm.n, side * (wall - 0.9));
      for (let st = 0; st < 2 + (k % 2); st++) items.push({ p: new THREE.Vector3(p.x, sm.p.y + 0.36 + st * 0.72, p.z) });
    }
  }
  const inst = new THREE.InstancedMesh(geo, mat, Math.max(items.length, 1));
  const mtx = new THREE.Matrix4(), col = new THREE.Color();
  items.forEach((it, i) => {
    mtx.makeRotationY(rand(0, 3)).setPosition(it.p);
    inst.setMatrixAt(i, mtx);
    col.setHex([0xd23b30, 0xe8e8ea, 0x2a5db0, 0xd23b30][i % 4]).convertSRGBToLinear();
    inst.setColorAt(i, col);
  });
  inst.count = items.length;
  inst.castShadow = true;
  return inst;
}

// catch fencing for open circuits: posts + translucent mesh band
function makeCatchFence(track) {
  const postM = new Mesher();
  const stripGeos = [];
  const step = 14;
  for (let s = 0; s < track.length; s += step) {
    const at = track.placeAt(s / track.length, 0);
    for (const side of [1, -1]) {
      const wall = side > 0 ? at.sm.wallL : at.sm.wallR;
      if (wall > 30) continue;
      const p = at.p.clone().addScaledVector(at.n, side * (wall + 0.35));
      postM.pushBox(p.x, at.p.y + 1.9, p.z, 0.16, 3.8, 0.16, 0x3c424c, 0);
      const q = track.placeAt(((s + step) % track.length) / track.length, 0);
      const wall2 = side > 0 ? q.sm.wallL : q.sm.wallR;
      if (wall2 > 30) continue;
      const p2 = q.p.clone().addScaledVector(q.n, side * (wall2 + 0.35));
      const plane = new THREE.BufferGeometry();
      const v = new Float32Array([
        p.x, at.p.y + 0.9, p.z, p2.x, q.p.y + 0.9, p2.z, p.x, at.p.y + 3.7, p.z,
        p2.x, q.p.y + 0.9, p2.z, p2.x, q.p.y + 3.7, p2.z, p.x, at.p.y + 3.7, p.z,
      ]);
      plane.setAttribute('position', new THREE.BufferAttribute(v, 3));
      plane.computeVertexNormals();
      stripGeos.push(plane);
    }
  }
  const g = new THREE.Group();
  g.add(postM.build({ castShadow: false, roughness: 0.6 }));
  if (stripGeos.length) {
    const merged = mergeGeometries(stripGeos);
    const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({
      color: 0x11141a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false,
    }));
    g.add(mesh);
  }
  return g;
}

// slow drifting blimp
function makeBlimp(center) {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(9, 18, 12),
    new THREE.MeshStandardMaterial({ color: 0xe8eaee, roughness: 0.5 })
  );
  body.scale.set(2.4, 1, 1);
  const finMat = new THREE.MeshStandardMaterial({ color: 0xd0342c, roughness: 0.6 });
  for (const [ry, rz] of [[0, 0], [0, Math.PI / 2]]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 5), finMat);
    fin.position.x = -19; fin.rotation.x = rz;
    grp.add(fin);
  }
  const gondola = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 2.4), new THREE.MeshStandardMaterial({ color: 0x2a2e36 }));
  gondola.position.y = -8.6;
  grp.add(body, gondola);
  grp.position.set(center.x + 300, 170, center.z - 200);
  grp.userData.center = center.clone();
  return grp;
}

function makeTrees(track, count, reject, palette = 'green') {
  const sight = sightLines(track);
  const trunkGeo = new THREE.BoxGeometry(0.5, 2.6, 0.5);
  trunkGeo.translate(0, 1.3, 0);
  const canGeo = (() => {
    const parts = [
      [3.6, 2.8, 3.6, 0, 3.9, 0],
      [2.4, 2.0, 2.4, 0, 6.0, 0],
      [2.0, 1.7, 2.0, 1.5, 4.4, 0.4],
      [1.9, 1.6, 1.9, -1.4, 4.6, -0.5],
      [1.7, 1.4, 1.7, 0.3, 4.9, 1.4],
    ];
    const pos = [], idx = [];
    let off = 0;
    for (const [sx, sy, sz, tx, ty, tz] of parts) {
      const bg = new THREE.BoxGeometry(sx, sy, sz);
      bg.translate(tx, ty, tz);
      pos.push(...bg.attributes.position.array);
      for (const v of bg.index.array) idx.push(v + off);
      off += bg.attributes.position.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 }), count);
  const canopies = new THREE.InstancedMesh(canGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), count);
  canopies.castShadow = true; trunks.castShadow = true;
  const mtx = new THREE.Matrix4(), col = new THREE.Color();
  let placed = 0, guard = 0;
  while (placed < count && guard++ < count * 30) {
    const frac = Math.random();
    const side = Math.random() > 0.5 ? 1 : -1;
    const at = track.placeAt(frac, 0);
    const wall = side > 0 ? at.sm.wallL : at.sm.wallR;
    const dist = rand(wall + 5, wall + track.cfg.apron * 1.35);
    const p = at.p.clone().addScaledVector(at.n, side * dist);
    p.y = groundYAt(track, at.sm, side, dist);
    if (reject && reject(p, frac, side, dist)) continue;
    const q = track.query(p, at.sm.idx);
    if (Math.abs(q.lat) < track.width / 2 + 7) continue;
    const s = rand(0.8, 1.6);
    if (blocksSight(sight, p.x, p.z, p.y + 7.2 * s * 1.2)) continue;
    mtx.makeRotationY(Math.random() * Math.PI * 2).scale(new THREE.Vector3(s, s * rand(0.9, 1.2), s)).setPosition(p);
    trunks.setMatrixAt(placed, mtx);
    canopies.setMatrixAt(placed, mtx);
    if (palette === 'autumn') {
      col.setHSL(rand(0.05, 0.16), rand(0.5, 0.75), rand(0.30, 0.44)); // gold/rust/olive
      if (Math.random() < 0.35) col.setHSL(rand(0.2, 0.28), rand(0.35, 0.5), rand(0.28, 0.38));
    } else {
      col.setHSL(0.29 + Math.random() * 0.06, rand(0.4, 0.55), rand(0.28, 0.42));
    }
    canopies.setColorAt(placed, col);
    placed++;
  }
  trunks.count = placed; canopies.count = placed;
  return [trunks, canopies];
}

function makeGrandstands(track, defs, crowdColors) {
  const m = new Mesher();
  const crowdSpots = [];
  for (const def of defs) {
    const f0 = def.f0, f1 = def.f1 < f0 ? def.f1 + 1 : def.f1;
    const step = 4.5 / track.length;
    for (let f = f0; f < f1; f += step) {
      const at = track.placeAt(f % 1, 0);
      const side = def.side === 'auto' ? -Math.sign(at.sm.kappa || 1) : def.side;
      const wall = side > 0 ? at.sm.wallL : at.sm.wallR;
      const dist = wall + (def.gap ?? 3);
      const rows = def.rows ?? 6;
      const heading = at.heading;
      for (let r = 0; r < rows; r++) {
        const d = dist + 1.2 * r;
        const p = at.p.clone().addScaledVector(at.n, side * d);
        const y = at.p.y + 0.6 + r * 0.62;
        m.pushBox(p.x, y - 0.31, p.z, 1.25, 0.62, 4.6, r % 2 ? 0x6d737c : 0x5f656e, heading, 0.05);
        if (Math.random() < 0.82) crowdSpots.push([p.x, y + 0.32, p.z]);
        if (Math.random() < 0.55) crowdSpots.push([p.x + Math.sin(heading) * 1.4, y + 0.32, p.z + Math.cos(heading) * 1.4]);
      }
      // supports + roof
      const backD = dist + 1.2 * rows + 0.6;
      const pBack = at.p.clone().addScaledVector(at.n, side * backD);
      m.pushBox(pBack.x, at.p.y + rows * 0.31, pBack.z, 0.5, rows * 0.62 + 0.6, 4.6, 0x494e56, heading);
      const pRoof = at.p.clone().addScaledVector(at.n, side * (dist + rows * 0.6));
      m.pushBox(pRoof.x, at.p.y + rows * 0.62 + 2.6, pRoof.z, rows * 1.25 + 1.5, 0.25, 4.8, def.roof ?? 0xe8eaee, heading, 0.04);
      const pPost = at.p.clone().addScaledVector(at.n, side * dist);
      m.pushBox(pPost.x, at.p.y + rows * 0.31 + 1.3, pPost.z, 0.22, rows * 0.62 + 2.6, 0.22, 0x9aa0a8, 0);
    }
  }
  const structure = m.build({ roughness: 0.85 });
  // crowd
  const crowd = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.34, 0.6, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    Math.max(crowdSpots.length, 1)
  );
  const mtx = new THREE.Matrix4(), col = new THREE.Color();
  crowdSpots.forEach((p, i) => {
    mtx.makeRotationY(rand(0, 6.28)).setPosition(p[0] + rand(-0.4, 0.4), p[1], p[2] + rand(-0.4, 0.4));
    crowd.setMatrixAt(i, mtx);
    col.setHSL(Math.random(), rand(0.5, 0.85), rand(0.35, 0.62));
    crowd.setColorAt(i, col);
  });
  crowd.count = crowdSpots.length;
  crowd.castShadow = false; crowd.receiveShadow = false;
  return [structure, crowd];
}

const BRANDS = [
  { t: 'VOXEL GP', bg: '#d40b18', fg: '#ffffff' },
  { t: 'GRIPELLI', bg: '#ffd700', fg: '#101010' },
  { t: 'BLOCKBULL', bg: '#1a2c5e', fg: '#ffd700' },
  { t: 'CUBEWAY', bg: '#0d9c8a', fg: '#ffffff' },
  { t: 'TURBOVOX', bg: '#ffffff', fg: '#d40b18' },
  { t: '速度方块', bg: '#16181d', fg: '#ffffff' },
];

function makeAdBoards(track, { skip, night = false } = {}) {
  const group = new THREE.Group();
  const geosByBrand = BRANDS.map(() => []);
  const postM = new Mesher();
  const stepM = 105;
  for (let s = 0; s < track.length; s += stepM) {
    const frac = s / track.length;
    if (skip && skip(frac)) continue;
    const at = track.placeAt(frac, 0);
    if (Math.abs(at.sm.kappa) > 0.006) continue;
    const side = (Math.floor(s / stepM) % 2) * 2 - 1;
    const wall = side > 0 ? at.sm.wallL : at.sm.wallR;
    if (wall < 4) continue;
    const p = at.p.clone().addScaledVector(at.n, side * (wall + 1.1));
    const plane = new THREE.PlaneGeometry(7.2, 1.0);
    const facing = at.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    plane.rotateY(facing);
    plane.translate(p.x, at.p.y + 1.15, p.z);
    geosByBrand[Math.floor(s / stepM) % BRANDS.length].push(plane);
    postM.pushBox(p.x, at.p.y + 0.3, p.z, 0.18, 0.75, 0.18, 0x50555c, 0);
  }
  geosByBrand.forEach((geos, i) => {
    if (!geos.length) return;
    const merged = mergeGeometries(geos);
    const tex = textTexture(BRANDS[i].t, { w: 1024, h: 144, bg: BRANDS[i].bg, fg: BRANDS[i].fg });
    const mat = night
      ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
      : new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
    if (night) mat.color.setScalar(1.15);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = false;
    group.add(mesh);
  });
  group.add(postM.build({ castShadow: false }));
  return group;
}

// minimal geometry merge (positions+normal+uv, non-indexed)
function mergeGeometries(geos) {
  const pos = [], nrm = [], uv = [];
  for (const g of geos) {
    const gg = g.toNonIndexed ? g.toNonIndexed() : g;
    pos.push(...gg.attributes.position.array);
    nrm.push(...gg.attributes.normal.array);
    if (gg.attributes.uv) uv.push(...gg.attributes.uv.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  if (uv.length) out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

function makeCornerBoards(track) {
  const corners = track.cfg.corners.filter(c => c.num > 0);
  if (!corners.length) return new THREE.Group();
  // texture atlas: one row per corner
  const cellH = 96, W = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = cellH * corners.length;
  const ctx = cv.getContext('2d');
  corners.forEach((c, i) => {
    const y = i * cellH;
    ctx.fillStyle = '#f5f0e6'; ctx.fillRect(0, y, W, cellH);
    ctx.fillStyle = '#d40b18'; ctx.fillRect(0, y, 96, cellH);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 56px "Segoe UI", Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(c.num), 48, y + cellH / 2 + 2);
    ctx.fillStyle = '#15161a'; ctx.textAlign = 'left';
    ctx.font = `900 ${c.n.length > 12 ? 40 : 48}px "Segoe UI", Arial`;
    ctx.fillText(c.n.toUpperCase(), 112, y + cellH / 2 + 2, W - 130);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const geos = [];
  const posts = new Mesher();
  corners.forEach((c, i) => {
    const f = ((c.f - 85 / track.length) % 1 + 1) % 1;
    const at = track.placeAt(f, 0);
    const side = -Math.sign(track.placeAt(c.f, 0).sm.kappa || 1);
    const wall = side > 0 ? at.sm.wallL : at.sm.wallR;
    const p = at.p.clone().addScaledVector(at.n, side * (wall + 1.6));
    const plane = new THREE.PlaneGeometry(3.4, 0.65);
    const uvA = plane.attributes.uv;
    for (let k = 0; k < uvA.count; k++) uvA.setY(k, 1 - (i + 1 - uvA.getY(k)) / corners.length);
    const facing = at.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    plane.rotateY(facing);
    plane.translate(p.x, at.p.y + 2.2, p.z);
    geos.push(plane);
    posts.pushBox(p.x, at.p.y + 0.9, p.z, 0.16, 1.9, 0.16, 0x555a61, 0);
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide }));
  const group = new THREE.Group();
  group.add(mesh, posts.build({ castShadow: false }));
  return group;
}

function makeGantry(track) {
  const at = track.placeAt(4 / track.length, 0);
  const m = new Mesher();
  const w2 = track.width / 2 + 1.4;
  const h = 6.4;
  const heading = at.heading;
  for (const side of [1, -1]) {
    const p = at.p.clone().addScaledVector(at.n, side * w2);
    m.pushBox(p.x, at.p.y + h / 2, p.z, 0.85, h, 0.85, 0x2c2f35, heading);
  }
  m.pushBox(at.p.x, at.p.y + h + 0.6, at.p.z, w2 * 2 + 1.7, 1.3, 1.1, 0x24272c, heading);
  const group = new THREE.Group();
  group.add(m.build({ roughness: 0.6 }));
  // banner
  const tex = textTexture('VOXEL GRAND PRIX', { w: 1024, h: 128, bg: '#111318', fg: '#ffffff' });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(w2 * 2, 1.0), new THREE.MeshBasicMaterial({ map: tex }));
  banner.position.set(at.p.x, at.p.y + h + 0.6, at.p.z);
  banner.rotation.y = heading + Math.PI;
  banner.translateZ(0.6);
  group.add(banner);
  // 5x2 start lights facing the grid (backwards)
  const lights = [];
  const lightGeo = new THREE.BoxGeometry(0.34, 0.34, 0.12);
  const rig = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x330a0a, toneMapped: false });
    for (let r = 0; r < 2; r++) {
      const lm = new THREE.Mesh(lightGeo, mat);
      lm.position.set((i - 2) * 0.55, -1.1 - r * 0.42, 0);
      rig.add(lm);
    }
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.35, 0.2), new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.5 }));
    housing.position.set((i - 2) * 0.55, -1.31, 0.08);
    rig.add(housing);
    lights.push(mat);
  }
  rig.position.set(at.p.x, at.p.y + h + 0.55, at.p.z);
  rig.rotation.y = heading + Math.PI; // face backwards toward the grid
  rig.translateZ(-0.75);
  group.add(rig);
  return { group, lights };
}

function makePit(track) {
  const cfg = track.cfg;
  const side = cfg.pitSide;
  const m = new Mesher();
  const f0 = 0.982, f1 = 1.022;
  const step = 6 / track.length;
  let first = null, last = null;
  for (let f = f0; f <= f1; f += step) {
    const at = track.placeAt(f % 1, 0);
    const wall = side > 0 ? at.sm.wallL : at.sm.wallR;
    const d = wall + 8;
    const p = at.p.clone().addScaledVector(at.n, side * d);
    if (!first) first = { p, at };
    last = { p, at };
    const heading = at.heading;
    m.pushBox(p.x, at.p.y + 2.6, p.z, 9.5, 5.2, 6.2, 0xd6d9de, heading, 0.03);
    // garage mouth
    const pm = at.p.clone().addScaledVector(at.n, side * (d - 4.8));
    m.pushBox(pm.x, at.p.y + 1.5, pm.z, 0.3, 3.0, 4.6, 0x0e0f12, heading);
    m.pushBox(p.x, at.p.y + 5.4, p.z, 10.2, 0.3, 7.0, 0x2e3138, heading);
    // pit wall between track and lane
    const pw = at.p.clone().addScaledVector(at.n, side * (wall + 0.4));
    m.pushBox(pw.x, at.p.y + 0.5, pw.z, 0.4, 1.0, 6.2, 0x9aa0a8, heading, 0.05);
  }
  return m.build({ roughness: 0.8 });
}

function makeDistanceBoards(track) {
  const m = new Mesher();
  const group = new THREE.Group();
  const texs = [100, 50].map(n => textTexture(String(n), { w: 256, h: 256, bg: '#d40b18', fg: '#ffffff', border: '#ffffff' }));
  const geos = [[], []];
  const { samples } = track;
  // braking points: big vT drop
  const spots = [];
  for (let i = 0; i < samples.length; i += 4) {
    const ahead = samples[(i + 24) % samples.length];
    if (samples[i].vT - ahead.vT > 26 && samples[i].vT > 70) {
      if (!spots.some(sIdx => Math.abs(samples[sIdx].s - samples[i].s) < 220)) spots.push(i);
    }
  }
  for (const idx of spots.slice(0, 7)) {
    for (let b = 0; b < 2; b++) {
      const s = samples[idx].s - (b === 0 ? 100 : 50) + 60;
      const at = track.placeAt(((s / track.length) % 1 + 1) % 1, 0);
      const side = -Math.sign(samples[(idx + 26) % samples.length].kappa || 1);
      const wall = side > 0 ? at.sm.wallL : at.sm.wallR;
      const p = at.p.clone().addScaledVector(at.n, side * (wall + 1.0));
      const plane = new THREE.PlaneGeometry(1.15, 1.15);
      plane.rotateY(at.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2));
      plane.translate(p.x, at.p.y + 1.5, p.z);
      geos[b].push(plane);
      m.pushBox(p.x, at.p.y + 0.45, p.z, 0.14, 0.9, 0.14, 0x50555c, 0);
    }
  }
  geos.forEach((g, i) => {
    if (!g.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(g), new THREE.MeshStandardMaterial({ map: texs[i], roughness: 0.7 }));
    group.add(mesh);
  });
  group.add(m.build({ castShadow: false }));
  return group;
}

// ---------------------------------------------------------------- Monaco
function monacoExtras(track, group, ctx) {
  const PALETTE = [0xe8d8b0, 0xe6c9a8, 0xd9a9a0, 0xf0e6d2, 0xc9b896, 0xdfd3c0];
  const m = new Mesher();
  const win = 0x2c3a4c;
  const inTunnel = f => track.inTunnel(f);
  const harborZone = (f, side) => side < 0 && ((f > 0.575 && f < 0.925) || f > 0.955 || f < 0.055);

  // --- city blocks along both sides ---
  const step = 21 / track.length;
  for (let f = 0; f < 1; f += step) {
    for (const side of [1, -1]) {
      if (inTunnel(f) || harborZone(f, side)) continue;
      if (Math.random() < 0.14) continue;
      const at = track.placeAt(f, 0);
      const wall = side > 0 ? at.sm.wallL : at.sm.wallR;
      const setback = wall + rand(5, 13);
      const w = rand(13, 19), d = rand(10, 16), hgt = rand(11, 15) + (Math.random() < 0.3 ? rand(6, 16) : 0);
      const p = at.p.clone().addScaledVector(at.n, side * (setback + d / 2));
      const gy = groundYAt(track, at.sm, side, setback) - 0.9; // embed the base
      const heading = at.heading;
      // reject if the center or either façade end crowds any road segment
      let tooClose = false;
      for (const lx of [-w / 2, 0, w / 2]) {
        const cp = p.clone().add(new THREE.Vector3(Math.sin(heading) * lx, 0, Math.cos(heading) * lx));
        const q = track.query(cp, at.sm.idx);
        if (Math.abs(q.lat) < track.width / 2 + d / 2 + 3 && Math.abs(q.y - gy) < 9) { tooClose = true; break; }
      }
      if (tooClose) continue;
      const col = pick(PALETTE);
      m.pushBox(p.x, gy + hgt / 2, p.z, d, hgt, w, col, heading, 0.06);
      m.pushBox(p.x, gy + hgt + 0.35, p.z, d + 0.8, 0.7, w + 0.8, 0x9e5b3c, heading, 0.08);
      // window grids on both long façades
      const cols = Math.floor(w / 2.3), rows = Math.floor(hgt / 3.2);
      for (const face of [-1, 1]) {
        for (let wc = 0; wc < cols; wc++) for (let wr = 0; wr < rows; wr++) {
          const lx = (wc - (cols - 1) / 2) * 2.3;
          const ly = gy + 2.2 + wr * 3.2;
          const off = new THREE.Vector3(Math.sin(heading) * lx, 0, Math.cos(heading) * lx); // along façade
          const facadeP = p.clone().add(off).addScaledVector(at.n, face * side * (d / 2 + 0.12));
          m.pushBox(facadeP.x, ly, facadeP.z, 0.35, 1.5, 1.15, Math.random() < 0.12 ? 0xffe9b0 : win, heading, 0.15);
        }
      }
      if (Math.random() < 0.4) { // awnings
        const ap = p.clone().addScaledVector(at.n, -side * (d / 2 + 0.7));
        m.pushBox(ap.x, gy + 3.2, ap.z, 1.4, 0.18, w * 0.5, pick([0xc23b3b, 0x3b6ec2, 0xe0e0e0]), heading, 0);
      }
    }
  }

  // --- tunnel structure + hotel above ---
  const t0 = track.cfg.tunnel[0], t1 = track.cfg.tunnel[1];
  const tm = new Mesher();
  const stepT = 3.2 / track.length;
  const lightsM = new Mesher();
  for (let f = t0; f < t1; f += stepT) {
    const at = track.placeAt(f, 0);
    const w2 = track.width / 2;
    const heading = at.heading;
    for (const side of [1, -1]) {
      const wp = at.p.clone().addScaledVector(at.n, side * (w2 + 1.35));
      tm.pushBox(wp.x, at.p.y + 2.3, wp.z, 0.7, 4.6, 4.8, 0x8f887a, heading, 0.04);
    }
    tm.pushBox(at.p.x, at.p.y + 4.9, at.p.z, (w2 + 1.7) * 2, 0.7, 4.8, 0x7e776b, heading, 0.04);
    const fi = Math.round((f - t0) / stepT);
    if (fi % 3 === 1) lightsM.pushBox(at.p.x, at.p.y + 4.45, at.p.z, 1.7, 0.14, 0.5, 0xffe0a8, heading);
    if (fi % 6 === 2) { // hotel mass above
      tm.pushBox(at.p.x, at.p.y + 5.5 + 4.5, at.p.z, (w2 + rand(6, 10)) * 2, 9, 10.5, pick(PALETTE), heading, 0.06);
    }
  }
  group.add(tm.build({ roughness: 0.9 }));
  const lightsMesh = lightsM.build({ castShadow: false, receiveShadow: false });
  lightsMesh.material = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  group.add(lightsMesh);
  // interior point lights
  for (let i = 0; i < 6; i++) {
    const f = t0 + (t1 - t0) * (i + 0.5) / 6;
    const at = track.placeAt(f, 0);
    const pl = new THREE.PointLight(0xffc890, 60, 30, 1.8);
    pl.position.set(at.p.x, at.p.y + 3.8, at.p.z);
    group.add(pl);
  }

  // --- harbor: water + quay + yachts ---
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 240, 48, 28),
    new THREE.MeshStandardMaterial({ color: 0x1d5f96, roughness: 0.24, metalness: 0.05, envMapIntensity: 0.8 })
  );
  water.rotation.x = -Math.PI / 2;
  const wAt = track.placeAt(0.755, 0);
  const wCenter = wAt.p.clone().addScaledVector(wAt.n, -(wAt.sm.wallR + 140));
  water.position.set(wCenter.x, -1.35, wCenter.z);
  water.rotation.z = -wAt.heading;
  water.receiveShadow = true;
  group.add(water);
  ctx.water = water;
  const ym = new Mesher();
  for (let i = 0; i < 11; i++) {
    const f = 0.63 + (0.90 - 0.63) * (i / 11) + rand(0, 0.01);
    const at = track.placeAt(f, 0);
    const d = at.sm.wallR + rand(26, 95);
    const p = at.p.clone().addScaledVector(at.n, -d);
    const hd = rand(0, Math.PI * 2);
    const s = rand(0.8, 1.7);
    ym.pushBox(p.x, -0.9, p.z, 10 * s, 1.4, 3.2 * s, 0xf2f4f6, hd, 0.03);       // hull
    ym.pushBox(p.x, -0.1, p.z, 6.5 * s, 0.5, 2.9 * s, 0xe4e7ea, hd);            // deck
    ym.pushBox(p.x, 0.6, p.z, 3.4 * s, 1.1, 2.2 * s, 0xd7dbdf, hd);             // cabin
    ym.pushBox(p.x, 1.9, p.z, 0.16, 2.6, 0.16, 0x8f959e, hd);                    // mast
  }
  // quay edge
  const qm = new Mesher();
  for (let f = 0.615; f < 0.92; f += 8 / track.length) {
    const at = track.placeAt(f, 0);
    const d = at.sm.wallR + rand(14, 15);
    const p = at.p.clone().addScaledVector(at.n, -d);
    qm.pushBox(p.x, at.p.y - 0.8, p.z, 2.2, 1.6, 8.4, 0xb0aca0, at.heading, 0.05);
  }
  group.add(ym.build({ roughness: 0.5 }), qm.build());
  group.add(m.build({ roughness: 0.92 }));
}

// ---------------------------------------------------------------- Suzuka
function suzukaExtras(track, group, ctx) {
  // --- crossover bridge ---
  for (const cross of track.crossings) {
    const hi = track.samples[cross.highIdx], lo = track.samples[cross.lowIdx];
    const m = new Mesher();
    const heading = Math.atan2(hi.t.x, hi.t.z);
    // girder under the upper deck
    for (let d = -16; d <= 16; d += 4) {
      const p = hi.p.clone().addScaledVector(hi.t, d);
      const y = p.y;
      m.pushBox(p.x, y - 0.65, p.z, track.width + 3.4, 1.0, 4.2, d % 8 === 0 ? 0xd8dce2 : 0xc22832, heading, 0.04);
      // side rails on the upper deck
      for (const side of [1, -1]) {
        const pr = p.clone().addScaledVector(hi.n, side * (track.width / 2 + 1.1));
        m.pushBox(pr.x, y + 0.75, pr.z, 0.35, 1.5, 4.2, 0xdfe3e8, heading, 0.03);
      }
    }
    // support pillars beside the lower road
    for (const sideL of [1, -1]) {
      const off = lo.p.clone().addScaledVector(lo.n, sideL * (track.width / 2 + 2.6));
      const h = hi.p.y - lo.p.y - 1.1;
      m.pushBox(off.x, lo.p.y + h / 2, off.z, 2.0, h, 2.0, 0xb8bcc2, 0, 0.04);
    }
    const mesh = m.build({ roughness: 0.8 });
    group.add(mesh);
    // banner on the girder facing the lower road
    const tex = textTexture('SUZUKA', { w: 512, h: 96, bg: '#c22832', fg: '#ffffff' });
    for (const s of [1, -1]) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(13, 1.05), new THREE.MeshBasicMaterial({ map: tex }));
      const bp = hi.p.clone().addScaledVector(hi.n, 0);
      banner.position.set(bp.x, hi.p.y - 0.65, bp.z);
      banner.rotation.y = heading + (s > 0 ? 0 : Math.PI);
      banner.translateZ(2.15);
      group.add(banner);
    }
  }

  // --- ferris wheel ---
  const at = track.placeAt(0.955, 0);
  const side = 1;
  const base = at.p.clone().addScaledVector(at.n, side * (at.sm.wallL + 85));
  base.y = groundYAt(track, at.sm, side, at.sm.wallL + 85);
  group.add(makeFerris(base, at.heading + Math.PI / 2, ctx, 24));
}

// shared big wheel (Suzuka / Singapore Flyer)
function makeFerris(base, rotY, ctx, R = 24) {
  const wheel = new THREE.Group();
  const rim = new Mesher();
  const SEG = 28;
  for (let i = 0; i < SEG; i++) {
    const a0 = i / SEG * Math.PI * 2, a1 = (i + 1) / SEG * Math.PI * 2;
    const x0 = Math.cos(a0) * R, y0 = Math.sin(a0) * R;
    const x1 = Math.cos(a1) * R, y1 = Math.sin(a1) * R;
    rim.pushBox((x0 + x1) / 2, (y0 + y1) / 2, 0, Math.hypot(x1 - x0, y1 - y0) + 0.4, 0.55, 0.55, 0xe8eaee, 0);
    const seg = rim.pos.length / 3 - 24; // rotate the just-added box around Z
    const ang = Math.atan2(y1 - y0, x1 - x0);
    for (let v = seg; v < rim.pos.length / 3; v++) {
      const px = rim.pos[v * 3] - (x0 + x1) / 2, py = rim.pos[v * 3 + 1] - (y0 + y1) / 2;
      rim.pos[v * 3] = (x0 + x1) / 2 + px * Math.cos(ang) - py * Math.sin(ang);
      rim.pos[v * 3 + 1] = (y0 + y1) / 2 + px * Math.sin(ang) + py * Math.cos(ang);
    }
  }
  for (let i = 0; i < 7; i++) { // spokes
    const a = i / 7 * Math.PI;
    rim.pushBox(0, 0, 0, R * 2 - 1, 0.4, 0.4, 0xc8ccd2, 0);
    const start = rim.pos.length / 3 - 24;
    for (let v = start; v < rim.pos.length / 3; v++) {
      const px = rim.pos[v * 3], py = rim.pos[v * 3 + 1];
      rim.pos[v * 3] = px * Math.cos(a) - py * Math.sin(a);
      rim.pos[v * 3 + 1] = px * Math.sin(a) + py * Math.cos(a);
    }
  }
  rim.pushBox(0, 0, 0, 2.2, 2.2, 2.6, 0x9aa0a8, 0);
  const rimMesh = rim.build({ roughness: 0.55, castShadow: false });
  wheel.add(rimMesh);
  const CABS = 14;
  const cabCols = [0xe23b3b, 0xf0a028, 0x35b06a, 0x3576d0, 0xd050b8, 0xf3ee4f];
  const cabins = [];
  for (let i = 0; i < CABS; i++) {
    const cm = new Mesher();
    cm.pushBox(0, -1.1, 0, 1.9, 2.0, 1.9, cabCols[i % cabCols.length], 0, 0.04);
    cm.pushBox(0, -0.15, 0, 0.3, 0.6, 0.3, 0x666b72, 0);
    const cab = cm.build({ castShadow: false });
    wheel.add(cab);
    cabins.push({ mesh: cab, angle: i / CABS * Math.PI * 2 });
  }
  const legs = new Mesher();
  legs.pushBox(-9, -R / 2 - 2, 0, 1.4, R + 6, 1.4, 0x8f959e, 0);
  legs.pushBox(9, -R / 2 - 2, 0, 1.4, R + 6, 1.4, 0x8f959e, 0);
  const legMesh = legs.build({});
  const whole = new THREE.Group();
  whole.add(wheel, legMesh);
  whole.position.set(base.x, base.y + R + 4, base.z);
  whole.rotation.y = rotY;
  ctx.ferris = { wheel, cabins, R };
  return whole;
}

// ---------------------------------------------------------------- Singapore
function singaporeExtras(track, group, ctx, center) {
  // lit skyline ring (kept clear of the circuit)
  group.add(makeSkyline(center, { count: 72, df: track.groundCtx && track.groundCtx.df }));
  // bay: water plane on the empty side of the loop
  const S = track.samples;
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  const centroid = new THREE.Vector3();
  for (const s of S) {
    centroid.add(s.p);
    minx = Math.min(minx, s.p.x); maxx = Math.max(maxx, s.p.x);
    minz = Math.min(minz, s.p.z); maxz = Math.max(maxz, s.p.z);
  }
  centroid.divideScalar(S.length);
  const bboxC = new THREE.Vector3((minx + maxx) / 2, 0, (minz + maxz) / 2);
  const dir = bboxC.clone().sub(centroid).setY(0);
  if (dir.lengthSq() < 1) dir.set(1, 0, 0);
  dir.normalize();
  const waterC = centroid.clone().addScaledVector(dir, 420);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 850),
    new THREE.MeshStandardMaterial({ color: 0x0a1626, roughness: 0.12, metalness: 0.55, envMapIntensity: 1.2 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(waterC.x, -2.05, waterC.z);
  group.add(water);
  ctx.water = water;
  ctx.waterBaseY = -2.05;
  // the Flyer at the bay's edge
  const flyerPos = centroid.clone().addScaledVector(dir, 240);
  flyerPos.y = 0;
  group.add(makeFerris(flyerPos, rand(0, 3), ctx, 30));
}

// ---------------------------------------------------------------- Silverstone
function silverstoneExtras(track, group) {
  // The Wing: long sleek building along the pit straight
  const m = new Mesher();
  for (let f = 0.975; f < 1.035; f += 5 / track.length) {
    const at = track.placeAt(f % 1, 0);
    const side = track.cfg.pitSide;
    const d = (side > 0 ? at.sm.wallL : at.sm.wallR) + 24;
    const p = at.p.clone().addScaledVector(at.n, side * d);
    m.pushBox(p.x, at.p.y + 4.2, p.z, 16, 8.4, 5.2, 0xdde1e6, at.heading, 0.03);
    m.pushBox(p.x, at.p.y + 8.8, p.z, 20, 0.5, 5.6, 0x2e3138, at.heading);
  }
  group.add(m.build({ roughness: 0.6 }));
}

// ---------------------------------------------------------------- main entry
export function buildEnvironment(scene, track, cfg, renderer = null) {
  const group = new THREE.Group();
  const ctx = { time: 0, night: cfg.sky.type === 'night' };

  // ---- sky + image-based lighting from the sky itself ----
  const skySys = makeSkySystem(cfg.sky, renderer);
  group.add(skySys.mesh);
  if (skySys.envTex) {
    scene.environment = skySys.envTex;
    if ('environmentIntensity' in scene) scene.environmentIntensity = ctx.night ? 0.75 : 0.55;
    ctx.envTex = skySys.envTex;
  }
  scene.fog = new THREE.FogExp2(cfg.sky.fog, cfg.sky.fogDensity);

  const hemi = new THREE.HemisphereLight(cfg.sky.hemiSky, cfg.sky.hemiGround, cfg.sky.hemiIntensity);
  group.add(hemi);
  const sun = new THREE.DirectionalLight(cfg.sky.sunColor, cfg.sky.sunIntensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = 62;
  sun.shadow.camera.left = -sc; sun.shadow.camera.right = sc;
  sun.shadow.camera.top = sc; sun.shadow.camera.bottom = -sc;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 560;
  sun.shadow.bias = -0.00028; sun.shadow.normalBias = 0.035;
  group.add(sun, sun.target);
  ctx.sunDir = sunDirFrom(cfg.sky);

  // ---- ground: one continuous surface swept from the road edge outward
  group.add(buildGroundSweep(track, cfg));

  // shared props
  const center = track.samples.reduce((v, s) => v.add(s.p), new THREE.Vector3()).divideScalar(track.samples.length);
  group.add(makeClouds(center));
  const gantry = makeGantry(track);
  group.add(gantry.group);
  group.add(makePit(track));
  group.add(makeCornerBoards(track));
  group.add(makeDistanceBoards(track));

  const skipAds = f => (track.inTunnel && track.inTunnel(f)) || (f > 0.96 || f < 0.04);
  group.add(makeAdBoards(track, { skip: skipAds, night: ctx.night }));

  let standDefs, treeCount = 0, treePalette = 'green', treeReject = null;
  if (cfg.env === 'monaco') {
    standDefs = [
      { f0: 0.628, f1: 0.700, side: 1, rows: 6, gap: 2.5 },
      { f0: 0.775, f1: 0.845, side: 1, rows: 5, gap: 2.5 },
      { f0: 0.965, f1: 0.995, side: 1, rows: 5, gap: 2 },
    ];
    treeCount = 26;
    treeReject = (p, f, side) => (side < 0 && f > 0.58 && f < 0.95) || (f > 0.30 && f < 0.47) || track.inTunnel(f);
    monacoExtras(track, group, ctx);
  } else if (cfg.env === 'suzuka') {
    standDefs = [
      { f0: 0.962, f1: 1.045, side: -1, rows: 8, gap: 4 },
      { f0: 0.085, f1: 0.135, side: 'auto', rows: 6, gap: 5 },
      { f0: 0.195, f1: 0.24, side: -1, rows: 5, gap: 5 },
      { f0: 0.845, f1: 0.895, side: 1, rows: 6, gap: 5 },
      { f0: 0.475, f1: 0.50, side: 1, rows: 5, gap: 4 },
    ];
    treeCount = 380;
    suzukaExtras(track, group, ctx);
    group.add(makeCatchFence(track));
  } else if (cfg.env === 'spa') {
    standDefs = [
      { f0: 0.975, f1: 1.045, side: -1, rows: 8, gap: 4 },
      { f0: 0.030, f1: 0.062, side: 'auto', rows: 6, gap: 4 },
      { f0: 0.135, f1: 0.170, side: 1, rows: 7, gap: 6 },
      { f0: 0.520, f1: 0.555, side: -1, rows: 5, gap: 5 },
    ];
    const [ct, cc] = makeConifers(track, 3200, cfg);
    group.add(ct, cc);
    group.add(makeRidges(track, center));
    group.add(makeCatchFence(track));
    treeCount = 90;
  } else if (cfg.env === 'monza') {
    standDefs = [
      { f0: 0.960, f1: 1.045, side: -1, rows: 8, gap: 4 },
      { f0: 0.870, f1: 0.905, side: 1, rows: 7, gap: 5 },
      { f0: 0.140, f1: 0.175, side: 1, rows: 6, gap: 5 },
      { f0: 0.680, f1: 0.710, side: -1, rows: 5, gap: 5 },
    ];
    treeCount = 950;
    treePalette = 'autumn';
    group.add(makeCatchFence(track));
    ctx.blimp = makeBlimp(center);
    group.add(ctx.blimp);
  } else if (cfg.env === 'singapore') {
    standDefs = [
      { f0: 0.955, f1: 1.03, side: -1, rows: 7, gap: 3 },
      { f0: 0.925, f1: 0.950, side: 1, rows: 8, gap: 3 },
      { f0: 0.700, f1: 0.740, side: -1, rows: 5, gap: 3 },
    ];
    singaporeExtras(track, group, ctx, center);
    group.add(makeFloodlights(track, ctx));
  } else {
    standDefs = [
      { f0: 0.965, f1: 1.04, side: -1, rows: 8, gap: 4 },
      { f0: 0.488, f1: 0.525, side: 1, rows: 7, gap: 5 },
      { f0: 0.60, f1: 0.655, side: -1, rows: 6, gap: 6 },
      { f0: 0.815, f1: 0.855, side: 1, rows: 6, gap: 5 },
      { f0: 0.325, f1: 0.36, side: 1, rows: 6, gap: 4 },
    ];
    treeCount = 300;
    silverstoneExtras(track, group);
    group.add(makeCatchFence(track));
    ctx.blimp = makeBlimp(center);
    group.add(ctx.blimp);
  }
  group.add(makeTireStacks(track));
  const [stands, crowd] = makeGrandstands(track, standDefs);
  group.add(stands, crowd);
  if (treeCount > 0) {
    const [trunks, canopies] = makeTrees(track, treeCount, treeReject, treePalette);
    group.add(trunks, canopies);
  }

  // night: a pool of point lights hopping between the nearest floodlights
  if (ctx.night && ctx.floodPositions) {
    ctx.poolLights = [];
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight(0xf6efdc, 460, 84, 1.7);
      group.add(pl);
      ctx.poolLights.push(pl);
    }
  }

  scene.add(group);

  const _target = new THREE.Vector3();
  return {
    group, sun, hemi,
    gantryLights: gantry.lights,
    update(dt, carPos) {
      ctx.time += dt;
      // sun follows car (texel-snapped to avoid shadow shimmer)
      const snap = 4;
      _target.set(Math.round(carPos.x / snap) * snap, 0, Math.round(carPos.z / snap) * snap);
      sun.position.copy(_target).addScaledVector(ctx.sunDir, 260);
      sun.target.position.copy(_target);
      if (ctx.ferris) {
        ctx.ferris.wheel.rotation.z += dt * 0.08;
        for (const cab of ctx.ferris.cabins) {
          const a = cab.angle + ctx.ferris.wheel.rotation.z;
          cab.mesh.position.set(Math.cos(a) * ctx.ferris.R, Math.sin(a) * ctx.ferris.R, 0);
          cab.mesh.rotation.z = -ctx.ferris.wheel.rotation.z - cab.angle;
        }
      }
      if (ctx.water) {
        const t = ctx.time;
        ctx.water.position.y = (ctx.waterBaseY ?? -1.35) + Math.sin(t * 0.7) * 0.05;
      }
      if (ctx.blimp) {
        const c = ctx.blimp.userData.center;
        const a = ctx.time * 0.012 + 1.2;
        ctx.blimp.position.set(c.x + Math.cos(a) * 420, 165 + Math.sin(ctx.time * 0.1) * 6, c.z + Math.sin(a) * 420);
        ctx.blimp.rotation.y = -a - Math.PI / 2;
      }
      if (ctx.poolLights && ctx.floodPositions) {
        // pick the nearest floodlight heads to the car for the light pool
        const near = ctx.floodPositions
          .map(p => ({ p, d: (p.x - carPos.x) ** 2 + (p.z - carPos.z) ** 2 }))
          .sort((a, b) => a.d - b.d);
        for (let i = 0; i < ctx.poolLights.length; i++) {
          const src = near[i];
          if (src) ctx.poolLights[i].position.copy(src.p);
        }
      }
    },
    dispose() {
      scene.remove(group);
      group.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(mt => { if (mt.map) mt.map.dispose(); mt.dispose(); });
        }
      });
    },
  };
}
