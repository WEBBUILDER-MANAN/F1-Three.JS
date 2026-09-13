// Race session: time attack or a simplified real race (multi-car grid,
// per-driver AI with overtaking/avoidance, car-car collision, live
// positions/gaps, short lap count and a results classification).
// Also provides the shared pursuit "driver brain" used by AI cars and the
// player's demo autopilot.
import * as THREE from 'three';
import { CAR } from './physics.js';

export class Race {
  /**
   * entries: [{ physics, car, team, name, short, isPlayer, skill, bias }]
   * opts: { mode: 'time' | 'race', laps }
   */
  constructor(track, entries, hud, audio, opts = {}) {
    this.track = track;
    this.entries = entries;
    this.player = entries.find(e => e.isPlayer);
    this.hud = hud;
    this.audio = audio;
    this.mode = opts.mode || 'time';
    this.laps = this.mode === 'race' ? (opts.laps || 3) : Infinity;
    this.state = 'idle';
    this.raceTime = 0;
    this.wrongWay = false;
    this._wrongT = 0;
    this.autopilotActive = false;
    this._timers = [];
    this.onPlayerFinish = null;
    this.playerFinished = false;

    entries.forEach((e, i) => {
      e.pos = i + 1; // grid order until racing
      e.gridIndex = i;
    });
    for (const e of entries) {
      e.cp = [false, false];
      e.prevFrac = 0;
      e.crossedLine = false; // grid sits before the line: progress counts from -L
      e.lapCount = 1;
      e.lapStart = 0;
      e.lastLapMs = null;
      e.currentLapMs = 0;
      e.finished = false;
      e.finishTime = null;
      e.progress = 0;
      e.pos = 1;
      e.launchDelay = e.isPlayer ? 0 : 110 + e.gridIndex * 130 + Math.random() * 110; // staggered reactions => cleaner T1
      e.blockedT = 0;
      e.gridLat = e.physics.info?.lat ?? 0; // grid slot lane, held through the launch
    }
    this.bestLapMs = this.loadBest();
  }

  /* ---------- player-facing accessors (HUD compatibility) ---------- */
  get lapCount() { return this.player.lapCount; }
  get lastLapMs() { return this.player.lastLapMs; }
  get currentLapMs() { return this.player.currentLapMs; }
  get playerPos() { return this.player.pos; }

  storageKey() { return `voxelf1-best-${this.track.cfg.id}`; }
  loadBest() {
    const v = Number(localStorage.getItem(this.storageKey()));
    return v > 0 ? v : null;
  }

  start() {
    this.state = 'countdown';
    for (const e of this.entries) e.physics.locked = true;
    this.hud.show('lights', true);
    this.hud.lights(0);
    let delay = 700;
    for (let i = 1; i <= 5; i++) {
      this._timers.push(setTimeout(() => { this.hud.lights(i); this.audio.lightOn(); }, delay));
      delay += 860;
    }
    delay += 500 + Math.random() * 900;
    this._timers.push(setTimeout(() => {
      this.hud.lightsOut();
      this.audio.lightsOut();
      this.hud.message('灯灭起跑！<span class="en">LIGHTS OUT!</span>', 1800, 'go');
      this.state = 'racing';
      this.raceTime = 0;
      for (const e of this.entries) {
        e.prevFrac = e.physics.info ? e.physics.info.frac : 0;
        e.lapStart = 0;
      }
    }, delay));
  }

  cancelTimers() { this._timers.forEach(clearTimeout); this._timers = []; }

