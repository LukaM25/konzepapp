import * as React from 'react';
import { Platform } from 'react-native';
import { DeviceMotion, Magnetometer, Pedometer } from 'expo-sensors';
import { scanWifi } from '../navigation/wifi';
import { type StoreMap, type StoreMapAnchor } from '../navigation/storeMap';
import { snapToGraph, type SnapResult } from '../mapmatching/snapToGraph';
import { lowPassHeading, wrapHeading, clamp } from './pdrMath';
import { PdrEngine, type MotionDebug, type SensorHealth, type StepSource } from './pdrEngine';
import { computeWifiFix, wifiConfidenceFromFix, type WifiFix } from './wifiFix';
import { createKalman2D, kalmanPosSigma, predictKalman2D, updateKalman2D, type Kalman2DState } from '../fusion/kalman2d';

export type Pose2D = { x: number; y: number; headingDeg: number; ts: number; source: 'pdr' | 'pdr_wifi'; snapped: boolean };

export type IndoorPositioningState = {
  pose: Pose2D | null;
  rawPose: Pose2D | null;
  path: { x: number; y: number }[];
  steps: number;
  motion: MotionDebug;
  sensors: SensorHealth;
  pdrConfidence: 'good' | 'ok' | 'low';
  wifi: {
    enabled: boolean;
    status: 'mock' | 'live' | 'off';
    note: string | null;
    lastScanAt: number | null;
    lastCount: number;
    fix: WifiFix | null;
    confidence: number;
    anchor: StoreMapAnchor | null;
  };
};

export type IndoorPositioningActions = {
  resetTo: (p: { x: number; y: number }) => void;
  setStrideScale: (next: number) => void;
  alignHeadingToMag: () => void;
  scanWifiNow: () => Promise<void>;
  setWifiEnabled: (enabled: boolean) => void;
};

const defaultMotion: MotionDebug = {
  accelMag: 0,
  accelBaseline: 0,
  accelDiff: 0,
  stepThreshold: 0.12,
  stepLength: 0.6,
  lastStepAt: null,
  lastIntervalMs: 0,
  isStationary: true,
  stepSource: 'none',
  deviceMotionLinAccMag: 0,
  pedometerSteps: 0,
  deviceSteps: 0,
};

const defaultSensors: SensorHealth = {
  mag: { available: null, lastAt: null },
  deviceMotion: { available: null, lastAt: null },
  pedometer: { available: null, lastAt: null },
};

