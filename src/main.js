// Voxel Grand Prix — bootstrapping, menu, game loop, visual sync.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TRACKS, TRACK_ORDER } from './config.js';
import { CIRCUITS } from './data/circuits.js';
import { Track } from './track.js';
import { TrackSystem} from './tracksystem.js';
import { buildEnvironment } from './environment.js';
import { buildSculptedCar, buildCarInstance, clearCarCache } from './carSculpt.js';
import { TEAMS, TEAM_ORDER, loadSelectedTeam } from './teams.js';
import { CarPhysics } from './physics.js';
import { Garage } from './garage.js';
import { CameraRig, CAMERA_MODES } from './cameras.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { Particles, SkidMarks } from './particles.js';
import { Hud, drawTrackMap } from './hud.js';
import { Race } from './race.js';
import { MultiplayerManager } from './multiplayer.js';

// ------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 6000);

const input = new Input();
const audio = new GameAudio();
const hud = new Hud();

let G = null; // current game session
let mp = null; // multiplayer manager instance
let selTrack = TRACK_ORDER[0];
let selTeam = loadSelectedTeam();
let selMode = localStorage.getItem('voxelf1-mode') === 'race' ? 'race' : 'time';
let paused = false;
const RACE_LOD = 0.022;
const RACE_LAPS = 3;

const garage = new Garage(
  renderer,
  teamId => { selTeam = teamId; refreshTeamChip(); garage.close(); hud.show('menu', true); },
  () => { garage.close(); hud.show('menu', true); }
);

function refreshTeamChip() {
  const t = TEAMS[selTeam];
  const chip = document.getElementById('selected-team');
  if (chip) chip.innerHTML = `<i style="background:${t.uiColor}"></i>${t.name} <b>#${t.number}</b>`;
}

function openGarage() {
  hud.show('menu', false);
  garage.open(selTeam);
}

// ------------------------------------------------------------ menu
function setupMenu() {
  const cards = document.getElementById('track-cards');
  if (cards) {
    cards.innerHTML = '';
    for (const id of TRACK_ORDER) {
      const cfg = TRACKS[id];
      const card = document.createElement('div');
      card.className = 'track-card' + (id === selTrack ? ' selected' : '');
      card.dataset.id = id;
      card.innerHTML = `
        <canvas width="240" height="180"></canvas>
        <div class="tc-name">${cfg.flag} ${cfg.name}<span class="tc-full">${cfg.fullName}</span></div>
        <div class="tc-stats">${(CIRCUITS[id].length / 1000).toFixed(3)} km · ${cfg.corners.length} CORNERS</div>
        <div class="tc-desc">${cfg.desc}</div>`;
      cards.appendChild(card);
      const cv = card.querySelector('canvas');
      drawTrackMap(cv.getContext('2d'), CIRCUITS[id].pts, 240, 180, cfg.minimapRot, { width: 3.5, color: '#e8ecf4', pad: 14 });
      card.addEventListener('click', () => {
        selTrack = id;
        cards.querySelectorAll('.track-card').forEach(c => c.classList.toggle('selected', c.dataset.id === id));
      });
    }
  }
  
  refreshTeamChip();
  
  const refreshMode = () => {
    document.querySelectorAll('.mode-chip').forEach(c => c.classList.toggle('on', c.dataset.mode === selMode));
    const btn = document.getElementById('btn-start');
    if (btn) btn.textContent = selMode === 'race' ? `START RACE · ${RACE_LAPS} LAPS` : 'LIGHTS OUT';
  };
  
  document.querySelectorAll('.mode-chip').forEach(c => c.addEventListener('click', () => {
    selMode = c.dataset.mode === 'race' ? 'race' : 'time';
    localStorage.setItem('voxelf1-mode', selMode);
    refreshMode();
  }));
  refreshMode();

  // Auto-generate button for room code
  const genBtn = document.getElementById('btn-gen-code');
  const roomInput = document.getElementById('room-code-input');
  if (genBtn && roomInput) {
    genBtn.addEventListener('click', () => {
      const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
      roomInput.value = randomCode;
    });
  }

  const btnGarage = document.getElementById('btn-garage');
  if (btnGarage) btnGarage.addEventListener('click', () => {
    audio.init(); audio.resume();
    openGarage();
  });

  const btnStart = document.getElementById('btn-start');
  if (btnStart) btnStart.addEventListener('click', () => {
    audio.init(); audio.resume();
    startGame(selTrack, selTeam);
  });

  const btnResume = document.getElementById('btn-resume');
  if (btnResume) btnResume.addEventListener('click', () => setPaused(false));

  const btnRestart = document.getElementById('btn-restart');
  if (btnRestart) btnRestart.addEventListener('click', () => { setPaused(false); startGame(selTrack, selTeam); });

  const btnMenu = document.getElementById('btn-menu');
  if (btnMenu) btnMenu.addEventListener('click', () => { setPaused(false); toMenu(); });

  const btnResAgain = document.getElementById('btn-res-again');
  if (btnResAgain) btnResAgain.addEventListener('click', () => { hud.show('results', false); startGame(selTrack, selTeam); });

  const btnResMenu = document.getElementById('btn-res-menu');
  if (btnResMenu) btnResMenu.addEventListener('click', () => { hud.show('results', false); toMenu(); });
}

