import { PermissionsAndroid, Platform } from 'react-native';

export type WifiReading = { bssid: string; level: number };

const tryLoadWifiManager = () => {
  try {
    const mod = require('react-native-wifi-reborn');
    return mod?.default ?? mod;
  } catch {
    return null;
  }
};

export type WifiScanStatus = 'ok' | 'unavailable' | 'permission_denied' | 'error';
export type WifiScanResult = { readings: WifiReading[]; status: WifiScanStatus; message?: string };

type AndroidPermission = (typeof PermissionsAndroid.PERMISSIONS)[keyof typeof PermissionsAndroid.PERMISSIONS];

const ensureAndroidWifiScanPermissions = async (): Promise<{ granted: boolean; message?: string }> => {
  if (Platform.OS !== 'android') return { granted: true };
  const api = typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version);
  const perms: AndroidPermission[] = [];

  // Most devices still require location permission for Wi-Fi scan results.
  perms.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);

  // Android 13+ introduces NEARBY_WIFI_DEVICES for Wi‑Fi scan access.
  if (api >= 33) {
    const nearby = ((PermissionsAndroid.PERMISSIONS as any).NEARBY_WIFI_DEVICES ??
      'android.permission.NEARBY_WIFI_DEVICES') as AndroidPermission;
    perms.push(nearby);
  }

  const results = (await PermissionsAndroid.requestMultiple(perms as any)) as Record<
    string,
    (typeof PermissionsAndroid.RESULTS)[keyof typeof PermissionsAndroid.RESULTS]
  >;
  const denied = perms.filter((p) => results[String(p)] !== PermissionsAndroid.RESULTS.GRANTED);
  if (denied.length) {
    const neverAsk = denied.some((p) => results[String(p)] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
    return {
      granted: false,
      message: neverAsk
        ? 'Wi‑Fi Scan permission blocked (enable in Settings).'
        : 'Wi‑Fi Scan permission denied.',
    };
  }
  return { granted: true };
};

export const scanWifi = async (): Promise<WifiScanResult> => {
  const manager = tryLoadWifiManager();
  if (!manager) return { readings: [], status: 'unavailable', message: 'Wi‑Fi module unavailable (use a dev client build).' };
  if (Platform.OS === 'android') {
    const perm = await ensureAndroidWifiScanPermissions().catch((e) => ({
      granted: false,
      message: `Permission error: ${String((e as any)?.message || e)}`,
    }));
    if (!perm.granted) return { readings: [], status: 'permission_denied', message: perm.message };
  }
  if (Platform.OS === 'android') {
    try {
      const list = await manager.loadWifiList();
      const readings = (list ?? []).map((n: any) => ({ bssid: n.BSSID || n.bssid, level: n.level || n.RSSI || -100 }));
      return { readings, status: 'ok' };
    } catch {
      return { readings: [], status: 'error', message: 'Wi‑Fi scan failed (check Location services are ON).' };
    }
  }
  if (Platform.OS === 'ios') {
    try {
      const bssid = await manager.getBSSID?.();
      if (!bssid) return { readings: [], status: 'ok' };
      return { readings: [{ bssid, level: -50 }], status: 'ok' };
    } catch {
      return { readings: [], status: 'error', message: 'Wi‑Fi scan failed.' };
    }
  }
  return { readings: [], status: 'unavailable', message: 'Wi‑Fi scan not supported on this platform.' };
};

// Backwards-compatible helper: older UI expects just an array.
export const scanWifiReadings = async (): Promise<WifiReading[]> => {
  const result = await scanWifi();
  return result.readings;
};
