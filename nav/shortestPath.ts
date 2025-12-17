import { type StoreMap, type StoreMapEdge, type StoreMapNode } from '../navigation/storeMap';
import { dist, type Point2 } from '../mapmatching/geometry';
import { nearestNodeId, snapToGraph } from '../mapmatching/snapToGraph';

type Adj = Record<string, { to: string; w: number }[]>;

const buildAdjacency = (nodes: StoreMapNode[], edges: StoreMapEdge[] = []): Adj => {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const adj: Adj = {};
  nodes.forEach((n) => {
    adj[n.id] = [];
  });
  edges.forEach((e) => {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) return;
    const w = e.distance ?? dist(from, to);
    adj[e.from].push({ to: e.to, w });
    if (e.bidirectional !== false) adj[e.to].push({ to: e.from, w });
  });
  return adj;
};

const dijkstra = (adj: Adj, startId: string) => {
  const distMap: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const q = new Set<string>();
  Object.keys(adj).forEach((id) => {
    distMap[id] = id === startId ? 0 : Number.POSITIVE_INFINITY;
    prev[id] = null;
    q.add(id);
  });
  while (q.size) {
    let u: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    q.forEach((id) => {
      if (distMap[id] < best) {
        best = distMap[id];
        u = id;
      }
    });
    if (!u) break;
    q.delete(u);
    adj[u].forEach(({ to, w }) => {
      if (!q.has(to)) return;
      const alt = distMap[u!] + w;
      if (alt < distMap[to]) {
        distMap[to] = alt;
        prev[to] = u;
      }
    });
  }
  return { dist: distMap, prev };
};

const reconstruct = (prev: Record<string, string | null>, startId: string, endId: string) => {
  const path: string[] = [];
  let cur: string | null = endId;
  while (cur) {
    path.push(cur);
    if (cur === startId) break;
    cur = prev[cur];
  }
  return path.reverse();
};

export type PathResult = {
  nodeIds: string[];
  points: Point2[];
  lengthMeters: number;
};

export const shortestPathFromPoint = (
  map: StoreMap,
  startPoint: Point2,
  endNodeId: string,
): PathResult | null => {
  if (!map.nodes.find((n) => n.id === endNodeId)) return null;

  const snapped = snapToGraph(map, startPoint, { maxSnapMeters: 3.0 });
  const nodesById = new Map(map.nodes.map((n) => [n.id, n] as const));
  const baseEdges = map.edges ?? [];

  const virtualId = '__start__';
  const virtualNode: StoreMapNode = { id: virtualId, label: 'Start', x: snapped.snapped.x, y: snapped.snapped.y, floor: 0, type: 'walkway' };

  // Connect to nearest endpoints of the snapped edge, or fallback to nearest node.
  const virtualEdges: StoreMapEdge[] = [];
  if (snapped.edge) {
    const a = nodesById.get(snapped.edge.from);
    const b = nodesById.get(snapped.edge.to);
    if (a && b) {
      const da = dist(virtualNode, a);
      const db = dist(virtualNode, b);
      virtualEdges.push({ from: virtualId, to: a.id, distance: da, bidirectional: true });
      virtualEdges.push({ from: virtualId, to: b.id, distance: db, bidirectional: true });
    }
  } else {
    const nearest = nearestNodeId(map, startPoint);
    if (nearest) {
      const n = nodesById.get(nearest);
      if (n) virtualEdges.push({ from: virtualId, to: n.id, distance: dist(virtualNode, n), bidirectional: true });
    }
  }

  const nodes = [...map.nodes, virtualNode];
  const edges = [...baseEdges, ...virtualEdges];
  const adj = buildAdjacency(nodes, edges);
  const { prev, dist: d } = dijkstra(adj, virtualId);
  if (!Number.isFinite(d[endNodeId] ?? Number.POSITIVE_INFINITY)) return null;

  const nodeIds = reconstruct(prev, virtualId, endNodeId);
  const points: Point2[] = nodeIds.map((id) => {
    if (id === virtualId) return { x: virtualNode.x, y: virtualNode.y };
    const n = nodesById.get(id);
    return { x: n?.x ?? 0, y: n?.y ?? 0 };
  });

  let lengthMeters = 0;
  for (let i = 1; i < points.length; i += 1) lengthMeters += dist(points[i - 1], points[i]);
  return { nodeIds, points, lengthMeters };
};

