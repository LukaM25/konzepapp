import { type ImageSourcePropType } from 'react-native';
import { type StoreMap } from './storeMap';

export const neueFloorplanImage: ImageSourcePropType = require('../assets/floorplans/neue_plan.png');
const neueGraph: StoreMap = require('../assets/graphs/neue.graph.json');

export type PlanId = 'neue';

const ppmFromScale = (dpi: number, scale: number) => dpi / (scale * 0.0254);

// Coordinate system for the plan overlay:
// - origin is top-left of the displayed image
// - x/y are in meters (mapped via pixelsPerMeter in UI)
export const neueTestMap: StoreMap = {
  ...neueGraph,
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
    defaultImagePixelsPerMeter: 46.03,
  },
};