  /* ---------- the shared driver brain (AI + demo autopilot) ----------
   * Follows the precomputed RACING LINE with its own speed profile,
   * time-headway car following, and sticky committed overtakes. */
  driverInput(e) {
    const p = e.physics;
    const q = p.info;
    if (!q || this.state !== 'racing') return { steer: 0, throttle: 0, brake: 0 };
    const v = Math.max(p.speed, 1);
    const skill = e.skill ?? 1;
    const L = this.track.length;
    const lim = this.track.width / 2 - 1.3;

    // launch pack phase: 0 right off the grid → 1 once the field is strung
    // out. While low, drivers hold their grid lane, keep double headway and
    // watch a wider lateral window (grid columns are >3.4m apart).
    const tRace = Math.max(0, (this.raceTime - (e.launchDelay || 0)) / 1000);
    const settle = this.mode === 'race'
      ? THREE.MathUtils.clamp((tRace - 1.4) / 6.0, 0, 1) : 1;

    // --- traffic: nearest car genuinely ahead on roughly our path ---
    const latGate = 3.4 + (1 - settle) * 1.6;
    let ahead = null, aheadGap = Infinity;
    for (const o of this.entries) {
      if (o === e) continue;
      let dGap = ((o.physics.info?.s ?? 0) - q.s + L) % L;
      if (dGap > L / 2) dGap -= L;
      const isAhead = dGap > 0.3 || (Math.abs(dGap) <= 0.3 && o.progress > e.progress);
      if (!isAhead || dGap > 34 || dGap < -0.5) continue;
      const dLat = (o.physics.info?.lat ?? 0) - q.lat;
      if (Math.abs(dLat) < latGate && dGap < aheadGap) { ahead = o; aheadGap = Math.max(dGap, 0.4); }
    }

    // queuing nose-to-tail behind live traffic is NOT being stuck — the
    // marshal must not "rescue" cars that are just waiting their turn
    e.queueing = !!(ahead && aheadGap < 14);

    // --- lateral target: racing line + committed overtake offset ---
    const myLine = this.track.lineAt(q.s);
    let targetOff = myLine.off + (e.bias ?? 0) * 0.25;
    if (settle < 1) targetOff = THREE.MathUtils.lerp(e.gridLat ?? q.lat, targetOff, settle);
    const engageDist = 6 + v * 0.28;
    if (ahead && aheadGap < engageDist) {
      const oLat = ahead.physics.info?.lat ?? 0;
      if (!e.passSide || e.passT <= 0) {
        // commit to the side with more room and hold it
        const roomL = lim - (oLat + 2.6);
        const roomR = (oLat - 2.6) + lim;
        e.passSide = roomL >= roomR ? 1 : -1;
      }
      e.passT = 1.7;
      const passOff = THREE.MathUtils.clamp(oLat + e.passSide * 2.9, -lim, lim);
      const w = THREE.MathUtils.clamp(1.5 - aheadGap / engageDist, 0, 1);
      targetOff = THREE.MathUtils.lerp(targetOff, passOff, Math.min(1, w * 1.5));
    }

    // racecraft: never steer into a slot another car already occupies, and
    // if squeezed against the edge with someone alongside, tuck in behind
    // rather than hold a three-wide line into the corner
    let squeezedBy = null;
    for (const o of this.entries) {
      if (o === e) continue;
      const oq = o.physics.info; if (!oq) continue;
      let dS = (oq.s - q.s + L) % L; if (dS > L / 2) dS -= L;
      if (Math.abs(dS) > 5.2) continue; // only genuine wheel overlap constrains the line
      const oLat = oq.lat;
      if (Math.abs(oLat - q.lat) < 3.0) squeezedBy = squeezedBy || o;
      if (o !== ahead && Math.abs(oLat - targetOff) < 2.5) {
        targetOff = q.lat < oLat ? Math.min(targetOff, oLat - 2.6) : Math.max(targetOff, oLat + 2.6);
      }
    }
    targetOff = THREE.MathUtils.clamp(targetOff, -lim, lim);

    // --- recovery driving: off the road or badly misaligned ---
    const F = p.forward(_f);
    const align = F.dot(q.t);
    const offRoad = Math.abs(q.lat) > this.track.width / 2 - 0.2 || p.surface === 'grass' || p.surface === 'gravel';
    if (offRoad) targetOff = 0;

    // --- steering: pure pursuit on the racing line ahead ---
    const La = offRoad ? 7 + v * 0.22 : 5.5 + v * 0.38;
    const sT = q.s + La;
    const lineT = this.track.lineAt(sT);
    const smT = this.track.sampleAt(sT);
    const shift = targetOff - myLine.off;
    _tp.set(lineT.x + smT.n.x * shift, 0, lineT.z + smT.n.z * shift);
    _dir.subVectors(_tp, p.pos); _dir.y = 0;
    const dist = _dir.length() || 1;
    _dir.divideScalar(dist);
    const cross = F.z * _dir.x - F.x * _dir.z;
    const dot = THREE.MathUtils.clamp(F.dot(_dir), -1, 1);
    const alpha = Math.atan2(cross, dot);
    const delta = Math.atan2(2 * (CAR.a + CAR.b) * Math.sin(alpha), dist);
    const maxSteer = THREE.MathUtils.clamp(CAR.steerMax - Math.max(p.vx, 0) * CAR.steerFade, CAR.steerMin, CAR.steerMax);
    const steer = THREE.MathUtils.clamp(delta / maxSteer, -1, 1);

    // --- speed: racing-line profile + time-headway following ---
    let vAllow = Math.min(myLine.vT, this.track.lineAt(q.s + v * 0.28).vT) * 0.99 * skill;
    if (offRoad) vAllow = Math.min(vAllow, 11);
    if (align < 0.55) vAllow = Math.min(vAllow, 7);
    // pinched at the edge with a car alongside → back out of it
    if (squeezedBy && Math.abs(q.lat) > lim - 1.2) {
      vAllow = Math.min(vAllow, Math.max(squeezedBy.physics.speed - 1.5, 5));
    }
    if (ahead) {
      const oV = ahead.physics.speed;
      // pack headway: double off the line, still generous through the first
      // corner complex (~15s), settling to racing gaps after
      const packHW = 1 + (1 - settle) + 0.5 * (1 - THREE.MathUtils.clamp((tRace - 4) / 12, 0, 1));
      const desired = (3.2 + 0.16 * v) * packHW;
      const closing = Math.max(v - oV, 0);
      let vMax = oV + (aheadGap - desired) * 0.9 - closing * (0.25 + 0.45 * (1 - settle));
      if (aheadGap < desired * 0.5) vMax = Math.min(vMax, oV * 0.85);
      // alongside with room? carry the momentum through the pass (not in
      // the launch pack, where everyone is alongside someone)
      if (e.passT > 0 && settle > 0.55) {
        const oLat = ahead.physics.info?.lat ?? 0;
        if (Math.abs(oLat - q.lat) > 2.1) vMax = Math.max(vMax, oV + 3.5);
      }
      vAllow = Math.min(vAllow, Math.max(vMax, 0));
    }
    let throttle = 0, brake = 0;
    if (v > vAllow + 0.6) brake = THREE.MathUtils.clamp((v - vAllow) * 0.30, 0.15, 1);
    else throttle = THREE.MathUtils.clamp((vAllow - v) * 0.55 + 0.35, 0, 1);
    throttle *= 1 - Math.min(Math.abs(steer) * 0.30, 0.4);
    if (this.mode === 'race' && tRace < 1.5) throttle *= 0.62 + 0.38 * (tRace / 1.5); // getaway, not a ram
    return { steer, throttle, brake };
  }

