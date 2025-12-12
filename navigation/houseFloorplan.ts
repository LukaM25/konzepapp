import { type ImageSourcePropType } from 'react-native';
import { type StoreMap } from './storeMap';

export const houseFloorplanImage: ImageSourcePropType = require('../assets/floorplans/house.png');
export const neueFloorplanImage: ImageSourcePropType = require('../assets/floorplans/neue.png');

export type PlanId = 'house' | 'neue';

const ppmFromScale = (dpi: number, scale: number) => dpi / (scale * 0.0254);

// Coordinate system for the plan overlay:
// - origin is top-left of the displayed image
// - x/y are in meters (mapped via pixelsPerMeter in UI)
export const houseTestMap: StoreMap = {
  id: 'house-test',
  label: 'House Test Plan',
  gridSize: 50,
  nodes: [
    { id: 'entry', label: 'Start', x: 1, y: 1, floor: 0, type: 'entry' },
    { id: 'exit', label: 'Goal', x: 8, y: 8, floor: 0, type: 'exit' },
  ],
  edges: [],
  anchors: [],
};

export const neueTestMap: StoreMap = {
  id: 'neue-test',
  label: 'Neue Plan',
  gridSize: 50,
  nodes: [
    { id: 'entry', label: 'Start', x: 1, y: 1, floor: 0, type: 'entry' },
    { id: 'exit', label: 'Goal', x: 8, y: 8, floor: 0, type: 'exit' },
  ],
  edges: [],
  anchors: [],
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
  house: { id: 'house', label: 'House', image: houseFloorplanImage, map: houseTestMap },
  neue: {
    id: 'neue',
    label: 'Neue',
    image: neueFloorplanImage,
    map: neueTestMap,
    scale: 74,
    imageDpi: 72,
    defaultImagePixelsPerMeter: ppmFromScale(72, 74),
  },
};
