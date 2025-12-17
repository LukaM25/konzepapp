import { dist, type Point2 } from '../mapmatching/geometry';

export type ManeuverType = 'start' | 'arrive' | 'left' | 'right' | 'straight' | 'uturn';

export type Maneuver = {
  type: ManeuverType;
  atIndex: number; // index into polyline
  point: Point2;
  distanceFromStartMeters: number;
  instruction: string;
};

const bearingDeg = (a: Point2, b: Point2) => {
  // 0° points to negative Y (up on the plan), 90° to +X (right)
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const rad = Math.atan2(dx, -dy);
  const deg = (rad * 180) / Math.PI;
  const h = deg % 360;
  return h < 0 ? h + 360 : h;
};

const angleDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180;

const classifyTurn = (delta: number): ManeuverType => {
  const abs = Math.abs(delta);
  if (abs < 28) return 'straight';
  if (abs > 150) return 'uturn';
  return delta > 0 ? 'right' : 'left';
};

export const buildManeuvers = (polyline: Point2[]) => {
  const maneuvers: Maneuver[] = [];
  if (polyline.length < 2) return maneuvers;

  let cumulative = 0;
  maneuvers.push({
    type: 'start',
    atIndex: 0,
    point: polyline[0],
    distanceFromStartMeters: 0,
    instruction: 'Start',
  });

  for (let i = 1; i < polyline.length - 1; i += 1) {
    const prev = polyline[i - 1];
    const cur = polyline[i];
    const next = polyline[i + 1];
    cumulative += dist(prev, cur);
    const b1 = bearingDeg(prev, cur);
    const b2 = bearingDeg(cur, next);
    const delta = angleDiff(b2, b1);
    const turn = classifyTurn(delta);
    if (turn === 'straight') continue;
    const label = turn === 'left' ? 'Turn left' : turn === 'right' ? 'Turn right' : 'Make a U-turn';
    maneuvers.push({
      type: turn,
      atIndex: i,
      point: cur,
      distanceFromStartMeters: cumulative,
      instruction: label,
    });
  }

  // Arrive
  const total = polyline.reduce((acc, p, idx) => (idx === 0 ? 0 : acc + dist(polyline[idx - 1], p)), 0);
  maneuvers.push({
    type: 'arrive',
    atIndex: polyline.length - 1,
    point: polyline[polyline.length - 1],
    distanceFromStartMeters: total,
    instruction: 'Arrive',
  });
  return maneuvers;
};

export const formatNextInstruction = (maneuver: Maneuver | null, distanceMeters: number | null) => {
  if (!maneuver) return 'Select a destination';
  if (maneuver.type === 'start') return 'Start walking';
  if (maneuver.type === 'arrive') return distanceMeters !== null && distanceMeters < 2 ? 'Arrive' : 'Continue to destination';
  if (distanceMeters === null) return maneuver.instruction;
  const m = Math.max(0, Math.round(distanceMeters));
  return `In ${m}m, ${maneuver.instruction.toLowerCase()}`;
};

