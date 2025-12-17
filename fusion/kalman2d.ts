export type Vec2 = { x: number; y: number };

export type Kalman2DState = {
  x: number;
  y: number;
  // covariance matrix [[p00,p01],[p10,p11]] with p10==p01
  p00: number;
  p01: number;
  p11: number;
};

export const createKalman2D = (start: Vec2, posSigmaMeters = 1.5): Kalman2DState => {
  const v = Math.max(1e-6, posSigmaMeters * posSigmaMeters);
  return { x: start.x, y: start.y, p00: v, p01: 0, p11: v };
};

export const predictKalman2D = (s: Kalman2DState, delta: Vec2, processSigmaMeters: number) => {
  s.x += delta.x;
  s.y += delta.y;
  const q = Math.max(1e-6, processSigmaMeters * processSigmaMeters);
  s.p00 += q;
  s.p11 += q;
};

export const updateKalman2D = (s: Kalman2DState, z: Vec2, measSigmaMeters: number) => {
  const r = Math.max(1e-6, measSigmaMeters * measSigmaMeters);
  // Innovation covariance S = P + R (R is diagonal scalar)
  const s00 = s.p00 + r;
  const s01 = s.p01;
  const s11 = s.p11 + r;
  const det = s00 * s11 - s01 * s01;
  if (det <= 1e-12) return;
  const inv00 = s11 / det;
  const inv01 = -s01 / det;
  const inv11 = s00 / det;

  // Kalman gain K = P * inv(S)
  const k00 = s.p00 * inv00 + s.p01 * inv01;
  const k01 = s.p00 * inv01 + s.p01 * inv11;
  const k10 = s.p01 * inv00 + s.p11 * inv01;
  const k11 = s.p01 * inv01 + s.p11 * inv11;

  const y0 = z.x - s.x;
  const y1 = z.y - s.y;
  s.x += k00 * y0 + k01 * y1;
  s.y += k10 * y0 + k11 * y1;

  // P = (I - K)P
  const p00 = s.p00;
  const p01 = s.p01;
  const p11 = s.p11;
  s.p00 = (1 - k00) * p00 - k01 * p01;
  s.p01 = (1 - k00) * p01 - k01 * p11;
  s.p11 = -k10 * p01 + (1 - k11) * p11;
};

export const kalmanPosSigma = (s: Kalman2DState) => Math.sqrt(Math.max(1e-9, (s.p00 + s.p11) / 2));

