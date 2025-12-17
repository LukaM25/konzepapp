import { dist, projectPointToSegment, type Point2 } from './geometry';

export type RouteProgress = {
  alongMeters: number;
  closest: Point2;
  distanceMeters: number;
  segmentIndex: number;
  t: number;
};

export const computeRouteProgress = (polyline: Point2[], point: Point2): RouteProgress | null => {
  if (polyline.length < 2) return null;
  let best: RouteProgress | null = null;
  let cumulative = 0;
  for (let i = 0; i < polyline.length - 1; i += 1) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const proj = projectPointToSegment(point, a, b);
    const segLen = dist(a, b);
    const along = cumulative + segLen * proj.t;
    if (!best || proj.distance < best.distanceMeters) {
      best = {
        alongMeters: along,
        closest: proj.point,
        distanceMeters: proj.distance,
        segmentIndex: i,
        t: proj.t,
      };
    }
    cumulative += segLen;
  }
  return best;
};

export const polylineLength = (polyline: Point2[]) =>
  polyline.reduce((acc, p, i) => (i === 0 ? 0 : acc + dist(polyline[i - 1], p)), 0);