function toMenu() {
  if (G) disposeGame();
  garage.close();
  hud.show('menu', true);
  hud.show('hud', false);
  hud.show('lights', false);
}

function setPaused(v) {
  if (!G) return;
  paused = v;
  hud.show('pause', v);
  if (audio.ctx) { v ? audio.ctx.suspend() : audio.ctx.resume(); }
}

// ------------------------------------------------------------ game session
function disposeGame() {
  if (!G) return;
  
  if (mp && mp.socket) {
    mp.socket.close();
    mp = null;
  }
  
  G.race.cancelTimers();
  G.env.dispose();
  G.track.dispose();
  G.scene.remove(G.track.group);
  G.particles.dispose(G.scene);
  G.skids.dispose(G.scene);
  clearCarCache();
  G.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  G = null;
  window.__game = null;
}

let starting = false;
async function startGame(trackId, teamId) {
  if (starting) return;
  starting = true;
  garage.close();
  hud.show('menu', false);
  hud.show('loading', true);
  try {
    await new Promise(r => setTimeout(r, 30));
    disposeGame();
    await buildGame(trackId, teamId);
    hud.show('loading', false);
    hud.show('hud', true);
    G.race.start();
  } finally {
    starting = false;
  }
}

async function buildGame(trackId, teamId) {
  const cfg = TRACKS[trackId];
  const team = TEAMS[teamId] || TEAMS.redbull;
  const loadMsg = document.getElementById('loading-msg');

  const scene = new THREE.Scene();
  renderer.toneMappingExposure = cfg.sky.exposure;

  // Read room code from UI input
  const roomInput = document.getElementById('room-code-input');
  const codeToJoin = roomInput ? roomInput.value.trim().toUpperCase() : '';

  mp = new MultiplayerManager(scene, () => {
    const group = new THREE.Group();
    const bodyGeo = new THREE.BoxGeometry(1.6, 0.45, 3.8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x888888 }); 
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.25;
    group.add(body);
    return group;
  });
  
  const serverUrl = 'ws://' + window.location.hostname + ':8080';
  mp.connect(serverUrl, codeToJoin);

  if (loadMsg) loadMsg.textContent = 'BUILDING CIRCUIT…';
  const track = new Track(cfg);
  scene.add(track.group);
  if (loadMsg) loadMsg.textContent = 'GENERATING TERRAIN & LIGHTING…';
  await new Promise(r => setTimeout(r, 16));
  const env = buildEnvironment(scene, track, cfg, renderer);

  let composer = null;
  if (cfg.sky.type === 'night') {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.55, 0.5, 0.68);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composer.setSize(window.innerWidth, window.innerHeight);
  }

  const car = await buildCarInstance(team, RACE_LOD, (f, label) => {
    if (loadMsg && label) loadMsg.textContent = label;
  }, 'race');
  car.group.rotation.order = 'YXZ';
  scene.add(car.group);
  const physics = new CarPhysics(track);
  const playerEntry = {
    physics, car, team, isPlayer: true, skill: 1, bias: 0,
    name: `${team.short} #${team.number} · YOU`, short: team.short,
    roll: 0, dive: 0,
  };

  const entries = [];
  if (selMode === 'race') {
    const slots = TEAM_ORDER.filter(id => id !== team.id);
    const skills = [0.985, 0.978, 0.971, 0.964, 0.957, 0.950, 0.942, 0.934, 0.926];
    for (let i = 0; i < slots.length; i++) {
      if (loadMsg) loadMsg.textContent = `BUILDING AI CAR ${i + 1}/${slots.length}…`;
      await new Promise(r => setTimeout(r, 0));
      const t = TEAMS[slots[i]];
      const c = await buildCarInstance(t, RACE_LOD, () => {}, 'race');
      c.group.rotation.order = 'YXZ';
      scene.add(c.group);
      entries.push({
        physics: new CarPhysics(track), car: c, team: t, isPlayer: false,
        skill: skills[i], bias: (Math.random() * 2 - 1) * 1.1,
        name: `${t.short} #${t.number}`, short: t.short,
        roll: 0, dive: 0,
      });
    }
  }
  entries.push(playerEntry);

  entries.forEach((e, i) => {
    const back = 9 + i * 9;
    e.physics.placeAt(((-back / track.length) % 1 + 1) % 1, (i % 2 === 0 ? 1 : -1) * track.width * 0.22);
    e.physics.locked = true;
  });

  const rig = new CameraRig(camera, car, physics, track);
  const particles = new Particles(scene);
  const skids = new SkidMarks(scene);
  const race = new Race(track, entries, hud, audio, { mode: selMode, laps: RACE_LAPS });
  race.onPlayerFinish = cls => showResults(cls);

  hud.setTrack(cfg, track);
  hud.setMode(selMode, RACE_LAPS);
  hud.setCameraLabel(CAMERA_MODES[0].label);

  G = {
    scene, track, env, car, physics, entries, rig, particles, skids, race, cfg, team, composer,
    accum: 0, smoke: { t: 0 }, lastGear: 1, wallCd: 0,
  };
  window.__game = G;
}

