import React from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
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
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';

type Point2 = { x: number; y: number };

type Props = {
  model: number;
  style?: StyleProp<ViewStyle>;
  planMeters: { width: number; height: number };
  target?: Point2 | null;
  follow?: boolean;
  zoom?: number;
  headingDeg?: number;
  rotateWithHeading?: boolean;
  bearingDeg?: number;
  onCameraChange?: (patch: { follow?: boolean; zoom?: number; target?: Point2 | null; bearingDeg?: number }) => void;
  route?: Point2[] | null;
  destination?: Point2 | null;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const readArrayBufferFromUri = async (uri: string) => {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return await res.arrayBuffer();
  }
  return await new File(uri).arrayBuffer();
};

export const ModelMap3D: React.FC<Props> = ({
  model,
  style,
  planMeters,
  target,
  follow = true,
  zoom = 2,
  headingDeg = 0,
  rotateWithHeading = true,
  bearingDeg = 0,
  onCameraChange,
  route = null,
  destination = null,
}) => {
  const [status, setStatus] = React.useState<'init' | 'context' | 'running' | 'error'>('init');
  const [modelLoaded, setModelLoaded] = React.useState(false);
  const [lastError, setLastError] = React.useState<string | null>(null);
  const markedRunningRef = React.useRef(false);
  const [layout, setLayout] = React.useState<{ w: number; h: number } | null>(null);

  const glRef = React.useRef<ExpoWebGLRenderingContext | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const rendererRef = React.useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = React.useRef<THREE.Scene | null>(null);
  const cameraRef = React.useRef<THREE.PerspectiveCamera | null>(null);
  const canvasRef = React.useRef<any>(null);
  const modelRootRef = React.useRef<THREE.Object3D | null>(null);
  const baseBoxRef = React.useRef<THREE.Box3 | null>(null);
  const dotRef = React.useRef<THREE.Mesh | null>(null);
  const coneRef = React.useRef<THREE.Mesh | null>(null);
  const destRef = React.useRef<THREE.Mesh | null>(null);
  const routeRef = React.useRef<THREE.Line | null>(null);
  const routeKeyRef = React.useRef<string>('');
  const lastFitRef = React.useRef<{ w: number; h: number } | null>(null);
  const propsRef = React.useRef({
    planMeters,
    target,
    follow,
    zoom,
    headingDeg,
    rotateWithHeading,
    bearingDeg,
    route,
    destination,
  });

  React.useEffect(() => {
    propsRef.current = { planMeters, target, follow, zoom, headingDeg, rotateWithHeading, bearingDeg, route, destination };
  }, [planMeters, target, follow, zoom, headingDeg, rotateWithHeading, bearingDeg, route, destination]);

  const fitModelToPlan = React.useCallback(() => {
    const root = modelRootRef.current;
    const baseBox = baseBoxRef.current;
    if (!root || !baseBox) return;
    const baseSize = new THREE.Vector3();
    baseBox.getSize(baseSize);
    const { width, height } = propsRef.current.planMeters;
    if (baseSize.x <= 0.0001 || baseSize.z <= 0.0001) return;

    const last = lastFitRef.current;
    if (last && Math.abs(last.w - width) < 0.001 && Math.abs(last.h - height) < 0.001) return;
    lastFitRef.current = { w: width, h: height };

    const sx = width / baseSize.x;
    const sz = height / baseSize.z;
    const sy = Math.sqrt(Math.max(0.0001, sx * sz));
    root.scale.set(sx, sy, sz);
    root.position.set(-baseBox.min.x * sx, -baseBox.min.y * sy, -baseBox.min.z * sz);
  }, []);

  const stop = React.useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    rendererRef.current?.dispose();
    rendererRef.current = null;
    sceneRef.current = null;
    cameraRef.current = null;
    canvasRef.current = null;
    modelRootRef.current = null;
    baseBoxRef.current = null;
    dotRef.current = null;
    coneRef.current = null;
    destRef.current = null;
    routeRef.current = null;
    glRef.current = null;
  }, []);

  React.useEffect(() => stop, [stop]);

  const onContextCreate = React.useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      glRef.current = gl;
      setStatus('context');
      setLastError(null);
      setModelLoaded(false);
      markedRunningRef.current = false;

      // three.js expects a canvas-like object; provide a minimal stub for React Native.
      const canvas: any = {
        width: gl.drawingBufferWidth,
        height: gl.drawingBufferHeight,
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
        clientHeight: gl.drawingBufferHeight,
        clientWidth: gl.drawingBufferWidth,
      };
      canvasRef.current = canvas;

      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(
        45,
        gl.drawingBufferWidth / gl.drawingBufferHeight,
        0.05,
        2000,
      );
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ canvas, context: gl as any, antialias: true, alpha: true });
      renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight, false);
      renderer.setClearColor(0xfff9f3, 1);
      rendererRef.current = renderer;

      scene.add(new THREE.AmbientLight(0xffffff, 0.75));
      const sun = new THREE.DirectionalLight(0xffffff, 0.9);
      sun.position.set(10, 18, 6);
      scene.add(sun);

      const grid = new THREE.GridHelper(50, 50, 0x666666, 0xcccccc);
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.35;
      scene.add(grid);

      const axes = new THREE.AxesHelper(2);
      axes.position.set(0, 0.01, 0);
      scene.add(axes);

      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 18, 18),
        new THREE.MeshStandardMaterial({ color: 0x2d7ff9, emissive: 0x0b2a6f, emissiveIntensity: 0.25 }),
      );
      dot.position.set(0, 0.35, 0);
      dotRef.current = dot;
      scene.add(dot);

      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.6, 1.8, 18, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x2d7ff9, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
      );
      // Orient cone forward to -Z when headingDeg=0 (plan "up").
      cone.rotation.x = -Math.PI / 2;
      cone.position.set(0, 0.05, 0);
      coneRef.current = cone;
      scene.add(cone);

      const dest = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 18, 18),
        new THREE.MeshStandardMaterial({ color: 0xd97652, emissive: 0x6a2e1c, emissiveIntensity: 0.18 }),
      );
      dest.position.set(0, 0.3, 0);
      dest.visible = false;
      destRef.current = dest;
      scene.add(dest);

      const routeGeo = new THREE.BufferGeometry();
      const routeMat = new THREE.LineBasicMaterial({ color: 0x2d7ff9, transparent: true, opacity: 0.9 });
      const routeLine = new THREE.Line(routeGeo, routeMat);
      routeLine.frustumCulled = false;
      routeRef.current = routeLine;
      scene.add(routeLine);

      try {
        const asset = Asset.fromModule(model);
        await asset.downloadAsync();
        const uri = asset.localUri ?? asset.uri;
        const buffer = await readArrayBufferFromUri(uri);

        const loader = new GLTFLoader();
        const gltf = await new Promise<THREE.Group>((resolve, reject) => {
          loader.parse(
            buffer,
            '',
            (parsed) => resolve(parsed.scene),
            (err) => reject(err),
          );
        });

        const root = gltf;
        root.traverse((obj: THREE.Object3D) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.frustumCulled = false;
          const name = (obj.name ?? '').toLowerCase();
          const isWall = name.includes('externalwalls') || name.includes('innerside') || name.includes('wall');

          const applyOpacity = (m: THREE.Material, opacity: number) => {
            const mat: any = m;
            if (mat && typeof mat === 'object') {
              mat.transparent = opacity < 1;
              mat.opacity = opacity;
              // Make walls see-through rather than just tinted (avoid depth buffer blocking).
              mat.depthWrite = opacity >= 1 ? true : false;
              mat.needsUpdate = true;
            }
          };

          if (Array.isArray(mesh.material)) {
            // Clone before mutation so shared materials don't unintentionally affect the whole model.
            mesh.material = mesh.material.map((m: THREE.Material) => {
              const cloned = m.clone();
              cloned.side = THREE.DoubleSide;
              if (isWall) applyOpacity(cloned, 0.75);
              return cloned;
            });
          } else if (mesh.material) {
            const cloned = mesh.material.clone();
            cloned.side = THREE.DoubleSide;
            if (isWall) applyOpacity(cloned, 0.75);
            mesh.material = cloned;
          }
        });

        // Try to orient to Y-up by rotating the smallest dimension to Y.
        root.rotation.set(0, 0, 0);
        root.position.set(0, 0, 0);
        root.scale.set(1, 1, 1);
        root.updateMatrixWorld(true);
        const initialBox = new THREE.Box3().setFromObject(root);
        const initialSize = new THREE.Vector3();
        initialBox.getSize(initialSize);
        const smallest = Math.min(initialSize.x, initialSize.y, initialSize.z);
        if (smallest === initialSize.z) {
          root.rotation.x = Math.PI / 2;
        } else if (smallest === initialSize.x) {
          root.rotation.z = -Math.PI / 2;
        }

        root.updateMatrixWorld(true);
        const baseBox = new THREE.Box3().setFromObject(root);
        baseBoxRef.current = baseBox.clone();
        modelRootRef.current = root;
        fitModelToPlan();
        scene.add(root);
        setModelLoaded(true);
      } catch (e) {
        // model load failure: still render grid + dot so UI stays responsive
        // eslint-disable-next-line no-console
        console.warn('[ModelMap3D] GLB load failed:', e);
        setLastError(String((e as any)?.message ?? e));
      }

      const clock = new THREE.Clock();
      const cameraPos = new THREE.Vector3();
      const targetPos = new THREE.Vector3();
      const desiredPos = new THREE.Vector3();
      const userPos = new THREE.Vector3(0, 0, 0);
      const desiredUser = new THREE.Vector3(0, 0, 0);
      let userInit = false;

      const render = () => {
        try {
          const nowProps = propsRef.current;

          const gl2 = glRef.current;
          const renderer2 = rendererRef.current;
          const scene2 = sceneRef.current;
          const camera2 = cameraRef.current;
          const canvas2 = canvasRef.current;
          if (!gl2 || !renderer2 || !scene2 || !camera2 || !canvas2) return;

          const w = gl2.drawingBufferWidth;
          const h = gl2.drawingBufferHeight;
          if (w > 0 && h > 0) {
            canvas2.width = w;
            canvas2.height = h;
            canvas2.clientWidth = w;
            canvas2.clientHeight = h;
            renderer2.setSize(w, h, false);
            camera2.aspect = w / h;
            camera2.updateProjectionMatrix();
          }

          // Update model fit when the plan scale changes (e.g. calibration).
          fitModelToPlan();

          const viewTarget = nowProps.follow
            ? (nowProps.target ?? null)
            : { x: nowProps.planMeters.width / 2, y: nowProps.planMeters.height / 2 };
          const txRaw = viewTarget?.x ?? 0;
          const tzRaw = viewTarget?.y ?? 0;
          const headingRad = (((nowProps.rotateWithHeading ? nowProps.headingDeg : 0) + (nowProps.bearingDeg ?? 0)) * Math.PI) / 180;

          const z = clamp(nowProps.zoom ?? 2, 1, 6);
          const height = clamp(18 / z, 3, 40);
          const back = clamp(height * 0.9, 2.5, 35);
          const bx = -Math.sin(headingRad) * back;
          const bz = Math.cos(headingRad) * back;

          // Frame delta once (used for both user + camera smoothing).
          const dt = clamp(clock.getDelta(), 0.001, 0.05);

          desiredUser.set(txRaw, 0.0, tzRaw);
          if (!userInit) {
            userInit = true;
            userPos.copy(desiredUser);
          } else {
            // Smooth the user target to avoid "teleporting" between nearby corridors.
            const kUser = clamp(9 * dt, 0.05, 0.22);
            userPos.lerp(desiredUser, kUser);
          }

          const tx = userPos.x;
          const tz = userPos.z;

          targetPos.set(tx, 0.25, tz);
          desiredPos.set(tx + bx, height, tz + bz);

          // Smooth camera movement (critical for "Google Maps" feel).
          const k = clamp(10 * dt, 0.05, 0.35);
          cameraPos.lerp(desiredPos, k);
          camera2.position.copy(cameraPos);
          camera2.lookAt(targetPos);

          if (dotRef.current) {
            dotRef.current.position.set(tx, 0.35, tz);
          }
          if (coneRef.current) {
            coneRef.current.position.set(tx, 0.05, tz);
            coneRef.current.rotation.y = -headingRad;
          }

          if (destRef.current) {
            if (nowProps.destination) {
              destRef.current.visible = true;
              destRef.current.position.set(nowProps.destination.x, 0.3, nowProps.destination.y);
            } else {
              destRef.current.visible = false;
            }
          }

          if (routeRef.current) {
            const pts = nowProps.route ?? null;
            const key = pts ? `${pts.length}:${pts[0]?.x.toFixed(2)},${pts[0]?.y.toFixed(2)}:${pts[pts.length - 1]?.x.toFixed(2)},${pts[pts.length - 1]?.y.toFixed(2)}` : '';
            if (key !== routeKeyRef.current) {
              routeKeyRef.current = key;
              const verts: number[] = [];
              if (pts && pts.length > 1) {
                pts.forEach((p) => {
                  verts.push(p.x, 0.08, p.y);
                });
              }
              const geom = new THREE.BufferGeometry();
              geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
              routeRef.current.geometry.dispose();
              routeRef.current.geometry = geom;
            }
          }

          renderer2.render(scene2, camera2);
          gl2.endFrameEXP();

          if (!markedRunningRef.current) {
            markedRunningRef.current = true;
            setStatus('running');
          }

          rafRef.current = requestAnimationFrame(render);
        } catch (e) {
          setStatus('error');
          setLastError(String((e as any)?.message ?? e));
          // eslint-disable-next-line no-console
          console.warn('[ModelMap3D] render loop failed:', e);
        }
      };

      cameraPos.set(0, 12, 12);
      rafRef.current = requestAnimationFrame(render);
    },
    [fitModelToPlan],
  );

  const panStartTargetRef = React.useRef<Point2 | null>(null);
  const pinchStartZoomRef = React.useRef(zoom);
  const rotStartDegRef = React.useRef(bearingDeg);

  React.useEffect(() => {
    pinchStartZoomRef.current = zoom;
    rotStartDegRef.current = bearingDeg;
  }, [bearingDeg, zoom]);

  const onPanStateChange = React.useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.state === State.BEGAN) {
        const base = target ?? { x: planMeters.width / 2, y: planMeters.height / 2 };
        panStartTargetRef.current = base;
      }
      if (e.nativeEvent.oldState === State.ACTIVE) panStartTargetRef.current = null;
    },
    [planMeters.height, planMeters.width, target],
  );

  const onPan = React.useCallback(
    (e: PanGestureHandlerGestureEvent) => {
      if (!layout) return;
      if (!panStartTargetRef.current) return;
      const dx = e.nativeEvent.translationX;
      const dy = e.nativeEvent.translationY;

      const z = clamp(zoom ?? 2, 1, 6);
      const cameraHeight = clamp(18 / z, 3, 40);
      const fovRad = (45 * Math.PI) / 180;
      const metersPerPx = (2 * cameraHeight * Math.tan(fovRad / 2)) / Math.max(1, layout.h);

      const rad = ((rotateWithHeading ? headingDeg : 0) + bearingDeg) * (Math.PI / 180);
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      // Invert rotation (screen -> world) and scale by meters-per-pixel.
      const worldDx = (dx * cos + dy * sin) * metersPerPx;
      const worldDy = (-dx * sin + dy * cos) * metersPerPx;

      onCameraChange?.({
        target: { x: panStartTargetRef.current.x - worldDx, y: panStartTargetRef.current.y - worldDy },
      });
    },
    [bearingDeg, headingDeg, layout, onCameraChange, rotateWithHeading, zoom],
  );

  const onPinchStateChange = React.useCallback(
    (e: PinchGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.state === State.BEGAN) pinchStartZoomRef.current = zoom ?? 2;
    },
    [zoom],
  );

  const onPinch = React.useCallback(
    (e: PinchGestureHandlerGestureEvent) => {
      const next = clamp(pinchStartZoomRef.current * e.nativeEvent.scale, 1, 6);
      onCameraChange?.({ zoom: next });
    },
    [onCameraChange],
  );

  const onRotateStateChange = React.useCallback(
    (e: RotationGestureHandlerStateChangeEvent) => {
      if (e.nativeEvent.state === State.BEGAN) rotStartDegRef.current = bearingDeg;
    },
    [bearingDeg],
  );

  const onRotate = React.useCallback(
    (e: RotationGestureHandlerGestureEvent) => {
      const deltaDeg = (e.nativeEvent.rotation * 180) / Math.PI;
      onCameraChange?.({ bearingDeg: rotStartDegRef.current + deltaDeg });
    },
    [onCameraChange],
  );

  return (
    <View style={style} onLayout={(e) => setLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <PanGestureHandler minDist={6} onGestureEvent={onPan} onHandlerStateChange={onPanStateChange}>
        <RotationGestureHandler onGestureEvent={onRotate} onHandlerStateChange={onRotateStateChange}>
          <PinchGestureHandler onGestureEvent={onPinch} onHandlerStateChange={onPinchStateChange}>
            <View style={{ flex: 1 }}>
              <GLView collapsable={false} style={{ flex: 1 }} onContextCreate={onContextCreate} />
            </View>
          </PinchGestureHandler>
        </RotationGestureHandler>
      </PanGestureHandler>
      <View pointerEvents="none" style={styles.overlay}>
        <Text style={styles.overlayTitle}>3D</Text>
        <Text style={styles.overlayText}>
          {status}
          {modelLoaded ? ' • model' : ' • grid'}
        </Text>
        {lastError ? <Text style={styles.overlayError}>{lastError}</Text> : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 10,
    top: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    maxWidth: '92%',
  },
  overlayTitle: { color: '#fff', fontWeight: '900' },
  overlayText: { color: 'rgba(255,255,255,0.92)', marginTop: 2 },
  overlayError: { color: '#ffd6d6', marginTop: 6 },
});
