// Garage showroom: studio-lit turntable with a fake floor reflection,
// orbit camera, per-team car display (fine LOD, cached), DRS demo animation
// and car selection persisted to localStorage.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildSculptedCar } from './carSculpt.js';
import { TEAMS, TEAM_ORDER, saveSelectedTeam } from './teams.js';

const GARAGE_LOD = 0.016;

export class Garage {
  constructor(renderer, onSelect, onBack) {
    this.renderer = renderer;
    this.onSelect = onSelect;
    this.onBack = onBack;
    this.cache = new Map();     // teamId -> built car
    this.active = false;
    this.currentId = null;
    this.car = null;
    this.mirrorCar = null;
    this.drsT = 0;
    this.building = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d16);
    this.scene.fog = new THREE.FogExp2(0x0a0d16, 0.025);

    this.camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.1, 200);
    this.camera.position.set(5.5, 1.8, 5.2);

    this.buildStudio();
    this.buildUI();

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(0, 0.35, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 1.1;
    this.controls.minDistance = 3.0;
    this.controls.maxDistance = 14;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.01; // Keep camera above floor level
    this.controls.enabled = false;
    this.controls.addEventListener('start', () => { this.controls.autoRotate = false; });
  }

  buildStudio() {
    const s = this.scene;

    // 1. Balanced Studio Ambient Fill
    const amb = new THREE.HemisphereLight(0xdce6ff, 0x111522, 1.2);
    s.add(amb);

    // 2. Key Overhead Directional Light with Soft Shadows
    const key = new THREE.DirectionalLight(0xfff5ea, 3.2);
    key.position.set(4, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -4; key.shadow.camera.right = 4;
    key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
    key.shadow.camera.far = 25;
    key.shadow.bias = -0.0001;
    key.shadow.normalBias = 0.02;
    s.add(key);

    // 3. Rim / Highlight Lights to Separate Car Body from Dark Background
    const rimBlue = new THREE.DirectionalLight(0x4080ff, 2.2);
    rimBlue.position.set(-6, 3, -5);
    s.add(rimBlue);

    const rimWarm = new THREE.DirectionalLight(0xff7733, 1.8);
    rimWarm.position.set(6, 2, -6);
    s.add(rimWarm);

    // Overhead Studio Softbox Light for Bonnet/Wing Highlights
    const topSpot = new THREE.SpotLight(0xffffff, 4.0, 15, Math.PI / 4, 0.5, 1);
    topSpot.position.set(0, 7, 0);
    topSpot.target.position.set(0, 0, 0);
    s.add(topSpot);
    s.add(topSpot.target);

    // 4. Floor Geometry
    // Outer Matte Surrounding Floor
    const far = new THREE.Mesh(
      new THREE.RingGeometry(8.95, 60, 64),
      new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.9 })
    );
    far.rotation.x = -Math.PI / 2;
    far.position.y = -0.01;
    far.receiveShadow = true;
    s.add(far);

    // Reflective Metallic Turntable Center
    this.glossFloor = new THREE.Mesh(
      new THREE.CircleGeometry(9, 64),
      new THREE.MeshStandardMaterial({
        color: 0x121620,
        roughness: 0.18,
        metalness: 0.7,
        transparent: true,
        opacity: 0.85,
      })
    );
    this.glossFloor.rotation.x = -Math.PI / 2;
    this.glossFloor.position.y = 0;
    this.glossFloor.receiveShadow = true;
    s.add(this.glossFloor);

    // Yellow / Accent Turntable Ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.45, 3.55, 96),
      new THREE.MeshBasicMaterial({ color: 0xffcc00, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.002;
    s.add(ring);
    this.ring = ring;

    // Curved Studio Backdrop Screen
    const bgGeo = new THREE.CylinderGeometry(18, 18, 10, 32, 1, true, Math.PI * 0.7, Math.PI * 1.6);
    const bgMat = new THREE.MeshStandardMaterial({
      color: 0x101420,
      roughness: 0.8,
      side: THREE.BackSide,
    });
    const bgWall = new THREE.Mesh(bgGeo, bgMat);
    bgWall.position.set(0, 4, 0);
    s.add(bgWall);

    this.carRoot = new THREE.Group();     // Rotates on the turntable
    this.mirrorRoot = new THREE.Group();  // Mirrored underneath for reflection
    s.add(this.carRoot, this.mirrorRoot);
  }

  buildUI() {
    const el = document.createElement('div');
    el.id = 'garage-ui';
    el.classList.add('hidden');
    el.innerHTML = `
      <div id="garage-panel">
        <div id="garage-team"></div>
        <div id="garage-model"></div>
        <div class="g-bar"></div>
        <div id="garage-note"></div>
        <div id="garage-desc"></div>
        <div id="garage-stats"></div>
      </div>
      <div id="garage-progress" class="hidden">
        <div class="g-track"><div id="garage-fill"></div></div>
        <div id="garage-msg">正在雕刻…</div>
      </div>
      <div id="garage-chips"></div>
      <div id="garage-actions">
        <button id="garage-select">✓ 驾驶这辆赛车</button>
        <button id="garage-back">返回主菜单</button>
      </div>
      <div id="garage-hint">拖拽旋转 · 滚轮缩放 · 车辆自动展示 DRS</div>`;
    document.body.appendChild(el);
    this.ui = el;

    const chips = el.querySelector('#garage-chips');
    for (const id of TEAM_ORDER) {
      const t = TEAMS[id];
      const c = document.createElement('button');
      c.className = 'garage-chip';
      c.dataset.id = id;
      c.innerHTML = `<i style="background:${t.uiColor}"></i>${t.name}<b>#${t.number}</b>`;
      c.addEventListener('click', () => this.show(id));
      chips.appendChild(c);
    }
    el.querySelector('#garage-select').addEventListener('click', () => {
      if (!this.currentId) return;
      saveSelectedTeam(this.currentId);
      this.onSelect(this.currentId);
    });
    el.querySelector('#garage-back').addEventListener('click', () => this.onBack());
  }

  async open(teamId) {
    this.active = true;
    this.controls.enabled = true;
    this.controls.autoRotate = true;
    this.ui.classList.remove('hidden');
    this.camera.position.set(5.5, 1.8, 5.2);
    this.controls.target.set(0, 0.35, 0);
    await this.show(teamId);
  }

  close() {
    this.active = false;
    this.controls.enabled = false;
    this.ui.classList.add('hidden');
  }

  setChipActive() {
    this.ui.querySelectorAll('.garage-chip').forEach(c =>
      c.classList.toggle('on', c.dataset.id === this.currentId));
  }

  async show(teamId) {
    if (this.building || (teamId === this.currentId && this.car)) {
      if (teamId === this.currentId) return;
    }
    if (this.building) return;
    this.currentId = teamId;
    this.setChipActive();
    const team = TEAMS[teamId];

    // Info panel updates
    const $ = sel => this.ui.querySelector(sel);
    $('#garage-team').textContent = team.fullName;
    $('#garage-team').style.background = `linear-gradient(90deg,#fff 25%, ${team.uiColor2}, ${team.uiColor})`;
    $('#garage-team').style.webkitBackgroundClip = 'text';
    $('#garage-team').style.backgroundClip = 'text';
    $('#garage-model').innerHTML = `${team.name} <span>· ${team.year} · #${team.number}</span>`;
    $('#garage-note').textContent = team.driverNote;
    $('#garage-desc').textContent = team.desc;
    $('#garage-stats').textContent = '';

    // Clear previous car from stage
    if (this.car) { this.carRoot.remove(this.car.group); this.car = null; }
    if (this.mirrorCar) { this.mirrorRoot.remove(this.mirrorCar); this.mirrorCar = null; }

    let built = this.cache.get(teamId);
    if (!built) {
      this.building = true;
      const prog = $('#garage-progress'), fill = $('#garage-fill'), msg = $('#garage-msg');
      prog.classList.remove('hidden');
      built = await buildSculptedCar(team, GARAGE_LOD, (f, label) => {
        fill.style.width = `${Math.round(f * 100)}%`;
        if (label) msg.textContent = label;
      });
      prog.classList.add('hidden');
      this.cache.set(teamId, built);
      this.building = false;
      if (this.currentId !== teamId) return; // Switched away mid-build
    }
    this.car = built;
    this.carRoot.add(built.group);
    built.group.traverse(o => { if (o.isMesh) o.castShadow = true; });

    // Mirrored clone beneath the glossy floor plane for realistic reflection
    this.mirrorCar = built.group.clone(true);
    this.mirrorCar.scale.y = -1;
    this.mirrorCar.position.y = -0.002;
    this.mirrorCar.traverse(o => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    this.mirrorRoot.add(this.mirrorCar);

    const st = built.stats;
    $('#garage-stats').innerHTML =
      `体素 <b>${st.voxels.toLocaleString()}</b> · 面片 <b>${st.faces.toLocaleString()}</b> · 雕刻 <b>${st.ms}ms</b>`;
    this.ring.material.color.set(team.uiColor2 || 0xffcc00);
  }

  update(dt) {
    if (!this.active) return;
    this.controls.update();

    if (this.car && this.mirrorCar) {
      // Sync turntable rotation to mirrored car
      this.mirrorCar.rotation.copy(this.car.group.rotation);

      // DRS & Wheel Steering Demo Loop
      this.drsT += dt;
      const phase = (this.drsT % 6) / 6;
      const open = phase > 0.5 ? 1 - S01((phase - 0.5) / 0.12) : S01(phase / 0.12);
      const target = -0.72 * Math.min(open, 1);
      
      if (this.car.drsPivot) {
        this.car.drsPivot.rotation.x = target;
      }

      const steerA = Math.sin(this.drsT * 0.9) * 0.28;
      if (this.car.wheels) {
        for (const w of this.car.wheels) {
          if (w.isFront && w.steer) w.steer.rotation.y = steerA;
        }
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

function S01(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }