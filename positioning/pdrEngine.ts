import { headingDiff, wrapHeading, clamp } from './pdrMath';

export type StepSource = 'deviceMotion' | 'pedometer';

export type MotionDebug = {
  accelMag: number;
  accelBaseline: number;
  accelDiff: number;
  stepThreshold: number;
  stepLength: number;
  lastStepAt: number | null;
  lastIntervalMs: number;
  isStationary: boolean;
  stepSource: StepSource | 'none';
  deviceMotionLinAccMag: number;
  pedometerSteps: number;
  deviceSteps: number;
};

export type SensorHealth = {
  mag: { available: boolean | null; lastAt: number | null; error?: string };
  deviceMotion: { available: boolean | null; lastAt: number | null; error?: string };
  pedometer: { available: boolean | null; lastAt: number | null; error?: string; permission?: string };
};

const toDeg = (v: number) => (Math.abs(v) <= Math.PI * 2 + 0.5 ? (v * 180) / Math.PI : v);

export class PdrEngine {
  headingDeg = 0;
  gyroHeadingDeg = 0;
  magHeadingDeg = 0;
  yawRateDegPerSec = 0;
  magReliability = 0.5;

  strideScale = 1;
  stepLengthMeters = 0.6;
  deviceSteps = 0;
  pedometerSteps = 0;

  lastStepAt = 0;
  lastIntervalMs = 0;
  lastMotionAt: number | null = null;
  stationarySince: number | null = null;

  private magStrengthEma: number | null = null;
  private gravity = { x: 0, y: 0, z: 0, init: false };
  private linAccWindow: number[] = [];
  private peak = { inPeak: false, max: 0 };

  reset(args?: { headingDeg?: number; strideScale?: number }) {
    const h = wrapHeading(args?.headingDeg ?? 0);
    this.headingDeg = h;
    this.gyroHeadingDeg = h;
    this.magHeadingDeg = h;
    this.yawRateDegPerSec = 0;
    this.magReliability = 0.5;
    this.magStrengthEma = null;
    this.lastStepAt = 0;
    this.lastIntervalMs = 0;
    this.lastMotionAt = null;
    this.stationarySince = null;
    this.linAccWindow = [];
    this.peak = { inPeak: false, max: 0 };
    this.gravity = { x: 0, y: 0, z: 0, init: false };
    this.deviceSteps = 0;
    this.pedometerSteps = 0;
    this.strideScale = args?.strideScale ?? this.strideScale ?? 1;
    this.stepLengthMeters = 0.6 * this.strideScale;
  }

  handleMagnetometer(sample: { x?: number; y?: number; z?: number }) {
    const x = sample.x ?? 0;
    const y = sample.y ?? 0;
    const z = sample.z ?? 0;
    const strength = Math.hypot(x, y, z);
    const emaPrev = this.magStrengthEma ?? strength;
    const ema = emaPrev * 0.92 + strength * 0.08;
    this.magStrengthEma = ema;

    const dev = Math.abs(strength - ema);
    const inRange = ema > 15 && ema < 80; // µT typical range
    const stable = dev < 10;
    const relInstant = clamp((inRange ? 1 : 0.25) * (stable ? 1 : 0.5) * (1 - clamp(dev / 25, 0, 1)), 0, 1);
    this.magReliability = clamp(this.magReliability * 0.85 + relInstant * 0.15, 0, 1);

    const angle = Math.atan2(y, x) * (180 / Math.PI);
    const heading = wrapHeading(angle);
    const diff = headingDiff(heading, this.magHeadingDeg);
    const factor = 0.03 + 0.09 * this.magReliability;
    this.magHeadingDeg = wrapHeading(this.magHeadingDeg + diff * factor);
  }

