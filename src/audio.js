// Fully procedural WebAudio: layered-oscillator engine note pitched by RPM,
// wind rush, tire screech, kerb rumble, gearshift blips, start-light beeps.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.started = false;
  }

  init() {
    if (this.started) return;
    this.started = true;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);

    // ---- engine: saw + detuned saw + sub square through soft clip + LPF ----
    this.engineGain = ctx.createGain(); this.engineGain.gain.value = 0;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 1.8); }
    shaper.curve = curve;
    this.engineLPF = ctx.createBiquadFilter();
    this.engineLPF.type = 'lowpass'; this.engineLPF.frequency.value = 2200; this.engineLPF.Q.value = 0.6;
    this.engineGain.connect(shaper).connect(this.engineLPF).connect(this.master);

    this.oscA = ctx.createOscillator(); this.oscA.type = 'sawtooth';
    this.oscB = ctx.createOscillator(); this.oscB.type = 'sawtooth'; this.oscB.detune.value = 14;
    this.oscC = ctx.createOscillator(); this.oscC.type = 'square';
    const gA = ctx.createGain(); gA.gain.value = 0.5;
    const gB = ctx.createGain(); gB.gain.value = 0.35;
    const gC = ctx.createGain(); gC.gain.value = 0.22;
    this.oscA.connect(gA).connect(this.engineGain);
    this.oscB.connect(gB).connect(this.engineGain);
    this.oscC.connect(gC).connect(this.engineGain);
    this.oscA.start(); this.oscB.start(); this.oscC.start();

    // ---- shared noise buffer ----
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const noiseSrc = (filterType, freq, q = 1) => {
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { src, f, g };
    };
    this.wind = noiseSrc('lowpass', 620);
    this.skid = noiseSrc('bandpass', 780, 2.2);
    this.kerb = noiseSrc('lowpass', 90);
    this.gravel = noiseSrc('bandpass', 300, 0.8);
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  update(dt, { rpm = 0, throttle = 0, speed01 = 0, slide = 0, onKerb = false, onGrass = false, cockpit = false }) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const f = 68 + rpm * rpm * 490 + rpm * 160;
    this.oscA.frequency.setTargetAtTime(f, t, 0.03);
    this.oscB.frequency.setTargetAtTime(f * 1.5, t, 0.03);
    this.oscC.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    const vol = (0.05 + throttle * 0.115 + rpm * 0.05) * (cockpit ? 1.25 : 1);
    this.engineGain.gain.setTargetAtTime(vol, t, 0.05);
    this.engineLPF.frequency.setTargetAtTime(900 + rpm * 4200 + throttle * 800, t, 0.08);
    this.wind.g.gain.setTargetAtTime(speed01 * speed01 * 0.30, t, 0.1);
    this.skid.g.gain.setTargetAtTime(Math.min(slide, 1) * 0.22, t, 0.05);
    this.skid.f.frequency.setTargetAtTime(650 + slide * 260, t, 0.05);
    this.kerb.g.gain.setTargetAtTime(onKerb ? 0.5 * Math.min(speed01 * 2.5, 1) : 0, t, 0.03);
    this.gravel.g.gain.setTargetAtTime(onGrass ? 0.32 * Math.min(speed01 * 3, 1) : 0, t, 0.05);
  }

  blip(freq, dur = 0.1, vol = 0.25, type = 'sine', when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  shift() { this.blip(2200, 0.05, 0.10, 'square'); }
  lightOn() { this.blip(620, 0.16, 0.22); }
  lightsOut() { this.blip(980, 0.5, 0.3); }
  lapDone(best) {
    this.blip(880, 0.1, 0.22); this.blip(1175, 0.14, 0.22, 'sine', 0.11);
    if (best) this.blip(1568, 0.2, 0.24, 'sine', 0.24);
  }
  wallHit(intensity) {
    if (!this.ctx || this.muted) return;
    const v = Math.min(0.4, intensity * 0.05);
    this.blip(90, 0.18, v, 'triangle');
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    // short white-noise burst
    const len = this.ctx.sampleRate * 0.12;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = v * 1.4;
    src.connect(g).connect(this.master);
    src.start(t);
  }
}
