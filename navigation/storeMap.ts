export type StoreMapNodeType = 'entry' | 'exit' | 'aisle' | 'poi' | 'walkway';

export type StoreMapNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  floor: number;
  type: StoreMapNodeType;
  sectionId?: string;
};

export type StoreMapEdge = {
  from: string;
  to: string;
  distance?: number;
  bidirectional?: boolean;
};

export type StoreMapAnchor = {
  bssid: string;
  label: string;
  x: number;
  y: number;
  floor: number;
  source: 'mock' | 'live';
  confidence?: number;
};

export type StoreMap = {
  id: string;
  label: string;
  gridSize: number;
  nodes: StoreMapNode[];
  edges?: StoreMapEdge[];
  anchors?: StoreMapAnchor[];
};

export const pilotStoreMap: StoreMap = {
  id: 'pilot-berlin-1',
  label: 'Pilot Markt Berlin',
  gridSize: 6,
  nodes: [
    { id: 'entry', label: 'Eingang', x: 0.5, y: 0.5, floor: 0, type: 'entry' },
    { id: 'exit', label: 'Kasse', x: 5.5, y: 5.5, floor: 0, type: 'exit' },
    { id: 'dairy', label: 'Milchprodukte', x: 1.5, y: 2.5, floor: 0, type: 'aisle', sectionId: 'dairy' },
    { id: 'produce', label: 'Obst & Gemüse', x: 3.5, y: 3.5, floor: 0, type: 'aisle', sectionId: 'produce' },
    { id: 'bakery', label: 'Brot', x: 4.5, y: 1.5, floor: 0, type: 'aisle', sectionId: 'bakery' },
    { id: 'frozen', label: 'TK', x: 0.5, y: 4.5, floor: 0, type: 'aisle', sectionId: 'frozen' },
    { id: 'protein', label: 'Proteine', x: 2.5, y: 4.5, floor: 0, type: 'aisle', sectionId: 'protein' },
    { id: 'dry', label: 'Trockenprodukte', x: 2.5, y: 1.5, floor: 0, type: 'aisle', sectionId: 'dry' },
  ],
  edges: [
    { from: 'entry', to: 'dry' },
    { from: 'dry', to: 'dairy' },
    { from: 'dairy', to: 'produce' },
    { from: 'produce', to: 'protein' },
    { from: 'protein', to: 'frozen' },
    { from: 'protein', to: 'exit' },
    { from: 'bakery', to: 'dry' },
    { from: 'bakery', to: 'produce' },
  ],
  anchors: [
    { bssid: 'AA:BB:CC:DD:EE:01', label: 'Router', x: 0.5, y: 0.5, floor: 0, source: 'mock', confidence: 0.85 },
    { bssid: 'AA:BB:CC:DD:EE:02', label: 'AP', x: 5.5, y: 5.5, floor: 0, source: 'mock', confidence: 0.7 },
  ],
};