function showResults(cls) {
  const box = document.getElementById('results-rows');
  if (!box) return;
  box.innerHTML = '';
  const playerRow = cls.find(r => r.isPlayer);
  document.getElementById('results-pos').textContent = `P${playerRow ? playerRow.pos : '-'}`;
  for (const r of cls) {
    const div = document.createElement('div');
    div.className = 'res-row' + (r.isPlayer ? ' me' : '');
    const gap = r.pos === 1 ? 'WINNER' : (r.finished && r.gapMs != null ? `+${(r.gapMs / 1000).toFixed(2)}s` : '—');
    div.innerHTML = `<b>P${r.pos}</b><span class="rn">${r.name}</span><span class="rg">${gap}</span>`;
    box.appendChild(div);
  }
  if (G) G.rig.setMode('tv');
  hud.show('results', true);
}

// ------------------------------------------------------------ per-frame visual sync
const SMOKE_GRAY = new THREE.Color(0xcfd2d6);
const SPRAY_GREEN = new THREE.Color(0x69a04a);
const _wpos = new THREE.Vector3(), _f2 = new THREE.Vector3(), _l2 = new THREE.Vector3();

function syncCarVisual(e, dt) {
  const car = e.car, p = e.physics;
  car.group.position.copy(p.pos);
  car.group.rotation.y = p.heading;
  car.group.rotation.x = p.groundPitch;
  const rollT = THREE.MathUtils.clamp(p.latG * 0.026, -0.06, 0.06);
  const diveT = THREE.MathUtils.clamp(-p.longG * 0.014, -0.03, 0.045);
  e.roll = THREE.MathUtils.damp(e.roll, rollT, 9, dt);
  e.dive = THREE.MathUtils.damp(e.dive, diveT, 9, dt);
  car.tilt.rotation.z = e.roll;
  car.tilt.rotation.x = e.dive;
  car.tilt.position.y = p.surface === 'kerb' ? Math.sin(performance.now() * 0.09) * 0.012 : 0;
  for (const w of car.wheels) {
    if (w.isFront) w.steer.rotation.y = p.steer;
    w.spin.rotation.x += p.wheelSpin * dt;
  }
  const targetRot = p.drsOpen ? -0.72 : 0;
  car.drsPivot.rotation.x = THREE.MathUtils.damp(car.drsPivot.rotation.x, targetRot, 12, dt);
  car.rainLight.visible = p.brake > 0.12 || (p.throttle < 0.05 && p.speed > 30);
}

