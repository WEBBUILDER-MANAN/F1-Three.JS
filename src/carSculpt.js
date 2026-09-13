// SDF-sculpted voxel F1 cars — modeling standard ported from the RB18
// reference build (voxelcar/rb18-voxel): implicit-surface part functions on a
// fine material grid, mirror-symmetric sampling, pixel-font decal spraying,
// two-pass meshing with per-vertex ambient occlusion, paint flake sparkle and
// per-material gloss buckets. Parameterized per team (sidepod philosophy,
// engine cover, paint bands, decals) to recreate famous 2022-era cars.
//
// Reference frame while sculpting: x = forward (nose +x), y = up, z = lateral.
// The finished geometry is rotated so the game's +Z is forward.
import * as THREE from 'three';

/* ------------------------------------------------ math helpers ---------- */
const sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
function S(v, a, b) { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); }
function segd(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  let t = ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / (abx * abx + aby * aby + abz * abz);
  t = sat(t);
  const dx = px - (ax + abx * t), dy = py - (ay + aby * t), dz = pz - (az + abz * t);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function rr2(dy, dz, hy, hz, r) {
  const qy = Math.abs(dy) - hy + r, qz = Math.abs(dz) - hz + r;
  const oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
  return Math.min(Math.max(qy, qz), 0) + Math.sqrt(oy * oy + oz * oz) - r;
}
const sp = (a, n) => Math.pow(Math.abs(a), n);
function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >> 13)) | 0; h = (h * 1274126177) | 0;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

/* ------------------------------------------------ materials ------------- */
export const M = {
  BODY: 1, ACC1: 2, ACC2: 3, WHT: 4, CARB: 5, TIRE: 6, TRED: 7, RIMS: 8, RIMD: 9,
  INT: 10, SIL: 11, RAIN: 12, FLR: 13, PLK: 14, HALO: 15, HDR: 16, DUCT: 17,
  GRY: 18, HELM: 19, VISOR: 20, ACC3: 21,
};
const BASE_GLOSS = {
  1: .85, 2: .8, 3: .8, 4: .75, 5: .5, 6: .14, 7: .5, 8: .72, 9: .45,
  10: .1, 11: .7, 12: 1.0, 13: .45, 14: .2, 15: .8, 16: .6, 17: .4, 18: .6,
  19: .85, 20: .9, 21: .8,
};

/* ------------------------------------------------ 5x7 pixel font -------- */
const FONT = {
  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['#...#', '#...#', '#...#', '#####', '....#', '....#', '....#'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
};
function textPx(txt, col, row) {
  if (row < 0 || row > 6 || col < 0) return false;
  const ci = (col / 6) | 0, cc = col % 6;
  if (cc === 5 || ci >= txt.length) return false;
  const g = FONT[txt[ci]];
  return g ? g[row][cc] === '#' : false;
}
const textW = txt => txt.length * 6 - 1;

/* charging bull silhouette (Red Bull engine-cover logo) */
const BULL = [
  '..........................',
  '.....................##.#.',
  '.#..................##.##.',
  '.##......#######...#####..',
  '..##...#############.##...',
  '...#################......',
  '...##################.....',
  '..####################....',
  '..###..######..######.....',
  '.###...#####...#####......',
  '.##...####....####........',
  '.#...###.....###..........',
  '....##......##............',
];
const bullPx = (c, r) => (r >= 0 && r < 13 && c >= 0 && c < 26) && BULL[r][c] === '#';
/* prancing-horse-ish rearing silhouette (17x16, faces +x) */
const HORSE = [
  '.......##........',
  '......####.......',
  '.....#####.......',
  '....######.......',
  '...########......',
  '..#########......',
  '..##########.....',
  '.############....',
  '.####..######....',
  '.###....#####....',
  '.##.....####.....',
  '.#.....####......',
  '.......###.......',
  '......###........',
  '.....##..........',
  '....##...........',
];
const horsePx = (c, r) => (r >= 0 && r < 16 && c >= 0 && c < 17) && HORSE[r][c] === '#';
/* three-pointed star (13x12, viewed from the side) */
const STAR = [
  '......#......',
  '......#......',
  '.....###.....',
  '.....###.....',
  '....#####....',
  '..#########..',
  '#####...#####',
  '...##...##...',
  '..##.....##..',
  '..#.......#..',
  '.#.........#.',
  '#...........#',
];
const starPx = (c, r) => (r >= 0 && r < 12 && c >= 0 && c < 13) && STAR[r][c] === '#';
/* mclaren speedmark swoosh (18x8) */
const SWOOSH = [
  '..............##..',
  '...........#####..',
  '........########..',
  '.....##########...',
  '..############....',
  '.###########......',
  '.########.........',
  '..###.............',
];
const swooshPx = (c, r) => (r >= 0 && r < 8 && c >= 0 && c < 18) && SWOOSH[r][c] === '#';
const LOGOS = { bull: bullPx, horse: horsePx, star: starPx, swoosh: swooshPx };

/* ------------------------------------------------ sculpt state ---------- */
let H = 0.02;   // voxel edge (set per build)
let P = null;   // active team shape params
const X0W = -2.80, X1W = 3.02, Y1W = 1.06, Z1W = 1.04;

/* ---------- wheels ---------- */
export const FA = 1.72, RA = -1.88, TR = 0.358;
const FWZ = 0.82, RWZ = 0.79, FWW = 0.30, RWW = 0.40;

function wheelLocal(dx, dy, dz, w) {
  const adz = Math.abs(dz), hw = w / 2;
  if (adz > hw) return 0;
  const rho = Math.sqrt(dx * dx + dy * dy);
  const Rmax = TR - 0.038 * Math.pow(adz / hw, 6);
  if (rho > Rmax) return 0;
  if (rho > 0.20) {
    if (adz > hw - 0.045 && rho > 0.252 && rho < 0.312) return M.TRED;
    return M.TIRE;
  }
  if (dz > hw - 0.042) {
    if (rho < 0.042) return M.ACC1;
    if (rho < 0.062) return M.CARB;
    if (rho > 0.163) return M.RIMD;
    if (rho > 0.098 && rho < 0.116) return M.RIMD;
    return M.RIMS;
  }
  if (dz < -(hw - 0.040)) return rho > 0.075 ? M.RIMD : M.CARB;
  if (rho > 0.152) return M.RIMD;
  return 0;
}

/* ---------- suspension ---------- */
const FSUS = [
  [1.92, 0.480, 0.21, 1.78, 0.465, 0.68],
  [1.56, 0.470, 0.21, 1.75, 0.462, 0.68],
  [1.94, 0.205, 0.21, 1.80, 0.180, 0.70],
  [1.52, 0.200, 0.21, 1.77, 0.178, 0.70],
  [1.79, 0.215, 0.65, 1.60, 0.500, 0.23],
  [1.47, 0.300, 0.21, 1.68, 0.285, 0.68],
];
const RSUS = [
  [-1.70, 0.465, 0.135, -1.86, 0.452, 0.63],
  [-2.07, 0.455, 0.135, -1.90, 0.452, 0.63],
  [-1.66, 0.190, 0.135, -1.86, 0.168, 0.66],
  [-2.09, 0.185, 0.135, -1.90, 0.168, 0.66],
  [-1.87, 0.440, 0.61, -1.99, 0.165, 0.13],
  [-1.88, 0.358, 0.14, -1.88, 0.358, 0.60, 0.028],
];
function susHit(x, y, z, list) {
  const r = Math.max(0.024, 1.05 * H);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (segd(x, y, z, a[0], a[1], a[2], a[3], a[4], a[5]) < (a[6] || r)) return M.CARB;
  }
  return 0;
}

