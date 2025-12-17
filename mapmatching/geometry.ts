export type Point2 = { x: number; y: number };

export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export const dist = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.y - b.y);

export const projectPointToSegment = (p: Point2, a: Point2, b: Point2) => {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const denom = abx * abx + aby * aby;
  const t = denom <= 1e-9 ? 0 : clamp((apx * abx + apy * aby) / denom, 0, 1);
  const q = { x: a.x + abx * t, y: a.y + aby * t };
  const d = Math.hypot(p.x - q.x, p.y - q.y);
  return { t, point: q, distance: d };
};

export const lerpPoint = (a: Point2, b: Point2, t: number): Point2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

