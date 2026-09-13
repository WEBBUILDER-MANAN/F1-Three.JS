// Realistic, highly stable multi-variable vehicle dynamics physics model.
import * as THREE from 'three';

const G = 9.81;

export const CAR = {
  mass: 798,
  inertia: 1550,       // Balanced yaw inertia for natural cornering feel
  a: 1.80,           // CG -> front axle
  b: 1.80,           // CG -> rear axle
  h: 0.38,           // Center of Gravity height for load transfer
  trackWidth: 1.62,  // Lateral wheelbase
  power: 760000,     // Power rating in W (~1020 hp)
  fMax: 17200,       // Launch force cap
  drag: 1.08,        // Aerodynamic drag force constant
  rolling: 175,
  downforce: 3.45,   // Aerodynamic downforce scaling coefficient
  aeroBalance: 0.47,
  weightFront: 0.48,
  mu: 1.88,
  muBrake: 2.05,
  cornerStiffF: 14.5,
  cornerStiffR: 16.5,
  steerMax: 0.38, steerMin: 0.065, steerFade: 0.0028,
  brakeForceMax: 44000,
  brakeBias: 0.57,
};

export const GEARS = [
  { top: 28 }, { top: 39 }, { top: 50 }, { top: 61 },
  { top: 71 }, { top: 80 }, { top: 88 }, { top: 96 },
];

const SURFACES = {
  road: { mu: 1.0, drag: 0 },
  kerb: { mu: 0.92, drag: 25 },
  grass: { mu: 0.50, drag: 22 },
  gravel: { mu: 0.40, drag: 35 },
};

export class CarPhysics {
  constructor(track) {
    this.track = track;
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.vx = 0; this.vy = 0; this.yawRate = 0;
    this.steer = 0; this.steerTarget = 0;
    this.throttle = 0; this.brake = 0;
    this.gear = 1; this.rpm = 0.35;
    this.drsOpen = false; this.drsAvailable = false;
    this.surface = 'road';
    this.slipFront = 0; this.slipRear = 0;
    this.latG = 0; this.longG = 0;
    this.smoothLongG = 0;
    this.smoothLatG = 0;
    this.tireTemp = 85.0; // Ideal tire temperature baseline (°C)
    this.lastIdx = 0;
    this.info = null;
    this.wallHit = 0;
    this.locked = true;
    this.wheelSpin = 0;
    this.gearShiftT = 0;
    this.groundY = 0; this.groundPitch = 0; this.groundRoll = 0;
  }

  _snapshotInfo(q) {
    if (!q) return this.info;
    this.info = Object.assign(this.info && this.info._own ? this.info : { _own: true }, q);
    return this.info;
  }

  placeAt(frac, latOffset = 0) {
    if (!this.track) return;
    const t = this.track;
    const s = ((frac % 1) + 1) % 1 * t.length;
    const smp = t.sampleAt ? t.sampleAt(s) : { p: new THREE.Vector3(), n: new THREE.Vector3(1,0,0), t: new THREE.Vector3(0,0,1), idx: 0, y: 0 };
    
    this.pos.copy(smp.p).addScaledVector(smp.n, latOffset);
    this.pos.y = smp.p.y || 0;
    this.heading = Math.atan2(smp.t.x, smp.t.z);
    this.vx = this.vy = this.yawRate = 0;
    this.steer = this.steerTarget = 0;
    this.gear = 1; this.rpm = 0.35;
    this.smoothLongG = 0;
    this.smoothLatG = 0;
    this.lastIdx = smp.idx || 0;
    
    if (this.track.query) {
      this._snapshotInfo(this.track.query(this.pos, this.lastIdx));
    }
  }

  get speed() { return Math.hypot(this.vx, this.vy); }
  get speedKmh() { return this.speed * 3.6; }

  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  left(out = new THREE.Vector3()) { return out.set(Math.cos(this.heading), 0, -Math.sin(this.heading)); }