function syncVisuals(dt) {
  const { physics: p } = G;
  for (const e of G.entries) syncCarVisual(e, dt);

  if (p.gear !== G.lastGear) { audio.shift(); G.lastGear = p.gear; }
  G.wallCd -= dt;
  if (p.wallHit > 1.6 && G.wallCd <= 0) { audio.wallHit(p.wallHit); G.wallCd = 0.25; }

  const slide = Math.max(Math.abs(p.slipRear) - 0.10, Math.abs(p.slipFront) - 0.13, 0);
  const F = p.forward(_f2), Lf = p.left(_l2);
  const onRoad = p.surface === 'road' || p.surface === 'kerb';
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    _wpos.copy(p.pos).addScaledVector(F, -1.8).addScaledVector(Lf, side * 0.8);
    _wpos.y = p.pos.y + 0.03;
    if (slide > 0.02 && p.speed > 8) {
      if (onRoad) {
        G.skids.add(i, _wpos, Math.min(slide * 6, 1));
        G.smoke.t += dt;
        if (G.smoke.t > 0.016) {
          G.smoke.t = 0;
          particlesSpawn(_wpos, SMOKE_GRAY, 0.8 + slide * 2, p);
        }
      } else {
        G.skids.breakStreak(i);
        if (Math.random() < 0.55) particlesSpawn(_wpos, SPRAY_GREEN, 0.65, p);
      }
    } else {
      G.skids.breakStreak(i);
    }
  }
  if (p.surface === 'grass' && p.speed > 12 && Math.random() < 0.4) {
    _wpos.copy(p.pos).addScaledVector(F, -2.0);
    particlesSpawn(_wpos, SPRAY_GREEN, 0.8, p);
  }

  G.particles.update(dt);

  audio.update(dt, {
    rpm: p.rpm, throttle: p.throttle,
    speed01: Math.min(p.speed / 92, 1),
    slide: slide * 5,
    onKerb: p.surface === 'kerb',
    onGrass: p.surface === 'grass',
    cockpit: G.rig.mode !== 'chase',
  });
}

function particlesSpawn(pos, color, size, p) {
  _f2.set((Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2);
  G.particles.spawn(pos, _f2, color, size, 0.55 + Math.random() * 0.5);
}

// ------------------------------------------------------------ main loop
const FIXED = 1 / 120;
let lastT = performance.now();

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;
  tick(dt);
}

function tick(dt, render = true) {
  if (garage.active) {
    for (const ev of input.takeEvents()) {
      if (ev === 'pause') { garage.close(); hud.show('menu', true); }
    }
    garage.update(dt);
    return;
  }

  for (const ev of input.takeEvents()) {
    if (!G) continue;
    if (ev === 'camera') { const m = G.rig.cycle(); hud.setCameraLabel(m.label); }
    if (ev === 'reset' && !paused) G.race.reset();
    if (ev === 'pause') setPaused(!paused);
    if (ev === 'mute') { audio.setMuted(!audio.muted); hud.message(audio.muted ? '🔇 MUTED' : '🔊 AUDIO ON', 1000); }
    if (ev === 'autopilot') {
      G.race.autopilotActive = !G.race.autopilotActive;
      const m = G.rig.setMode(G.race.autopilotActive ? 'tv' : 'chase');
      hud.setCameraLabel(m.label);
      hud.message(G.race.autopilotActive ? '🤖 DEMO MODE · TV BROADCAST' : '🎮 MANUAL CONTROL', 1400);
    }
  }

  if (G && !paused) {
    input.update(dt);
    G.accum = Math.min(G.accum + dt, FIXED * 8);
    const inp = { steer: input.steer, throttle: input.throttle, brake: input.brake };
    while (G.accum >= FIXED) {
      for (const e of G.entries) {
        const ein = G.race.inputFor(e, inp);
        e._lastInput = ein;
        e.physics.step(FIXED, ein);
      }
      G.accum -= FIXED;
    }
    if (G.entries.length > 1) G.race.resolveCollisions();
    G.race.update(dt, inp);
    
    syncVisuals(dt);

    if (mp) mp.sendUpdate(G.physics.pos, G.car.group.rotation);

    G.rig.update(dt);
    G.env.update(dt, G.physics.pos);
    hud.update(G);
  }

  if (G && render) {
    if (G.composer) G.composer.render();
    else renderer.render(G.scene, camera);
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (G && G.composer) G.composer.setSize(window.innerWidth, window.innerHeight);
  garage.resize(window.innerWidth, window.innerHeight);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && G && !paused) setPaused(true); });

setupMenu();
frame();

window.__renderer = renderer;
window.__camera = camera;
window.__startGame = startGame;
window.__tick = tick;
window.__setPaused = setPaused;
window.__garage = garage;
window.__shot = (name = `shot-${Date.now()}`) => {
  const scene = garage.active ? garage.scene : (G && G.scene);
  const cam = garage.active ? garage.camera : camera;
  if (!scene) return Promise.resolve('no scene');
  if (!garage.active && G && G.composer) G.composer.render();
  else renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/jpeg', 0.85);
  return fetch(`/__shot?name=${name}`, { method: 'POST', body: url }).then(r => r.text());
};