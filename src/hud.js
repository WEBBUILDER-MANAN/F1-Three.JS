// F1 / Dynamic Hybrid Telemetry HUD Engine
// Manages circular gauge arc drawing, shift LEDs, battery states, and track minimap overlays.

export function formatTime(ms) {
  if (ms == null || !isFinite(ms)) return '--:--.---';
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  const mil = Math.floor(t % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(mil).padStart(3, '0')}`;
}

export function drawTrackMap(ctx, pts, w, h, rot = 0, opts = {}) {
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  const rp = pts.map(([x, z]) => [x * cosR - z * sinR, x * sinR + z * cosR]);
  const xs = rp.map(p => p[0]), zs = rp.map(p => p[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs);
  const minz = Math.min(...zs), maxz = Math.max(...zs);
  const pad = opts.pad ?? 16;
  const scale = Math.min((w - pad * 2) / (maxx - minx || 1), (h - pad * 2) / (maxz - minz || 1));
  const ox = (w - (maxx - minx) * scale) / 2 - minx * scale;
  const oz = (h - (maxz - minz) * scale) / 2 - minz * scale;
  const map = (x, z) => [ox + (x * cosR - z * sinR) * scale, oz + (x * sinR + z * cosR) * scale];

  ctx.clearRect(0, 0, w, h);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();
  rp.forEach(([x, z], i) => {
    const px = ox + x * scale, pz = oz + z * scale;
    i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz);
  });
  ctx.closePath();

  if (opts.glow !== false) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = opts.width ? opts.width + 4 : 9;
    ctx.stroke();
  }

  ctx.strokeStyle = opts.color || '#ffffff';
  ctx.lineWidth = opts.width || 4.5;
  ctx.stroke();

  const [sx, sz] = map(pts[0][0], pts[0][1]);
  ctx.fillStyle = opts.startColor || '#ff1801';
  ctx.beginPath();
  ctx.arc(sx, sz, opts.width ? opts.width * 0.9 : 4.5, 0, Math.PI * 2);
  ctx.fill();

  return map;
}

export class Hud {
  constructor() {
    const $ = id => document.getElementById(id);

    this.el = {
      hud: $('hud'),
      menu: $('menu'),
      pause: $('pause'),
      loading: $('loading'),
      speed: $('hud-speed'),
      gear: $('hud-gear'),
      rpmVal: $('hud-rpm'),
      battVal: $('hud-batt-val'),
      battArc: $('hud-batt-arc'),
      ledBar: $('hud-led-bar'),
      mode: $('hud-mode'),
      drsLight: $('hud-drs-light'),
      time: $('hud-time'),
      last: $('hud-last'),
      best: $('hud-best'),
      lap: $('hud-lap'),
      trackName: $('hud-track-name'),
      corner: $('hud-corner'),
      camLabel: $('hud-camera-label'),
      minimap: $('minimap'),
      lights: $('lights'),
      msg: $('center-msg'),
      wrongway: $('wrongway'),
      autopilot: $('hud-autopilot'),
      pos: $('hud-pos'),
      gaps: $('hud-gaps'),
      results: $('results'),
    };

    this.mode = 'time';
    this.raceLaps = 3;
    this.mapCtx = this.el.minimap ? this.el.minimap.getContext('2d') : null;
    this.mapFn = null;
    this.msgTimer = null;
    this.cornerShown = null;
    this._lastVals = {};

    this._initLedBar();
  }

  show(id, on) {
    if (this.el[id]) {
      this.el[id].classList.toggle('hidden', !on);
    }
  }

  _initLedBar() {
    if (!this.el.ledBar) return;
    this.el.ledBar.innerHTML = '';
    this.shiftLeds = [];

    // 12 Shift LEDs (4 Green -> 4 Red -> 4 Blue)
    for (let i = 0; i < 12; i++) {
      const led = document.createElement('div');
      const color = i < 4 ? 'green' : i < 8 ? 'red' : 'blue';
      led.className = `led ${color}`;
      this.el.ledBar.appendChild(led);
      this.shiftLeds.push(led);
    }
  }

  setTrack(cfg, track) {
    if (this.el.trackName) {
      this.el.trackName.innerHTML = `${cfg.flag || ''} <b>${cfg.name || ''}</b> · ${cfg.fullName || ''}`;
    }
    this.track = track;
    this.cfg = cfg;
    this.redrawMap();
  }

  setMode(mode, laps) {
    this.mode = mode;
    this.raceLaps = laps;
    if (this.el.pos) this.el.pos.classList.toggle('hidden', mode !== 'race');
    if (this.el.gaps) this.el.gaps.classList.toggle('hidden', mode !== 'race');
  }

  redrawMap() {
    if (!this.el.minimap || !this.track?.minimap) return;
    const cv = this.el.minimap;
    this.mapBase = document.createElement('canvas');
    this.mapBase.width = cv.width;
    this.mapBase.height = cv.height;
    const bctx = this.mapBase.getContext('2d');
    this.mapFn = drawTrackMap(bctx, this.track.minimap, cv.width, cv.height, this.cfg.minimapRot, { width: 4.5 });
  }

  update(state) {
    const { physics: p, race } = state;
    if (!p) return;

    // 1. Gear Display
    const gearTxt = p.gear === 0 ? 'N' : p.gear < 0 ? 'R' : String(p.gear);
    if (this._lastVals.gear !== gearTxt && this.el.gear) {
      this.el.gear.textContent = gearTxt;
      this._lastVals.gear = gearTxt;
    }

    // 2. Speed (MPH) & RPM Readouts
    const mph = Math.round(p.speedKmh * 0.621371);
    const rpm = Math.round((p.rpm || 0) * 10500);

    if (this._lastVals.mph !== mph && this.el.speed) {
      this.el.speed.textContent = mph;
      this._lastVals.mph = mph;
    }
    if (this._lastVals.rpm !== rpm && this.el.rpmVal) {
      this.el.rpmVal.textContent = rpm;
      this._lastVals.rpm = rpm;
    }

    // 3. Circular Battery Arc Gauge (SVG Stroke-Dash Offset Math)
    const battPercent = Math.max(0, Math.min(100, p.batteryPercent ?? 49));
    if (this._lastVals.batt !== battPercent) {
      if (this.el.battVal) {
        this.el.battVal.innerHTML = `${Math.round(battPercent)}<small>%</small>`;
      }
      if (this.el.battArc) {
        const maxOffset = 264; // Empty arc
        const minOffset = 80;  // Full arc
        const offset = maxOffset - ((battPercent / 100) * (maxOffset - minOffset));
        this.el.battArc.style.strokeDashoffset = offset;
        this.el.battArc.style.stroke = battPercent < 20 ? '#ff2a2a' : '#a2e022';
      }
      this._lastVals.batt = battPercent;
    }

    // 4. Hybrid ERS Power Status (Deploying vs Harvesting)
    if (this.el.mode) {
      if (p.throttle > 0.8) {
        this.el.mode.textContent = 'DEPLOYING';
        this.el.mode.style.color = '#00bfff';
      } else if (p.brake > 0.1 || p.speedKmh > 10) {
        this.el.mode.textContent = 'HARVESTING';
        this.el.mode.style.color = '#e2fa31';
      } else {
        this.el.mode.textContent = 'BALANCED';
        this.el.mode.style.color = '#ffffff';
      }
    }

    // 5. RPM Shift LED Strip
    const rpmRatio = Math.max(0, Math.min(1, ((p.rpm || 0) - 0.35) / 0.65));
    const activeLeds = Math.floor(rpmRatio * (this.shiftLeds ? this.shiftLeds.length : 0));
    if (this.shiftLeds) {
      this.shiftLeds.forEach((led, i) => {
        led.classList.toggle('on', i < activeLeds);
      });
    }

    // 6. DRS Status Indicator Light
    if (this.el.drsLight) {
      const isDrsActive = p.drsOpen || p.drsAvailable;
      this.el.drsLight.classList.toggle('active', isDrsActive);
    }

    // 7. Lap Timing Board
    if (race) {
      if (this.el.time) this.el.time.textContent = formatTime(race.currentLapMs);

      const lapTxt = this.mode === 'race'
        ? `${Math.min(race.lapCount, this.raceLaps)} / ${this.raceLaps}`
        : String(race.lapCount);

      if (this._lastVals.lap !== lapTxt && this.el.lap) {
        this.el.lap.textContent = lapTxt;
        this._lastVals.lap = lapTxt;
      }
      if (this._lastVals.last !== race.lastLapMs && this.el.last) {
        this.el.last.textContent = formatTime(race.lastLapMs);
        this._lastVals.last = race.lastLapMs;
      }
      if (this._lastVals.best !== race.bestLapMs && this.el.best) {
        this.el.best.textContent = formatTime(race.bestLapMs);
        this._lastVals.best = race.bestLapMs;
      }

      // 8. Race Mode Positions and Gaps
      if (this.mode === 'race') {
        const posTxt = `P${race.playerPos}`;
        if (this._lastVals.pos !== posTxt && this.el.pos) {
          this.el.pos.innerHTML = `${posTxt}<i>/${race.entries ? race.entries.length : 1}</i>`;
          this._lastVals.pos = posTxt;
        }
        if (this.el.gaps && race.gaps) {
          const gaps = race.gaps();
          if (gaps) {
            const ah = gaps.ahead ? `▲ ${gaps.ahead.e.short} +${gaps.ahead.s.toFixed(1)}s` : '🏆 LEADER';
            const bh = gaps.behind ? `▼ ${gaps.behind.e.short} -${gaps.behind.s.toFixed(1)}s` : '';
            const t = `${ah}${bh ? ' · ' + bh : ''}`;
            if (this._lastVals.gaps !== t) {
              this.el.gaps.textContent = t;
              this._lastVals.gaps = t;
            }
          }
        }
      }

      this.show('wrongway', race.wrongWay);
      if (this.el.autopilot) this.el.autopilot.classList.toggle('hidden', !race.autopilotActive);
    }

    // 9. Corner Callouts
    if (this.cfg?.corners) {
      const frac = p.info ? p.info.frac : 0;
      let corner = null;
      for (const c of this.cfg.corners) {
        const d = ((frac - c.f) % 1 + 1) % 1;
        if (d < 0.017 || d > 0.997) { corner = c; break; }
        const before = ((c.f - frac) % 1 + 1) % 1;
        if (before < 0.012) { corner = c; break; }
      }
      if (corner !== this.cornerShown && this.el.corner) {
        this.cornerShown = corner;
        if (corner) {
          this.el.corner.innerHTML = `<span class="corner-cn">${corner.cn || ''}</span><span class="corner-en">${corner.n || ''}</span>`;
          this.el.corner.classList.add('visible');
        } else {
          this.el.corner.classList.remove('visible');
        }
      }
    }

    // 10. Radar Minimap Rendering
    if (this.mapCtx && this.mapFn && this.el.minimap && race?.entries) {
      const ctx = this.mapCtx;
      ctx.clearRect(0, 0, this.el.minimap.width, this.el.minimap.height);
      ctx.drawImage(this.mapBase, 0, 0);

      // Render Opponents
      for (const e of race.entries) {
        if (e.isPlayer || !e.physics) continue;
        const [ax, az] = this.mapFn(e.physics.pos.x, e.physics.pos.z);
        ctx.fillStyle = e.team?.uiColor || '#9aa2b1';
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ax, az, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Render Player Marker
      if (p.pos) {
        const [cx, cz] = this.mapFn(p.pos.x, p.pos.z);
        ctx.fillStyle = '#e2fa31';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cz, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  setCameraLabel(label) {
    if (!this.el.camLabel) return;
    this.el.camLabel.textContent = label;
    this.el.camLabel.classList.add('visible');
    clearTimeout(this._camT);
    this._camT = setTimeout(() => this.el.camLabel.classList.remove('visible'), 1600);
  }

  lights(n) {
    if (!this.el.lights) return;
    const cols = this.el.lights.querySelectorAll('.light-col');
    cols.forEach((c, i) => c.classList.toggle('on', i < n));
  }

  lightsOut() {
    if (!this.el.lights) return;
    this.el.lights.querySelectorAll('.light-col').forEach(c => c.classList.remove('on'));
    setTimeout(() => this.show('lights', false), 900);
  }

  message(html, dur = 2200, cls = '') {
    if (!this.el.msg) return;
    const el = this.el.msg;
    el.innerHTML = html;
    el.className = `visible ${cls}`;
    clearTimeout(this.msgTimer);
    if (dur > 0) this.msgTimer = setTimeout(() => { el.className = 'hidden'; }, dur);
  }
}