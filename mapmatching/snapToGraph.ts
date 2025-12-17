import { type StoreMap, type StoreMapEdge, type StoreMapNode } from '../navigation/storeMap';
import { dist, projectPointToSegment, type Point2 } from './geometry';

export type SnapResult = {
  snapped: Point2;
  distance: number;
  edge: { from: string; to: string } | null;
  t: number;
};

const nodeById = (map: StoreMap) => new Map(map.nodes.map((n) => [n.id, n] as const));

const isUsableEdge = (e: StoreMapEdge) => (e.distance ?? 0) > 1e-6 || e.bidirectional !== false;

export const snapToGraph = (
  map: StoreMap,
  point: Point2,
  opts?: {
    maxSnapMeters?: number;
    previousEdge?: { from: string; to: string } | null;
    switchPenaltyMeters?: number;
    hardClamp?: boolean;
  },
): SnapResult => {
  const maxSnapMeters = opts?.maxSnapMeters ?? 1.75;
  const prev = opts?.previousEdge ?? null;
  const switchPenaltyMeters = opts?.switchPenaltyMeters ?? 0.35;
  const hardClamp = opts?.hardClamp ?? false;

  const nodes = nodeById(map);
  const edges = (map.edges ?? []).filter(isUsableEdge);

  let best: SnapResult | null = null;
  for (const e of edges) {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    if (!a || !b) continue;
    const segA = { x: a.x, y: a.y };
    const segB = { x: b.x, y: b.y };
    const proj = projectPointToSegment(point, segA, segB);
    const edgeId = { from: e.from, to: e.to };
    const isPrev =
      prev &&
      ((prev.from === edgeId.from && prev.to === edgeId.to) || (prev.from === edgeId.to && prev.to === edgeId.from));
    const isConnectedToPrev = !!(
      prev &&
      (prev.from === edgeId.from ||
        prev.from === edgeId.to ||
        prev.to === edgeId.from ||
        prev.to === edgeId.to)
    );
    const penalty = isPrev ? 0 : isConnectedToPrev ? 0.08 : switchPenaltyMeters;
    const score = proj.distance + penalty;
    if (!best || score < best.distance + (best.edge && prev ? (isConnectedToPrev ? 0.08 : switchPenaltyMeters) : 0)) {
      best = { snapped: proj.point, distance: proj.distance, edge: edgeId, t: proj.t };
    }
  }

  if (!best) return { snapped: point, distance: Number.POSITIVE_INFINITY, edge: null, t: 0 };
  if (!hardClamp && best.distance > maxSnapMeters) return { snapped: point, distance: best.distance, edge: best.edge, t: best.t };
  return best;
};

export const nearestNodeId = (map: StoreMap, point: Point2, types?: StoreMapNode['type'][]): string | null => {
  let bestId: string | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const n of map.nodes) {
    if (types && !types.includes(n.type)) continue;
    const d = dist(point, { x: n.x, y: n.y });
    if (d < best) {
      best = d;
      bestId = n.id;
    }
  }
  return bestId;
};