  // demo autopilot for the player (kept for API compatibility)
  autopilot() { return this.driverInput(this.player); }

  // per-fixed-step input for any entry
  inputFor(e, userInput) {
    if (this.state === 'racing' && this.raceTime < e.launchDelay) {
      e.physics.locked = true;
    } else if (this.state === 'racing' && e.physics.locked && !e.finished) {
      e.physics.locked = false;
    }
    if (e.isPlayer && !this.autopilotActive) return userInput;
    if (e.finished) { // cruise after the flag
      const inp = this.driverInput(e);
      inp.throttle *= 0.5;
      return inp;
    }
    return this.driverInput(e);
  }

  /* ---------- car-car collisions (two discs per car) ---------- */
  resolveCollisions() {
    const R = 1.02, longOff = 1.25;
    for (let i = 0; i < this.entries.length; i++) {
      for (let j = i + 1; j < this.entries.length; j++) {
        const A = this.entries[i].physics, B = this.entries[j].physics;
        if (Math.abs(A.pos.x - B.pos.x) > 8 || Math.abs(A.pos.z - B.pos.z) > 8) continue;
        const FA2 = A.forward(_f), FB = B.forward(_f2);
        for (const oa of [-longOff, longOff]) {
          for (const ob of [-longOff, longOff]) {
            const ax = A.pos.x + FA2.x * oa, az = A.pos.z + FA2.z * oa;
            const bx = B.pos.x + FB.x * ob, bz = B.pos.z + FB.z * ob;
            let dx = ax - bx, dz = az - bz;
            const d = Math.hypot(dx, dz);
            if (d > R * 2 || d < 1e-4) continue;
            dx /= d; dz /= d;
            const pen = R * 2 - d;
            A.pos.x += dx * pen * 0.5; A.pos.z += dz * pen * 0.5;
            B.pos.x -= dx * pen * 0.5; B.pos.z -= dz * pen * 0.5;
            // damp closing velocity along the contact normal
            const va = A.forward(_f).multiplyScalar(A.vx).addScaledVector(A.left(_l), A.vy);
            const vb = B.forward(_f2).multiplyScalar(B.vx).addScaledVector(B.left(_l2), B.vy);
            const rel = (va.x - vb.x) * dx + (va.z - vb.z) * dz;
            if (rel < 0) {
              const imp = -rel * 0.5;
              va.x += dx * imp; va.z += dz * imp;
              vb.x -= dx * imp; vb.z -= dz * imp;
              const Fa = A.forward(_f), La2 = A.left(_l);
              A.vx = va.x * Fa.x + va.z * Fa.z; A.vy = va.x * La2.x + va.z * La2.z;
              const Fb = B.forward(_f2), Lb = B.left(_l2);
              B.vx = vb.x * Fb.x + vb.z * Fb.z; B.vy = vb.x * Lb.x + vb.z * Lb.z;
              A.yawRate += (Math.random() - 0.5) * 0.05;
              B.yawRate += (Math.random() - 0.5) * 0.05;
              if (this.player && (this.entries[i] === this.player || this.entries[j] === this.player) && -rel > 2.2) {
                this.audio.wallHit(-rel * 0.6);
              }
            }
          }
        }
      }
    }
  }