export const useIndoorPositioning = (args: {
  enabled: boolean;
  map: StoreMap;
  start: { x: number; y: number };
  strideScale?: number;
  wifiEnabled?: boolean;
  wifiScanIntervalMs?: number;
  snap?: { maxSnapMeters: number; hardClamp?: boolean; switchPenaltyMeters?: number };
}) => {
  const wifiEnabled = (args.wifiEnabled ?? true) && Platform.OS !== 'ios';
  const wifiScanIntervalMs = args.wifiScanIntervalMs ?? 3500;
  const maxSnapMeters = args.snap?.maxSnapMeters ?? 1.75;
  const hardClamp = args.snap?.hardClamp ?? false;
  const switchPenaltyMeters = args.snap?.switchPenaltyMeters ?? 0.35;

  const engineRef = React.useRef<PdrEngine>(new PdrEngine());
  const prevEdgeRef = React.useRef<SnapResult['edge']>(null);
  const kalmanRef = React.useRef<Kalman2DState | null>(null);
  const strideScaleRef = React.useRef(args.strideScale ?? 1);
  const headingSmoothedRef = React.useRef(0);
  const rawPosRef = React.useRef<{ x: number; y: number }>({ x: args.start.x, y: args.start.y });
  const sensorsRef = React.useRef<SensorHealth>(defaultSensors);
  const lastDebugUpdateAtRef = React.useRef(0);

  const [state, setState] = React.useState<IndoorPositioningState>(() => ({
    pose: null,
    rawPose: null,
    path: [args.start],
    steps: 0,
    motion: defaultMotion,
    sensors: defaultSensors,
    pdrConfidence: 'ok',
    wifi: {
      enabled: wifiEnabled,
      status: wifiEnabled ? 'mock' : 'off',
      note: null,
      lastScanAt: null,
      lastCount: 0,
      fix: null,
      confidence: 0,
      anchor: null,
    },
  }));

  const setStrideScale = React.useCallback((next: number) => {
    const v = clamp(next, 0.6, 1.5);
    strideScaleRef.current = v;
    engineRef.current.strideScale = v;
  }, []);

  const alignHeadingToMag = React.useCallback(() => {
    const mag = wrapHeading(engineRef.current.magHeadingDeg);
    engineRef.current.headingDeg = mag;
    engineRef.current.gyroHeadingDeg = mag;
    headingSmoothedRef.current = mag;
    setState((s) => {
      if (!s.pose) return s;
      const ts = Date.now();
      const nextPose: Pose2D = { ...s.pose, headingDeg: mag, ts };
      const nextRaw: Pose2D | null = s.rawPose ? { ...s.rawPose, headingDeg: mag, ts } : null;
      return { ...s, pose: nextPose, rawPose: nextRaw };
    });
  }, []);

  const resetTo = React.useCallback((p: { x: number; y: number }) => {
    const now = Date.now();
    prevEdgeRef.current = null;
    engineRef.current.reset({ headingDeg: 0, strideScale: strideScaleRef.current });
    headingSmoothedRef.current = 0;
    rawPosRef.current = { x: p.x, y: p.y };
    kalmanRef.current = wifiEnabled ? createKalman2D(p, 1.5) : null;
    setState((s) => ({
      ...s,
      pose: { x: p.x, y: p.y, headingDeg: 0, ts: now, source: wifiEnabled ? 'pdr_wifi' : 'pdr', snapped: false },
      rawPose: { x: p.x, y: p.y, headingDeg: 0, ts: now, source: wifiEnabled ? 'pdr_wifi' : 'pdr', snapped: false },
      path: [p],
      steps: 0,
      wifi: { ...s.wifi, fix: null, confidence: 0, anchor: null },
    }));
  }, [wifiEnabled]);

  React.useEffect(() => {
    setStrideScale(args.strideScale ?? 1);
  }, [args.strideScale, setStrideScale]);

  React.useEffect(() => {
    setState((s) => ({
      ...s,
      wifi: { ...s.wifi, enabled: wifiEnabled, status: wifiEnabled ? s.wifi.status : 'off', note: wifiEnabled ? s.wifi.note : null },
    }));
    if (!wifiEnabled) {
      kalmanRef.current = null;
    } else if (!kalmanRef.current) {
      const base = rawPosRef.current;
      kalmanRef.current = createKalman2D({ x: base.x, y: base.y }, 2.5);
    }
  }, [wifiEnabled]);

  const applyPoseUpdate = React.useCallback(
    (raw: { x: number; y: number; headingDeg: number; ts: number; source: Pose2D['source'] }) => {
      rawPosRef.current = { x: raw.x, y: raw.y };
      const snapped = snapToGraph(args.map, raw, {
        maxSnapMeters,
        previousEdge: prevEdgeRef.current,
        hardClamp,
        switchPenaltyMeters,
      });
      prevEdgeRef.current = snapped.edge;

      // Heading smoothing (for the cone + follow camera).
      const prevH = headingSmoothedRef.current;
      const nextH = wrapHeading(raw.headingDeg);
      const alpha = 0.18;
      const hSmooth = lowPassHeading(prevH, nextH, alpha);
      headingSmoothedRef.current = hSmooth;

      setState((s) => {
        const p = snapped.snapped;
        const nextPose: Pose2D = { x: p.x, y: p.y, headingDeg: hSmooth, ts: raw.ts, source: raw.source, snapped: snapped.distance <= maxSnapMeters };
        const nextRaw: Pose2D = { x: raw.x, y: raw.y, headingDeg: raw.headingDeg, ts: raw.ts, source: raw.source, snapped: false };
        const nextPath = [...s.path, { x: nextPose.x, y: nextPose.y }].slice(-240);
        return { ...s, pose: nextPose, rawPose: nextRaw, path: nextPath };
      });
    },
    [args.map, hardClamp, maxSnapMeters, switchPenaltyMeters],
  );

  const onStep = React.useCallback(
    (source: StepSource, stepLenMeters: number, now: number, count = 1) => {
      const base = kalmanRef.current ? { x: kalmanRef.current.x, y: kalmanRef.current.y } : rawPosRef.current;
      const heading = engineRef.current.headingDeg;
      const hRad = (heading * Math.PI) / 180;
      const dx = Math.sin(hRad) * stepLenMeters;
      const dy = -Math.cos(hRad) * stepLenMeters;
      const total = Math.min(count, 20);
      for (let i = 0; i < total; i += 1) {
        if (kalmanRef.current) predictKalman2D(kalmanRef.current, { x: dx, y: dy }, 0.22 + 0.08 * (1 - engineRef.current.magReliability));
      }
      const pos = kalmanRef.current ? { x: kalmanRef.current.x, y: kalmanRef.current.y } : { x: base.x + dx * total, y: base.y + dy * total };

      setState((s) => ({ ...s, steps: s.steps + total, motion: { ...s.motion, stepSource: source, lastStepAt: now } }));
      applyPoseUpdate({ x: pos.x, y: pos.y, headingDeg: heading, ts: now, source: kalmanRef.current ? 'pdr_wifi' : 'pdr' });
    },
    [applyPoseUpdate],
  );

  const scanWifiNow = React.useCallback(async () => {
    if (!wifiEnabled) return;
    if (Platform.OS === 'web') {
      setState((s) => ({
        ...s,
        wifi: { ...s.wifi, status: 'off', note: 'Wi‑Fi scan not available on web.', lastScanAt: Date.now(), lastCount: 0, fix: null, confidence: 0, anchor: null },
      }));
      return;
    }
    const now = Date.now();
    try {
      const res = await scanWifi();
      const anchors = args.map.anchors ?? [];
      const readings = res.readings.filter((r) => r?.bssid);
      const fix = readings.length && anchors.length ? computeWifiFix(readings, anchors) : null;
      const conf = wifiConfidenceFromFix(fix);
      const bestBssid = fix?.best?.bssid?.toLowerCase() ?? '';
      const bestAnchor = bestBssid ? anchors.find((a) => a.bssid.trim().toLowerCase() === bestBssid) ?? null : null;

      setState((s) => ({
        ...s,
        wifi: {
          ...s.wifi,
          lastScanAt: now,
          lastCount: res.readings.length,
          note: res.status === 'ok' ? null : res.message ?? 'Wi‑Fi scan failed.',
          status: fix ? 'live' : 'off',
          fix,
          confidence: fix ? conf : 0,
          anchor: fix ? (bestAnchor ?? { bssid: bestBssid, label: `Wi‑Fi (${fix.matched})`, x: fix.x, y: fix.y, floor: 0, source: 'live', confidence: conf }) : null,
        },
      }));

      if (!fix) return;
      if (!kalmanRef.current) kalmanRef.current = createKalman2D({ x: fix.x, y: fix.y }, 3);

      const current = { x: kalmanRef.current.x, y: kalmanRef.current.y };
      const d = Math.hypot(current.x - fix.x, current.y - fix.y);
      const hardReset = d > 10 && conf > 0.75;
      if (hardReset) {
        kalmanRef.current = createKalman2D({ x: fix.x, y: fix.y }, 1.5);
      } else {
        const measSigma = clamp(6 - conf * 5.2, 1.2, 6);
        updateKalman2D(kalmanRef.current, { x: fix.x, y: fix.y }, measSigma);
      }

      const heading = engineRef.current.headingDeg;
      applyPoseUpdate({ x: kalmanRef.current.x, y: kalmanRef.current.y, headingDeg: heading, ts: now, source: 'pdr_wifi' });
    } catch (e: any) {
      setState((s) => ({
        ...s,
        wifi: { ...s.wifi, lastScanAt: now, lastCount: 0, note: String(e?.message || e), status: 'off', fix: null, confidence: 0, anchor: null },
      }));
    }
  }, [applyPoseUpdate, args.map.anchors, args.map, wifiEnabled]);

  React.useEffect(() => {
    if (!args.enabled) return;
    resetTo(args.start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.enabled, args.start.x, args.start.y]);

  React.useEffect(() => {
    if (!args.enabled) return;
    let magSub: any;
    let devMotionSub: any;
    let pedSub: any;
    let wifiTimer: any;
    let cancelled = false;

    const updateSensors = (patch: Partial<SensorHealth>) => {
      sensorsRef.current = { ...sensorsRef.current, ...patch };
      setState((s) => ({ ...s, sensors: sensorsRef.current }));
    };

    const start = async () => {
      const [devOk, magOk, pedOk] = await Promise.all([
        DeviceMotion.isAvailableAsync().catch(() => false),
        Magnetometer.isAvailableAsync().catch(() => false),
        Pedometer.isAvailableAsync().catch(() => false),
      ]);
      if (cancelled) return;
      updateSensors({
        deviceMotion: { ...sensorsRef.current.deviceMotion, available: devOk },
        mag: { ...sensorsRef.current.mag, available: magOk },
        pedometer: { ...sensorsRef.current.pedometer, available: pedOk },
      });

      if (magOk) {
        try {
          Magnetometer.setUpdateInterval(200);
          magSub = Magnetometer.addListener((m) => {
            const now = Date.now();
            engineRef.current.handleMagnetometer(m);
            updateSensors({ mag: { ...sensorsRef.current.mag, lastAt: now, available: true } });
          });
        } catch (e: any) {
          updateSensors({ mag: { ...sensorsRef.current.mag, available: false, error: String(e?.message || e) } });
        }
      }

      if (devOk) {
        try {
          DeviceMotion.setUpdateInterval(50);
          devMotionSub = DeviceMotion.addListener((m) => {
            const now = Date.now();
            const debug = engineRef.current.handleDeviceMotion(m as any, now, (src, stepLen, ts) => onStep(src, stepLen, ts, 1));
            updateSensors({ deviceMotion: { ...sensorsRef.current.deviceMotion, lastAt: now, available: true } });

            // Quality signal, surfaced as a coarse confidence tier.
            const stepRecent = debug.lastStepAt ? now - debug.lastStepAt < 1800 : false;
            let pdrScore = 0.35;
            if (stepRecent) pdrScore += 0.25;
            if (!debug.isStationary) pdrScore += 0.1;
            pdrScore += (engineRef.current.magReliability - 0.5) * 0.35;
            if (Math.abs(engineRef.current.yawRateDegPerSec) > 280) pdrScore -= 0.08;
            const conf: 'good' | 'ok' | 'low' = pdrScore > 0.72 ? 'good' : pdrScore > 0.45 ? 'ok' : 'low';

            // Keep UI updates throttled.
            if (now - lastDebugUpdateAtRef.current > 150) {
              lastDebugUpdateAtRef.current = now;
              setState((s) => ({
                ...s,
                motion: { ...debug, stepLength: engineRef.current.stepLengthMeters },
                pdrConfidence: conf,
              }));
            }
          });
        } catch (e: any) {
          updateSensors({ deviceMotion: { ...sensorsRef.current.deviceMotion, available: false, error: String(e?.message || e) } });
        }
      }

      if (pedOk) {
        try {
          const perm = await Pedometer.getPermissionsAsync().catch(() => null);
          if (perm && !perm.granted && perm.canAskAgain) await Pedometer.requestPermissionsAsync().catch(() => null);
          const perm2 = await Pedometer.getPermissionsAsync().catch(() => null);
          updateSensors({ pedometer: { ...sensorsRef.current.pedometer, available: true, permission: perm2 ? String(perm2.status) : undefined } });
          pedSub = Pedometer.watchStepCount(({ steps }) => {
            const now = Date.now();
            const recentlyDeviceMotion = engineRef.current.lastStepAt > 0 && now - engineRef.current.lastStepAt < 1800;
            engineRef.current.handlePedometerSteps(steps, now, recentlyDeviceMotion, (src, stepLen, ts, count) => onStep(src, stepLen, ts, count));
            setState((s) => ({ ...s, motion: { ...s.motion, pedometerSteps: steps } }));
            updateSensors({ pedometer: { ...sensorsRef.current.pedometer, lastAt: now, available: true } });
          });
        } catch (e: any) {
          updateSensors({ pedometer: { ...sensorsRef.current.pedometer, available: false, error: String(e?.message || e) } });
        }
      }

      if (wifiEnabled) {
        wifiTimer = setInterval(() => scanWifiNow().catch(() => {}), wifiScanIntervalMs);
        scanWifiNow().catch(() => {});
      }
    };

    start();
    return () => {
      cancelled = true;
      magSub?.remove?.();
      devMotionSub?.remove?.();
      pedSub?.remove?.();
      if (wifiTimer) clearInterval(wifiTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.enabled, args.map.id, onStep, scanWifiNow, wifiEnabled, wifiScanIntervalMs]);

  const setWifiEnabled = React.useCallback(
    (enabled: boolean) => {
      setState((s) => ({ ...s, wifi: { ...s.wifi, enabled } }));
    },
    [],
  );

  const actions: IndoorPositioningActions = React.useMemo(
    () => ({
      resetTo,
      setStrideScale,
      alignHeadingToMag,
      scanWifiNow,
      setWifiEnabled,
    }),
    [alignHeadingToMag, resetTo, scanWifiNow, setStrideScale, setWifiEnabled],
  );

  return {
    state,
    actions,
  };
};
