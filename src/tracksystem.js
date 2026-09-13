import * as THREE from 'three';

export class TrackSystem {
  constructor(scene, circuitConfig) {
    this.scene = scene;
    this.cfg = circuitConfig;
    this.length = this.calculateTotalLength();
  }

  calculateTotalLength() {
    let len = 0;
    const pts = this.cfg.pts;
    for (let i = 0; i < pts.length; i++) {
      const p1 = new THREE.Vector3(pts[i][0], pts[i][1], pts[i][2]);
      const p2 = new THREE.Vector3(pts[(i + 1) % pts.length][0], pts[(i + 1) % pts.length][1], pts[(i + 1) % pts.length][2]);
      len += p1.distanceTo(p2);
    }
    return len;
  }

  sampleAt(s) {
    const progress = (s % this.length) / this.length;
    const pts = this.cfg.pts;
    const index = Math.floor(progress * pts.length);
    const pData = pts[index % pts.length];
    
    const p = new THREE.Vector3(pData[0], pData[1], pData[2]);
    const n = new THREE.Vector3(1, 0, 0); 
    return { p, n };
  }

  getPitStopCoordinates() {
    if (!this.cfg.pitlane) return null;
    const entryDistance = this.cfg.pitlane.entryFrac * this.length;
    return this.sampleAt(entryDistance);
  }

  buildTrack() {
    const { length } = this;
    const tWidth = this.cfg.width || 10;
    const rows = [], colors = [];
    const trackColor = new THREE.Color(0x333333);

    let currentS = 0;
    const step = 5.0;

    while (currentS <= length) {
      const sm = this.sampleAt(currentS);
      rows.push([
        sm.p.clone().addScaledVector(sm.n, tWidth / 2),
        sm.p.clone().addScaledVector(sm.n, -tWidth / 2)
      ]);
      colors.push([trackColor, trackColor]);
      currentS += step;
    }

    if (rows.length > 1) {
      const geometry = this.ribbonGeometry(rows, colors);
      const material = new THREE.MeshStandardMaterial({ roughness: 0.9, vertexColors: true });
      const mesh = new THREE.Mesh(geometry, material);
      this.scene.add(mesh);
    }

    this.buildPitLane();
  }

  buildPitLane() {
    const pitCfg = this.cfg.pitlane;
    if (!pitCfg) return;

    const { length } = this;
    const pWidth = 4.0; 
    const rows = [], colors = [];
    const pitColor = new THREE.Color(0x4a4e55);

    const startS = pitCfg.entryFrac * length;
    const endS = pitCfg.exitFrac * length;
    
    let currentS = startS;
    const step = 2.5; 

    while (true) {
      const sm = this.sampleAt(currentS);
      const pCenter = sm.p.clone().addScaledVector(sm.n, pitCfg.offset);

      rows.push([
        pCenter.clone().addScaledVector(sm.n, pWidth / 2),
        pCenter.clone().addScaledVector(sm.n, -pWidth / 2)
      ]);
      colors.push([pitColor, pitColor]);

      if (Math.abs((currentS % length) - (endS % length)) < step) break;
      currentS = (currentS + step) % length;
    }

    if (rows.length > 1) {
      const geometry = this.ribbonGeometry(rows, colors);
      const material = new THREE.MeshStandardMaterial({ roughness: 0.95, vertexColors: true });
      const mesh = new THREE.Mesh(geometry, material);
      this.scene.add(mesh);
    }
  }

  ribbonGeometry(rows, colors) {
    const geom = new THREE.BufferGeometry();
    const positions = [];
    const colList = [];

    for (let i = 0; i < rows.length; i++) {
      const [left, right] = rows[i];
      const [cLeft, cRight] = colors[i];

      positions.push(left.x, left.y, left.z);
      positions.push(right.x, right.y, right.z);

      colList.push(cLeft.r, cLeft.g, cLeft.b);
      colList.push(cRight.r, cRight.g, cRight.b);
    }

    const indices = [];
    for (let i = 0; i < rows.length - 1; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(colList, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    return geom;
  }
}

export class CarController {
  constructor(trackSystem, mesh) {
    this.track = trackSystem;
    this.mesh = mesh;
    this.fuel = 100; 
    this.isPitting = false;
    this.pitTimer = 0;
    this.currentFrac = 0;
    this.speed = 40; 
  }

  update(dt) {
    // Ensure dt is valid and fuel logic ticks continuously when moving
    if (dt <= 0) return;

    const distanceTraveled = (this.isPitting && this.pitTimer > 0) ? 0 : this.speed * dt;
    this.currentFrac = (this.currentFrac + (distanceTraveled / this.track.length)) % 1;

    const pitCfg = this.track.cfg.pitlane;

    // Fixed fuel burning rate
    if (!this.isPitting) {
      this.fuel = Math.max(0, this.fuel - 1.5 * dt);
    }

    // Trigger pit stop automatically when fuel is low and approaching entry
    if (!this.isPitting && pitCfg && this.fuel < 15) {
      if (Math.abs(this.currentFrac - pitCfg.entryFrac) < 0.03) {
        this.isPitting = true;
        this.pitTimer = 4.0;
      }
    }

    if (this.isPitting) {
      this.pitTimer -= dt;
      this.fuel = Math.min(100, this.fuel + (100 / 4.0) * dt);

      if (this.pitTimer <= 0 && this.fuel >= 99) {
        this.isPitting = false;
      }
    }

    const sm = this.track.sampleAt(this.currentFrac * this.track.length);
    if (this.isPitting && pitCfg) {
      this.mesh.position.copy(sm.p).addScaledVector(sm.n, pitCfg.offset);
    } else {
      this.mesh.position.copy(sm.p);
    }
  }
}