  update(dt, playerInput) {
    if (this.state !== 'racing') return;
    this.raceTime += dt * 1000;

    for (const e of this.entries) {
      if (e.passT > 0) e.passT -= dt; // overtake commitment decays
      const p = e.physics;
      const q = p.info;
      if (!q) continue;
      e.currentLapMs = this.raceTime - e.lapStart;
      const frac = q.frac;
      if (frac > 0.30 && frac < 0.40) e.cp[0] = true;
      if (frac > 0.62 && frac < 0.72) e.cp[1] = true;
      if (e.prevFrac > 0.90 && frac < 0.10) {
        e.crossedLine = true;
        if (e.cp[0] && e.cp[1]) {
          const lapMs = this.raceTime - e.lapStart;
          e.lastLapMs = lapMs;
          if (e.isPlayer) {
            const isBest = !this.bestLapMs || lapMs < this.bestLapMs;
            if (isBest) {
              this.bestLapMs = lapMs;
              localStorage.setItem(this.storageKey(), String(Math.round(lapMs)));
            }
            this.audio.lapDone(isBest);
            if (this.mode === 'time' || e.lapCount < this.laps) {
              this.hud.message(
                `${isBest ? '<span class="best">🏁 个人最快圈！</span>' : '🏁 完成一圈'}<br><b>${msFmt(lapMs)}</b>`,
                2200, isBest ? 'purple' : ''
              );
            }
          }
          // race finish?
          if (this.mode === 'race' && e.lapCount >= this.laps && !e.finished) {
            e.finished = true;
            e.finishTime = this.raceTime;
            if (e.isPlayer && !this.playerFinished) {
              this.playerFinished = true;
              if (this.onPlayerFinish) this.onPlayerFinish(this.classification());
            }
          }
          e.lapCount++;
        }
        e.lapStart = this.raceTime;
        e.cp = [false, false];
      }
      e.prevFrac = frac;
      e.progress = (e.lapCount - 1) * this.track.length + q.s - (e.crossedLine ? 0 : this.track.length);

      // marshal rescue: an AI (or demo) car wedged in a pile-up or against
      // a wall gets lifted back onto the track
      if ((!e.isPlayer || this.autopilotActive) && !e.finished && !p.locked && this.raceTime > 4500) {
        if (p.speed < 2.5 && !e.queueing) e.blockedT += dt; else e.blockedT = Math.max(0, e.blockedT - dt * 2);
        if (e.blockedT > 2.2) {
          // marshal lift onto the first CLEAR piece of road ahead
          e.blockedT = 0;
          const L2 = this.track.length;
          let adv = 14;
          for (; adv < 130; adv += 7) {
            const sTry = (q.s + adv) % L2;
            let clear = true;
            for (const o of this.entries) {
              if (o === e) continue;
              const dd = Math.abs(((o.physics.info?.s ?? 0) - sTry + L2 + L2 / 2) % L2 - L2 / 2);
              if (dd < 16) { clear = false; break; }
            }
            if (clear) break;
          }
          p.placeAt(((q.s + adv) / L2) % 1, THREE.MathUtils.clamp(e.bias ?? 0, -2, 2));
          p.vx = 10;
          e.prevFrac = p.info.frac; // a lift never counts as crossing the line
        }
      }

      // DRS per car
      p.drsAvailable = this.track.inDrsZone(frac) && p.speed > 28;
      const inp = e.isPlayer && !this.autopilotActive ? playerInput : e._lastInput || { throttle: 1, brake: 0 };
      if (p.drsAvailable && inp.throttle > 0.85 && inp.brake < 0.05) p.drsOpen = true;
      if (!p.drsAvailable || inp.brake > 0.15) p.drsOpen = false;
    }

    // positions
    const ranked = [...this.entries].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
    ranked.forEach((e, i) => { e.pos = i + 1; });
    this.ranked = ranked;

    // wrong way (player, manual only)
    const p = this.player.physics;
    if (!this.autopilotActive && p.info) {
      const F = p.forward(_f);
      const along = F.dot(p.info.t);
      if (p.speed > 4 && along < -0.2) this._wrongT += dt; else this._wrongT = 0;
      this.wrongWay = this._wrongT > 1.1;
    } else this.wrongWay = false;
  }

