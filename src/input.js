// Keyboard (WASD + arrows) and optional gamepad input with smoothed
// speed-sensitive digital steering so driving feels precise and realistic.
export class Input {
  constructor() {
    this.keys = new Set();
    this.steer = 0;          // -1..1 (+ = left)
    this.throttle = 0;
    this.brake = 0;
    this.events = [];        // one-shot: 'camera' | 'reset' | 'pause' | 'mute' | 'autopilot'
    
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (k === 'c' || k === 'v') this.events.push('camera');
      if (k === 'r') this.events.push('reset');
      if (k === 'escape') this.events.push('pause');
      if (k === 'm') this.events.push('mute');
      if (k === 'p') this.events.push('autopilot');
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    });
    
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  takeEvents() { const ev = this.events; this.events = []; return ev; }

  update(dt, currentSpeedKmh = 0) {
    const k = this.keys;
    let sTarget = 0;
    if (k.has('a') || k.has('arrowleft')) sTarget += 1;
    if (k.has('d') || k.has('arrowright')) sTarget -= 1;
    let th = (k.has('w') || k.has('arrowup')) ? 1 : 0;
    let br = (k.has('s') || k.has('arrowdown') || k.has(' ')) ? 1 : 0;

    // Gamepad overrides when active
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const ax = gp.axes[0] ?? 0;
      if (Math.abs(ax) > 0.09) sTarget = -Math.sign(ax) * Math.min(1, (Math.abs(ax) - 0.09) / 0.85);
      const rt = gp.buttons[7]?.value ?? 0, lt = gp.buttons[6]?.value ?? 0;
      if (rt > 0.04) th = rt;
      if (lt > 0.04) br = lt;
      if (gp.buttons[0]?.pressed && !this._padA) this.events.push('camera');
      this._padA = !!gp.buttons[0]?.pressed;
      if (gp.buttons[3]?.pressed && !this._padY) this.events.push('reset');
      this._padY = !!gp.buttons[3]?.pressed;
      break;
    }

    // Speed-sensitive steering response calculation
    const speedRatio = Math.min(1, Math.max(0, currentSpeedKmh / 320));
    const attack = 4.2 - speedRatio * 1.8;   // Slower steering response at extreme speeds
    const release = 7.0 + speedRatio * 2.5;  // Rapid centering at speed for control stability

    if (sTarget !== 0 && Math.sign(sTarget) !== Math.sign(this.steer) && this.steer !== 0) {
      this.steer += sTarget * (attack + release) * dt;
    } else if (sTarget !== 0) {
      this.steer += Math.sign(sTarget - this.steer) * attack * dt;
      if (Math.abs(this.steer) > Math.abs(sTarget)) this.steer = sTarget;
    } else {
      const dec = release * dt;
      this.steer = Math.abs(this.steer) <= dec ? 0 : this.steer - Math.sign(this.steer) * dec;
    }

    this.steer = Math.max(-1, Math.min(1, this.steer));
    this.throttle += Math.sign(th - this.throttle) * Math.min(Math.abs(th - this.throttle), 8 * dt);
    this.brake += Math.sign(br - this.brake) * Math.min(Math.abs(br - this.brake), 12 * dt);
  }
}