  step(dt, input) {
    if (!this.track) return null;
    
    // Safely query track properties with fallbacks to avoid engine crashes
    let qRaw = this.track.query ? this.track.query(this.pos, this.lastIdx) : null;
    const q = this._snapshotInfo(qRaw || { lat: 0, kerbL: false, kerbR: false, wallL: 20, wallR: 20, y: 0, dyds: 0, idx: 0, n: new THREE.Vector3(1,0,0), t: new THREE.Vector3(0,0,1) });
    this.lastIdx = q.idx || 0;
    this.wallHit = 0;

    // Surface detection & friction calculations
    const w2 = (this.track.width || 12) / 2;
    const absLat = Math.abs(q.lat || 0);
    let surface = 'road';
    if (absLat > w2 - 0.1) {
      const kerb = q.lat > 0 ? q.kerbL : q.kerbR;
      if (kerb && absLat < w2 + 1.45) surface = 'kerb';
      else if (absLat > w2 + 0.15) surface = 'grass';
    }
    this.surface = surface;
    const surf = SURFACES[surface] || SURFACES.road;

    // Speed-dependent dynamic steer response
    const speed = Math.max(0, this.vx);
    const maxSteer = THREE.MathUtils.clamp(CAR.steerMax / (1 + speed * CAR.steerFade), CAR.steerMin, CAR.steerMax);
    this.steerTarget = input.steer * maxSteer;

    const steerLambda = input.steer === 0 ? 13.0 : 9.0;
    this.steer = THREE.MathUtils.damp(this.steer, this.steerTarget, steerLambda, dt);

    this.throttle = this.locked ? 0 : input.throttle;
    this.brake = this.locked ? 1 : input.brake;

    // Tire Temperature Dynamic Grip Compensation
    const thermalStress = (Math.abs(this.slipFront) + Math.abs(this.slipRear) + this.brake * 0.4) * (speed / 50);
    this.tireTemp = THREE.MathUtils.damp(this.tireTemp, 85.0 + thermalStress * 22.0, 0.5, dt);
    const tempFactor = 1.0 - Math.pow(Math.max(0, Math.abs(this.tireTemp - 90) - 15) / 50, 2) * 0.15;

    // Aerodynamics & Dynamic Load Transfer
    const spdSq = this.vx * this.vx + this.vy * this.vy;
    const df = CAR.downforce * spdSq * (this.drsOpen ? 0.78 : 1.0);
    
    this.smoothLongG = THREE.MathUtils.damp(this.smoothLongG, this.longG, 6.5, dt);
    this.smoothLatG = THREE.MathUtils.damp(this.smoothLatG, this.latG, 6.5, dt);
    
    const L = CAR.a + CAR.b;
    const deltaNLong = (CAR.mass * this.smoothLongG * G * CAR.h) / L;

    const Nf = Math.max(300, CAR.mass * G * CAR.weightFront + df * CAR.aeroBalance - deltaNLong);
    const Nr = Math.max(300, CAR.mass * G * (1 - CAR.weightFront) + df * (1 - CAR.aeroBalance) + deltaNLong);

    const muF = CAR.mu * surf.mu * tempFactor;
    const muR = CAR.mu * surf.mu * tempFactor;

    // Pacejka Slip Angle Forces
    const vxSafe = Math.max(Math.abs(this.vx), 1.0);
    const slipF = Math.atan2(this.vy + CAR.a * this.yawRate, vxSafe) - this.steer;
    const slipR = Math.atan2(this.vy - CAR.b * this.yawRate, vxSafe);
    this.slipFront = slipF;
    this.slipRear = slipR;

    const calcSmoothTire = (slip, N, mu, stiffness) => {
      const C = 1.25;
      const B = stiffness / C;
      const peak = mu * N;
      return -peak * Math.sin(C * Math.atan(B * slip));
    };

    const FyF = calcSmoothTire(slipF, Nf, muF, CAR.cornerStiffF);
    const FyR = calcSmoothTire(slipR, Nr, muR, CAR.cornerStiffR);

    // Drivetrain & Shift Dynamics
    const gearTop = GEARS[this.gear - 1].top;
    const gearLow = this.gear > 1 ? GEARS[this.gear - 2].top : 0;
    if (this.vx > gearTop - 0.5 && this.gear < GEARS.length) { this.gear++; this.gearShiftT = 0.08; }
    else if (this.vx < gearLow - 2.5 && this.gear > 1) { this.gear--; this.gearShiftT = 0.05; }
    
    const span = gearTop - (this.gear > 1 ? GEARS[this.gear - 2].top : 0);
    this.rpm = THREE.MathUtils.clamp(0.35 + 0.63 * (1 - Math.max(0, gearTop - this.vx) / Math.max(span, 1)), 0.3, 1);
    if (this.gearShiftT > 0) this.gearShiftT -= dt;

    let Fdrive = 0;
    if (this.throttle > 0) {
      const shiftCut = this.gearShiftT > 0 ? 0.35 : 1.0;
      const rawDrive = Math.min(CAR.power / Math.max(this.vx, 5.5), CAR.fMax) * this.throttle * shiftCut;
      const maxRearGrip = muR * Nr;
      const availTraction = Math.sqrt(Math.max(0, maxRearGrip * maxRearGrip - (0.65 * FyR) * (0.65 * FyR)));
      Fdrive = Math.min(rawDrive, availTraction + 2200);
    }

    let FbrakeTotal = 0;
    if (this.brake > 0 && Math.abs(this.vx) > 0.05) {
      FbrakeTotal = Math.min(CAR.brakeForceMax * this.brake, CAR.muBrake * surf.mu * (Nf + Nr)) * Math.sign(this.vx);
    }

    const dragF = (CAR.drag * (this.drsOpen ? 0.78 : 1.0)) * this.vx * Math.abs(this.vx)
      + CAR.rolling * Math.sign(this.vx)
      + surf.drag * this.vx;
      
    const fwd = this.forward(_f);
    const slopeF = CAR.mass * G * fwd.dot(q.t || _f) * (q.dyds || 0);

    // Forces Integration
    const ax = (Fdrive - FbrakeTotal - dragF - slopeF - FyF * Math.sin(this.steer)) / CAR.mass + this.vy * this.yawRate;
    const ay = (FyF * Math.cos(this.steer) + FyR) / CAR.mass - this.vx * this.yawRate;
    const rDot = (CAR.a * FyF * Math.cos(this.steer) - CAR.b * FyR) / CAR.inertia - (2.8 * this.yawRate);

    this.latG = (ay + this.vx * this.yawRate) / G;
    this.longG = (Fdrive - FbrakeTotal - dragF) / CAR.mass / G;

    this.vx += ax * dt;
    this.vy += ay * dt;
    this.yawRate += rDot * dt;

    this.vy = THREE.MathUtils.damp(this.vy, 0, 1.35, dt);

    const speedTotal = Math.hypot(this.vx, this.vy);
    const lowSpeedBlend = THREE.MathUtils.clamp(speedTotal / 3.5, 0, 1);
    if (lowSpeedBlend < 1.0) {
      const kinYaw = (this.vx / L) * Math.tan(this.steer);
      this.yawRate = THREE.MathUtils.lerp(kinYaw, this.yawRate, lowSpeedBlend);
      this.vy *= lowSpeedBlend;
    }

    if (this.brake > 0 && Math.abs(this.vx) < 0.3 && this.throttle === 0) {
      this.vx = 0; this.vy = 0; this.yawRate = 0;
    }

    this.heading += this.yawRate * dt;

    const F = this.forward(_f), Lf = this.left(_l);
    this.pos.addScaledVector(F, this.vx * dt).addScaledVector(Lf, this.vy * dt);

    // Wall Collisions
    if (this.track.query) {
      const q2 = this.track.query(this.pos, this.lastIdx);
      if (q2) {
        this.lastIdx = q2.idx || 0;
        const margin = 0.90;
        for (const side of [1, -1]) {
          const wall = side > 0 ? (q2.wallL || 20) : (q2.wallR || 20);
          const lat = (q2.lat || 0) * side;
          if (lat > wall - margin) {
            this.pos.addScaledVector(q2.n || Lf, -(lat - (wall - margin)) * side);
            const vWorld = _v.copy(F).multiplyScalar(this.vx).addScaledVector(Lf, this.vy);
            const vn = vWorld.dot(q2.n || Lf) * side;
            if (vn > 0) {
              this.wallHit = Math.max(this.wallHit, vn);
              vWorld.addScaledVector(q2.n || Lf, -vn * 1.2 * side);
              vWorld.multiplyScalar(Math.max(0.85, 1 - vn * 0.015));
              this.vx = vWorld.dot(F);
              this.vy = vWorld.dot(Lf);
              this.yawRate *= 0.35;
            }
          }
        }
        this.groundY = THREE.MathUtils.damp(this.groundY, q2.y || 0, 14.0, dt);
        this.pos.y = this.groundY;
        const targetPitch = Math.atan(F.dot(q2.t || F) * (q2.dyds || 0));
        this.groundPitch = THREE.MathUtils.damp(this.groundPitch, targetPitch, 12.0, dt);
      }
    }

    this.wheelSpin = this.vx / 0.35;
    return q;
  }
}

const _f = new THREE.Vector3(), _l = new THREE.Vector3(), _v = new THREE.Vector3();