// Voxel building system: author models on an integer grid, then bake into a
// single merged BufferGeometry with per-face directional shading, subtle
// per-voxel color jitter and hidden-face culling.
import * as THREE from 'three';

const FACES = [
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], shade: 0.86 },
  { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], shade: 0.80 },
  { dir: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], shade: 1.0 },
  { dir: [0, -1, 0], corners: [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]], shade: 0.55 },
  { dir: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], shade: 0.92 },
  { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]], shade: 0.74 },
];

function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return (((h ^ (h >> 16)) >>> 0) % 1000) / 1000;
}

export class VoxelBuilder {
  constructor(size = 0.05) {
    this.size = size;
    this.map = new Map();
    this.jitter = 0.045; // per-voxel brightness variance
  }

  key(x, y, z) { return ((x + 512) << 20) | ((y + 512) << 10) | (z + 512); }

  set(x, y, z, color) {
    this.map.set(this.key(x | 0, y | 0, z | 0), color);
  }

  get(x, y, z) { return this.map.get(this.key(x | 0, y | 0, z | 0)); }

  del(x, y, z) { this.map.delete(this.key(x | 0, y | 0, z | 0)); }

  // Inclusive integer box fill.
  box(x0, x1, y0, y1, z0, z1, color) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
          this.set(x, y, z, color);
  }

  // Thick voxel line between two integer points.
  line(x0, y0, z0, x1, y1, z1, color, thick = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 1);
    const r = (thick - 1) / 2;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = Math.round(x0 + (x1 - x0) * t);
      const cy = Math.round(y0 + (y1 - y0) * t);
      const cz = Math.round(z0 + (z1 - z0) * t);
      if (thick <= 1) this.set(cx, cy, cz, color);
      else this.box(Math.round(cx - r), Math.round(cx + r), Math.round(cy - r), Math.round(cy + r), Math.round(cz - r), Math.round(cz + r), color);
    }
  }

  // Cylinder along the X axis (used for wheels): disc in the Y/Z plane.
  cylinderX(cx, cy, cz, x0, x1, r0, r1, color) {
    for (let x = x0; x <= x1; x++)
      for (let y = Math.floor(-r1); y <= Math.ceil(r1); y++)
        for (let z = Math.floor(-r1); z <= Math.ceil(r1); z++) {
          const d = Math.sqrt(y * y + z * z);
          if (d <= r1 + 0.35 && d >= r0 - 0.35) this.set(cx + x, cy + y, cz + z, color);
        }
  }

  // Mirror-x helper: run fn for +1 and -1.
  sym(fn) { fn(1); fn(-1); }

  // Bake into a merged indexed BufferGeometry. origin shifts in voxel units.
  build({ origin = [0, 0, 0], jitter = this.jitter } = {}) {
    const pos = [], nrm = [], col = [], idx = [];
    const c = new THREE.Color();
    const s = this.size;
    for (const [k, color] of this.map) {
      const x = (k >> 20) - 512, y = ((k >> 10) & 1023) - 512, z = (k & 1023) - 512;
      const j = 1 + (hash3(x, y, z) - 0.5) * 2 * jitter;
      for (const f of FACES) {
        if (this.map.has(this.key(x + f.dir[0], y + f.dir[1], z + f.dir[2]))) continue;
        const base = pos.length / 3;
        c.setHex(color);
        const r = Math.min(1, c.r * f.shade * j), g = Math.min(1, c.g * f.shade * j), b = Math.min(1, c.b * f.shade * j);
        for (const corner of f.corners) {
          pos.push((x + corner[0] + origin[0]) * s, (y + corner[1] + origin[1]) * s, (z + corner[2] + origin[2]) * s);
          nrm.push(f.dir[0], f.dir[1], f.dir[2]);
          col.push(r, g, b);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    return geo;
  }
}

// Shared materials for voxel meshes.
export function voxelMaterial(opts = {}) {
  return new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0.0,
    envMapIntensity: opts.envMapIntensity ?? 0.25,
    ...(opts.extra || {}),
  });
}

export function glowMaterial(color, intensity = 1) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false });
}
