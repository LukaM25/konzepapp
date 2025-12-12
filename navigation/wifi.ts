import { Platform } from 'react-native';

type WifiReading = { bssid: string; level: number };

const tryLoadWifiManager = () => {
  try {
    const mod = require('react-native-wifi-reborn');
    return mod?.default ?? mod;
  } catch {
    return null;
  }
};

export const scanWifiReadings = async (): Promise<WifiReading[]> => {
  const manager = tryLoadWifiManager();
  if (!manager) return [];
  if (Platform.OS === 'android') {
    try {
      const list = await manager.loadWifiList();
      return (list ?? []).map((n: any) => ({ bssid: n.BSSID || n.bssid, level: n.level || n.RSSI || -100 }));
    } catch {
      return [];
    }
  }
  if (Platform.OS === 'ios') {
    try {
      const bssid = await manager.getBSSID?.();
      if (!bssid) return [];
      return [{ bssid, level: -50 }];
    } catch {
      return [];
    }
  }
  return [];
};

