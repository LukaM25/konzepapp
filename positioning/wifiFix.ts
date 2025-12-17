import { type WifiReading } from '../navigation/wifi';
import { type StoreMapAnchor } from '../navigation/storeMap';

export type WifiFix = {
  x: number;
  y: number;
  matched: number;
  best?: WifiReading;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const normalizeBssid = (bssid: string) => bssid.trim().toLowerCase();

export const computeWifiFix = (readings: WifiReading[], anchors: StoreMapAnchor[]): WifiFix | null => {
  const byBssid = new Map<string, StoreMapAnchor>();
  anchors.forEach((a) => byBssid.set(normalizeBssid(a.bssid), a));

  const matched = readings
    .filter((r) => r?.bssid)
    .map((r) => ({ ...r, bssid: normalizeBssid(r.bssid) }))
    .filter((r) => byBssid.has(r.bssid));

  if (!matched.length) return null;
  const best = matched.reduce((acc, r) => (r.level > acc.level ? r : acc), matched[0]);

  // Weighted centroid; RSSI is only a rough proxy for distance.
  let sumW = 0;
  let x = 0;
  let y = 0;
  for (const r of matched) {
    const a = byBssid.get(r.bssid);
    if (!a) continue;
    const w = clamp(Math.exp((clamp(r.level, -95, -35) + 100) / 10), 1, 400);
    sumW += w;
    x += a.x * w;
    y += a.y * w;
  }
  if (sumW <= 0) return null;
  return { x: x / sumW, y: y / sumW, matched: matched.length, best };
};

export const wifiConfidenceFromFix = (fix: WifiFix | null) => {
  if (!fix) return 0;
  const bestLevel = fix.best?.level ?? -90;
  const base = clamp((bestLevel + 100) / 55, 0.15, 0.95);
  const multiBoost = clamp(0.08 * (fix.matched - 1), 0, 0.2);
  return clamp(base + multiBoost, 0.15, 0.98);
};