/* ---------- halo ---------- */
const HALO_PTS = (() => {
  const p = [[0.685, 0.555, 0], [0.635, 0.795, 0]];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const a = Math.PI * i / N;
    p.push([0.115 + 0.505 * Math.cos(a), 0.818 + 0.024 * (1 - Math.cos(a)), 0.237 * Math.sin(a)]);
  }
  p.push([-0.305, 0.665, 0.185]);
  return p;
})();
function haloHit(x, y, z) {
  if (x < -0.48 || x > 0.76 || y < 0.50 || y > 0.94 || z > 0.32) return 0;
  const r = Math.max(0.042, 0.9 * H);
  for (let i = 0; i < HALO_PTS.length - 1; i++) {
    const a = HALO_PTS[i], b = HALO_PTS[i + 1];
    if (segd(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2]) < r) return M.HALO;
  }
  return 0;
}

/* ---------- driver helmet (peeks above the cockpit) ---------- */
function helmet(x, y, z) {
  if (x < 0.05 || x > 0.40 || y < 0.44 || y > 0.72 || z > 0.15) return 0;
  const d = sp((x - 0.215) / 0.125, 2.3) + sp((y - 0.545) / 0.135, 2.3) + sp(z / 0.115, 2.3);
  if (d > 1) return 0;
  if (x > 0.285 && y > 0.505 && y < 0.585) return M.VISOR;   // visor slit
  if (y > 0.60 && Math.abs(z) < 0.035) return M.ACC1;        // crest stripe
  return M.HELM;
}

/* ---------- front wing ---------- */
function frontWing(x, y, z) {
  if (x < 2.30 || x > 2.99 || y > 0.46) return 0;
  if (z > 0.99) return 0;
  if (z > 0.945) {
    const fx = S(y, 0.06, 0.34);
    const xf = 2.96 - 0.10 * fx, xr = 2.38 + 0.06 * (1 - fx);
    if (x < xf && x > xr && y > 0.055 && y < 0.335)
      return y > 0.285 ? P.epTop : P.epMain;
    return 0;
  }
  const arch = 0.085 * S(z, 0.42, 0.93) - 0.022 * (1 - S(z, 0.04, 0.30));
  const th = Math.max(0.027, 1.7 * H);
  const riseMul = 0.30 + 0.70 * S(z, 0.12, 0.50);
  for (let e = 0; e < 4; e++) {
    const el = P.fwEl[e];
    if (x < el[0] || x > el[1]) continue;
    const t = (el[1] - x) / (el[1] - el[0]);
    const ys = el[2] + arch + el[3] * riseMul * t;
    if (Math.abs(y - ys) < th / 2 * (e === 0 ? 1.5 : 1)) return z > 0.86 ? P.fwTipMat : el[4];
  }
  if (Math.abs(z - 0.055) < 0.014 && x > 2.42 && x < 2.54 && y > 0.19 && y < 0.29) return M.CARB;
  return 0;
}

/* ---------- nose ---------- */
function nose(x, y, z) {
  if (x < 0.85 || x > 2.712 || y < 0.14 || y > 0.62) return 0;
  let w, hh, cy;
  if (x > 2.66) {
    const tt = (x - 2.66) / 0.052;
    if (tt > 1) return 0;
    const s = Math.sqrt(Math.max(0, 1 - tt * tt));
    w = 0.105 * s; hh = 0.10 * s; cy = 0.255;
    if (w < 0.01) return 0;
  } else {
    const t = sat((x - 0.85) / (2.66 - 0.85));
    w = lerp(0.44, 0.105, Math.pow(t, 0.9));
    hh = lerp(0.30, 0.10, Math.pow(t, 0.95));
    cy = lerp(0.455, 0.255, Math.pow(t, 1.12));
  }
  if (sp(z / (w / 2), 2.5) + sp((y - cy) / (hh / 2), 2.5) > 1) return 0;
  return P.nosePaint(x);
}

