import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  PanGestureHandler,
  PinchGestureHandler,
  RotationGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
  type PinchGestureHandlerGestureEvent,
  type PinchGestureHandlerStateChangeEvent,
  type RotationGestureHandlerGestureEvent,
  type RotationGestureHandlerStateChangeEvent,
} from 'react-native-gesture-handler';
import { clamp } from '../mapmatching/geometry';

export type Point2 = { x: number; y: number };

export type PoiMarker = { id: string; label: string; x: number; y: number; tone?: 'destination' | 'poi' };

export const IndoorPlan2D: React.FC<{
  source: any;
  imagePixelsPerMeter: number;
  style?: StyleProp<ViewStyle>;
  camera?: { follow?: boolean; zoom?: number; target?: Point2 | null; rotationDeg?: number };
  current?: Point2 | null;
  raw?: Point2 | null;
  headingDeg?: number;
  route?: Point2[] | null;
  pois?: PoiMarker[];
  destinationId?: string | null;
  onSelectPoi?: (id: string) => void;
  onTapMeters?: (pMeters: Point2, pImagePx: { x: number; y: number }) => void;
  onCameraChange?: (patch: { follow?: boolean; zoom?: number; target?: Point2 | null; rotationDeg?: number }) => void;
}> = ({
  source,
  imagePixelsPerMeter,
  style,
  camera,
  current,
  raw,
  headingDeg,
  route,
  pois,
  destinationId,
  onSelectPoi,
  onTapMeters,
  onCameraChange,
}) => {
  const [layout, setLayout] = React.useState<{ w: number; h: number } | null>(null);
  const resolved = Image.resolveAssetSource(source);
  const imgW = resolved?.width ?? 1;
  const imgH = resolved?.height ?? 1;
  const scale = layout ? Math.min(layout.w / imgW, layout.h / imgH) : 1;
  const dispW = imgW * scale;
  const dispH = imgH * scale;
  const offsetX = layout ? (layout.w - dispW) / 2 : 0;
  const offsetY = layout ? (layout.h - dispH) / 2 : 0;
  const ppm = Math.max(0.0001, imagePixelsPerMeter);

  const toContainer = (p: Point2) => ({
    x: offsetX + p.x * ppm * scale,
    y: offsetY + p.y * ppm * scale,
  });

  const camZoom = clamp(camera?.zoom ?? 1, 1, 6);
  const camFollow = camera?.follow ?? false;
  const camRotDeg = camera?.rotationDeg ?? 0;

  const centerMeters = React.useMemo((): Point2 | null => {
    if (!layout) return null;
    const cx = layout.w / 2;
    const cy = layout.h / 2;
    const ix = (cx - offsetX) / Math.max(0.0001, scale);
    const iy = (cy - offsetY) / Math.max(0.0001, scale);
    return { x: ix / ppm, y: iy / ppm };
  }, [layout, offsetX, offsetY, ppm, scale]);

  const targetMeters: Point2 | null = camFollow ? (camera?.target ?? current ?? null) : (camera?.target ?? null);
  const effectiveTarget = targetMeters ?? centerMeters ?? current ?? { x: 0, y: 0 };
  const targetC = toContainer(effectiveTarget);

  const center = layout ? { x: layout.w / 2, y: layout.h / 2 } : { x: 0, y: 0 };
  const rotRad = (camRotDeg * Math.PI) / 180;
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);

  const invScreenToContainerDelta = React.useCallback(
    (dxScreen: number, dyScreen: number) => {
      const dz = Math.max(0.0001, camZoom);
      const dcx = (dxScreen * cos + dyScreen * sin) / dz;
      const dcy = (-dxScreen * sin + dyScreen * cos) / dz;
      return { x: dcx, y: dcy };
    },
    [camZoom, cos, sin],
  );

  const containerToMetersDelta = React.useCallback(
    (dxContainer: number, dyContainer: number) => {
      const k = Math.max(0.0001, ppm * scale);
      return { x: dxContainer / k, y: dyContainer / k };
    },
    [ppm, scale],
  );

  const panStartTargetRef = React.useRef<Point2 | null>(null);
  const pinchStartZoomRef = React.useRef<number>(camZoom);
  const rotStartDegRef = React.useRef<number>(camRotDeg);

  const onPanStateChange = React.useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.state === State.BEGAN) {
        panStartTargetRef.current = effectiveTarget;
      }
      if (e.nativeEvent.oldState === State.ACTIVE) {
        panStartTargetRef.current = null;
      }
    },
    [effectiveTarget],
  );

  const onPan = React.useCallback(
    (e: PanGestureHandlerGestureEvent) => {
      if (!layout) return;
      if (!panStartTargetRef.current) return;
      const dx = e.nativeEvent.translationX;
      const dy = e.nativeEvent.translationY;
      const dC = invScreenToContainerDelta(dx, dy);
      const dM = containerToMetersDelta(dC.x, dC.y);
      onCameraChange?.({
        follow: false,
        target: { x: panStartTargetRef.current.x - dM.x, y: panStartTargetRef.current.y - dM.y },
      });
    },
    [containerToMetersDelta, invScreenToContainerDelta, layout, onCameraChange],
  );

  const onPinchStateChange = React.useCallback(
    (e: PinchGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.state === State.BEGAN) pinchStartZoomRef.current = camZoom;
    },
    [camZoom],
  );

  const onPinch = React.useCallback(
    (e: PinchGestureHandlerGestureEvent) => {
      const next = clamp(pinchStartZoomRef.current * e.nativeEvent.scale, 1, 6);
      onCameraChange?.({ follow: false, zoom: next });
    },
    [onCameraChange],
  );

  const onRotateStateChange = React.useCallback(
    (e: RotationGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.state === State.BEGAN) rotStartDegRef.current = camRotDeg;
    },
    [camRotDeg],
  );

  const onRotate = React.useCallback(
    (e: RotationGestureHandlerGestureEvent) => {
      const deltaDeg = (e.nativeEvent.rotation * 180) / Math.PI;
      const next = rotStartDegRef.current + deltaDeg;
      onCameraChange?.({ follow: false, rotationDeg: next });
    },
    [onCameraChange],
  );

  return (
    <View style={[styles.wrap, style]} onLayout={(e) => setLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <PanGestureHandler minDist={6} onGestureEvent={onPan} onHandlerStateChange={onPanStateChange}>
        <RotationGestureHandler onGestureEvent={onRotate} onHandlerStateChange={onRotateStateChange}>
          <PinchGestureHandler onGestureEvent={onPinch} onHandlerStateChange={onPinchStateChange}>
            <View style={{ flex: 1 }}>
              <Pressable
                style={{ flex: 1 }}
                onPress={(e) => {
                  if (!layout) return;
                  const x = e.nativeEvent.locationX;
                  const y = e.nativeEvent.locationY;

                  // Invert: screen -> container
                  const dx = x - center.x;
                  const dy = y - center.y;
                  const dC = invScreenToContainerDelta(dx, dy);
                  const cx = targetC.x + dC.x;
                  const cy = targetC.y + dC.y;

                  // container -> image px -> meters
                  const ix = Math.max(0, Math.min(imgW, (cx - offsetX) / Math.max(0.0001, scale)));
                  const iy = Math.max(0, Math.min(imgH, (cy - offsetY) / Math.max(0.0001, scale)));
                  onTapMeters?.({ x: ix / ppm, y: iy / ppm }, { x: ix, y: iy });
                }}
              >
                <View
                  style={{
                    flex: 1,
                    transform: [
                      { translateX: center.x },
                      { translateY: center.y },
                      { rotate: `${camRotDeg}deg` },
                      { scale: camZoom },
                      { translateX: -targetC.x },
                      { translateY: -targetC.y },
                    ],
                  }}
                >
                  <Image source={source} style={styles.image} resizeMode="contain" />

                  <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                    {layout ? (
                      <>
                        {route && route.length > 1
                          ? route.slice(0, -1).map((p, idx) => {
                              const next = route[idx + 1];
                              const a = toContainer(p);
                              const b = toContainer(next);
                              const dx2 = b.x - a.x;
                              const dy2 = b.y - a.y;
                              const len = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                              const angle = Math.atan2(dy2, dx2);
                              return (
                                <View
                                  key={`seg-${idx}`}
                                  style={[
                                    styles.routeSeg,
                                    {
                                      width: len,
                                      left: a.x,
                                      top: a.y,
                                      transform: [{ translateX: -len / 2 }, { rotate: `${angle}rad` }],
                                    },
                                  ]}
                                />
                              );
                            })
                          : null}

                        {pois?.map((poi) => {
                          const c = toContainer(poi);
                          const isDest = destinationId === poi.id;
                          return (
                            <Pressable
                              key={poi.id}
                              onPress={() => onSelectPoi?.(poi.id)}
                              style={[
                                styles.poi,
                                { left: c.x - 10, top: c.y - 10 },
                                isDest && styles.poiDest,
                              ]}
                              hitSlop={10}
                            >
                              <Text style={styles.poiText}>{isDest ? '★' : '•'}</Text>
                            </Pressable>
                          );
                        })}

                        {current ? (
                          (() => {
                            const c = toContainer(current);
                            const h = headingDeg ?? 0;
                            return (
                              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                                {raw
                                  ? (() => {
                                      const r = toContainer(raw);
                                      return <View style={[styles.rawDot, { left: r.x - 4, top: r.y - 4 }]} />;
                                    })()
                                  : null}
                                <View style={[styles.dot, { left: c.x - 7, top: c.y - 7 }]} />
                                <View
                                  style={[
                                    styles.cone,
                                    {
                                      left: c.x,
                                      top: c.y,
                                      transform: [
                                        { translateX: -12 },
                                        { translateY: -18 },
                                        { rotate: `${h}deg` },
                                        { translateX: 12 },
                                        { translateY: 18 },
                                      ],
                                    },
                                  ]}
                                />
                              </View>
                            );
                          })()
                        ) : null}
                      </>
                    ) : null}
                  </View>
                </View>
              </Pressable>
            </View>
          </PinchGestureHandler>
        </RotationGestureHandler>
      </PanGestureHandler>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  image: { width: '100%', height: '100%' },
  rawDot: { position: 'absolute', width: 8, height: 8, borderRadius: 5, backgroundColor: 'rgba(47,36,31,0.5)' },
  dot: { position: 'absolute', width: 14, height: 14, borderRadius: 9, backgroundColor: '#2D7FF9', borderWidth: 3, borderColor: '#fff' },
  routeSeg: { position: 'absolute', height: 5, backgroundColor: '#2D7FF9', borderRadius: 4, opacity: 0.9 },
  cone: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 30,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'rgba(45,127,249,0.22)',
  },
  poi: { position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(217,118,82,0.9)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  poiDest: { backgroundColor: 'rgba(38, 120, 225, 0.95)' },
  poiText: { color: '#fff', fontWeight: '900' },
});
