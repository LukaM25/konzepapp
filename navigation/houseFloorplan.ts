import { type ImageSourcePropType } from 'react-native';
import { type StoreMap } from './storeMap';

export const neueFloorplanImage: ImageSourcePropType = require('../assets/floorplans/neue_plan.png');
const neueGraph: StoreMap = require('../assets/graphs/neue.graph.json');

export type PlanId = 'neue';

const ppmFromScale = (dpi: number, scale: number) => dpi / (scale * 0.0254);

const scaleStoreMap = (map: StoreMap, factor: number): StoreMap => ({
  ...map,
  nodes: map.nodes.map((n) => ({ ...n, x: n.x * factor, y: n.y * factor })),
  anchors: map.anchors?.map((a) => ({ ...a, x: a.x * factor, y: a.y * factor })),
});

// Neue plan: lock to a fixed px/m and scale the authored graph coordinates to match.
export const NEUE_FIXED_PIXELS_PER_METER = 98;
const NEUE_GRAPH_AUTHORED_PIXELS_PER_METER = 46.03;
const NEUE_GRAPH_SCALE = NEUE_GRAPH_AUTHORED_PIXELS_PER_METER / NEUE_FIXED_PIXELS_PER_METER;

// Coordinate system for the plan overlay:
// - origin is top-left of the displayed image
// - x/y are in meters (mapped via pixelsPerMeter in UI)
export const neueTestMap: StoreMap = {
  ...scaleStoreMap(neueGraph, NEUE_GRAPH_SCALE),
};

export const planConfigs: Record<
  PlanId,
  {
    id: PlanId;
    label: string;
    image: ImageSourcePropType;
    map: StoreMap;
    scale?: number; // e.g. 74 for 1:74
    imageDpi?: number;
    defaultImagePixelsPerMeter?: number;
  }
> = {
  neue: {
    id: 'neue',
    label: 'Neue',
    image: neueFloorplanImage,
    map: neueTestMap,
    scale: 74,
    imageDpi: 72,
    defaultImagePixelsPerMeter: NEUE_FIXED_PIXELS_PER_METER,
  },
};