/* ---------- monocoque / cockpit ---------- */
function chassis(x, y, z) {
  if (x < -0.52 || x > 0.92 || y < 0.09 || z > 0.30) return 0;
  const topY = 0.625 - 0.075 * S(x, 0.40, 0.92) - 0.02 * S(-x, 0.10, 0.52);
  if (y > topY) return 0;
  const wh = lerp(0.28, 0.235, S(x, -0.50, 0.90));
  const cy = (topY + 0.095) / 2, hy = (topY - 0.095) / 2;
  if (rr2(y - cy, z, hy, wh, Math.min(0.09, hy * 0.8)) > 0) return 0;
  const ex = (x - 0.30) / 0.42, ez = z / 0.215;
  if (ex * ex + ez * ez < 1 && x < 0.585 && y > 0.345) {
    if (x > -0.115 && x < 0.055 && y > 0.465 && (z > 0.115 || x < 0.015)) return M.HDR;
    if (x > 0.435 && x < 0.505 && y > 0.435 && y < 0.565 && z < 0.145) {
      const hv = hash3(0, Math.round(y / 0.02), Math.round(z / 0.02));
      return hv < 0.10 ? M.ACC1 : hv < 0.18 ? M.ACC2 : hv < 0.26 ? M.WHT : M.INT;
    }
    if (y < 0.385) return M.INT;
    return 0;
  }
  return P.cockpitMat || M.BODY;
}

/* ---------- sidepods: four team philosophies ---------- */
function sidepod(x, y, z) {
  const style = P.sidepod;
  if (style === 'zeropod') {
    // W13: razor-thin upper pod hugging the chassis + wide low sill fairing
    if (x < -1.60 || x > 0.075 || z < 0.16 || y < 0.09) return 0;
    const u = -x;
    // slim pod
    if (y > 0.145 && y < 0.55) {
      const zo = 0.42 - 0.15 * S(u, 0.30, 1.45) - 0.06 * S(x, -0.05, 0.075);
      const topC = 0.545 - 0.34 * Math.pow(S(u, 0.12, 1.45), 1.15);
      if (z < zo && y < topC && rr2(y - (topC + 0.15) / 2, z - (zo + 0.20) / 2, (topC - 0.15) / 2, (zo - 0.20) / 2, 0.05) < 0) {
        if (x > -0.16 && x < 0.08 && rr2(y - 0.40, z - 0.30, 0.10, 0.09, 0.04) < 0)
          return x < -0.125 ? M.INT : 0;
        if (y > topC - 0.028 && x > -1.1 && x < -0.02) return M.ACC1;
        return M.BODY;
      }
    }
    // low sill
    if (y < 0.24) {
      const zs = 0.62 - 0.28 * S(u, 0.35, 1.55);
      if (z < zs && y > 0.10 && z > 0.18) {
        const yt = 0.235 - 0.06 * S(z, 0.30, zs);
        if (y < yt) return M.BODY;
      }
    }
    return 0;
  }

  if (x < P.podX0 || x > 0.075 || z < 0.16 || y > 0.62 || y < 0.09) return 0;
  const u = -x;
  const L = -P.podX0;
  let zo = P.podW - 0.395 * S(u, 0.50, L - 0.04);
  zo -= 0.32 * S(x, -0.02, 0.075);
  const zi = 0.225;
  if (zo <= zi + 0.03) return 0;
  let topC = P.podTop - 0.385 * Math.pow(S(u, 0.16, L - 0.16), P.podTopPow);
  topC -= 0.09 * S(x, -0.01, 0.075);
  const f = sat((z - zi) / (zo - zi));

  let ytop;
  if (style === 'bathtub') {
    // F1-75: high outer lip with a scooped channel inboard
    const lip = 0.045 * S(f, 0.55, 0.95) * (1 - S(u, 1.05, L));
    const scoop = 0.075 * S(f, 0.10, 0.45) * (1 - S(f, 0.55, 0.9)) * (1 - S(u, 0.85, L - 0.2));
    ytop = Math.max(0.145, topC - scoop + lip - 0.05 * Math.pow(f, 3));
  } else if (style === 'slab') {
    // FW44: boxy slab sides, nearly flat top, minimal wash-down
    ytop = Math.max(0.15, topC - 0.025 * Math.pow(f, 3));
  } else {
    // downwash (RB18) / undercut (MCL36)
    const fall = (style === 'undercut' ? 0.045 : 0.055) + (style === 'undercut' ? 0.085 : 0.11) * S(u, 0.30, 1.25);
    ytop = Math.max(0.145, topC - fall * Math.pow(f, style === 'undercut' ? 2.4 : 1.8));
  }
  const ucAmp = style === 'undercut' ? 0.21 : style === 'slab' ? 0.07 : 0.165;
  const uc = ucAmp * S(z, 0.33, 0.62) * (1 - S(u, 0.55, 1.35)) + 0.05 * S(x, -0.40, -0.02) * S(z, 0.30, 0.55);
  const ybot = 0.103 + uc;
  if (ytop - ybot < 0.03) return 0;
  if (rr2(y - (ytop + ybot) / 2, z - (zo + zi) / 2, (ytop - ybot) / 2, (zo - zi) / 2,
          Math.min(0.055, (ytop - ybot) / 2, (zo - zi) / 2)) > 0) return 0;
  if (x > -0.17 && x < 0.08 && rr2(y - 0.42, z - 0.465, P.inletH, 0.17, 0.05) < 0)
    return x < -0.135 ? M.INT : 0;
  if (y > ytop - 0.032 && z < zi + 0.15 && x > -1.30 && x < -0.02) return P.podStripe;
  return M.BODY;
}