  handleDeviceMotion(
    sample: any,
    now: number,
    onStep: (source: StepSource, stepLenMeters: number, now: number) => void,
  ): MotionDebug {
    const prevTs = this.lastMotionAt ?? now;
    const dt = clamp((now - prevTs) / 1000, 0.001, 0.2);
    this.lastMotionAt = now;

    // Heading from DeviceMotion rotation (alpha) + integration from yaw rate.
    const rot = sample.rotation;
    const attitudeYaw = rot && typeof rot.alpha === 'number' ? wrapHeading(toDeg(rot.alpha)) : null;
    if (attitudeYaw !== null) {
      this.gyroHeadingDeg = attitudeYaw;
      const d = headingDiff(attitudeYaw, this.headingDeg);
      this.headingDeg = wrapHeading(this.headingDeg + clamp(d, -20, 20));
    }

    const rr = sample.rotationRate as { alpha?: number; beta?: number; gamma?: number } | undefined;
    if (rr && typeof rr.alpha === 'number') {
      const yawRate = clamp(toDeg(rr.alpha), -720, 720);
      this.yawRateDegPerSec = yawRate;
      this.headingDeg = wrapHeading(this.headingDeg + yawRate * dt);
    } else {
      this.yawRateDegPerSec = 0;
    }

    const turningFast = Math.abs(this.yawRateDegPerSec) > 140;
    const gain = (0.008 + 0.05 * this.magReliability) * (turningFast ? 0.2 : 1);
    const err = headingDiff(this.magHeadingDeg, this.headingDeg);
    this.headingDeg = wrapHeading(this.headingDeg + err * gain);

    // Prefer native linear acceleration; fallback to high-pass filtered accelIncludingGravity.
    const lin = sample.acceleration;
    const incl = sample.accelerationIncludingGravity;
    let ax = 0;
    let ay = 0;
    let az = 0;
    if (lin) {
      ax = lin.x;
      ay = lin.y;
      az = lin.z;
    } else if (incl) {
      const g = this.gravity;
      if (!g.init) {
        this.gravity = { x: incl.x, y: incl.y, z: incl.z, init: true };
      } else {
        const a = 0.92;
        this.gravity = {
          x: g.x * a + incl.x * (1 - a),
          y: g.y * a + incl.y * (1 - a),
          z: g.z * a + incl.z * (1 - a),
          init: true,
        };
      }
      const gg = this.gravity;
      ax = incl.x - gg.x;
      ay = incl.y - gg.y;
      az = incl.z - gg.z;
    }

    const linMag = Math.hypot(ax, ay, az);
    this.linAccWindow.push(linMag);
    if (this.linAccWindow.length > 35) this.linAccWindow.shift();
    const w = this.linAccWindow;
    const mean = w.reduce((a, b) => a + b, 0) / (w.length || 1);
    const variance = w.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / Math.max(1, w.length - 1);
    const std = Math.sqrt(variance);
    const rawThreshold = mean + std * 2.6;
    const threshold = clamp(rawThreshold, 0.06, 1.6);

    const low = linMag < Math.max(0.02, threshold * 0.25);
    if (low) {
      if (this.stationarySince === null) this.stationarySince = now;
    } else {
      this.stationarySince = null;
    }
    const isStationary = this.stationarySince !== null && now - this.stationarySince > 600;

    // Peak detector
    if (!this.peak.inPeak) {
      if (linMag > threshold) {
        this.peak.inPeak = true;
        this.peak.max = linMag;
      }
    } else {
      this.peak.max = Math.max(this.peak.max, linMag);
      if (linMag < mean) {
        this.peak.inPeak = false;
        const minInterval = 280;
        if (now - this.lastStepAt > minInterval && this.peak.max > threshold && !isStationary) {
          this.lastIntervalMs = this.lastStepAt ? now - this.lastStepAt : 0;
          this.lastStepAt = now;
          const stepLen = Math.max(0.45, Math.min(1.05, 0.62 + (this.peak.max - threshold) * 0.18));
          this.stepLengthMeters = stepLen * this.strideScale;
          this.deviceSteps += 1;
          onStep('deviceMotion', this.stepLengthMeters, now);
        }
      }
    }

    return {
      accelMag: linMag,
      accelBaseline: mean,
      accelDiff: Math.max(0, linMag - mean),
      stepThreshold: threshold,
      stepLength: this.stepLengthMeters,
      lastStepAt: this.lastStepAt || null,
      lastIntervalMs: this.lastIntervalMs,
      isStationary,
      stepSource: 'none',
      deviceMotionLinAccMag: linMag,
      pedometerSteps: this.pedometerSteps,
      deviceSteps: this.deviceSteps,
    };
  }

  handlePedometerSteps(
    totalSteps: number,
    now: number,
    recentlyDeviceMotion: boolean,
    onStep: (source: StepSource, stepLenMeters: number, now: number, count: number) => void,
  ) {
    const prev = this.pedometerSteps;
    this.pedometerSteps = totalSteps;
    const delta = prev === 0 ? 0 : totalSteps - prev;
    if (delta > 0 && !recentlyDeviceMotion) {
      this.lastIntervalMs = this.lastStepAt ? now - this.lastStepAt : 0;
      this.lastStepAt = now;
      onStep('pedometer', this.stepLengthMeters, now, delta);
    }
  }
}

