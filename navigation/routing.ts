import { StoreMap, StoreMapNode } from './storeMap';

type Adj = Record<string, { to: string; w: number }[]>;

const distEuclid = (a: StoreMapNode, b: StoreMapNode) => Math.hypot(a.x - b.x, a.y - b.y);

const buildAdjacency = (map: StoreMap): Adj => {
  const nodesById = new Map(map.nodes.map((n) => [n.id, n]));
  const adj: Adj = {};
  map.nodes.forEach((n) => {
    adj[n.id] = [];
  });
  (map.edges ?? []).forEach((e) => {
    const from = nodesById.get(e.from);
    const to = nodesById.get(e.to);
    if (!from || !to) return;
    const w = e.distance ?? distEuclid(from, to);
    adj[e.from].push({ to: e.to, w });
    if (e.bidirectional !== false) {
      adj[e.to].push({ to: e.from, w });
    }
  });
  return adj;
};

const dijkstra = (adj: Adj, startId: string) => {
  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const q = new Set<string>();
  Object.keys(adj).forEach((id) => {
    dist[id] = id === startId ? 0 : Number.POSITIVE_INFINITY;
    prev[id] = null;
    q.add(id);
  });
  while (q.size) {
    let u: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    q.forEach((id) => {
      if (dist[id] < best) {
        best = dist[id];
        u = id;
      }
    });
    if (!u) break;
    q.delete(u);
    adj[u].forEach(({ to, w }) => {
      if (!q.has(to)) return;
      const alt = dist[u!] + w;
      if (alt < dist[to]) {
        dist[to] = alt;
        prev[to] = u;
      }
    });
  }
  return { dist, prev };
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

const buildDistanceFn = (map: StoreMap, adj: Adj) => {
  const nodesById = new Map(map.nodes.map((n) => [n.id, n] as const));
  const hasEdges = (map.edges ?? []).length > 0;
  const distCache = new Map<string, Record<string, number>>();
  return (aId: string, bId: string) => {
    if (!hasEdges) {
      const a = nodesById.get(aId);
      const b = nodesById.get(bId);
      if (!a || !b) return Number.POSITIVE_INFINITY;
      return distEuclid(a, b);
    }
    let distRow = distCache.get(aId);
    if (!distRow) {
      distRow = dijkstra(adj, aId).dist;
      distCache.set(aId, distRow);
    }
    const d = distRow[bId];
    if (Number.isFinite(d)) return d!;
    const a = nodesById.get(aId);
    const b = nodesById.get(bId);
    if (!a || !b) return Number.POSITIVE_INFINITY;
    return distEuclid(a, b);
  };
};

const nearestNeighborOrder = (pairDistance: (aId: string, bId: string) => number, startId: string, stops: string[]) => {
  const remaining = new Set(stops);
  const order: string[] = [];
  let current = startId;
  while (remaining.size) {
    let bestId: string | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    remaining.forEach((id) => {
      const d = pairDistance(current, id);
      if (d < bestDist) {
        bestDist = d;
        bestId = id;
      }
    });
    if (!bestId) break;
    order.push(bestId);
    remaining.delete(bestId);
    current = bestId;
  }
  return order;
};

const twoOptImprove = (
  pairDistance: (aId: string, bId: string) => number,
  startId: string,
  endId: string,
  route: string[],
) => {
  const full = [startId, ...route, endId];
  const cost = (seq: string[]) =>
    seq.reduce((acc, id, i) => (i === 0 ? 0 : acc + pairDistance(seq[i - 1], id)), 0);
  let best = full;
  let bestCost = cost(best);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 2; i += 1) {
      for (let k = i + 1; k < best.length - 1; k += 1) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        const c = cost(candidate);
        if (c + 1e-6 < bestCost) {
          best = candidate;
          bestCost = c;
          improved = true;
        }
      }
    }
  }
  return best.slice(1, -1);
};

export const computeRouteOrder = (
  map: StoreMap,
  startId: string,
  stopNodeIds: string[],
  endId: string,
) => {
  const uniqueStops = Array.from(new Set(stopNodeIds.filter((s) => s && s !== startId && s !== endId)));
  const adj = buildAdjacency(map);
  const pairDistance = buildDistanceFn(map, adj);
  const baseOrder = nearestNeighborOrder(pairDistance, startId, uniqueStops);
  const improved = twoOptImprove(pairDistance, startId, endId, baseOrder);
  return [startId, ...improved, endId];
};

export const computePolylineForOrder = (map: StoreMap, order: string[]) => {
  const adj = buildAdjacency(map);
  if ((map.edges ?? []).length === 0) return order;
  const prevCache = new Map<string, Record<string, string | null>>();
  const segments: string[] = [];
  for (let i = 0; i < order.length - 1; i += 1) {
    const a = order[i];
    const b = order[i + 1];
    let prev = prevCache.get(a);
    if (!prev) {
      prev = dijkstra(adj, a).prev;
      prevCache.set(a, prev);
    }
    const path = reconstruct(prev, a, b);
    path.forEach((id, idx) => {
      if (idx === 0 && segments.length) return;
      segments.push(id);
    });
  }
  return segments;
};