/* ---------- engine cover spine ---------- */
function spine(x, y, z) {
  if (x < -2.36 || x > -0.18 || z > P.spineW + 0.03 || y < 0.13) return 0;
  const u = -x;
  const hwv = P.spineW - 0.175 * S(u, 0.45, 2.28);
  const top = P.spineTop - 0.475 * Math.pow(S(u, 0.40, 2.32), 0.92);
  if (y > top) return 0;
  const f = (y - 0.135) / (top - 0.135);
  if (f < 0) return 0;
  if (z > hwv * Math.sqrt(Math.max(0, 1 - Math.pow(f, P.spinePow)))) return 0;
  return M.BODY;
}

/* ---------- shark fin ---------- */
function fin(x, y, z) {
  if (x < P.finX0 || x > P.finX1 || y < 0.40) return 0;
  if (z > Math.max(0.015, 0.62 * H)) return 0;
  if (y > P.finTop - 0.055 * S(-x, -P.finX1 + 0.03, -P.finX0 - 0.02)) return 0;
  return P.finMat;
}

/* ---------- airbox ---------- */
function airbox(x, y, z) {
  if (x < -0.52 || x > -0.24 || y < 0.70 || z > 0.16) return 0;
  const d = sp(z / 0.135, 2.4) + sp((y - 0.845) / 0.115, 2.4);
  if (d > 1) return 0;
  if (d < 0.52) {
    if (x > -0.34) return (z < Math.max(0.011, 0.55 * H) && y > 0.80) ? M.BODY : 0;
    return M.INT;
  }
  return M.BODY;
}

/* ---------- small details ---------- */
function tcam(x, y, z) {
  if (x < -0.40 || x > -0.26 || y < 0.955 || y > 1.012 || z > 0.058) return 0;
  return rr2(y - 0.983, z, 0.028, 0.052, 0.018) < 0 ? M.CARB : 0;
}
function mirror(x, y, z) {
  if (x < 0.42 || x > 0.60 || y < 0.56 || y > 0.68 || z < 0.24 || z > 0.43) return 0;
  if (segd(x, y, z, 0.545, 0.585, 0.27, 0.505, 0.632, 0.365) < 0.016) return M.CARB;
  if (x > 0.45 && x < 0.565 && y > 0.605 && y < 0.665 && z > 0.362 && z < 0.412)
    return x < 0.466 ? M.INT : M.BODY;
  return 0;
}
function pitot(x, y, z) {
  if (x < 0.84 || x > 1.00 || y < 0.58 || y > 0.76 || z > 0.03) return 0;
  if (segd(x, y, z, 0.92, 0.60, 0, 0.92, 0.735, 0) < 0.011) return M.CARB;
  if (segd(x, y, z, 0.865, 0.735, 0, 0.975, 0.735, 0) < 0.010) return M.CARB;
  return 0;
}

/* ---------- floor / diffuser ---------- */
function floor_(x, y, z) {
  if (x < -1.80 || x > 1.38 || y > 0.16) return 0;
  let zmax;
  if (x > 0.62) zmax = lerp(0.42, 0.155, S(x, 0.62, 1.36));
  else zmax = 0.76 - 0.24 * S(-x, 1.30, 1.80);
  if (z > zmax) return 0;
  if (y >= 0.052 && y <= 0.108) {
    if (z < 0.155 && y < 0.070) return M.PLK;
    return M.FLR;
  }
  if (z > zmax - 0.045 && x < -0.28 && x > -1.22 && y > 0.05 && y < 0.150) return P.floorEdge;
  return 0;
}
function diffuser(x, y, z) {
  if (x < -2.38 || x > -1.80 || y > 0.48) return 0;
  const t = S(-x, 1.80, 2.38);
  const yb = 0.055 + 0.31 * Math.pow(t, 1.6);
  const zmax = 0.52 - 0.07 * t;
  if (z > zmax || y < 0.045) return 0;
  if (y > yb - 0.048 && y < yb + 0.006) return M.CARB;
  if (y < yb + 0.006) {
    if (z > zmax - 0.028) return M.CARB;
    const st = Math.max(0.012, 0.6 * H);
    if (Math.abs(z - 0.17) < st || Math.abs(z - 0.33) < st || z < st) return M.CARB;
  }
  return 0;
}

/* ---------- tail / rain light / exhaust ---------- */
function tail(x, y, z) {
  if (x < -2.68 || x > -2.00 || z > 0.12 || y < 0.24 || y > 0.55) return 0;
  if (segd(x, y, z, -2.02, 0.335, 0, -2.40, 0.355, 0) < 0.078) return M.BODY;
  if (segd(x, y, z, -2.40, 0.355, 0, -2.615, 0.368, 0) < 0.052)
    return x < -2.555 ? M.RAIN : M.BODY;
  const rho = Math.sqrt((y - 0.462) * (y - 0.462) + z * z);
  if (x > -2.44 && x < -2.33 && rho < 0.036)
    return (x > -2.36 && rho < 0.026) ? M.INT : M.GRY;
  return 0;
}

