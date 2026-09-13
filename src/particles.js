// Tire smoke / grass spray (GPU point sprites) + persistent skid marks
// (ring-buffer quad strip laid on the road).
import * as THREE from 'three';

function softCircleTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  return tex;
}

export class Particles {
  constructor(scene) {
    this.max = 420;
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    this.posA = new Float32Array(this.max * 3);
    this.velA = new Float32Array(this.max * 3);
    this.lifeA = new Float32Array(this.max);   // remaining
    this.life0A = new Float32Array(this.max);  // initial
    this.sizeA = new Float32Array(this.max);
    this.colA = new Float32Array(this.max * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.posA, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colA, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this.lifeA, 1));
    geo.setAttribute('aLife0', new THREE.BufferAttribute(this.life0A, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizeA, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { map: { value: softCircleTexture() } },
      vertexShader: `
        attribute vec3 aColor; attribute float aLife, aLife0, aSize;
        varying float vAlpha; varying vec3 vColor;
        void main() {
          vColor = aColor;
          float t = aLife0 > 0.0 ? (1.0 - aLife / aLife0) : 1.0;
          vAlpha = aLife > 0.0 ? (1.0 - t) * 0.42 : 0.0;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float size = aSize * (1.0 + t * 2.6);
          gl_PointSize = size * 320.0 / max(-mv.z, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying float vAlpha; varying vec3 vColor;
        void main() {
          vec4 tex = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor, tex.a * vAlpha);
          if (gl_FragColor.a < 0.01) discard;
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.geo = geo;
  }

  spawn(pos, vel, color, size = 0.9, life = 0.8) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.posA[i * 3] = pos.x; this.posA[i * 3 + 1] = pos.y; this.posA[i * 3 + 2] = pos.z;
    this.velA[i * 3] = vel.x + (Math.random() - 0.5) * 1.6;
    this.velA[i * 3 + 1] = vel.y + Math.random() * 1.2;
    this.velA[i * 3 + 2] = vel.z + (Math.random() - 0.5) * 1.6;
    this.lifeA[i] = life; this.life0A[i] = life;
    this.sizeA[i] = size;
    this.colA[i * 3] = color.r; this.colA[i * 3 + 1] = color.g; this.colA[i * 3 + 2] = color.b;
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.lifeA[i] <= 0) continue;
      this.lifeA[i] -= dt;
      this.posA[i * 3] += this.velA[i * 3] * dt;
      this.posA[i * 3 + 1] += this.velA[i * 3 + 1] * dt;
      this.posA[i * 3 + 2] += this.velA[i * 3 + 2] * dt;
      this.velA[i * 3 + 1] += 1.1 * dt; // smoke rises
      this.velA[i * 3] *= (1 - 1.6 * dt);
      this.velA[i * 3 + 2] *= (1 - 1.6 * dt);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aLife.needsUpdate = true;
  }

  dispose(scene) {
    scene.remove(this.points);
    this.geo.dispose();
    this.points.material.dispose();
  }
}

export class SkidMarks {
  constructor(scene) {
    this.max = 900; // quads
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    this.posA = new Float32Array(this.max * 4 * 3);
    this.alphaA = new Float32Array(this.max * 4);
    const idx = new Uint32Array(this.max * 6);
    for (let i = 0; i < this.max; i++) {
      const b = i * 4;
      idx.set([b, b + 2, b + 1, b + 1, b + 2, b + 3], i * 6);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.posA, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphaA, 1));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      vertexShader: `
        attribute float aAlpha; varying float vA;
        void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying float vA;
        void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(0.05, 0.05, 0.06, vA); }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.geo = geo;
    this.lastPos = [null, null]; // per rear wheel
  }

  // called per rear wheel while sliding; w = half width of the mark
  add(wheelIdx, pos, intensity) {
    const last = this.lastPos[wheelIdx];
    this.lastPos[wheelIdx] = { p: pos.clone(), i: intensity };
    if (!last) return;
    if (last.p.distanceToSquared(pos) > 4) return; // teleported
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const dir = _d.subVectors(pos, last.p);
    if (dir.lengthSq() < 0.0004) { this.lastPos[wheelIdx] = last; return; }
    _n.set(-dir.z, 0, dir.x).normalize().multiplyScalar(0.17);
    const b = i * 4 * 3;
    const y0 = last.p.y + 0.018, y1 = pos.y + 0.018;
    this.posA[b] = last.p.x - _n.x; this.posA[b + 1] = y0; this.posA[b + 2] = last.p.z - _n.z;
    this.posA[b + 3] = last.p.x + _n.x; this.posA[b + 4] = y0; this.posA[b + 5] = last.p.z + _n.z;
    this.posA[b + 6] = pos.x - _n.x; this.posA[b + 7] = y1; this.posA[b + 8] = pos.z - _n.z;
    this.posA[b + 9] = pos.x + _n.x; this.posA[b + 10] = y1; this.posA[b + 11] = pos.z + _n.z;
    const a0 = Math.min(0.62, last.i * 0.62), a1 = Math.min(0.62, intensity * 0.62);
    this.alphaA[i * 4] = a0; this.alphaA[i * 4 + 1] = a0;
    this.alphaA[i * 4 + 2] = a1; this.alphaA[i * 4 + 3] = a1;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }

  breakStreak(wheelIdx) { this.lastPos[wheelIdx] = null; }

  dispose(scene) {
    scene.remove(this.mesh);
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}

const _d = new THREE.Vector3(), _n = new THREE.Vector3();