  classification() {
    const leader = this.ranked ? this.ranked[0] : this.player;
    return (this.ranked || [this.player]).map(e => ({
      pos: e.pos, name: e.name, short: e.short, team: e.team,
      isPlayer: !!e.isPlayer,
      finished: e.finished,
      gapMs: e.finished && leader.finished ? e.finishTime - leader.finishTime : null,
      bestLap: e.lastLapMs,
    }));
  }

  // gaps around the player, in seconds
  gaps() {
    if (!this.ranked || this.mode !== 'race') return null;
    const i = this.ranked.indexOf(this.player);
    const out = {};
    const spd = Math.max(this.player.physics.speed, 25);
    if (i > 0) out.ahead = { e: this.ranked[i - 1], s: (this.ranked[i - 1].progress - this.player.progress) / spd };
    if (i < this.ranked.length - 1) out.behind = { e: this.ranked[i + 1], s: (this.player.progress - this.ranked[i + 1].progress) / spd };
    return out;
  }

  reset() {
    const p = this.player.physics;
    const frac = p.info ? p.info.frac : 0;
    p.placeAt(frac, 0);
    p.drsOpen = false;
    this.player.cp = [false, false];
    this.player.prevFrac = p.info.frac;
    this.player.lapStart = this.raceTime;
    this.hud.message('已重置到赛道 · 本圈作废', 1500);
  }
}

function msFmt(ms) {
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), mil = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(mil).padStart(3, '0')}`;
}

const _f = new THREE.Vector3(), _f2 = new THREE.Vector3(), _l = new THREE.Vector3(), _l2 = new THREE.Vector3();
const _dir = new THREE.Vector3(), _tp = new THREE.Vector3();