/* ---------- rear wing (flap sculpted separately for DRS) ---------- */
function rearWingMain(x, y, z) {
  if (x < -2.665 || x > -2.015 || z > 0.478 || y < 0.38) return 0;
  const th = Math.max(0.030, 1.9 * H);
  const tip = S(z, 0.325, 0.462);
  const droop = 0.075 * tip * tip;
  if (z < 0.448) {
    if (x >= -2.485 && x <= -2.115) {
      const t = (-2.115 - x) / 0.37;
      const ys = 0.700 + 0.118 * Math.pow(t, 1.15) - droop;
      if (Math.abs(y - ys) < th / 2 * (1 + 0.9 * (1 - t))) return P.rwMat;
    }
    if (z < 0.44) {
      if (x >= -2.42 && x <= -2.32) {
        const ys = 0.535 + 0.62 * (-x - 2.32);
        if (Math.abs(y - ys) < th * 0.85) return M.CARB;
      }
      if (x >= -2.36 && x <= -2.27) {
        const ys = 0.600 + 0.55 * (-x - 2.27);
        if (Math.abs(y - ys) < th * 0.75) return M.CARB;
      }
    }
  }
  if (z > 0.438) {
    const yhi = 0.90 - 0.42 * S(x, -2.36, -2.04) - 0.85 * droop;
    const ylo = 0.545 + 0.16 * S(x, -2.26, -2.06);
    if (x > -2.615 && x < -2.055 && y > ylo && y < yhi) return P.epRear;
  }
  return 0;
}
function rwMount(x, y, z) {
  if (x < -2.48 || x > -2.15 || z > 0.06 || y < 0.38 || y > 0.96) return 0;
  if (z < Math.max(0.016, 0.65 * H)) {
    if (x > -2.31 && x < -2.17 && y > 0.40 && y < 0.76) return M.BODY;
    if (x > -2.46 && x < -2.20 && y > 0.855 && y < 0.945) return M.CARB;
  }
  if (segd(x, y, z, -2.355, 0.905, 0, -2.205, 0.915, 0) < 0.037) return M.BODY;
  return 0;
}
/* the DRS flap alone, in car coordinates (meshed into its own geometry) */
function drsFlap(x, y, z) {
  if (x < -2.63 || x > -2.435 || z > 0.452 || y < 0.75 || y > 0.97) return 0;
  const th = Math.max(0.030, 1.9 * H);
  const tip = S(z, 0.325, 0.462);
  const droop = 0.075 * tip * tip;
  const t = (-2.445 - x) / 0.165;
  if (t < 0 || t > 1) return 0;
  const ys = 0.812 + 0.116 * t - droop;
  if (Math.abs(y - ys) < th / 2) return P.rwMat;
  return 0;
}

/* ---------- brake ducts ---------- */
function ducts(x, y, z) {
  if (y < 0.20 || y > 0.55) return 0;
  if (z > 0.582 && z < 0.648 && rr2(y - 0.365, x - 1.70, 0.135, 0.105, 0.04) < 0) return M.DUCT;
  if (z > 0.565 && z < 0.635 && rr2(y - 0.365, x + 1.88, 0.130, 0.100, 0.04) < 0) return M.DUCT;
  return 0;
}

/* ---------- assembled body (wheels + flap excluded: separate meshes) ----- */
function material(x, y, z) {
  let m;
  if (x > 1.40 && x < 2.02 && y < 0.56 && z < 0.76) { m = susHit(x, y, z, FSUS); if (m) return m; }
  if (x > -2.16 && x < -1.58 && y < 0.55 && z < 0.72) { m = susHit(x, y, z, RSUS); if (m) return m; }
  m = ducts(x, y, z); if (m) return m;
  m = haloHit(x, y, z); if (m) return m;
  m = helmet(x, y, z); if (m) return m;
  m = mirror(x, y, z); if (m) return m;
  m = pitot(x, y, z); if (m) return m;
  m = tcam(x, y, z); if (m) return m;
  if (x > 2.29) { m = frontWing(x, y, z); if (m) return m; }
  m = nose(x, y, z); if (m) return m;
  m = chassis(x, y, z); if (m) return m;
  m = sidepod(x, y, z); if (m) return m;
  m = spine(x, y, z); if (m) return m;
  m = fin(x, y, z); if (m) return m;
  m = airbox(x, y, z); if (m) return m;
  m = floor_(x, y, z); if (m) return m;
  m = diffuser(x, y, z); if (m) return m;
  m = rearWingMain(x, y, z); if (m) return m;
  m = rwMount(x, y, z); if (m) return m;
  m = tail(x, y, z); if (m) return m;
  return 0;
}

export { material as _materialFn, textPx as _textPx, textW, LOGOS };

/* ========================================================================
 *  Sampling grid + decal spraying + AO mesher (two-pass, gloss buckets)
 * ======================================================================== */
const AO_L = [0.40, 0.60, 0.78, 1.0];

function bucketFor(mat, gloss) {
  if (mat === M.RAIN) return 3;
  const g = gloss[mat] ?? 0.5;
  return g >= 0.68 ? 0 : g >= 0.40 ? 1 : 2;
}

function sampleGrid(bounds, h, fn, { mirrorZ = false, onProgress, budgetMs = 14 } = {}) {
  const [x0, x1, y0, y1, z0, z1] = bounds;
  const nx = Math.ceil((x1 - x0) / h);
  const ny = Math.ceil((y1 - y0) / h);
  let nz = Math.ceil((z1 - z0) / h);
  if (mirrorZ && (nz & 1)) nz++;
  const grid = new Uint8Array(nx * ny * nz);
  const halfz = mirrorZ ? nz >> 1 : 0;
  let vox = 0;

  return new Promise(resolve => {
    let ix = 0;
    function step() {
      const budget = document.hidden ? Infinity : budgetMs; // no yielding when tab is hidden
      const t0 = performance.now();
      while (ix < nx && performance.now() - t0 < budget) {
        const x = x0 + (ix + 0.5) * h;
        for (let iy = 0; iy < ny; iy++) {
          const y = y0 + (iy + 0.5) * h;
          const base = (ix * ny + iy) * nz;
          for (let iz = halfz; iz < nz; iz++) {
            const z = z0 + (iz + 0.5) * h;
            const m = fn(x, y, z);
            if (m) {
              grid[base + iz] = m; vox++;
              if (mirrorZ) { grid[base + (nz - 1 - iz)] = m; vox++; }
            }
          }
        }
        ix++;
      }
      if (onProgress) onProgress(ix / nx);
      if (ix < nx) setTimeout(step, 0);
      else resolve({ grid, nx, ny, nz, x0, y0, z0, h, vox });
    }
    step();
  });
}

