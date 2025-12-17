import * as React from 'react';
import { type StoreMap } from '../navigation/storeMap';
import { computeRouteProgress, polylineLength } from '../mapmatching/routeProgress';
import { type Point2 } from '../mapmatching/geometry';
import { shortestPathFromPoint, type PathResult } from './shortestPath';
import { buildManeuvers, formatNextInstruction, type Maneuver } from './turnByTurn';

export type IndoorRoute = {
  path: PathResult;
  maneuvers: Maneuver[];
  lengthMeters: number;
};

export const useIndoorNavigation = (args: {
  enabled: boolean;
  map: StoreMap;
  current: Point2 | null;
  destinationId: string | null;
  reroute: { offRouteMeters: number; persistMs: number };
}) => {
  const { enabled, map, current, destinationId } = args;
  const [route, setRoute] = React.useState<IndoorRoute | null>(null);
  const [offRoute, setOffRoute] = React.useState(false);
  const [nextInstruction, setNextInstruction] = React.useState('Select a destination');
  const [nextManeuver, setNextManeuver] = React.useState<Maneuver | null>(null);
  const [distanceToNext, setDistanceToNext] = React.useState<number | null>(null);

  const offRouteSinceRef = React.useRef<number | null>(null);
  const lastRecalcAtRef = React.useRef<number>(0);

  const recalc = React.useCallback(() => {
    if (!current || !destinationId) return null;
    const res = shortestPathFromPoint(map, current, destinationId);
    if (!res) return null;
    const maneuvers = buildManeuvers(res.points);
    const r: IndoorRoute = { path: res, maneuvers, lengthMeters: res.lengthMeters };
    setRoute(r);
    return r;
  }, [current, destinationId, map]);

  React.useEffect(() => {
    if (!enabled) {
      setRoute(null);
      setOffRoute(false);
      setNextManeuver(null);
      setDistanceToNext(null);
      setNextInstruction('Select a destination');
      offRouteSinceRef.current = null;
      return;
    }
    recalc();
  }, [enabled, destinationId, map, recalc]);

  React.useEffect(() => {
    if (!enabled || !current || !route) return;
    const progress = computeRouteProgress(route.path.points, current);
    if (!progress) return;

    const total = polylineLength(route.path.points);
    const remaining = Math.max(0, total - progress.alongMeters);
    // Find next non-start maneuver ahead of us.
    const next = route.maneuvers.find((m) => m.distanceFromStartMeters > progress.alongMeters + 0.5) ?? null;
    const distToNext = next ? Math.max(0, next.distanceFromStartMeters - progress.alongMeters) : remaining;
    setNextManeuver(next);
    setDistanceToNext(distToNext);
    setNextInstruction(formatNextInstruction(next, distToNext));

    // Off-route detection + reroute.
    const now = Date.now();
    const isOff = progress.distanceMeters > args.reroute.offRouteMeters;
    if (!isOff) {
      offRouteSinceRef.current = null;
      if (offRoute) setOffRoute(false);
      return;
    }
    if (!offRouteSinceRef.current) offRouteSinceRef.current = now;
    const persist = now - offRouteSinceRef.current;
    const should = persist > args.reroute.persistMs;
    setOffRoute(true);
    if (!should) return;
    if (now - lastRecalcAtRef.current < 1500) return;
    lastRecalcAtRef.current = now;
    recalc();
    offRouteSinceRef.current = null;
  }, [args.reroute.offRouteMeters, args.reroute.persistMs, current, enabled, offRoute, recalc, route]);

  return { route, offRoute, nextInstruction, nextManeuver, distanceToNext, recalc };
};