function decalBox(g, x0, x1, y0, y1, z0, z1, fn) {
  const { grid, nx, ny, nz, h } = g;
  const i0 = Math.max(0, ((x0 - g.x0) / h) | 0), i1 = Math.min(nx - 1, Math.ceil((x1 - g.x0) / h));
  const j0 = Math.max(0, ((y0 - g.y0) / h) | 0), j1 = Math.min(ny - 1, Math.ceil((y1 - g.y0) / h));
  const k0 = Math.max(0, ((z0 - g.z0) / h) | 0), k1 = Math.min(nz - 1, Math.ceil((z1 - g.z0) / h));
  for (let ix = i0; ix <= i1; ix++) {
    const x = g.x0 + (ix + 0.5) * h;
    for (let iy = j0; iy <= j1; iy++) {
      const y = g.y0 + (iy + 0.5) * h;
      const base = (ix * ny + iy) * nz;
      for (let iz = k0; iz <= k1; iz++) {
        const cur = grid[base + iz];
        if (!cur) continue;
        const z = g.z0 + (iz + 0.5) * h;
        const m = fn(x, y, z, cur);
        if (m) grid[base + iz] = m;
      }
    }
  }
}

/* generic decal placers (text reads correctly from each side) */
function applyDecal(g, d) {
  const p = d.px;
  const only = d.only ?? M.BODY;
  const ok = cur => (Array.isArray(only) ? only.includes(cur) : cur === only);
  if (d.kind === 'sideText') {
    const W = textW(d.text) * p;
    decalBox(g, d.x0, d.x0 + W + p, d.yTop - 7 * p - p, d.yTop + p, -1.04, 1.04, (x, y, z, cur) => {
      if (!ok(cur) || Math.abs(z) < d.zMin) return 0;
      const col = z > 0 ? Math.floor((x - d.x0) / p) : Math.floor((d.x0 + W - x) / p);
      return textPx(d.text, col, Math.floor((d.yTop - y) / p)) ? d.color : 0;
    });
  } else if (d.kind === 'sideLogo') {
    const px = LOGOS[d.logo];
    const W = d.cols * p;
    decalBox(g, d.x0, d.x0 + W, d.yTop - d.rows * p, d.yTop + p, -1.04, 1.04, (x, y, z, cur) => {
      if (!ok(cur) || Math.abs(z) < d.zMin) return 0;
      const col = z > 0 ? ((x - d.x0) / p) | 0 : ((d.x0 + W - x) / p) | 0;
      return px(col, Math.floor((d.yTop - y) / p)) ? d.color : 0;
    });
  } else if (d.kind === 'circle') {
    decalBox(g, d.cx - d.r, d.cx + d.r, d.cy - d.r, d.cy + d.r, -1.04, 1.04, (x, y, z, cur) => {
      if (!ok(cur) || Math.abs(z) < d.zMin) return 0;
      const dx = x - d.cx, dy = y - d.cy;
      return dx * dx + dy * dy < d.r * d.r ? d.color : 0;
    });
  } else if (d.kind === 'noseNumber') {
    const rowsLen = 7 * p, colsW = textW(d.text) * p;
    decalBox(g, d.xRear, d.xRear + rowsLen, 0.14, 0.62, -colsW / 2 - p, colsW / 2 + p, (x, y, z, cur) => {
      if (!ok(cur)) return 0;
      return textPx(d.text, Math.floor((colsW / 2 - z) / p), Math.floor((x - d.xRear) / p)) ? d.color : 0;
    });
  } else if (d.kind === 'rearText') {
    const W = textW(d.text) * p;
    decalBox(g, -2.70, -2.30, d.yTop - 7 * p - p, d.yTop + p, -W / 2 - p, W / 2 + p, (x, y, z, cur) => {
      if (!ok(cur)) return 0;
      return textPx(d.text, Math.floor((z + W / 2) / p), Math.floor((d.yTop - y) / p)) ? d.color : 0;
    });
  } else if (d.kind === 'epNumber') {
    const W = textW(d.text) * p;
    decalBox(g, d.x0, d.x0 + W + p, d.yTop - 7 * p - p, d.yTop + p, -1.04, 1.04, (x, y, z, cur) => {
      if (!ok(cur) || Math.abs(z) < 0.43) return 0;
      const col = z > 0 ? Math.floor((x - d.x0) / p) : Math.floor((d.x0 + W - x) / p);
      return textPx(d.text, col, Math.floor((d.yTop - y) / p)) ? d.color : 0;
    });
  }
}

/* two-pass mesher with per-vertex AO, per-voxel jitter + paint sparkle */
const DIRS = [
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0] },
];

async function meshGrid(g, palette, gloss, { budgetMs = 14 } = {}) {
  const { grid, nx, ny, nz, h } = g;
  // palette is authored in sRGB; vertex colors must be linear working-space
  const lin = {};
  const _c = new THREE.Color();
  for (const k in palette) {
    _c.setRGB(palette[k][0] / 255, palette[k][1] / 255, palette[k][2] / 255, THREE.SRGBColorSpace);
    lin[k] = [_c.r, _c.g, _c.b];
  }
  const solid = (ix, iy, iz) =>
    (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) ? 0 : (grid[(ix * ny + iy) * nz + iz] ? 1 : 0);

  const counts = [0, 0, 0, 0];
  for (let ix = 0; ix < nx; ix++) {
    for (let iy = 0; iy < ny; iy++) {
      const base = (ix * ny + iy) * nz;
      for (let iz = 0; iz < nz; iz++) {
        const m = grid[base + iz];
        if (!m) continue;
        const b = bucketFor(m, gloss);
        if (!solid(ix + 1, iy, iz)) counts[b]++;
        if (!solid(ix - 1, iy, iz)) counts[b]++;
        if (!solid(ix, iy + 1, iz)) counts[b]++;
        if (!solid(ix, iy - 1, iz)) counts[b]++;
        if (!solid(ix, iy, iz + 1)) counts[b]++;
        if (!solid(ix, iy, iz - 1)) counts[b]++;
      }
    }
  }
  const out = counts.map(c => c ? {
    pos: new Float32Array(c * 12), nrm: new Float32Array(c * 12),
    col: new Float32Array(c * 12), idx: new Uint32Array(c * 6), f: 0,
  } : null);

  let ix = 0;
  await new Promise(resolve => {
    function step() {
      const budget = document.hidden ? Infinity : budgetMs;
      const t0 = performance.now();
      while (ix < nx && performance.now() - t0 < budget) {
        for (let iy = 0; iy < ny; iy++) {
          const base = (ix * ny + iy) * nz;
          for (let iz = 0; iz < nz; iz++) {
            const m = grid[base + iz];
            if (!m) continue;
            const pal = lin[m];
            let nv = 0.90 + 0.20 * hash3(ix, iy, iz);
            const b = bucketFor(m, gloss);
            if (b === 0 && hash3(iy + 7, iz + 13, ix + 3) > 0.987) nv *= 1.5;
            const cr = Math.min(1, pal[0] * nv), cg = Math.min(1, pal[1] * nv), cb = Math.min(1, pal[2] * nv);
            const B = out[b];
            for (let d = 0; d < 6; d++) {
              const D = DIRS[d], n = D.n;
              if (solid(ix + n[0], iy + n[1], iz + n[2])) continue;
              const u = D.u, v = D.v;
              const bx = ix + n[0], by = iy + n[1], bz = iz + n[2];
              const px = ix + (n[0] > 0 ? 1 : 0), py = iy + (n[1] > 0 ? 1 : 0), pz = iz + (n[2] > 0 ? 1 : 0);
              const f = B.f, vo = f * 4, po = f * 12, io = f * 6;
              const aos = [0, 0, 0, 0];
              for (let ci = 0; ci < 4; ci++) {
                const s = (ci === 1 || ci === 2) ? 1 : 0;
                const t = (ci === 2 || ci === 3) ? 1 : 0;
                B.pos[po + ci * 3] = g.x0 + (px + s * u[0] + t * v[0]) * h;
                B.pos[po + ci * 3 + 1] = g.y0 + (py + s * u[1] + t * v[1]) * h;
                B.pos[po + ci * 3 + 2] = g.z0 + (pz + s * u[2] + t * v[2]) * h;
                B.nrm[po + ci * 3] = n[0]; B.nrm[po + ci * 3 + 1] = n[1]; B.nrm[po + ci * 3 + 2] = n[2];
                const dux = s ? u[0] : -u[0], duy = s ? u[1] : -u[1], duz = s ? u[2] : -u[2];
                const dvx = t ? v[0] : -v[0], dvy = t ? v[1] : -v[1], dvz = t ? v[2] : -v[2];
                const s1 = solid(bx + dux, by + duy, bz + duz);
                const s2 = solid(bx + dvx, by + dvy, bz + dvz);
                const cn = solid(bx + dux + dvx, by + duy + dvy, bz + duz + dvz);
                const ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + cn);
                aos[ci] = ao;
                const L = AO_L[ao];
                B.col[po + ci * 3] = cr * L; B.col[po + ci * 3 + 1] = cg * L; B.col[po + ci * 3 + 2] = cb * L;
              }
              if (aos[0] + aos[2] >= aos[1] + aos[3]) {
                B.idx[io] = vo; B.idx[io + 1] = vo + 1; B.idx[io + 2] = vo + 2;
                B.idx[io + 3] = vo; B.idx[io + 4] = vo + 2; B.idx[io + 5] = vo + 3;
              } else {
                B.idx[io] = vo + 1; B.idx[io + 1] = vo + 2; B.idx[io + 2] = vo + 3;
                B.idx[io + 3] = vo + 1; B.idx[io + 4] = vo + 3; B.idx[io + 5] = vo;
              }
              B.f++;
            }
          }
        }
        ix++;
      }
      if (ix < nx) setTimeout(step, 0); else resolve();
    }
    step();
  });

  const geos = out.map(B => {
    if (!B) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(B.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(B.nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(B.col, 3));
    geo.setIndex(new THREE.BufferAttribute(B.idx, 1));
    return geo;
  });
  return { geos, faces: counts.reduce((a, b) => a + b, 0) };
}

/* bucket materials — 'studio' for the garage, 'race' tuned for bright
 * sun + scene envmap so paint stays saturated on track */
export function bucketMaterials(profile = 'studio') {
  if (profile === 'race') {
    return [
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.10, envMapIntensity: 0.35 }),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.60, metalness: 0.05, envMapIntensity: 0.22 }),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0.0, envMapIntensity: 0.10 }),
      new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    ];
  }
  return [
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.30, metalness: 0.28, envMapIntensity: 1.0 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.12, envMapIntensity: 0.5 }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.18 }),
    new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  ];
}

/* ------------------------------------------------ public build ---------- */
export async function buildSculptedCar(team, h, onProgress = () => {}, profile = 'studio') {
  const t0 = performance.now();
  H = h;
  P = team.shape;
  const palette = team.palette;
  const gloss = { ...BASE_GLOSS, ...(team.gloss || {}) };
  const mats = bucketMaterials(profile);

  // ---- body ----
  onProgress(0.02, '雕刻车身…');
  const bodyGrid = await sampleGrid([X0W, X1W, 0, Y1W, -Z1W, Z1W], h, material, {
    mirrorZ: true,
    onProgress: f => onProgress(0.02 + f * 0.5, `雕刻车身 ${Math.round(f * 100)}%`),
  });
  onProgress(0.54, '喷涂涂装与徽标…');
  for (const d of (team.decals || [])) applyDecal(bodyGrid, d);
  onProgress(0.56, '组装车身网格…');
  const bodyMesh = await meshGrid(bodyGrid, palette, gloss);

  const group = new THREE.Group();
  const tilt = new THREE.Group();
  group.add(tilt);
  let rainLight = null;
  bodyMesh.geos.forEach((geo, b) => {
    if (!geo) return;
    geo.rotateY(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mats[b]);
    mesh.castShadow = b !== 3;
    tilt.add(mesh);
    if (b === 3) rainLight = mesh;
  });
  if (!rainLight) {
    rainLight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), mats[3]);
    rainLight.visible = false;
    tilt.add(rainLight);
  }

  // ---- DRS flap ----
  onProgress(0.72, '安装 DRS 尾翼…');
  const flapGrid = await sampleGrid([-2.63, -2.42, 0.74, 0.98, -0.46, 0.46], h, drsFlap, { mirrorZ: true });
  for (const d of (team.flapDecals || [])) applyDecal(flapGrid, d);
  const flapMesh = await meshGrid(flapGrid, palette, gloss);
  const hinge = new THREE.Vector3(0, 0.925, -2.60); // game coords
  const drsPivot = new THREE.Group();
  drsPivot.position.copy(hinge);
  flapMesh.geos.forEach((geo, b) => {
    if (!geo) return;
    geo.rotateY(-Math.PI / 2);
    geo.translate(-hinge.x, -hinge.y, -hinge.z);
    const mesh = new THREE.Mesh(geo, mats[b]);
    mesh.castShadow = true;
    drsPivot.add(mesh);
  });
  tilt.add(drsPivot);

  // ---- wheels ----
  onProgress(0.80, '锻造轮毂与轮胎…');
  const wheels = [];
  const wheelGeoCache = {};
  const defs = [
    { x: 0.82, z: FA, w: FWW, front: true, side: 1 },
    { x: -0.82, z: FA, w: FWW, front: true, side: -1 },
    { x: 0.82, z: RA, w: RWW, front: false, side: 1 },
    { x: -0.82, z: RA, w: RWW, front: false, side: -1 },
  ];
  for (const dfn of defs) {
    const key = `${dfn.w}_${dfn.side}`;
    if (!wheelGeoCache[key]) {
      const R = TR + h;
      const wg = await sampleGrid([-R, R, -R, R, -dfn.w / 2 - h, dfn.w / 2 + h], h,
        (x, y, z) => wheelLocal(x, y, z * dfn.side, dfn.w), { mirrorZ: false });
      const wm = await meshGrid(wg, palette, gloss);
      wm.geos.forEach(geo => { if (geo) geo.rotateY(-Math.PI / 2); });
      wheelGeoCache[key] = wm.geos;
      bodyMesh.faces += wm.faces;
    }
    const spin = new THREE.Group();
    wheelGeoCache[key].forEach((geo, b) => {
      if (!geo) return;
      const mesh = new THREE.Mesh(geo, mats[b]);
      mesh.castShadow = true;
      spin.add(mesh);
    });
    const steer = new THREE.Group();
    steer.add(spin);
    steer.position.set(dfn.x, TR, dfn.z);
    group.add(steer);
    wheels.push({ steer, spin, isFront: dfn.front, side: dfn.side });
  }

  onProgress(1, '完成');
  // tag handles so cloned instances can rebuild their API cheaply
  tilt.userData.tag = 'tilt';
  drsPivot.userData.tag = 'drs';
  rainLight.userData.tag = 'rain';
  wheels.forEach((w, i) => { w.steer.userData.tag = `steer${i}`; w.spin.userData.tag = `spin${i}`; w.steer.userData.front = w.isFront; });
  return {
    group, tilt, wheels, drsPivot, rainLight,
    dims: carDims(),
    stats: {
      voxels: bodyGrid.vox,
      faces: bodyMesh.faces + flapMesh.faces,
      ms: Math.round(performance.now() - t0),
    },
  };
}

function carDims() {
  return {
    wheelbase: FA - RA, halfTrack: 0.82, wheelRadius: TR,
    eye: new THREE.Vector3(0, 0.92, 0.38),
    tcam: new THREE.Vector3(0, 1.16, -0.42),
    length: X1W - X0W, width: Z1W * 2,
  };
}

/* cached builds + cheap clones: geometry is sculpted once per (team, LOD),
 * additional cars of the same team share it */
const _carCache = new Map();

export async function buildCarInstance(team, h, onProgress = () => {}, profile = 'race') {
  const key = `${team.id}_${h}_${profile}`;
  if (!_carCache.has(key)) {
    const built = await buildSculptedCar(team, h, onProgress, profile);
    _carCache.set(key, built);
    return built;
  }
  const src = _carCache.get(key);
  const group = src.group.clone(true);
  const api = { group, tilt: null, drsPivot: null, rainLight: null, wheels: [], dims: carDims(), stats: src.stats };
  const wheelMap = {};
  group.traverse(o => {
    const tag = o.userData && o.userData.tag;
    if (!tag) return;
    if (tag === 'tilt') api.tilt = o;
    else if (tag === 'drs') api.drsPivot = o;
    else if (tag === 'rain') api.rainLight = o;
    else if (tag.startsWith('steer')) (wheelMap[tag.slice(5)] ??= {}).steer = o;
    else if (tag.startsWith('spin')) (wheelMap[tag.slice(4)] ??= {}).spin = o;
  });
  for (const k of Object.keys(wheelMap).sort()) {
    const w = wheelMap[k];
    api.wheels.push({ steer: w.steer, spin: w.spin, isFront: !!(w.steer && w.steer.userData.front) });
  }
  return api;
}

export function clearCarCache() { _carCache.clear(); }
