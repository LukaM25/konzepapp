import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { FlatList, Image, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  useFonts,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import {
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { Barometer, DeviceMotion, Magnetometer, Pedometer } from 'expo-sensors';
import { pilotStoreMap, type StoreMap, type StoreMapAnchor, type StoreMapNode } from './navigation/storeMap';
import { computePolylineForOrder, computeRouteOrder } from './navigation/routing';
import { scanWifi, type WifiReading } from './navigation/wifi';
import { planConfigs, type PlanId } from './navigation/houseFloorplan';

type HouseholdRole = 'owner' | 'editor' | 'viewer';
type HouseholdMember = {
  id: string;
  name: string;
  role: HouseholdRole;
  color: string;
  avatar: string;
};

type ShoppingItem = {
  id: string;
  name: string;
  assignedTo: string;
  quantity: string;
  status: 'pending' | 'done';
  category: string;
  priority?: 'high' | 'normal';
  note?: string;
};

type Recipe = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  duration: string;
  byPantry: string;
  servings: number;
  aiCost: number;
  diet: string[];
  allergens: string[];
};

type StoreSection = {
  id: string;
  label: string;
  aisle: number;
  icon: string;
  items: string[];
};

type TierId = 'free' | 'pro' | 'family';
type Locale = 'de' | 'en';
type TabId = 'home' | 'list' | 'recipes' | 'nav' | 'plans';
type SortMode = 'category' | 'aisle' | 'priority';
type PdrState = {
  steps: number;
  heading: number;
  gyroHeading: number;
  magHeading: number;
  floor: number;
  pressure: number;
  status: 'idle' | 'tracking' | 'denied';
};
type PdrPoint = { x: number; y: number };
type NavNode = StoreMapNode;
type MotionDebug = {
  accelMag: number;
  accelBaseline: number;
  accelDiff: number;
  stepThreshold: number;
  stepLength: number;
  lastStepAt: number | null;
  lastIntervalMs: number;
  isStationary: boolean;
  stepSource: 'deviceMotion' | 'pedometer' | 'none';
  deviceMotionLinAccMag: number;
  pedometerSteps: number;
  deviceSteps: number;
};
type SensorHealth = {
  accel: { available: boolean | null; lastAt: number | null; error?: string };
  gyro: { available: boolean | null; lastAt: number | null; error?: string };
  mag: { available: boolean | null; lastAt: number | null; error?: string };
  baro: { available: boolean | null; lastAt: number | null; error?: string };
  deviceMotion: { available: boolean | null; lastAt: number | null; error?: string };
  pedometer: { available: boolean | null; lastAt: number | null; error?: string; permission?: string };
};

type PlanTool = 'start' | 'measure' | 'anchor';
type WifiFix = {
  x: number;
  y: number;
  matched: number;
  best?: WifiReading;
};

const FloorplanImageCanvas: React.FC<{
  source: any;
  imagePixelsPerMeter: number;
  path: PdrPoint[];
  current?: PdrPoint;
  onTapMeters?: (pMeters: PdrPoint, pImagePx: { x: number; y: number }) => void;
}> = ({ source, imagePixelsPerMeter, path, current, onTapMeters }) => {
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
  const toContainer = (p: PdrPoint) => ({
    x: offsetX + p.x * ppm * scale,
    y: offsetY + p.y * ppm * scale,
  });

  return (
    <View
      style={styles.planWrap}
      onLayout={(e) => setLayout({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Pressable
        style={{ flex: 1 }}
        onPress={(e) => {
          if (!layout) return;
          const x = e.nativeEvent.locationX;
          const y = e.nativeEvent.locationY;
          const ix = Math.max(0, Math.min(imgW, (x - offsetX) / scale));
          const iy = Math.max(0, Math.min(imgH, (y - offsetY) / scale));
          onTapMeters?.({ x: ix / ppm, y: iy / ppm }, { x: ix, y: iy });
        }}
      >
        <Image source={source} style={styles.planImage} resizeMode="contain" />
        <View pointerEvents="none" style={styles.planOverlay}>
          {layout ? (
            <>
              {path.map((p, idx) => (
                (() => {
                  const c = toContainer(p);
                  return (
                <View
                  key={`p-${idx}`}
                  style={[
                    styles.planPathDot,
                    { left: c.x - 2, top: c.y - 2 },
                  ]}
                />
                  );
                })()
              ))}
              {current ? (
                (() => {
                  const c = toContainer(current);
                  return (
                <View
                  style={[
                    styles.planCurrentDot,
                    { left: c.x - 7, top: c.y - 7 },
                  ]}
                />
                  );
                })()
              ) : null}
            </>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
};

const wrapHeading = (deg: number) => {
  const h = deg % 360;
  return h < 0 ? h + 360 : h;
};
const headingDiff = (a: number, b: number) => {
  const d = ((a - b + 540) % 360) - 180;
  return d;
};
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
const normalizeBssid = (bssid: string) => bssid.trim().toLowerCase();

const tabs: { id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'home', label: 'Home', icon: 'home-outline' },
  { id: 'list', label: 'Liste', icon: 'checkbox-outline' },
  { id: 'recipes', label: 'Rezepte', icon: 'restaurant-outline' },
  { id: 'nav', label: 'Navigation', icon: 'map-outline' },
  { id: 'plans', label: 'Pläne', icon: 'card-outline' },
];

const defaultStoreMap: StoreMap = pilotStoreMap;

const colors = {
  background: '#F7F1E8', // cozy base
  card: '#FFFFFF', // clean cards
  accent: '#D97652', // terracotta accent
  accentSoft: '#F3D9C8', // soft terracotta wash
  success: '#3E7A52', // pine green
  text: '#2F241F', // ink
  muted: '#6F5F56', // warm muted
  border: '#E3D7CF', // paper edge
  warning: '#C6533D', // ember
  offline: '#F0E6DC',
  gradientStart: '#F9F3EB',
  gradientEnd: '#F4E6D5',
  shadow: 'rgba(47,36,31,0.12)',
  ink: '#1C120F',
};

const members: HouseholdMember[] = [
  { id: 'anna', name: 'Anna', role: 'owner', color: '#81E6D9', avatar: '🧑‍🍳' },
  { id: 'tom', name: 'Tom', role: 'editor', color: '#FCD34D', avatar: '🧑‍🔧' },
  { id: 'mira', name: 'Mira', role: 'editor', color: '#F9A8D4', avatar: '🧑‍🎨' },
  { id: 'wir', name: 'Wir', role: 'viewer', color: '#BFDBFE', avatar: '🤝' },
];

const initialItems: ShoppingItem[] = [
  { id: '1', name: 'Eier', assignedTo: 'anna', quantity: '10 Stk', status: 'done', category: 'Basics' },
  { id: '2', name: 'Milch', assignedTo: 'wir', quantity: '2 x 1L', status: 'pending', category: 'Kühlregal' },
  { id: '3', name: 'Brot', assignedTo: 'tom', quantity: 'Vollkorn', status: 'pending', category: 'Bäckerei', priority: 'high' },
  { id: '4', name: 'Spinat', assignedTo: 'mira', quantity: '400g TK', status: 'pending', category: 'Tiefkühl' },
  { id: '5', name: 'Haferflocken', assignedTo: 'wir', quantity: '1kg', status: 'done', category: 'Trocken' },
  { id: '6', name: 'Tofu', assignedTo: 'anna', quantity: '2 Pack', status: 'pending', category: 'Proteine' },
];

const mockRecipes: Recipe[] = [
  {
    id: 'curry',
    title: 'Cremiges Gemüse-Curry',
    description: 'Basierend auf deinem Kühlschrank: Kürbis, Kichererbsen, Spinat, Kokos.',
    tags: ['Schnell', 'One-Pot', 'Vegan'],
    duration: '25 min',
    byPantry: 'Kühlschrank + Vorrat',
    servings: 2,
    aiCost: 1,
    diet: ['Vegan', 'Glutenfrei'],
    allergens: ['Kokos'],
  },
  {
    id: 'bowl',
    title: 'Protein Bowl mit Halloumi',
    description: 'Gerösteter Halloumi, Ofengemüse, Tahini-Dressing, 30g Protein pro Portion.',
    tags: ['High Protein', 'Meal Prep'],
    duration: '30 min',
    byPantry: 'Frisches + Vorrat',
    servings: 3,
    aiCost: 1,
    diet: ['Vegetarisch'],
    allergens: ['Sesam'],
  },
  {
    id: 'pasta',
    title: 'Pasta Verde',
    description: 'Basilikum-Pesto, Blattspinat, Erbsen, optional Hähnchenstreifen.',
    tags: ['Familie', '15-Minuten'],
    duration: '15 min',
    byPantry: 'Spontan',
    servings: 4,
    aiCost: 1,
    diet: ['Vegetarisch'],
    allergens: ['Gluten', 'Nüsse'],
  },
];

const recipeNeeds: Record<string, string[]> = {
  curry: ['Kokosmilch', 'Currypaste', 'Kartoffeln', 'Karotten', 'Spinat'],
  bowl: ['Halloumi', 'Kichererbsen', 'Tahini', 'Süßkartoffeln'],
  pasta: ['Pasta', 'Basilikum', 'Pinienkerne', 'Parmesan'],
  pantry: ['Reis', 'Gemüse', 'Tofu', 'Sojasauce'],
};

const storeSections: StoreSection[] = [
  { id: 'dairy', label: 'Milchprodukte', aisle: 2, icon: '🥛', items: ['Milch', 'Joghurt', 'Käse', 'Eier', 'Butter', 'Quark'] },
  { id: 'produce', label: 'Obst & Gemüse', aisle: 4, icon: '🍎', items: ['Äpfel', 'Spinat', 'Zucchini', 'Bananen', 'Karotten', 'Kartoffeln', 'Tomaten', 'Paprika', 'Zwiebeln', 'Knoblauch'] },
  { id: 'bakery', label: 'Brot', aisle: 6, icon: '🍞', items: ['Brot', 'Brötchen', 'Baguette'] },
  { id: 'frozen', label: 'TK', aisle: 1, icon: '🧊', items: ['TK-Spinat', 'TK-Beeren', 'TK-Pizza', 'TK-Gemüse'] },
  { id: 'protein', label: 'Proteine', aisle: 5, icon: '🍗', items: ['Tofu', 'Hähnchen', 'Hackfleisch', 'Lachs', 'Bohnen', 'Kichererbsen'] },
  { id: 'dry', label: 'Trockenprodukte', aisle: 3, icon: '🥣', items: ['Haferflocken', 'Reis', 'Pasta', 'Linsen', 'Couscous'] },
  { id: 'beverages', label: 'Getränke', aisle: 7, icon: '🥤', items: ['Wasser', 'Saft', 'Kaffee', 'Tee'] },
  { id: 'snacks', label: 'Snacks', aisle: 8, icon: '🍫', items: ['Schokolade', 'Chips', 'Nüsse', 'Cracker'] },
  { id: 'spices', label: 'Gewürze', aisle: 9, icon: '🧂', items: ['Salz', 'Pfeffer', 'Paprika edelsüß', 'Curry', 'Oregano'] },
  { id: 'canned', label: 'Konserven', aisle: 10, icon: '🥫', items: ['Tomaten aus der Dose', 'Mais', 'Thunfisch', 'Kokosmilch'] },
  { id: 'household', label: 'Haushalt', aisle: 11, icon: '🧽', items: ['Spülmittel', 'Schwämme', 'Toilettenpapier'] },
  { id: 'personal', label: 'Drogerie', aisle: 12, icon: '🪥', items: ['Zahnpasta', 'Shampoo', 'Seife'] },
];

const productCatalog: { name: string; sectionId: string; category: string }[] = storeSections.flatMap((section) =>
  section.items.map((name) => ({ name, sectionId: section.id, category: section.label })),
);

const tiers: Record<TierId, { price: string; tagline: string; perks: string[] }> = {
  free: {
    price: 'Free',
    tagline: 'Unbegrenzte Listen, 1 Haushalt, 10 AI-Requests/Monat.',
    perks: ['Teilen mit 3 Personen', 'Standard-Rezepte', 'Offline-Sync basic'],
  },
  pro: {
    price: '4,99 € / Monat',
    tagline: 'Für Power-User mit Wocheplan & Auto-Listen.',
    perks: ['Unbegrenzte AI (Fair-Use)', 'Mehr Haushalte', 'Personalisierung & History', 'Wochenplanung'],
  },
  family: {
    price: '8,99 € / Monat',
    tagline: 'Bis 6 Nutzer, Rollen & Priorisierte AI.',
    perks: ['Alles aus Pro', 'Rollen & Rechte', 'Priority AI', 'Familienkalender-Sync'],
  },
};

const translations: Record<
  Locale,
  { heroKicker: string; heroTitle: string; heroSubtitle: string; offlineTitle: string; offlineMessage: string }
> = {
  de: {
    heroKicker: 'Wir sparen dir Zeit',
    heroTitle: 'Planen. Einkaufen. Kochen.',
    heroSubtitle: 'Vertrauensvoll teilen, KI-Rezepte, clevere Navigation.',
    offlineTitle: 'Offline-Modus',
    offlineMessage: 'Wir speichern Änderungen lokal und gleichen bei Verbindung ab.',
  },
  en: {
    heroKicker: 'We save your time',
    heroTitle: 'Plan. Shop. Cook.',
    heroSubtitle: 'Share with trust. AI recipes. Smart navigation.',
    offlineTitle: 'Offline mode',
    offlineMessage: 'We cache your changes and sync once you are online.',
  },
};

const Section: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
    {children}
  </View>
);

const Badge: React.FC<{ label: string; tone?: 'accent' | 'muted' | 'success' }> = ({ label, tone = 'muted' }) => (
  <View
    style={[
      styles.badge,
      tone === 'accent' && { backgroundColor: colors.accentSoft },
      tone === 'success' && { backgroundColor: '#E6F4EA' },
    ]}
  >
    <Text
      style={[
        styles.badgeText,
        tone === 'accent' && { color: colors.accent },
        tone === 'success' && { color: colors.success },
      ]}
    >
      {label}
    </Text>
  </View>
);

const Avatar: React.FC<{ member: HouseholdMember; size?: number }> = ({ member, size = 32 }) => (
  <View style={[styles.avatar, { backgroundColor: member.color, width: size, height: size, borderRadius: size / 2 }]}>
    <Text style={styles.avatarText}>{member.avatar}</Text>
  </View>
);

const RecipeCard: React.FC<{
  recipe: Recipe;
  onSelect: () => void;
  aiLeft: number;
  gated?: boolean;
}> = ({ recipe, onSelect, aiLeft, gated }) => (
  <Pressable onPress={onSelect}>
    <LinearGradient
      colors={gated ? ['#FFE2D6', '#F7B8A3'] : ['#FFF4EA', '#FFECE0']}
      style={[styles.recipeCard, gated && { borderColor: colors.warning }]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={styles.recipeHeader}>
        <Text style={styles.recipeTitle}>{recipe.title}</Text>
        <Badge label={recipe.duration} tone="accent" />
      </View>
      <Text style={styles.recipeDesc}>{recipe.description}</Text>
      <View style={styles.recipeTags}>
        {recipe.tags.map((tag) => (
          <Badge key={tag} label={tag} />
        ))}
        <Badge label={`${recipe.aiCost} AI`} tone={aiLeft <= 2 ? 'accent' : 'muted'} />
      </View>
      <View style={styles.recipeMetaRow}>
        <Text style={styles.metaText}>Servings: {recipe.servings}</Text>
        <Text style={styles.metaText}>{recipe.diet.join(' • ')}</Text>
      </View>
      <Text style={styles.metaMuted}>Allergene: {recipe.allergens.join(', ')}</Text>
      {gated ? <Text style={styles.gatedText}>Upgrade für unbegrenzte AI</Text> : null}
    </LinearGradient>
  </Pressable>
);

const FloorplanCanvas: React.FC<{
  nodes: NavNode[];
  routeOrder: string[];
  visited: string[];
  gridSize?: number;
  startId?: string;
  onSelectNode?: (node: NavNode) => void;
  path?: PdrPoint[];
  current?: PdrPoint;
}> = ({ nodes, routeOrder, visited, gridSize = 6, startId, onSelectNode, path = [], current }) => {
  const [cellSize, setCellSize] = React.useState(0);
  const cells = Array.from({ length: gridSize }, (_, row) =>
    Array.from({ length: gridSize }, (_, col) => {
      const node = nodes.find((n) => Math.floor(n.y) === row && Math.floor(n.x) === col);
      const isRoute = node ? routeOrder.includes(node.id) : false;
      const isVisited = node ? visited.includes(node.id) : false;
      const isEntry = node?.type === 'entry' || node?.id === 'entry';
      const isExit = node?.type === 'exit' || node?.id === 'exit';
      const isStart = node?.id === startId;
      const isPath = path.some((p) => Math.floor(p.y) === row && Math.floor(p.x) === col);
      const isCurrent = current ? Math.floor(current.y) === row && Math.floor(current.x) === col : false;
      return { node, isRoute, isVisited, isEntry, isExit, isStart, isPath, isCurrent };
    }),
  );

  return (
    <View
      style={styles.floorGrid}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        setCellSize(w / gridSize);
      }}
    >
      {cellSize > 0 ? (
        <View style={styles.floorOverlay} pointerEvents="none">
          {path.map((p, idx) => {
            if (idx === path.length - 1) return null;
            const next = path[idx + 1];
            const x1 = p.x * cellSize;
            const y1 = p.y * cellSize;
            const x2 = next.x * cellSize;
            const y2 = next.y * cellSize;
            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            return (
              <React.Fragment key={`${p.x}-${p.y}-${idx}`}>
                <View
                  style={[
                    styles.floorPathLine,
                    {
                      width: dist,
                      left: x1,
                      top: y1,
                      transform: [{ translateX: -dist / 2 }, { rotate: `${angle}rad` }],
                    },
                  ]}
                />
                <View style={[styles.floorPathDot, { left: x1 - 4, top: y1 - 4 }]} />
              </React.Fragment>
            );
          })}
          {current ? (
            <View
              style={[
                styles.floorCurrentDot,
                {
                  left: current.x * cellSize - 8,
                  top: current.y * cellSize - 8,
                },
              ]}
            />
          ) : null}
        </View>
      ) : null}
      {cells.map((row, rIdx) => (
        <View key={rIdx} style={styles.floorRow}>
          {row.map((cell, cIdx) => {
            const bg = cell.isCurrent
              ? colors.accent
              : cell.isVisited
              ? '#DCEEE1'
              : cell.isPath
              ? colors.accentSoft
              : cell.isRoute
              ? 'rgba(217,118,82,0.18)'
              : cell.node
              ? '#FFF7ED'
              : '#E9DFD6';
            return (
              <Pressable
                key={`${rIdx}-${cIdx}`}
                style={[styles.floorCell, { backgroundColor: bg }]}
                disabled={!cell.node}
                onPress={() => cell.node && onSelectNode?.(cell.node)}
              >
                {cell.node ? (
                  <View style={styles.floorNode}>
                    <Text style={styles.floorNodeIcon}>
                      {cell.isStart
                        ? '⭐'
                        : cell.isEntry
                        ? '🟢'
                        : cell.isExit
                        ? '🏁'
                        : storeSections.find((s) => s.id === cell.node?.sectionId)?.icon || '📍'}
                    </Text>
                    <Text style={styles.floorNodeLabel}>{cell.node.label}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
};

const TierCard: React.FC<{ id: TierId; active: boolean; onSelect: () => void }> = ({ id, active, onSelect }) => {
  const tier = tiers[id];
  return (
    <Pressable style={[styles.tierCard, active && styles.tierCardActive]} onPress={onSelect}>
      <View style={styles.tierHeader}>
        <Text style={styles.tierTitle}>{id === 'free' ? 'Free' : id === 'pro' ? 'Pro (Single)' : 'Family/WG'}</Text>
        <Badge label={tier.price} tone="accent" />
      </View>
      <Text style={styles.sectionSubtitle}>{tier.tagline}</Text>
      {tier.perks.map((p) => (
        <View key={p} style={styles.tierPerk}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.metaText}>{p}</Text>
        </View>
      ))}
      {id !== 'free' && <Text style={styles.metaMuted}>Priorisierte AI & mehr Haushalte</Text>}
    </Pressable>
  );
};

const SmartBar: React.FC<{ onAddQuick: () => void; onScan: () => void; onAskAI: () => void }> = ({
  onAddQuick,
  onScan,
  onAskAI,
}) => (
  <View style={styles.smartBar}>
    <Pressable style={styles.smartButton} onPress={onAddQuick}>
      <Ionicons name="add-circle" size={20} color={colors.accent} />
      <Text style={styles.smartButtonText}>Add</Text>
    </Pressable>
    <Pressable style={styles.smartButton} onPress={onScan}>
      <Ionicons name="qr-code-outline" size={20} color={colors.accent} />
      <Text style={styles.smartButtonText}>Scan</Text>
    </Pressable>
    <Pressable style={styles.smartButtonAccent} onPress={onAskAI}>
      <Ionicons name="sparkles" size={20} color={colors.ink} />
      <Text style={styles.smartButtonAccentText}>AI Prompt</Text>
    </Pressable>
  </View>
);

const PatternOverlay: React.FC = () => {
  const rows = Array.from({ length: 6 }, (_, r) => r);
  const cols = Array.from({ length: 8 }, (_, c) => c);
  return (
    <View pointerEvents="none" style={styles.patternWrap}>
      {rows.map((r) => (
        <View key={r} style={styles.patternRow}>
          {cols.map((c) => (
            <View
              key={`${r}-${c}`}
              style={[
                styles.patternDot,
                { opacity: 0.05 + ((r + c) % 2 === 0 ? 0.04 : 0), transform: [{ translateY: (r % 2) * 4 }] },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
};

const Hero: React.FC<{
  t: (typeof translations)[Locale];
  locale: Locale;
  setLocale: (l: Locale) => void;
  usedTimeSaved: { minutes: number; aiUsage: number };
  presence: HouseholdMember[];
}> = ({ t, locale, setLocale, usedTimeSaved, presence }) => (
  <View style={styles.hero}>
    <View style={styles.heroTopRow}>
      <View>
        <Text style={styles.heroBrand}>Konzep</Text>
        <Text style={styles.kicker}>{t.heroKicker}</Text>
      </View>
      <View style={styles.langRow}>
        {(['de', 'en'] as Locale[]).map((code) => (
          <Pressable
            key={code}
            style={[styles.langPill, locale === code && styles.langPillActive]}
            onPress={() => setLocale(code)}
          >
            <Text style={[styles.langText, locale === code && { color: '#fff' }]}>{code.toUpperCase()}</Text>
          </Pressable>
        ))}
      </View>
    </View>
    <Text style={styles.title}>{t.heroTitle}</Text>
    <Text style={styles.subtitle}>{t.heroSubtitle}</Text>
    <View style={styles.heroPresence}>
      <View style={styles.presenceInline}>
        {presence.slice(0, 3).map((m) => (
          <Avatar key={m.id} member={m} size={30} />
        ))}
        {presence.length > 3 ? <Text style={styles.metaMuted}>+{presence.length - 3}</Text> : null}
      </View>
      <Badge label="Vertrauenskreis" tone="accent" />
    </View>
    <View style={styles.heroStats}>
      <View style={[styles.statCard, styles.statCardPrimary]}>
        <Text style={[styles.statValue, { color: colors.ink }]}>{usedTimeSaved.minutes} min</Text>
        <Text style={[styles.metaMuted, { color: colors.ink }]}>Zeit gespart</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statValue}>{usedTimeSaved.aiUsage}/10</Text>
        <Text style={styles.metaMuted}>AI-Requests (Free)</Text>
      </View>
      <View style={styles.statCard}>
        <Text style={styles.statValue}>{presence.length}</Text>
        <Text style={styles.metaMuted}>Leute in der Liste</Text>
      </View>
    </View>
  </View>
);

const AuthSection: React.FC<{ presence: HouseholdMember[] }> = ({ presence }) => (
  <Section title="Login & Haushalte" subtitle="Google, Apple oder E-Mail. Haushalte & Rollen sind vorbereitet.">
    <View style={styles.authRow}>
      <Pressable style={styles.authButton}>
        <Ionicons name="logo-google" size={18} color={colors.text} />
        <Text style={styles.authText}>Google</Text>
      </Pressable>
      <Pressable style={styles.authButton}>
        <Ionicons name="logo-apple" size={18} color={colors.text} />
        <Text style={styles.authText}>Apple</Text>
      </Pressable>
      <Pressable style={styles.authButton}>
        <Ionicons name="mail" size={18} color={colors.text} />
        <Text style={styles.authText}>E-Mail</Text>
      </Pressable>
    </View>
    <View style={styles.presenceRow}>
      {presence.map((m) => (
        <View key={m.id} style={styles.presence}>
          <Avatar member={m} />
          <Text style={styles.presenceName}>{m.name}</Text>
          <Text style={styles.metaMuted}>{m.role}</Text>
        </View>
      ))}
    </View>
  </Section>
);

const ListSection: React.FC<{
  items: ShoppingItem[];
  presence: HouseholdMember[];
  isOffline: boolean;
  queued: string[];
  toggleItem: (id: string) => void;
  addItem: (name: string, assignedTo: string, category: string) => void;
  removeItem: (id: string) => void;
  setIsOffline: (v: boolean) => void;
  resetQueue: () => void;
  offlineCopy: { title: string; message: string };
  suggestedRecipe: Recipe | null;
  setSuggestedRecipe: (r: Recipe | null) => void;
  addMissingFromRecipe: (recipe: Recipe) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  density: 'cozy' | 'compact';
  setDensity: (d: 'cozy' | 'compact') => void;
  showSuggestions: boolean;
  setShowSuggestions: (v: boolean) => void;
  recent: string[];
  activity: string[];
  sortMode: SortMode;
  setSortMode: (m: SortMode) => void;
}> = ({
  items,
  presence,
  isOffline,
  queued,
  toggleItem,
  addItem,
  removeItem,
  setIsOffline,
  resetQueue,
  offlineCopy,
  suggestedRecipe,
  setSuggestedRecipe,
  addMissingFromRecipe,
  searchQuery,
  setSearchQuery,
  density,
  setDensity,
  showSuggestions,
  setShowSuggestions,
  recent,
  activity,
  sortMode,
  setSortMode,
}) => {
  const quickAdds = ['Tomaten', 'Hafermilch', 'Brot', 'Kaffee', 'Joghurt'];
  const inlineSuggestions = mockRecipes.slice(0, 3);
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((it) => it.name.toLowerCase().includes(q) || it.category.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const grouped = useMemo(() => {
    const collection: Record<string, ShoppingItem[]> = {};
    filtered.forEach((item) => {
      const key = item.category || 'Sonstiges';
      if (!collection[key]) collection[key] = [];
      collection[key].push(item);
    });
    const getAisle = (category: string) => {
      const section = storeSections.find(
        (s) => s.label.toLowerCase() === category.toLowerCase() || s.items.some((i) => i.toLowerCase() === category.toLowerCase()),
      );
      return section ? section.aisle : 999;
    };
    const sortedEntries = Object.entries(collection).sort(([a], [b]) => {
      if (sortMode === 'aisle') return getAisle(a) - getAisle(b);
      return a.localeCompare(b);
    });
    return sortedEntries.map(([category, list]) => {
      const itemsSorted = [...list].sort((a, b) => {
        if (sortMode === 'priority') {
          const prio = (val?: string) => (val === 'high' ? 0 : 1);
          if (prio(a.priority) !== prio(b.priority)) return prio(a.priority) - prio(b.priority);
        }
        return a.name.localeCompare(b.name);
      });
      return [category, itemsSorted] as [string, ShoppingItem[]];
    });
  }, [filtered, sortMode]);

  return (
    <Section title="Geteilte Einkaufsliste" subtitle="Schnell abhaken, teilen, offline sicher.">
      <View style={styles.listHeader}>
        <Badge label="WG / Familie" tone="accent" />
        <View style={styles.listActions}>
          <Pressable
            style={styles.addButton}
            onPress={() => addItem('Bananen', 'wir', 'Obst')}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addText}>Hinzufügen</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.listControlRow}>
        <View style={styles.segment}>
          {(['cozy', 'compact'] as const).map((mode) => (
            <Pressable
              key={mode}
              style={[styles.segmentButton, density === mode && styles.segmentButtonActive]}
              onPress={() => setDensity(mode)}
            >
              <Text style={[styles.metaText, density === mode && { color: colors.ink }]}>
                {mode === 'cozy' ? 'Locker' : 'Kompakt'}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.segment}>
          {(['category', 'aisle', 'priority'] as SortMode[]).map((mode) => (
            <Pressable
              key={mode}
              style={[styles.segmentButton, sortMode === mode && styles.segmentButtonActive]}
              onPress={() => setSortMode(mode)}
            >
              <Text style={[styles.metaText, sortMode === mode && { color: colors.ink }]}>
                {mode === 'category' ? 'Kategorien' : mode === 'aisle' ? 'Gänge' : 'Prio'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.listControlRow}>
        <View style={styles.collabPill}>
          <Ionicons name="people" size={16} color={colors.accent} />
          <Text style={styles.metaText}>Owner + Editor können bearbeiten</Text>
        </View>
        <View style={styles.inlineSwitch}>
          <Text style={styles.metaText}>Vorschläge</Text>
          <Switch value={showSuggestions} onValueChange={setShowSuggestions} thumbColor={colors.accent} />
        </View>
      </View>

      <View style={styles.quickChipRow}>
        {quickAdds.map((label) => (
          <Pressable key={label} style={styles.quickChip} onPress={() => addItem(label, 'wir', 'Schnellzugriff')}>
            <Text style={styles.quickChipText}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.recentRow}>
        <Text style={styles.metaText}>Zuletzt gekauft</Text>
        <View style={styles.recentChips}>
          {recent.map((r) => (
            <Pressable key={r} style={styles.recentChip} onPress={() => addItem(r, 'wir', 'Wiederkehrend')}>
              <Text style={styles.metaText}>{r}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Suche in der Liste..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      {showSuggestions ? (
        <View style={styles.inlineSuggestRow}>
          {inlineSuggestions.map((r) => (
            <Pressable key={r.id} style={styles.inlineSuggest} onPress={() => setSuggestedRecipe(r)}>
              <Ionicons name="sparkles" size={16} color={colors.accent} />
              <Text style={styles.metaText}>{r.title}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {grouped.map(([category, groupedItems], idxCategory) => {
        const section = storeSections.find(
          (s) => s.label.toLowerCase() === category.toLowerCase() || s.id.toLowerCase() === category.toLowerCase(),
        );
        return (
          <View key={category} style={styles.categoryBlock}>
            <View style={styles.categoryHeader}>
              <View>
                <Text style={styles.sectionTitle}>{category}</Text>
                {section ? <Text style={styles.metaMuted}>{section.icon} Gang {section.aisle}</Text> : null}
              </View>
              <Badge label={`${groupedItems.length} Artikel`} tone="accent" />
            </View>
            {groupedItems.map((item, idxItem) => {
              const assignee = presence.find((p) => p.id === item.assignedTo);
              const compact = density === 'compact';
              return (
                <Swipeable
                  key={item.id}
                  renderRightActions={() => (
                    <Pressable style={styles.swipeDelete} onPress={() => removeItem(item.id)}>
                      <Ionicons name="trash" size={20} color={colors.text} />
                    </Pressable>
                  )}
                  renderLeftActions={() => (
                    <Pressable style={styles.swipeCheck} onPress={() => toggleItem(item.id)}>
                      <Ionicons name="checkmark" size={20} color={colors.text} />
                    </Pressable>
                  )}
                >
                  <View
                    style={[styles.listItem, compact && styles.listItemCompact]}
                  >
                    <View style={styles.itemLeft}>
                      <Ionicons
                        name={item.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'}
                        size={compact ? 18 : 22}
                        color={item.status === 'done' ? colors.success : colors.muted}
                      />
                      <Pressable onPress={() => toggleItem(item.id)}>
                        <Text style={[styles.itemTitle, compact && styles.itemTitleCompact, item.status === 'done' && styles.itemDone]}>
                          {item.name}
                        </Text>
                        <Text style={[styles.metaMuted, compact && styles.metaMutedCompact]}>
                          {item.quantity} • {item.category}
                        </Text>
                      </Pressable>
                    </View>
                    <View style={styles.itemRight}>
                      {item.priority === 'high' ? <Badge label="Dringend" tone="accent" /> : null}
                      {assignee ? <Avatar member={assignee} size={28} /> : null}
                      <Pressable style={styles.iconButton} onPress={() => toggleItem(item.id)}>
                        <Ionicons name={item.status === 'done' ? 'refresh' : 'checkmark'} size={18} color={colors.accent} />
                      </Pressable>
                      <Pressable style={styles.iconButton} onPress={() => removeItem(item.id)}>
                        <Ionicons name="trash-outline" size={18} color={colors.muted} />
                      </Pressable>
                      <Pressable
                        style={styles.iconButton}
                        onPress={() => {
                          const match = mockRecipes.find((r) =>
                            r.description.toLowerCase().includes(item.name.toLowerCase()) ||
                            r.tags.some((t) => t.toLowerCase().includes(item.name.toLowerCase())),
                          );
                          setSuggestedRecipe(match ?? mockRecipes[0]);
                        }}
                      >
                        <Ionicons name="sparkles" size={18} color={colors.warning} />
                      </Pressable>
                    </View>
                  </View>
                </Swipeable>
              );
            })}
          </View>
        );
      })}

      {suggestedRecipe ? (
        <View style={styles.suggestCard}>
          <Text style={styles.sectionTitle}>Rezept-Idee</Text>
          <Text style={styles.sectionSubtitle}>{suggestedRecipe.title}</Text>
          <Text style={styles.metaMuted}>{suggestedRecipe.description}</Text>
          <View style={styles.recipeTags}>
            {suggestedRecipe.tags.map((tag) => (
              <Badge key={tag} label={tag} />
            ))}
          </View>
          <View style={styles.suggestActions}>
            <Pressable style={styles.primaryButton} onPress={() => addMissingFromRecipe(suggestedRecipe)}>
              <Ionicons name="cart" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Fehlende Zutaten hinzufügen</Text>
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => setSuggestedRecipe(null)}>
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.offlineRow}>
        <Text style={styles.metaText}>Offline-Sync</Text>
        <View style={styles.offlineControls}>
          <Pressable style={styles.ghostButton} onPress={() => { resetQueue(); setIsOffline(false); }}>
            <Ionicons name="refresh" size={16} color={colors.muted} />
            <Text style={styles.metaText}>Sync jetzt</Text>
          </Pressable>
          <Switch value={isOffline} onValueChange={setIsOffline} thumbColor={isOffline ? colors.accent : '#fff'} />
        </View>
      </View>
      {isOffline ? (
        <View style={styles.offlineCard}>
          <Text style={styles.sectionTitle}>{offlineCopy.title}</Text>
          <Text style={styles.sectionSubtitle}>{offlineCopy.message}</Text>
          {queued.length > 0 ? (
            <View>
              {queued.map((q) => (
                <Text key={q} style={styles.metaMuted}>
                  • {q}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.metaMuted}>Änderungen werden lokal gehalten.</Text>
          )}
        </View>
      ) : queued.length > 0 ? (
        <View style={styles.syncCard}>
          <Text style={styles.sectionSubtitle}>Synchronisiert</Text>
          <Pressable onPress={resetQueue}>
            <Text style={[styles.metaText, { color: colors.accent }]}>Sync-Log leeren</Text>
          </Pressable>
        </View>
      ) : null}

      {activity.length > 0 ? (
        <View style={styles.activityCard}>
          <View style={styles.activityHeader}>
            <Text style={styles.sectionTitle}>Aktivität</Text>
            <Text style={[styles.metaMuted, { color: colors.accent }]}>Protokoll bleibt lokal</Text>
          </View>
          {activity.slice(0, 4).map((entry, idx) => (
            <View key={idx} style={styles.activityRow}>
              <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.accent} />
              <Text style={styles.metaMuted}>{entry}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Section>
  );
};

const RecipesSection: React.FC<{
  recipes: Recipe[];
  aiRequestsLeft: number;
  requestAI: (r: Recipe) => void;
  selectedRecipe: Recipe;
}> = ({ recipes, aiRequestsLeft, requestAI, selectedRecipe }) => (
  <Section title="Smarte Rezepte mit KI" subtitle="Pantry-basiert, Allergene im Blick, 10 Requests im Free-Plan.">
    <FlatList
      horizontal
      data={recipes}
      keyExtractor={(r) => r.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12 }}
      renderItem={({ item }) => (
        <RecipeCard recipe={item} onSelect={() => requestAI(item)} aiLeft={aiRequestsLeft} gated={aiRequestsLeft <= 0} />
      )}
    />
    <View style={styles.selectedRecipe}>
      <Text style={styles.sectionSubtitle}>Vorgeschlagen:</Text>
      <Text style={styles.sectionTitle}>{selectedRecipe.title}</Text>
      <Text style={styles.recipeDesc}>{selectedRecipe.description}</Text>
      <View style={styles.recipeTags}>
        <Badge label={selectedRecipe.byPantry} tone="accent" />
        <Badge label={`Allergene: ${selectedRecipe.allergens.join(', ')}`} />
      </View>
    </View>
  </Section>
);

const NavigationSection: React.FC<{
  storeMap: StoreMap;
  items: ShoppingItem[];
  customNodes: NavNode[];
  addNode: (label: string, sectionId: string, row: number, col: number) => void;
  clearNodes: () => void;
  optimiseRoute: () => void;
  routeOrder: string[];
  visited: string[];
  form: { label: string; section: string; row: string; col: string };
  setForm: (f: Partial<{ label: string; section: string; row: string; col: string }>) => void;
  pdrState: PdrState;
  pdrActive: boolean;
  togglePdr: () => void;
  startNodeId: string;
  onSelectStart: (id: string) => void;
  pdrPath: PdrPoint[];
  motionDebug: MotionDebug;
  sensorHealth: SensorHealth;
  wifiAnchor: StoreMapAnchor | null;
  wifiStatus: 'mock' | 'live' | 'off';
  wifiNote?: string | null;
  wifiLastScanAt?: number | null;
  wifiLastCount?: number;
  wifiFix?: WifiFix | null;
  onMockAnchor: (anchor: StoreMapAnchor) => void;
  onScanWifi?: () => void;
  onUseBestWifiAsAnchor?: () => void;
  wifiConfidence: number;
  strideScale?: number;
  onAdjustStrideScale?: (delta: number) => void;
  onResetHeading?: () => void;
  testMode?: boolean;
  pdrConfidence: 'good' | 'ok' | 'low';
  onRecenter: () => void;
  mapMode: 'pilot' | 'house';
  onChangeMapMode: (m: 'pilot' | 'house') => void;
  planId: 'house' | 'neue';
  onChangePlanId: (id: 'house' | 'neue') => void;
  planImage: any;
  planImagePixelsPerMeter: number;
  setPlanImagePixelsPerMeter: (n: number) => void;
  planDefaultImagePixelsPerMeter?: number;
  planTool: PlanTool;
  setPlanTool: (t: PlanTool) => void;
  planMeasureA: { x: number; y: number } | null;
  planMeasureB: { x: number; y: number } | null;
  setPlanMeasureA: (p: { x: number; y: number } | null) => void;
  setPlanMeasureB: (p: { x: number; y: number } | null) => void;
  onSetAnchorAt?: (pMeters: PdrPoint) => void;
  planCalA: { x: number; y: number } | null;
  planCalB: { x: number; y: number } | null;
  setPlanCalA: (p: { x: number; y: number } | null) => void;
  setPlanCalB: (p: { x: number; y: number } | null) => void;
  planCalMeters: string;
  setPlanCalMeters: (v: string) => void;
  onPlanTap: (pMeters: PdrPoint, pPx: { x: number; y: number }) => void;
}> = ({
  storeMap,
  items,
  customNodes,
  addNode,
  clearNodes,
  optimiseRoute,
  routeOrder,
  visited,
  form,
  setForm,
  pdrState,
  pdrActive,
  togglePdr,
  startNodeId,
  onSelectStart,
  pdrPath,
  motionDebug,
  sensorHealth,
  wifiAnchor,
  wifiStatus,
  wifiNote,
  wifiLastScanAt,
  wifiLastCount,
  wifiFix,
  onMockAnchor,
  onScanWifi,
  onUseBestWifiAsAnchor,
  wifiConfidence,
  strideScale,
  onAdjustStrideScale,
  onResetHeading,
  testMode = false,
  pdrConfidence,
  onRecenter,
  mapMode,
  onChangeMapMode,
  planId,
  onChangePlanId,
  planImage,
  planImagePixelsPerMeter,
  setPlanImagePixelsPerMeter,
  planDefaultImagePixelsPerMeter,
  planTool,
  setPlanTool,
  planMeasureA,
  planMeasureB,
  setPlanMeasureA,
  setPlanMeasureB,
  onSetAnchorAt,
  planCalA,
  planCalB,
  setPlanCalA,
  setPlanCalB,
  planCalMeters,
  setPlanCalMeters,
  onPlanTap,
}) => {
  const pending = items.filter((i) => i.status === 'pending');
  const done = items.filter((i) => i.status === 'done');
  const matched = pending
    .map((it) => {
      const section = storeSections.find((s) =>
        s.items.some((name) => name.toLowerCase() === it.name.toLowerCase()),
      );
      return section ? { item: it, section } : null;
    })
    .filter(Boolean) as { item: ShoppingItem; section: StoreSection }[];

  const orderedSections = useMemo(() => {
    const unique: StoreSection[] = [];
    matched.forEach(({ section }) => {
      if (!unique.some((s) => s.id === section.id)) {
        unique.push(section);
      }
    });
    return unique.sort((a, b) => a.aisle - b.aisle);
  }, [matched]);

  const estimatedMinutes = Math.max(3, orderedSections.length * 2);
  const doneSections = useMemo(() => {
    const found: StoreSection[] = [];
    done.forEach((it) => {
      const section = storeSections.find((s) =>
        s.items.some((name) => name.toLowerCase() === it.name.toLowerCase()),
      );
      if (section && !found.some((s) => s.id === section.id)) {
        found.push(section);
      }
    });
    return found;
  }, [done]);
  const progress =
    orderedSections.length + doneSections.length === 0 ? 0 : doneSections.length / (orderedSections.length + doneSections.length);
  const lastStepAgoSec = motionDebug.lastStepAt ? (Date.now() - motionDebug.lastStepAt) / 1000 : null;
  const cadencePerMin =
    motionDebug.lastIntervalMs > 0 ? Math.round(60000 / motionDebug.lastIntervalMs) : 0;
  const stepPulse = lastStepAgoSec !== null && lastStepAgoSec < 0.6;
  const sensorLabel = (ok: boolean | null) => (ok === null ? '?' : ok ? 'ok' : 'no');
  const ageSec = (t: number | null) => (t ? `${((Date.now() - t) / 1000).toFixed(1)}s` : '—');
  const wifiAge = wifiLastScanAt ? `${((Date.now() - wifiLastScanAt) / 1000).toFixed(1)}s` : '—';
  const gridSize = storeMap.gridSize;
  const anchors: StoreMapAnchor[] = storeMap.anchors ?? [];

  const findFreeSlot = () => {
    const occupied = [...storeMap.nodes, ...customNodes].map((n) => `${Math.floor(n.y)}-${Math.floor(n.x)}`);
    for (let r = 0; r < gridSize; r += 1) {
      for (let c = 0; c < gridSize; c += 1) {
        if (!occupied.includes(`${r}-${c}`)) {
          return { row: r, col: c };
        }
      }
    }
    return { row: 0, col: 0 };
  };

  const quickSections = [
    { label: 'Milchprodukte', section: 'dairy' },
    { label: 'Obst & Gemüse', section: 'produce' },
    { label: 'Brot', section: 'bakery' },
    { label: 'Proteine', section: 'protein' },
  ];

  return (
    <Section
      title="Markt-Navigation"
      subtitle="Eigener Floorplan, optimierte Route. Modern & klar."
    >
      <View style={styles.navInfoCard}>
        <View>
          <Text style={styles.sectionTitle}>Navigation</Text>
          <Text style={styles.metaMuted}>
            {mapMode === 'house' ? 'House Floorplan Mode' : `${orderedSections.length} Stopps • ~${estimatedMinutes} min`}
          </Text>
        </View>
        <View style={styles.navPills}>
          <Badge label={mapMode === 'house' ? 'Plan' : `${pending.length} offen`} tone="accent" />
          <Badge label={mapMode === 'house' ? 'Free Move' : `${customNodes.length} Gänge`} tone="muted" />
        </View>
      </View>
      <View style={styles.listControlRow}>
        <View style={styles.segment}>
          {(['pilot', 'house'] as const).map((m) => (
            <Pressable
              key={m}
              style={[styles.segmentButton, mapMode === m && styles.segmentButtonActive]}
              onPress={() => onChangeMapMode(m)}
            >
              <Text style={[styles.metaText, mapMode === m && { color: colors.ink }]}>
                {m === 'pilot' ? 'Pilot Store' : 'House Plan'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.pdrCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.sectionTitle}>Sensor-Tracking</Text>
          <Pressable style={[styles.primaryButton, { paddingVertical: 8 }]} onPress={togglePdr}>
            <Text style={styles.primaryButtonText}>{pdrActive ? 'Stop' : 'Start'}</Text>
          </Pressable>
        </View>
        <View style={styles.pdrRow}>
          <Badge label={`Steps ${pdrState.steps}`} tone="accent" />
          <Badge label={`Heading ${pdrState.heading.toFixed(0)}°`} />
          <Badge label={`Floor ~${pdrState.floor}`} />
          <Badge label={pdrState.status === 'tracking' ? 'Live' : pdrState.status === 'denied' ? 'Denied' : 'Idle'} tone={pdrState.status === 'tracking' ? 'success' : 'muted'} />
          <Badge label={`Pfad ${pdrPath.length}`} />
          <Badge label={`Wi-Fi ${wifiStatus}${wifiAnchor ? ` • ${wifiAnchor.label}` : ''}`} />
          <Badge label={`Conf ${Math.round(wifiConfidence * 100)}%`} />
          <Badge label={`PDR ${pdrConfidence}`} />
          <Badge label={`OS ${Platform.OS}`} />
        </View>
        <View style={styles.pdrRow}>
          <Badge label={`Wi‑Fi scan ${wifiAge}`} />
          <Badge label={`APs ${wifiLastCount ?? 0}`} />
          <Badge label={`match ${wifiFix?.matched ?? 0}`} />
          {wifiFix?.best ? <Badge label={`best ${wifiFix.best.level}dBm`} tone="accent" /> : <Badge label="best —" />}
        </View>
        <View style={styles.pdrRow}>
          <Badge label={`DevMotion ${sensorLabel(sensorHealth.deviceMotion.available)} ${ageSec(sensorHealth.deviceMotion.lastAt)}`} />
          <Badge
            label={`Pedom ${sensorLabel(sensorHealth.pedometer.available)} ${ageSec(sensorHealth.pedometer.lastAt)}${
              sensorHealth.pedometer.permission ? ` • ${sensorHealth.pedometer.permission}` : ''
            }`}
          />
          <Badge label={`Mag ${sensorLabel(sensorHealth.mag.available)} ${ageSec(sensorHealth.mag.lastAt)}`} />
          <Badge label={`Baro ${sensorLabel(sensorHealth.baro.available)} ${ageSec(sensorHealth.baro.lastAt)}`} />
        </View>
        <View style={styles.pdrRow}>
          <Badge label={`Att ${pdrState.gyroHeading.toFixed(0)}°`} />
          <Badge label={`Mag ${pdrState.magHeading.toFixed(0)}°`} />
          <Badge label={`src ${motionDebug.stepSource}`} />
          <Badge label={`ped ${motionDebug.pedometerSteps}`} />
          <Badge label={`dev ${motionDebug.deviceSteps}`} />
          <Badge label={`a ${motionDebug.accelMag.toFixed(2)}`} />
          <Badge label={`base ${motionDebug.accelBaseline.toFixed(2)}`} />
          <Badge
            label={`diff ${motionDebug.accelDiff.toFixed(2)}`}
            tone={motionDebug.accelDiff > motionDebug.stepThreshold ? 'accent' : 'muted'}
          />
          <Badge label={`th ${motionDebug.stepThreshold.toFixed(2)}`} />
          <Badge label={`len ${motionDebug.stepLength.toFixed(2)}m`} />
          <Badge label={cadencePerMin ? `cad ${cadencePerMin}/min` : 'cad —'} />
          <Badge
            label={stepPulse ? 'STEP' : lastStepAgoSec !== null ? `${lastStepAgoSec.toFixed(1)}s` : 'no step'}
            tone={stepPulse ? 'success' : 'muted'}
          />
          <Badge label={motionDebug.isStationary ? 'Still' : 'Moving'} tone={motionDebug.isStationary ? 'muted' : 'success'} />
        </View>
        {sensorHealth.deviceMotion.error ||
        sensorHealth.pedometer.error ||
        sensorHealth.mag.error ||
        sensorHealth.baro.error ? (
          <Text style={styles.metaMuted}>
            Sensor error:{' '}
            {[
              sensorHealth.deviceMotion.error,
              sensorHealth.pedometer.error,
              sensorHealth.mag.error,
              sensorHealth.baro.error,
            ]
              .filter(Boolean)
              .join(' | ')}
          </Text>
        ) : null}
        {wifiNote ? <Text style={styles.metaMuted}>Wi‑Fi: {wifiNote}</Text> : null}
        <Text style={styles.metaMuted}>Step wenn diff &gt; th und Δt &gt; 250ms.</Text>
        <View style={styles.pdrRow}>
          {anchors.map((anchor) => (
            <Pressable key={anchor.bssid} style={styles.ghostButton} onPress={() => onMockAnchor(anchor)}>
              <Ionicons name="wifi" size={16} color={colors.accent} />
              <Text style={styles.metaText}>{anchor.label}</Text>
            </Pressable>
          ))}
          {onScanWifi ? (
            <Pressable key="wifi-auto" style={styles.ghostButton} onPress={onScanWifi}>
              <Ionicons name="wifi" size={16} color={colors.accent} />
              <Text style={styles.metaText}>Auto Wi-Fi</Text>
            </Pressable>
          ) : null}
          {onUseBestWifiAsAnchor ? (
            <Pressable
              key="wifi-cal"
              style={styles.ghostButton}
              onPress={onUseBestWifiAsAnchor}
              disabled={!wifiFix?.best}
            >
              <Ionicons name="pin" size={16} color={colors.accent} />
              <Text style={styles.metaText}>{wifiFix?.best ? 'Use best AP as anchor' : 'Scan first'}</Text>
            </Pressable>
          ) : null}
          {onAdjustStrideScale ? (
            <Pressable key="stride-minus" style={styles.ghostButton} onPress={() => onAdjustStrideScale(-0.05)}>
              <Ionicons name="remove" size={16} color={colors.accent} />
              <Text style={styles.metaText}>Stride</Text>
            </Pressable>
          ) : null}
          {typeof strideScale === 'number' ? <Badge label={`x${strideScale.toFixed(2)}`} tone="accent" /> : null}
          {onAdjustStrideScale ? (
            <Pressable key="stride-plus" style={styles.ghostButton} onPress={() => onAdjustStrideScale(0.05)}>
              <Ionicons name="add" size={16} color={colors.accent} />
              <Text style={styles.metaText}>Stride</Text>
            </Pressable>
          ) : null}
          {onResetHeading ? (
            <Pressable key="heading-reset" style={styles.ghostButton} onPress={onResetHeading}>
              <Ionicons name="compass" size={16} color={colors.accent} />
              <Text style={styles.metaText}>Align heading</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.ghostButton}
            onPress={onRecenter}
          >
            <Ionicons name="refresh" size={16} color={colors.accent} />
            <Text style={styles.metaText}>Recenter</Text>
          </Pressable>
        </View>
      </View>

      {!testMode && (
        <>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(100, Math.round(progress * 100))}%` }]} />
          </View>
          <Text style={styles.metaMuted}>
            Fortschritt: {Math.min(100, Math.round(progress * 100))}% (abhängig von abgehakten Artikeln)
          </Text>
        </>
      )}

      {!testMode && mapMode !== 'house' && (
        <View style={styles.glassCard}>
          <Text style={styles.sectionTitle}>Floorplan anpassen</Text>
          <Text style={styles.metaMuted}>Füge Gänge hinzu und platziere sie im Raster.</Text>
          <View style={styles.quickChipRow}>
            {quickSections.map((qs) => (
              <Pressable
                key={qs.section}
                style={styles.quickChip}
                onPress={() => {
                  const slot = findFreeSlot();
                  addNode(qs.label, qs.section, slot.row, slot.col);
                }}
              >
                <Text style={styles.quickChipText}>{qs.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.floorForm}>
            <TextInput
              style={[styles.searchInput, styles.floorInput]}
              placeholder="Label (z.B. Milch)"
              value={form.label}
              onChangeText={(v) => setForm({ label: v })}
            />
            <TextInput
              style={[styles.searchInput, styles.floorInput]}
              placeholder="Section ID (z.B. dairy)"
              value={form.section}
              onChangeText={(v) => setForm({ section: v })}
            />
            <View style={[styles.row, { gap: 8 }]}>
              <TextInput
                style={[styles.searchInput, styles.floorInputSmall]}
                placeholder={`Row (0-${gridSize - 1})`}
                keyboardType="numeric"
                value={form.row}
                onChangeText={(v) => setForm({ row: v })}
              />
              <TextInput
                style={[styles.searchInput, styles.floorInputSmall]}
                placeholder={`Col (0-${gridSize - 1})`}
                keyboardType="numeric"
                value={form.col}
                onChangeText={(v) => setForm({ col: v })}
              />
            </View>
            <View style={[styles.row, { gap: 8, marginTop: 6 }]}>
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  const r = Math.max(0, Math.min(gridSize - 1, Number(form.row) || 0));
                  const c = Math.max(0, Math.min(gridSize - 1, Number(form.col) || 0));
                  addNode(form.label || 'Gang', form.section || 'custom', r, c);
                }}
              >
                <Ionicons name="add" size={18} color={colors.text} />
                <Text style={styles.primaryButtonText}>Gang hinzufügen</Text>
              </Pressable>
              <Pressable style={styles.ghostButton} onPress={clearNodes}>
                <Ionicons name="trash-outline" size={18} color={colors.muted} />
                <Text style={styles.metaText}>Zurücksetzen</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {!testMode && mapMode !== 'house' && (
        <Pressable style={[styles.primaryButton, { marginTop: 10 }]} onPress={optimiseRoute}>
          <Ionicons name="navigate" size={18} color={colors.text} />
          <Text style={styles.primaryButtonText}>Route optimieren</Text>
        </Pressable>
      )}

      <View style={styles.mapLegend}>
        <Text style={styles.metaMuted}>
          {mapMode === 'house' ? 'Tippe auf den Plan, um den Start zu setzen.' : 'Tippe auf einen Punkt, um den Start zu setzen.'}
        </Text>
        <Badge label={`Start: ${startNodeId}`} />
        {wifiAnchor ? <Badge label={`Anchor: ${wifiAnchor.label}`} tone="accent" /> : null}
      </View>

      {mapMode === 'house' ? (
        <>
          <View style={styles.listControlRow}>
            <View style={styles.segment}>
              {(['house', 'neue'] as const).map((id) => (
                <Pressable
                  key={id}
                  style={[styles.segmentButton, planId === id && styles.segmentButtonActive]}
                  onPress={() => onChangePlanId(id)}
                >
                  <Text style={[styles.metaText, planId === id && { color: colors.ink }]}>
                    {id === 'house' ? 'House' : 'Neue'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.listControlRow}>
            <View style={styles.segment}>
              {(['start', 'measure', 'anchor'] as const).map((t) => (
                <Pressable
                  key={t}
                  style={[styles.segmentButton, planTool === t && styles.segmentButtonActive]}
                  onPress={() => setPlanTool(t)}
                >
                  <Text style={[styles.metaText, planTool === t && { color: colors.ink }]}>
                    {t === 'start' ? 'Start' : t === 'measure' ? 'Measure' : 'Anchor'}
                  </Text>
                </Pressable>
              ))}
            </View>
            {planTool !== 'start' ? (
              <Pressable
                style={styles.ghostButton}
                onPress={() => {
                  setPlanMeasureA(null);
                  setPlanMeasureB(null);
                }}
              >
                <Ionicons name="trash-outline" size={16} color={colors.muted} />
                <Text style={styles.metaText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.planControls}>
            <Text style={styles.metaText}>Scale</Text>
            <TextInput
              style={[styles.searchInput, styles.floorInputSmall]}
              placeholder="img px / m"
              keyboardType="numeric"
              value={String(Math.round(planImagePixelsPerMeter))}
              onChangeText={(v) => setPlanImagePixelsPerMeter(Number(v) || 1)}
            />
            {planId === 'neue' ? <Badge label="1:74" tone="accent" /> : null}
            <Pressable
              style={styles.ghostButton}
              onPress={() => {
                setPlanCalA(null);
                setPlanCalB(null);
                setPlanCalMeters('');
                if (planDefaultImagePixelsPerMeter) {
                  setPlanImagePixelsPerMeter(planDefaultImagePixelsPerMeter);
                }
              }}
            >
              <Ionicons name="close" size={16} color={colors.muted} />
              <Text style={styles.metaText}>Reset</Text>
            </Pressable>
          </View>
          {planTool === 'measure' && (planMeasureA || planMeasureB) ? (
            <View style={styles.planControls}>
              <Badge label={`A ${planMeasureA ? `${Math.round(planMeasureA.x)},${Math.round(planMeasureA.y)}` : '—'}`} />
              <Badge label={`B ${planMeasureB ? `${Math.round(planMeasureB.x)},${Math.round(planMeasureB.y)}` : '—'}`} />
              {planMeasureA && planMeasureB ? (
                <Badge
                  label={`Δ ${(Math.hypot(planMeasureB.x - planMeasureA.x, planMeasureB.y - planMeasureA.y) / Math.max(0.0001, planImagePixelsPerMeter)).toFixed(2)} m`}
                  tone="accent"
                />
              ) : (
                <Text style={styles.metaMuted}>Tap point {planMeasureA ? 'B' : 'A'}</Text>
              )}
            </View>
          ) : null}
          {planId === 'house' ? (
            <>
              <Text style={styles.metaMuted}>
                Kalibrieren: Tippe 2 Punkte auf dem Plan, gib die reale Distanz (m) ein, dann „Apply“.
              </Text>
              <View style={styles.planControls}>
                <Badge label={`A ${planCalA ? `${Math.round(planCalA.x)},${Math.round(planCalA.y)}` : '—'}`} />
                <Badge label={`B ${planCalB ? `${Math.round(planCalB.x)},${Math.round(planCalB.y)}` : '—'}`} />
                {planCalA && planCalB ? (
                  <Badge
                    label={`d ${(Math.hypot(planCalB.x - planCalA.x, planCalB.y - planCalA.y) / Math.max(1, planImagePixelsPerMeter)).toFixed(2)} m`}
                    tone="accent"
                  />
                ) : null}
                <TextInput
                  style={[styles.searchInput, styles.floorInputSmall]}
                  placeholder="meters"
                  keyboardType="numeric"
                  value={planCalMeters}
                  onChangeText={setPlanCalMeters}
                />
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => {
                    if (!planCalA || !planCalB) return;
                    const meters = Number(planCalMeters);
                    if (!Number.isFinite(meters) || meters <= 0.01) return;
                    const dPx = Math.hypot(planCalB.x - planCalA.x, planCalB.y - planCalA.y);
                    const ppm = Math.max(1, dPx / meters);
                    setPlanImagePixelsPerMeter(ppm);
                  }}
                >
                  <Ionicons name="checkmark" size={18} color={colors.text} />
                  <Text style={styles.primaryButtonText}>Apply</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.metaMuted}>Scale ist hardcoded über 1:74 (PNG @ 72dpi).</Text>
          )}
          <FloorplanImageCanvas
            source={planImage}
            imagePixelsPerMeter={planImagePixelsPerMeter}
            path={pdrPath}
            current={pdrPath[pdrPath.length - 1]}
            onTapMeters={(p, px) => {
              if (planTool === 'measure') {
                if (!planMeasureA) setPlanMeasureA(px);
                else if (!planMeasureB) setPlanMeasureB(px);
                else {
                  setPlanMeasureA(px);
                  setPlanMeasureB(null);
                }
                return;
              }
              if (planTool === 'anchor') {
                onSetAnchorAt?.(p);
                return;
              }
              onPlanTap(p, px);
            }}
          />
        </>
      ) : (
        <FloorplanCanvas
          nodes={[...storeMap.nodes, ...customNodes]}
          gridSize={gridSize}
          routeOrder={routeOrder}
          visited={visited}
          startId={startNodeId}
          onSelectNode={(node) => onSelectStart(node.id)}
          path={pdrPath}
          current={pdrPath[pdrPath.length - 1]}
        />
      )}

      {!testMode && mapMode !== 'house' && (
        <View style={styles.routeSteps}>
          {orderedSections.map((section, idx) => {
            const sectionItems = matched.filter((m) => m.section.id === section.id).map((m) => m.item.name);
            return (
              <View key={section.id} style={styles.routeStep}>
                <View style={styles.routeStepCircle}>
                  <Text style={styles.routeStepText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sectionTitle}>{section.label}</Text>
                  <Text style={styles.metaMuted}>{sectionItems.join(', ')}</Text>
                </View>
                <Badge label={`Gang ${section.aisle}`} tone="accent" />
              </View>
            );
          })}
        </View>
      )}

      {!testMode && mapMode !== 'house' && (
        <View style={styles.navCtaRow}>
          <View>
            <Text style={styles.sectionTitle}>Zeit sparen im Markt</Text>
            <Text style={styles.metaMuted}>Aisle-Hints sind Free. Turn-by-Turn im Pro/Familienplan.</Text>
          </View>
          <Pressable style={styles.primaryButton}>
            <Ionicons name="navigate" size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>Route starten</Text>
          </Pressable>
        </View>
      )}
    </Section>
  );
};

const PlansSection: React.FC<{
  activeTier: TierId;
  setActiveTier: (id: TierId) => void;
}> = ({ activeTier, setActiveTier }) => (
  <Section title="Upsell & Wochenplanung" subtitle="Freemium mit klaren Stufen und Add-on für AI.">
    <View style={styles.tierGrid}>
      <TierCard id="free" active={activeTier === 'free'} onSelect={() => setActiveTier('free')} />
      <TierCard id="pro" active={activeTier === 'pro'} onSelect={() => setActiveTier('pro')} />
      <TierCard id="family" active={activeTier === 'family'} onSelect={() => setActiveTier('family')} />
    </View>
    <View style={styles.weekPlan}>
      <Text style={styles.sectionTitle}>Wochenplanung</Text>
      <Text style={styles.sectionSubtitle}>Auto-Listen aus deinem Wochenplan (Pro+).</Text>
      <View style={styles.planRow}>
        <Badge label="Mo" tone="accent" />
        <Text style={styles.metaText}>Cremiges Gemüse-Curry</Text>
      </View>
      <View style={styles.planRow}>
      <Badge label="Di" tone="accent" />
      <Text style={styles.metaText}>Protein Bowl</Text>
    </View>
    <View style={styles.planRow}>
      <Badge label="Mi" tone="accent" />
      <Text style={styles.metaText}>Pasta Verde</Text>
    </View>
  </View>
</Section>
);

const TabBar: React.FC<{ activeTab: TabId; onChange: (id: TabId) => void }> = ({ activeTab, onChange }) => (
  <View style={styles.tabBar}>
    {tabs.map((tab) => {
      const focused = tab.id === activeTab;
      return (
        <Pressable key={tab.id} style={styles.tabItem} onPress={() => onChange(tab.id)}>
          <Ionicons name={tab.icon} size={22} color={focused ? colors.accent : colors.muted} />
          <Text style={[styles.tabLabel, focused && { color: colors.accent, fontWeight: '700' }]}>{tab.label}</Text>
          {focused ? <View style={styles.tabIndicator} /> : null}
        </Pressable>
      );
    })}
  </View>
);

export default function App() {
  const [fontsLoaded] = useFonts({
    PlayfairDisplay_700Bold,
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  const [locale, setLocale] = useState<Locale>('de');
  const t = translations[locale];
  const [isOffline, setIsOffline] = useState(false);
  const [aiRequestsLeft, setAiRequestsLeft] = useState(10);
  const [aiOpen, setAiOpen] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe>(mockRecipes[0]);
  const [items, setItems] = useState<ShoppingItem[]>(initialItems);
  const [queued, setQueued] = useState<string[]>([]);
  const [activeTier, setActiveTier] = useState<TierId>('free');
  const [presence] = useState<HouseholdMember[]>(members);
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestedRecipe, setSuggestedRecipe] = useState<Recipe | null>(null);
  const [customNodes, setCustomNodes] = useState<NavNode[]>([]);
  const [routeOrder, setRouteOrder] = useState<string[]>(['entry', 'exit']);
  const [floorForm, setFloorForm] = useState({ label: '', section: '', row: '0', col: '0' });
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiCandidates, setAiCandidates] = useState<Recipe[]>([]);
  const [density, setDensity] = useState<'cozy' | 'compact'>('cozy');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('category');
  const [recent, setRecent] = useState<string[]>(['Milch', 'Brot', 'Eier']);
  const [activity, setActivity] = useState<string[]>(['Willkommen in deiner Liste.']);
  const [pdrActive, setPdrActive] = useState(false);
  const [navMapMode, setNavMapMode] = useState<'pilot' | 'house'>('pilot');
  const [planId, setPlanId] = useState<PlanId>('house');
  const activePlan = useMemo(() => planConfigs[planId], [planId]);
  const [planTool, setPlanTool] = useState<PlanTool>('start');
  const [planMeasureA, setPlanMeasureA] = useState<{ x: number; y: number } | null>(null);
  const [planMeasureB, setPlanMeasureB] = useState<{ x: number; y: number } | null>(null);
  const [planAnchorsById, setPlanAnchorsById] = useState<Record<PlanId, StoreMapAnchor[]>>(() => ({
    house: [
      { bssid: '8c:19:b5:d8:b1:6d', label: 'Home Wi‑Fi', x: 1, y: 1, floor: 0, source: 'live', confidence: 0.9 },
    ],
    neue: [
      { bssid: '8c:19:b5:d8:b1:6d', label: 'Home Wi‑Fi', x: 1, y: 1, floor: 0, source: 'live', confidence: 0.9 },
    ],
  }));
  const activeStoreMap: StoreMap = useMemo(() => {
    if (navMapMode !== 'house') return defaultStoreMap;
    const anchors = planAnchorsById[planId] ?? [];
    return { ...activePlan.map, anchors };
  }, [navMapMode, activePlan, planAnchorsById, planId]);
  const [planImagePixelsPerMeter, setPlanImagePixelsPerMeter] = useState(
    activePlan.defaultImagePixelsPerMeter ?? 90,
  );
  const [planCalA, setPlanCalA] = useState<{ x: number; y: number } | null>(null);
  const [planCalB, setPlanCalB] = useState<{ x: number; y: number } | null>(null);
  const [planCalMeters, setPlanCalMeters] = useState('');
  const [startOverride, setStartOverride] = useState<PdrPoint | null>(null);
  const [pdrState, setPdrState] = useState<PdrState>({
    steps: 0,
    heading: 0,
    gyroHeading: 0,
    magHeading: 0,
    floor: 0,
    pressure: 0,
    status: 'idle',
  });
  const pdrBaseline = React.useRef<number | null>(null);
  const [startNodeId, setStartNodeId] = useState<string>('entry');
  const [pdrPath, setPdrPath] = useState<PdrPoint[]>([]);
  const headingRef = React.useRef(0);
  const magHeadingRef = React.useRef(0);
  const gyroHeadingRef = React.useRef(0);
  const gyroIntegratedHeadingRef = React.useRef(0);
  const lastMotionAtRef = React.useRef<number | null>(null);
  const yawRateRef = React.useRef(0);
  const magStrengthEmaRef = React.useRef<number | null>(null);
  const magReliabilityRef = React.useRef(0.5);
  const [pdrConfidence, setPdrConfidence] = useState<'good' | 'ok' | 'low'>('ok');
  const lastStepTime = React.useRef<number>(0);
  const stepLengthRef = React.useRef(0.6);
  const strideScaleRef = React.useRef(1);
  const [strideScale, setStrideScale] = useState(1);
  const [motionDebug, setMotionDebug] = useState<MotionDebug>({
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
  });
  const [sensorHealth, setSensorHealth] = useState<SensorHealth>({
    accel: { available: null, lastAt: null },
    gyro: { available: null, lastAt: null },
    mag: { available: null, lastAt: null },
    baro: { available: null, lastAt: null },
    deviceMotion: { available: null, lastAt: null },
    pedometer: { available: null, lastAt: null },
  });
  const sensorHealthRef = React.useRef<SensorHealth>(sensorHealth);
  const motionDebugRef = React.useRef<MotionDebug>(motionDebug);
  const lastDebugUpdateRef = React.useRef(0);
  const stationarySinceRef = React.useRef<number | null>(null);
  const lastIntervalRef = React.useRef(0);
  const lastPedometerStepsRef = React.useRef<number | null>(null);
  const deviceStepsRef = React.useRef(0);
  const stepPeakRef = React.useRef<{ inPeak: boolean; max: number }>({ inPeak: false, max: 0 });
  const linAccWindowRef = React.useRef<number[]>([]);
  const gravityRef = React.useRef<{ x: number; y: number; z: number; init: boolean }>({ x: 0, y: 0, z: 0, init: false });
  const getStartCoord = React.useCallback((): PdrPoint => {
    if (startOverride) return startOverride;
    const all = [...activeStoreMap.nodes, ...customNodes];
    const node = all.find((n) => n.id === startNodeId) || all[0];
    return { x: node?.x ?? 0.5, y: node?.y ?? 0.5 };
  }, [startOverride, startNodeId, activeStoreMap, customNodes]);
  const [wifiAnchor, setWifiAnchor] = useState<StoreMapAnchor | null>(null);
  const [wifiStatus, setWifiStatus] = useState<'mock' | 'live' | 'off'>('mock');
  const [wifiConfidence, setWifiConfidence] = useState(0.7);
  const [wifiNote, setWifiNote] = useState<string | null>(null);
  const [wifiLastScanAt, setWifiLastScanAt] = useState<number | null>(null);
  const [wifiLastCount, setWifiLastCount] = useState(0);
  const [wifiFix, setWifiFix] = useState<WifiFix | null>(null);
  const wifiScanInFlightRef = React.useRef(false);
  const wifiRssiEmaRef = React.useRef<Record<string, number>>({});
  const computeWifiFix = React.useCallback(
    (readings: WifiReading[], anchors: StoreMapAnchor[]): WifiFix | null => {
      const byBssid = new Map<string, StoreMapAnchor>();
      anchors.forEach((a) => byBssid.set(normalizeBssid(a.bssid), a));

      const matched = readings
        .filter((r) => r?.bssid)
        .map((r) => ({ ...r, bssid: normalizeBssid(r.bssid) }))
        .filter((r) => byBssid.has(r.bssid));

      if (!matched.length) return null;

      const best = matched.reduce((acc, r) => (r.level > acc.level ? r : acc), matched[0]);

      const smoothed: { bssid: string; level: number }[] = matched.map((r) => {
        const prev = wifiRssiEmaRef.current[r.bssid];
        const next = prev === undefined ? r.level : prev * 0.65 + r.level * 0.35;
        wifiRssiEmaRef.current[r.bssid] = next;
        return { bssid: r.bssid, level: next };
      });

      let sumW = 0;
      let x = 0;
      let y = 0;
      for (const r of smoothed) {
        const a = byBssid.get(r.bssid);
        if (!a) continue;
        const w = clamp(Math.exp((clamp(r.level, -95, -35) + 100) / 10), 1, 400);
        sumW += w;
        x += a.x * w;
        y += a.y * w;
      }
      if (sumW <= 0) return null;
      return { x: x / sumW, y: y / sumW, matched: matched.length, best };
    },
    [],
  );

  const applyWifiCorrection = React.useCallback(
    (fix: PdrPoint, conf: number) => {
      setPdrPath((prev) => {
        const current = prev[prev.length - 1] || fix;
        const dist = Math.hypot(current.x - fix.x, current.y - fix.y);
        const moving = !motionDebugRef.current.isStationary;
        const blend = clamp(conf * (moving ? 0.35 : 0.75), 0.08, 0.7);

        // If we're extremely far away but Wi‑Fi is strong, hard reset (helps after drift).
        if (dist > 10 && conf > 0.75) return [fix];

        // If Wi‑Fi is weak and far, ignore to prevent snapping to wrong AP.
        if (dist > 6 && conf < 0.45) return prev;

        const blended = { x: current.x * (1 - blend) + fix.x * blend, y: current.y * (1 - blend) + fix.y * blend };
        return [...prev, blended].slice(-200);
      });
    },
    [],
  );

  const scanWifiOnce = React.useCallback(async () => {
    if (Platform.OS === 'web') {
      setWifiStatus('off');
      setWifiAnchor(null);
      setWifiConfidence(0);
      setWifiNote('Wi‑Fi scan not available on web.');
      setWifiLastScanAt(Date.now());
      setWifiLastCount(0);
      setWifiFix(null);
      return;
    }
    if (wifiScanInFlightRef.current) return;
    wifiScanInFlightRef.current = true;

    const now = Date.now();
    try {
      const res = await scanWifi();
      setWifiLastScanAt(now);
      setWifiLastCount(res.readings.length);
      setWifiNote(res.status === 'ok' ? null : res.message ?? 'Wi‑Fi scan failed.');

      const readings = res.readings.filter((r) => r?.bssid);
      const anchors = activeStoreMap.anchors ?? [];
      if (!readings.length || anchors.length === 0) {
        setWifiStatus('off');
        setWifiAnchor(null);
        setWifiConfidence(0);
        setWifiFix(null);
        return;
      }

      const fix = computeWifiFix(readings, anchors);
      if (!fix) {
        setWifiStatus('off');
        setWifiAnchor(null);
        setWifiConfidence(0.15);
        setWifiFix(null);
        return;
      }

      const bestBssid = fix.best?.bssid ? normalizeBssid(fix.best.bssid) : '';
      const bestAnchor = anchors.find((a) => normalizeBssid(a.bssid) === bestBssid) ?? null;

      const bestLevel = fix.best?.level ?? -90;
      const base = clamp((bestLevel + 100) / 55, 0.15, 0.95);
      const multiBoost = clamp(0.08 * (fix.matched - 1), 0, 0.2);
      const conf = clamp(base + multiBoost, 0.15, 0.98);

      setWifiFix(fix);
      setWifiAnchor(bestAnchor ?? { bssid: bestBssid, label: `Wi‑Fi (${fix.matched})`, x: fix.x, y: fix.y, floor: 0, source: 'live', confidence: conf });
      setWifiStatus('live');
      setWifiConfidence(conf);
      if (pdrActive) applyWifiCorrection({ x: fix.x, y: fix.y }, conf);
    } finally {
      wifiScanInFlightRef.current = false;
    }
  }, [activeStoreMap, applyWifiCorrection, computeWifiFix, pdrActive]);

  const useBestWifiAsAnchor = React.useCallback(() => {
    if (navMapMode !== 'house') return;
    const best = wifiFix?.best;
    if (!best?.bssid) return;
    const current = pdrPath[pdrPath.length - 1] || getStartCoord();
    setPlanAnchorsById((prev) => {
      const existing = prev[planId] ?? [];
      const base =
        existing[0] ??
        ({
          bssid: best.bssid,
          label: 'Wi‑Fi Anchor',
          x: current.x,
          y: current.y,
          floor: 0,
          source: 'live',
          confidence: 0.9,
        } as StoreMapAnchor);
      const updated0: StoreMapAnchor = {
        ...base,
        bssid: best.bssid,
        label: base.label?.startsWith('Wi‑Fi') ? base.label : `Wi‑Fi Anchor`,
        x: current.x,
        y: current.y,
        floor: 0,
        source: 'live',
        confidence: clamp(base.confidence ?? 0.85, 0.5, 0.98),
      };
      return { ...prev, [planId]: [updated0, ...existing.slice(1)] };
    });
  }, [getStartCoord, navMapMode, pdrPath, planId, wifiFix?.best]);

  const adjustStrideScale = React.useCallback((delta: number) => {
    setStrideScale((prev) => {
      const next = clamp(Math.round((prev + delta) * 100) / 100, 0.6, 1.5);
      strideScaleRef.current = next;
      return next;
    });
  }, []);

  const resetHeadingToMag = React.useCallback(() => {
    const mag = magHeadingRef.current;
    headingRef.current = mag;
    gyroIntegratedHeadingRef.current = mag;
    gyroHeadingRef.current = mag;
    setPdrState((s) => ({ ...s, heading: mag, gyroHeading: mag, magHeading: magHeadingRef.current }));
  }, []);
  const recenterPdr = React.useCallback(() => {
    const all = [...activeStoreMap.nodes, ...customNodes];
    const node = all.find((n) => n.id === startNodeId) || all[0];
    setPdrPath([{ x: node?.x ?? 0.5, y: node?.y ?? 0.5 }]);
    setPdrState((s) => ({ ...s, steps: 0 }));
  }, [activeStoreMap, customNodes, startNodeId]);

  const pickRecipeFromPrompt = (prompt: string) => {
    const words = prompt
      .toLowerCase()
      .split(/\W+/)
      .filter(Boolean);
    const scored = mockRecipes
      .map((recipe) => {
        const haystack = [recipe.title, recipe.description, ...recipe.tags, ...recipe.diet].join(' ').toLowerCase();
        const score = words.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
        return { recipe, score };
      })
      .sort((a, b) => b.score - a.score);
    return scored.map((s) => s.recipe);
  };

  const pushActivity = (msg: string) => {
    setActivity((prev) => [msg, ...prev].slice(0, 6));
  };

  const addRecent = (name: string) => {
    setRecent((prev) => [name, ...prev.filter((r) => r.toLowerCase() !== name.toLowerCase())].slice(0, 8));
  };

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, status: it.status === 'done' ? 'pending' : 'done' } : it)),
    );
    if (isOffline) {
      setQueued((q) => [...q, `Sync: Item ${id} toggled`]);
    }
    const item = items.find((i) => i.id === id);
    if (item) {
      pushActivity(`${item.name}: ${item.status === 'done' ? 'auf offen' : 'abgehakt'}`);
    }
  };

  const requestAI = (recipe: Recipe) => {
    if (aiRequestsLeft <= 0) {
      setActiveTier('pro');
      setActiveTab('plans');
      return;
    }
    setSelectedRecipe(recipe);
    setAiRequestsLeft((prev) => Math.max(prev - recipe.aiCost, 0));
    if (isOffline) {
      setQueued((q) => [...q, `Sync: AI Rezept "${recipe.title}"`]);
    }
  };

  const addItem = (name: string, assignedTo: string, category: string) => {
    setItems((prev) => [
      {
        id: `${Date.now()}`,
        name,
        assignedTo,
        quantity: '1x',
        status: 'pending',
        category,
      },
      ...prev,
    ]);
    addRecent(name);
    pushActivity(`${name} hinzugefügt`);
    if (isOffline) {
      setQueued((q) => [...q, `Sync: ${name}`]);
    }
  };

  const addMissingFromRecipe = (recipe: Recipe) => {
    const needs = recipeNeeds[recipe.id] ?? [];
    const existingNames = items.map((i) => i.name.toLowerCase());
    needs.forEach((ing) => {
      if (!existingNames.includes(ing.toLowerCase())) {
        addItem(ing, 'wir', 'Vorrat');
      }
    });
    setSuggestedRecipe(null);
  };

  const addCustomNode = (label: string, sectionId: string, row: number, col: number) => {
    const id = `${sectionId || 'custom'}-${Date.now()}`;
    const occupied = [...activeStoreMap.nodes, ...customNodes].some(
      (n) => Math.floor(n.y) === row && Math.floor(n.x) === col,
    );
    if (occupied) return;
    const x = col + 0.5;
    const y = row + 0.5;
    setCustomNodes((prev) => [
      ...prev,
      { id, label, x, y, floor: 0, type: sectionId ? 'aisle' : 'poi', sectionId },
    ]);
  };

  const clearCustomNodes = () => {
    setCustomNodes([]);
    setRouteOrder(['entry', 'exit']);
    setFloorForm({ label: '', section: '', row: '0', col: '0' });
  };

  const optimiseRoute = () => {
    if (navMapMode === 'house') return;
    const pending = items.filter((i) => i.status === 'pending');
    const targets = pending
      .map((it) => {
        const section = storeSections.find((s) =>
          s.items.some((name) => name.toLowerCase() === it.name.toLowerCase()),
        );
        return section;
      })
      .filter(Boolean) as StoreSection[];

    const stopNodeIds: string[] = [];
    targets.forEach((section) => {
      const baseMatch = activeStoreMap.nodes.find((n) => n.sectionId === section.id);
      const customMatch =
        customNodes.find((n) => n.sectionId === section.id) ||
        customNodes.find((n) => n.label.toLowerCase().includes(section.label.toLowerCase()));
      const node = baseMatch ?? customMatch;
      if (node && !stopNodeIds.includes(node.id)) stopNodeIds.push(node.id);
    });

    const mapWithCustom: StoreMap = {
      ...activeStoreMap,
      nodes: [...activeStoreMap.nodes, ...customNodes],
    };
    const order = computeRouteOrder(mapWithCustom, startNodeId, stopNodeIds, 'exit');
    setRouteOrder(computePolylineForOrder(mapWithCustom, order));
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    const item = items.find((i) => i.id === id);
    if (item) pushActivity(`${item.name} gelöscht`);
    if (isOffline) {
      setQueued((q) => [...q, `Sync: Remove ${id}`]);
    }
  };

  const resetQueue = () => setQueued([]);

  const handleAiPrompt = (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    if (aiRequestsLeft <= 0) {
      setActiveTier('pro');
      setActiveTab('plans');
      setAiOpen(false);
      return;
    }
    const ranked = pickRecipeFromPrompt(trimmed);
    setAiCandidates(ranked.slice(0, 3));
    const recipe = ranked[0];
    if (recipe) {
      requestAI(recipe);
      addMissingFromRecipe(recipe);
      setSuggestedRecipe(recipe);
    }
    setActiveTab('recipes');
    setAiOpen(false);
    setAiPrompt('');
    if (isOffline) {
      setQueued((q) => [...q, `AI Prompt (offline): ${trimmed}`]);
    }
  };

  const usedTimeSaved = useMemo(
    () => ({
      minutes: 22,
      aiUsage: 10 - aiRequestsLeft,
    }),
    [aiRequestsLeft],
  );

  const offlineCopy = { title: t.offlineTitle, message: t.offlineMessage };

  React.useEffect(() => {
    let devMotionSub: any;
    let magSub: any;
    let baroSub: any;
    let pedometerSub: any;
    const start = async () => {
      if (!pdrActive) return;
	      setPdrState((s) => ({ ...s, status: 'tracking', steps: 0, heading: 0, gyroHeading: 0, magHeading: 0 }));
	      setPdrPath([getStartCoord()]);
	      headingRef.current = 0;
	      gyroHeadingRef.current = 0;
	      gyroIntegratedHeadingRef.current = 0;
	      magHeadingRef.current = 0;
	      lastMotionAtRef.current = null;
	      yawRateRef.current = 0;
	      magStrengthEmaRef.current = null;
	      magReliabilityRef.current = 0.5;
	      lastStepTime.current = 0;
      lastIntervalRef.current = 0;
      stationarySinceRef.current = null;
      lastDebugUpdateRef.current = 0;
      lastPedometerStepsRef.current = null;
      deviceStepsRef.current = 0;
      stepPeakRef.current = { inPeak: false, max: 0 };
      linAccWindowRef.current = [];
      gravityRef.current = { x: 0, y: 0, z: 0, init: false };
      sensorHealthRef.current = {
        accel: { available: null, lastAt: null },
        gyro: { available: null, lastAt: null },
        mag: { available: null, lastAt: null },
        baro: { available: null, lastAt: null },
        deviceMotion: { available: null, lastAt: null },
        pedometer: { available: null, lastAt: null },
      };
      setSensorHealth(sensorHealthRef.current);
	      const initialDebug: MotionDebug = {
        accelMag: 0,
        accelBaseline: 0,
        accelDiff: 0,
	        stepThreshold: 0.12,
	        stepLength: 0.6 * strideScaleRef.current,
        lastStepAt: null,
        lastIntervalMs: 0,
        isStationary: true,
        stepSource: 'none',
        deviceMotionLinAccMag: 0,
        pedometerSteps: 0,
        deviceSteps: 0,
      };
      motionDebugRef.current = initialDebug;
      setMotionDebug(initialDebug);

      const updateSensorHealth = (patch: Partial<SensorHealth>) => {
        sensorHealthRef.current = { ...sensorHealthRef.current, ...patch };
        setSensorHealth(sensorHealthRef.current);
      };

      const [devOk, magOk, baroOk, pedOk] = await Promise.all([
        DeviceMotion.isAvailableAsync().catch(() => false),
        Magnetometer.isAvailableAsync().catch(() => false),
        Barometer.isAvailableAsync().catch(() => false),
        Pedometer.isAvailableAsync().catch(() => false),
      ]);
      updateSensorHealth({
        accel: { ...sensorHealthRef.current.accel, available: null },
        gyro: { ...sensorHealthRef.current.gyro, available: null },
        mag: { ...sensorHealthRef.current.mag, available: magOk },
        baro: { ...sensorHealthRef.current.baro, available: baroOk },
        deviceMotion: { ...sensorHealthRef.current.deviceMotion, available: devOk },
        pedometer: { ...sensorHealthRef.current.pedometer, available: pedOk },
      });

	      // Magnetometer: heavily smoothed, only used as a slow corrector
	      if (magOk) {
	        try {
	          Magnetometer.setUpdateInterval(200);
	          magSub = Magnetometer.addListener(({ x, y, z }) => {
	            sensorHealthRef.current = {
	              ...sensorHealthRef.current,
	              mag: { ...sensorHealthRef.current.mag, lastAt: Date.now() },
	            };
	            const strength = Math.hypot(x ?? 0, y ?? 0, z ?? 0);
	            const emaPrev = magStrengthEmaRef.current ?? strength;
	            const ema = emaPrev * 0.92 + strength * 0.08;
	            magStrengthEmaRef.current = ema;

	            const dev = Math.abs(strength - ema);
	            const inRange = ema > 15 && ema < 80; // µT typical range
	            const stable = dev < 10;
	            const relInstant = clamp((inRange ? 1 : 0.25) * (stable ? 1 : 0.5) * (1 - clamp(dev / 25, 0, 1)), 0, 1);
	            magReliabilityRef.current = clamp(magReliabilityRef.current * 0.85 + relInstant * 0.15, 0, 1);

	            const angle = Math.atan2(y ?? 0, x ?? 0) * (180 / Math.PI);
	            const heading = wrapHeading(angle);
	            const diff = headingDiff(heading, magHeadingRef.current);
	            const factor = 0.03 + 0.09 * magReliabilityRef.current;
	            magHeadingRef.current = wrapHeading(magHeadingRef.current + diff * factor);
	          });
	        } catch (e: any) {
	          updateSensorHealth({
	            mag: {
	              ...sensorHealthRef.current.mag,
              available: false,
              error: String(e?.message || e),
            },
          });
        }
      }

      const toDeg = (v: number) => (Math.abs(v) <= Math.PI * 2 + 0.5 ? (v * 180) / Math.PI : v);

		      const applyStep = (source: MotionDebug['stepSource'], stepsDelta: number, now: number) => {
		        if (stepsDelta <= 0) return;
		        const stepLen = stepLengthRef.current * strideScaleRef.current;
		        const hRad = (headingRef.current * Math.PI) / 180;
		        const clampMax = activeStoreMap.gridSize;
		        setPdrPath((prev) => {
		          const coords: PdrPoint[] = [...prev];
		          let cur = coords[coords.length - 1] || getStartCoord();
		          for (let i = 0; i < Math.min(stepsDelta, 20); i += 1) {
		            let nx = cur.x + Math.sin(hRad) * stepLen;
		            let ny = cur.y - Math.cos(hRad) * stepLen;
		            nx = Math.max(0, Math.min(clampMax, nx));
		            ny = Math.max(0, Math.min(clampMax, ny));
		            cur = { x: nx, y: ny };
		            coords.push(cur);
		          }
		          return coords.slice(-200);
		        });
	        setPdrState((s) => ({ ...s, steps: s.steps + stepsDelta }));
	        const nextDebug = { ...motionDebugRef.current, stepSource: source, lastStepAt: now };
        motionDebugRef.current = nextDebug;
        setMotionDebug(nextDebug);
      };

      // DeviceMotion: primary for step detection and heading stability
      if (devOk) {
        try {
          DeviceMotion.setUpdateInterval(50);
          devMotionSub = DeviceMotion.addListener((m) => {
            const now = Date.now();
            sensorHealthRef.current = {
              ...sensorHealthRef.current,
              deviceMotion: { ...sensorHealthRef.current.deviceMotion, lastAt: now },
	            };
	
	            const prevTs = lastMotionAtRef.current ?? now;
	            const dt = clamp((now - prevTs) / 1000, 0.001, 0.2);
	            lastMotionAtRef.current = now;

	            const rot = m.rotation;
	            const attitudeYaw =
	              rot && typeof rot.alpha === 'number' ? wrapHeading(toDeg(rot.alpha)) : null;
	            if (attitudeYaw !== null) {
	              gyroHeadingRef.current = attitudeYaw;
	              const d = headingDiff(attitudeYaw, gyroIntegratedHeadingRef.current);
	              gyroIntegratedHeadingRef.current = wrapHeading(gyroIntegratedHeadingRef.current + clamp(d, -20, 20));
	            }

	            const rr = (m as any).rotationRate as { alpha?: number; beta?: number; gamma?: number } | undefined;
	            if (rr && typeof rr.alpha === 'number') {
	              const yawRate = clamp(toDeg(rr.alpha), -720, 720);
	              yawRateRef.current = yawRate;
	              gyroIntegratedHeadingRef.current = wrapHeading(gyroIntegratedHeadingRef.current + yawRate * dt);
	            } else {
	              yawRateRef.current = 0;
	            }

	            const mag = magHeadingRef.current;
	            const magReliability = magReliabilityRef.current;
	            const turningFast = Math.abs(yawRateRef.current) > 140;
	            const gain = (0.008 + 0.05 * magReliability) * (turningFast ? 0.2 : 1);
	            const err = headingDiff(mag, gyroIntegratedHeadingRef.current);
	            gyroIntegratedHeadingRef.current = wrapHeading(gyroIntegratedHeadingRef.current + err * gain);
	            headingRef.current = gyroIntegratedHeadingRef.current;

	            setPdrState((s) => ({
	              ...s,
	              heading: headingRef.current,
	              gyroHeading: gyroIntegratedHeadingRef.current,
	              magHeading: magHeadingRef.current,
	            }));

            // Prefer native linear acceleration, fallback to high-pass filter on accelIncludingGravity.
            const lin = m.acceleration;
            const incl = m.accelerationIncludingGravity;
            let ax = 0;
            let ay = 0;
            let az = 0;
            if (lin) {
              ax = lin.x;
              ay = lin.y;
              az = lin.z;
            } else if (incl) {
              const g = gravityRef.current;
              if (!g.init) {
                gravityRef.current = { x: incl.x, y: incl.y, z: incl.z, init: true };
              } else {
                const a = 0.92;
                gravityRef.current = {
                  x: g.x * a + incl.x * (1 - a),
                  y: g.y * a + incl.y * (1 - a),
                  z: g.z * a + incl.z * (1 - a),
                  init: true,
                };
              }
              const gg = gravityRef.current;
              ax = incl.x - gg.x;
              ay = incl.y - gg.y;
              az = incl.z - gg.z;
            }
            const linMag = Math.hypot(ax, ay, az);
            linAccWindowRef.current.push(linMag);
            if (linAccWindowRef.current.length > 35) linAccWindowRef.current.shift();
            const w = linAccWindowRef.current;
            const mean = w.reduce((a, b) => a + b, 0) / (w.length || 1);
            const variance =
              w.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / Math.max(1, w.length - 1);
            const std = Math.sqrt(variance);
            const threshold = Math.max(0.35, mean + std * 2.2);
            const low = linMag < 0.18;
            if (low) {
              if (stationarySinceRef.current === null) stationarySinceRef.current = now;
            } else {
              stationarySinceRef.current = null;
            }
            const isStationary = stationarySinceRef.current !== null && now - stationarySinceRef.current > 600;

            // simple peak detector
            const peak = stepPeakRef.current;
            if (!peak.inPeak) {
              if (linMag > threshold) {
                peak.inPeak = true;
                peak.max = linMag;
              }
            } else {
              peak.max = Math.max(peak.max, linMag);
              if (linMag < mean) {
                peak.inPeak = false;
                const minInterval = 280;
                if (now - lastStepTime.current > minInterval && peak.max > threshold && !isStationary) {
                  lastIntervalRef.current = lastStepTime.current ? now - lastStepTime.current : 0;
                  lastStepTime.current = now;
                  const stepLen = Math.max(0.45, Math.min(1.05, 0.62 + (peak.max - threshold) * 0.18));
                  stepLengthRef.current = stepLen;
                  deviceStepsRef.current += 1;
                  applyStep('deviceMotion', 1, now);
                }
              }
            }

	            const nextDebug: MotionDebug = {
	              ...motionDebugRef.current,
	              accelMag: linMag,
	              accelBaseline: mean,
	              accelDiff: Math.max(0, linMag - mean),
	              stepThreshold: threshold,
	              stepLength: stepLengthRef.current * strideScaleRef.current,
	              lastIntervalMs: lastIntervalRef.current,
	              isStationary,
	              deviceMotionLinAccMag: linMag,
	              pedometerSteps: motionDebugRef.current.pedometerSteps,
	              deviceSteps: deviceStepsRef.current,
	            };

	            // Lightweight quality signal to surface in UI (Android magnetometers can be noisy indoors).
	            const stepRecent = nextDebug.lastStepAt ? now - nextDebug.lastStepAt < 1800 : false;
	            let pdrScore = 0.35;
	            if (stepRecent) pdrScore += 0.25;
	            if (!isStationary) pdrScore += 0.1;
	            const magReliability2 = magReliabilityRef.current;
	            pdrScore += (magReliability2 - 0.5) * 0.35;
	            if (Math.abs(yawRateRef.current) > 280) pdrScore -= 0.08;
	            const nextPdrConf: 'good' | 'ok' | 'low' = pdrScore > 0.72 ? 'good' : pdrScore > 0.45 ? 'ok' : 'low';

	            motionDebugRef.current = nextDebug;
	            if (now - lastDebugUpdateRef.current > 150) {
	              lastDebugUpdateRef.current = now;
	              setMotionDebug(nextDebug);
	              setSensorHealth(sensorHealthRef.current);
	              setPdrConfidence(nextPdrConf);
	            }
	          });
	        } catch (e: any) {
	          updateSensorHealth({
            deviceMotion: {
              ...sensorHealthRef.current.deviceMotion,
              available: false,
              error: String(e?.message || e),
            },
          });
        }
      }

      // Pedometer: robust fallback for steps (especially iOS)
      if (pedOk) {
        try {
          const perm = await Pedometer.getPermissionsAsync().catch(() => null);
          if (perm && !perm.granted && perm.canAskAgain) {
            await Pedometer.requestPermissionsAsync().catch(() => null);
          }
          const perm2 = await Pedometer.getPermissionsAsync().catch(() => null);
          updateSensorHealth({
            pedometer: {
              ...sensorHealthRef.current.pedometer,
              available: true,
              permission: perm2 ? String(perm2.status) : undefined,
            },
          });
	          pedometerSub = Pedometer.watchStepCount(({ steps }) => {
	            const now = Date.now();
            sensorHealthRef.current = {
              ...sensorHealthRef.current,
              pedometer: { ...sensorHealthRef.current.pedometer, lastAt: now },
            };
	            const prev = lastPedometerStepsRef.current;
	            lastPedometerStepsRef.current = steps;
	            const delta = prev === null ? 0 : steps - prev;
	            if (delta > 0) {
	              // Avoid double-counting when our DeviceMotion detector is already producing steps.
	              const recentlyDeviceMotion = lastStepTime.current > 0 && now - lastStepTime.current < 1800;
	              if (!devOk || !recentlyDeviceMotion) {
	                lastIntervalRef.current = lastStepTime.current ? now - lastStepTime.current : 0;
	                lastStepTime.current = now;
	                applyStep('pedometer', delta, now);
	              }
	            }
            const nextDebug = {
              ...motionDebugRef.current,
              pedometerSteps: steps,
            };
            motionDebugRef.current = nextDebug;
            setMotionDebug(nextDebug);
            setSensorHealth(sensorHealthRef.current);
          });
        } catch (e: any) {
          updateSensorHealth({
            pedometer: {
              ...sensorHealthRef.current.pedometer,
              available: false,
              error: String(e?.message || e),
            },
          });
        }
      }

      if (baroOk) {
        try {
          baroSub = Barometer.addListener(({ pressure }) => {
            sensorHealthRef.current = {
              ...sensorHealthRef.current,
              baro: { ...sensorHealthRef.current.baro, lastAt: Date.now() },
            };
            if (pdrBaseline.current === null) {
              pdrBaseline.current = pressure;
            }
            const delta = (pdrBaseline.current ?? pressure) - pressure;
            const approxMeters = delta * 8.3; // rough meters per hPa
            const floor = Math.round(approxMeters / 3);
            setPdrState((s) => ({ ...s, pressure, floor }));
          });
        } catch (e: any) {
          updateSensorHealth({
            baro: {
              ...sensorHealthRef.current.baro,
              available: false,
              error: String(e?.message || e),
            },
          });
        }
      }

      if (!devOk && !magOk && !baroOk && !pedOk) {
        setPdrState((s) => ({ ...s, status: 'denied' }));
      }
      setPdrConfidence(devOk ? (magOk ? 'good' : 'ok') : pedOk ? 'ok' : 'low');
    };

    const stop = () => {
      devMotionSub?.remove?.();
      magSub?.remove?.();
      baroSub?.remove?.();
      pedometerSub?.remove?.();
    };

    start();
    return () => stop();
  }, [pdrActive, navMapMode, activeStoreMap, getStartCoord]);

  React.useEffect(() => {
    if (!pdrActive) {
      pdrBaseline.current = null;
      setPdrState((s) => ({ ...s, status: 'idle' }));
    }
  }, [pdrActive]);

  React.useEffect(() => {
    setPdrPath([getStartCoord()]);
  }, [getStartCoord]);

  React.useEffect(() => {
    if (!pdrActive) return;
    const id = setInterval(() => {
      scanWifiOnce().catch(() => {});
    }, 2500);
    return () => clearInterval(id);
  }, [pdrActive, scanWifiOnce]);

  if (!fontsLoaded) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={styles.safe}>
          <StatusBar style="dark" />
          <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={styles.sectionTitle}>Lade Schriftarten…</Text>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View style={styles.container}>
          <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.gradientBg}>
            <PatternOverlay />
            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {activeTab === 'home' ? (
            <>
              <Hero
                t={t}
                locale={locale}
                setLocale={setLocale}
                usedTimeSaved={usedTimeSaved}
                presence={presence}
              />
              <Section title="Schnellstart" subtitle="Wähle deinen nächsten Schritt.">
                <View style={styles.quickGrid}>
                  <Pressable style={styles.quickCard} onPress={() => setActiveTab('list')}>
                    <Ionicons name="checkbox-outline" size={22} color={colors.accent} />
                    <Text style={styles.sectionTitle}>Zur Einkaufsliste</Text>
                    <Text style={styles.metaMuted}>Abhaken & hinzufügen</Text>
                  </Pressable>
                  <Pressable style={styles.quickCard} onPress={() => setActiveTab('recipes')}>
                    <Ionicons name="restaurant-outline" size={22} color={colors.accent} />
                    <Text style={styles.sectionTitle}>KI-Rezepte</Text>
                    <Text style={styles.metaMuted}>10 frei im Free-Plan</Text>
                  </Pressable>
                  <Pressable style={styles.quickCard} onPress={() => setActiveTab('nav')}>
                    <Ionicons name="map-outline" size={22} color={colors.accent} />
                    <Text style={styles.sectionTitle}>Navigation</Text>
                    <Text style={styles.metaMuted}>Route im Markt</Text>
                  </Pressable>
                </View>
              </Section>
            </>
          ) : null}

          {activeTab === 'list' ? (
            <>
              <Hero
                t={t}
                locale={locale}
                setLocale={setLocale}
                usedTimeSaved={usedTimeSaved}
                presence={presence}
              />
              <ListSection
                items={items}
                presence={presence}
                isOffline={isOffline}
                queued={queued}
                toggleItem={toggleItem}
                addItem={addItem}
                removeItem={removeItem}
                setIsOffline={setIsOffline}
                resetQueue={resetQueue}
                offlineCopy={offlineCopy}
                suggestedRecipe={suggestedRecipe}
                setSuggestedRecipe={setSuggestedRecipe}
                addMissingFromRecipe={addMissingFromRecipe}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                density={density}
                setDensity={setDensity}
                showSuggestions={showSuggestions}
                setShowSuggestions={setShowSuggestions}
                recent={recent}
                activity={activity}
                sortMode={sortMode}
                setSortMode={setSortMode}
              />
            </>
          ) : null}

          {activeTab === 'recipes' ? (
            <RecipesSection
              recipes={mockRecipes}
              aiRequestsLeft={aiRequestsLeft}
              requestAI={requestAI}
              selectedRecipe={selectedRecipe}
            />
          ) : null}

          {activeTab === 'nav' ? (
            <NavigationSection
              storeMap={activeStoreMap}
              items={items}
              customNodes={customNodes}
              addNode={addCustomNode}
              clearNodes={clearCustomNodes}
              optimiseRoute={optimiseRoute}
              routeOrder={routeOrder}
              visited={customNodes.filter((n) => n.sectionId && items.some((i) => i.status === 'done' && storeSections.find((s) => s.id === n.sectionId && s.items.some((nm) => nm.toLowerCase() === i.name.toLowerCase())))).map((n) => n.id)}
              form={floorForm}
              setForm={(f) => setFloorForm((prev) => ({ ...prev, ...f }))}
              pdrState={pdrState}
              pdrActive={pdrActive}
              togglePdr={() => setPdrActive((v) => !v)}
              startNodeId={startNodeId}
              onSelectStart={(id) => {
                setStartNodeId(id);
                const exists = [...activeStoreMap.nodes, ...customNodes].some((n) => n.id === id);
                if (exists) {
                  setRouteOrder((prev) => [id, ...prev.filter((p) => p !== id && p !== 'entry'), 'exit']);
                }
                const all = [...activeStoreMap.nodes, ...customNodes];
                const node = all.find((n) => n.id === id);
                if (node) {
                  setStartOverride({ x: node.x, y: node.y });
                  setPdrPath([{ x: node.x, y: node.y }]);
                }
              }}
              pdrPath={pdrPath}
              motionDebug={motionDebug}
              sensorHealth={sensorHealth}
              wifiAnchor={wifiAnchor}
              wifiStatus={wifiStatus}
              wifiConfidence={wifiConfidence}
              wifiNote={wifiNote}
              wifiLastScanAt={wifiLastScanAt}
              wifiLastCount={wifiLastCount}
              wifiFix={wifiFix}
              strideScale={strideScale}
              onAdjustStrideScale={adjustStrideScale}
              onResetHeading={resetHeadingToMag}
              onMockAnchor={(anchor) => {
                setWifiAnchor(anchor);
                setWifiStatus('mock');
                const conf = anchor.confidence ?? 0.7;
                setWifiConfidence(conf);
                setWifiFix({ x: anchor.x, y: anchor.y, matched: 1 });
                if (pdrActive) {
                  // manual anchor selection should immediately correct the position for testing
                  setPdrPath([{ x: anchor.x, y: anchor.y }]);
                }
              }}
              onScanWifi={scanWifiOnce}
              onUseBestWifiAsAnchor={navMapMode === 'house' ? useBestWifiAsAnchor : undefined}
              pdrConfidence={pdrConfidence}
              onRecenter={recenterPdr}
              mapMode={navMapMode}
	              onChangeMapMode={(m) => {
	                setNavMapMode(m);
	                setStartOverride(null);
	                setPdrPath([getStartCoord()]);
	                setWifiAnchor(null);
	                setWifiStatus('off');
	                setWifiConfidence(0);
	                setWifiFix(null);
	                setWifiNote(null);
	                setWifiLastScanAt(null);
	                setWifiLastCount(0);
	                setPlanCalA(null);
	                setPlanCalB(null);
	                setPlanCalMeters('');
	                setPlanTool('start');
	                setPlanMeasureA(null);
	                setPlanMeasureB(null);
	              }}
              planId={planId}
	              onChangePlanId={(id) => {
	                setPlanId(id);
	                setPlanCalA(null);
	                setPlanCalB(null);
	                setPlanCalMeters('');
	                setStartOverride(null);
	                setPdrPath([getStartCoord()]);
	                setWifiFix(null);
	                setWifiNote(null);
	                const preset = planConfigs[id].defaultImagePixelsPerMeter;
	                if (preset) setPlanImagePixelsPerMeter(preset);
	                setPlanTool('start');
	                setPlanMeasureA(null);
	                setPlanMeasureB(null);
	              }}
              planImage={activePlan.image}
              planImagePixelsPerMeter={planImagePixelsPerMeter}
              setPlanImagePixelsPerMeter={(n) => setPlanImagePixelsPerMeter(Math.max(1, Math.min(600, n)))}
              planDefaultImagePixelsPerMeter={activePlan.defaultImagePixelsPerMeter}
              planTool={planTool}
              setPlanTool={setPlanTool}
              planMeasureA={planMeasureA}
              planMeasureB={planMeasureB}
              setPlanMeasureA={setPlanMeasureA}
              setPlanMeasureB={setPlanMeasureB}
	              onSetAnchorAt={(pMeters) => {
	                setPlanAnchorsById((prev) => {
	                  const existing = prev[planId] ?? [];
	                  const best = wifiFix?.best?.bssid;
	                  const updated =
	                    existing.length > 0
	                      ? [
	                          {
	                            ...existing[0],
	                            bssid: best ?? existing[0].bssid,
	                            x: pMeters.x,
	                            y: pMeters.y,
	                            floor: 0,
	                            source: 'live',
	                          },
	                          ...existing.slice(1),
	                        ]
	                      : [
	                          {
	                            bssid: best ?? '8c:19:b5:d8:b1:6d',
	                            label: 'Wi‑Fi Anchor',
	                            x: pMeters.x,
	                            y: pMeters.y,
	                            floor: 0,
	                            source: 'live',
	                            confidence: 0.9,
	                          },
	                        ];
	                  return { ...prev, [planId]: updated };
	                });
	              }}
              planCalA={planCalA}
              planCalB={planCalB}
              setPlanCalA={setPlanCalA}
              setPlanCalB={setPlanCalB}
              planCalMeters={planCalMeters}
              setPlanCalMeters={setPlanCalMeters}
              onPlanTap={(pMeters, pPx) => {
                if (planId === 'house') {
                  if (!planCalA) {
                    setPlanCalA(pPx);
                    return;
                  }
                  if (!planCalB) {
                    setPlanCalB(pPx);
                    return;
                  }
                }
                setStartOverride(pMeters);
                setPdrPath([pMeters]);
              }}
            />
          ) : null}

            {activeTab === 'plans' ? (
              <PlansSection
                activeTier={activeTier}
                setActiveTier={setActiveTier}
              />
            ) : null}
          </ScrollView>
          </LinearGradient>

          <Pressable
            style={styles.fab}
            onPress={() => setAiOpen((v) => !v)}
          >
            <Ionicons name="sparkles" size={22} color="#0D1528" />
            <Text style={styles.fabText}>AI</Text>
            <View style={styles.fabBadge}>
              <Text style={styles.fabBadgeText}>{aiRequestsLeft}</Text>
            </View>
          </Pressable>

          {aiOpen ? (
            <View style={styles.aiDrawer}>
              <View style={styles.aiHeader}>
                <Text style={styles.sectionTitle}>Frag die KI</Text>
                <Text style={styles.metaMuted}>Erstelle Rezepte, plane Listen, frage nach Alternativen.</Text>
              </View>
              <View style={styles.aiInputRow}>
                <TextInput
                  style={styles.aiInput}
                  placeholder="Frag nach Rezepten, Alternativen oder plane deine Woche..."
                  placeholderTextColor={colors.muted}
                  value={aiPrompt}
                  onChangeText={setAiPrompt}
                  onSubmitEditing={() => handleAiPrompt(aiPrompt)}
                />
                <Pressable
                  style={styles.aiSend}
                  onPress={() => handleAiPrompt(aiPrompt)}
                >
                  <Ionicons name="arrow-forward" size={18} color={colors.ink} />
                </Pressable>
              </View>
              {aiCandidates.length > 0 ? (
                <View style={styles.aiCandidates}>
                  <View style={styles.aiCandidateHeader}>
                    <Text style={styles.sectionSubtitle}>Vorschläge:</Text>
                    <Pressable onPress={() => setAiCandidates([])}>
                      <Text style={[styles.metaMuted, { color: colors.accent }]}>Leeren</Text>
                    </Pressable>
                  </View>
                  {aiCandidates.map((c) => (
                    <Pressable
                      key={c.id}
                      style={styles.aiCandidate}
                      onPress={() => {
                        requestAI(c);
                        addMissingFromRecipe(c);
                        setSuggestedRecipe(c);
                        setActiveTab('recipes');
                        setAiOpen(false);
                      }}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.itemTitle}>{c.title}</Text>
                        <Text style={styles.metaMuted}>{c.tags.join(' • ')}</Text>
                        <Text style={styles.metaMuted}>
                          {c.duration} • {c.diet.join(' / ')} • Allergene: {c.allergens.join(', ')}
                        </Text>
                      </View>
                      <Badge label={`${c.aiCost} AI`} tone="accent" />
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <Pressable
                style={styles.aiAction}
                onPress={() => {
                  requestAI(mockRecipes[0]);
                  setAiOpen(false);
                }}
              >
                <Ionicons name="restaurant" size={18} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>Was koche ich mit Spinat & Kokos?</Text>
                  <Text style={styles.metaMuted}>Liefert ein Rezept + Auto-Einkaufsliste</Text>
                </View>
                <Badge label="1 AI" tone="accent" />
              </Pressable>
              <Pressable
                style={styles.aiAction}
                onPress={() => {
                  addItem('Hafermilch', 'wir', 'Kühlregal');
                  setAiOpen(false);
                }}
              >
                <Ionicons name="cart" size={18} color={colors.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>Füge Alternativen hinzu</Text>
                  <Text style={styles.metaMuted}>z.B. Hafermilch statt Kuhmilch</Text>
                </View>
                <Badge label="Kostenlos" tone="success" />
              </Pressable>
            </View>
          ) : null}

          <SmartBar
            onAddQuick={() => {
              setActiveTab('list');
              addItem('Brot', 'wir', 'Bäckerei');
            }}
            onScan={() => {
              setActiveTab('list');
              addItem('Scannartikel', 'wir', 'Unsortiert');
              if (isOffline) {
                setQueued((q) => [...q, 'Scan hinzugefügt (wartet auf Sync)']);
              }
            }}
            onAskAI={() => {
              setActiveTab('recipes');
              setAiOpen(true);
              setSelectedRecipe(mockRecipes[0]);
            }}
          />
          <TabBar activeTab={activeTab} onChange={setActiveTab} />
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  gradientBg: { flex: 1, position: 'relative' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 260, gap: 16 },
  patternWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 240,
    paddingHorizontal: 16,
    flexDirection: 'column',
    justifyContent: 'space-evenly',
  },
  patternRow: { flexDirection: 'row', justifyContent: 'flex-start', flexWrap: 'wrap' },
  patternDot: { width: 16, height: 16, borderRadius: 4, backgroundColor: colors.ink, marginRight: 1, marginBottom: 1 },
  hero: {
    backgroundColor: '#FFF9F3',
    padding: 18,
    borderRadius: 18,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroBrand: { fontSize: 16, fontWeight: '700', color: colors.ink, letterSpacing: 0.3, fontFamily: 'PlayfairDisplay_700Bold' },
  heroPresence: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  presenceInline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  langRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  langPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFF4EA',
  },
  langPillActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  langText: { fontWeight: '700', color: colors.text, fontFamily: 'Manrope_600SemiBold' },
  kicker: { fontSize: 14, color: colors.muted, fontWeight: '600', fontFamily: 'Manrope_600SemiBold' },
  title: { fontSize: 26, fontWeight: '700', color: colors.text, fontFamily: 'PlayfairDisplay_700Bold' },
  subtitle: { fontSize: 15, color: colors.muted, fontFamily: 'Manrope_400Regular' },
  heroStats: { flexDirection: 'row', gap: 12, marginTop: 12 },
  statCard: {
    backgroundColor: '#FFF4EA',
    padding: 12,
    borderRadius: 12,
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statCardPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.ink, fontFamily: 'PlayfairDisplay_700Bold' },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  sectionHeader: { marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, fontFamily: 'Manrope_700Bold' },
  sectionSubtitle: { fontSize: 14, color: colors.muted, fontFamily: 'Manrope_400Regular' },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: { fontSize: 12, color: colors.text, fontWeight: '600', fontFamily: 'Manrope_600SemiBold' },
  avatar: { justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 16 },
  row: { flexDirection: 'row', gap: 12 },
  authRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  authButton: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFF4EA',
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  authText: { fontSize: 14, fontWeight: '600', color: colors.text, fontFamily: 'Manrope_600SemiBold' },
  presenceRow: { flexDirection: 'row', gap: 12 },
  presence: { alignItems: 'center', width: 72 },
  presenceName: { marginTop: 4, fontWeight: '600', color: colors.text, fontFamily: 'Manrope_600SemiBold' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  listActions: { flexDirection: 'row', gap: 8 },
  listControlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#FFF4EA',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  segmentButton: { paddingHorizontal: 10, paddingVertical: 8 },
  segmentButtonActive: { backgroundColor: colors.accentSoft, borderRadius: 10 },
  collabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFF4EA',
  },
  inlineSwitch: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addButton: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  addText: { color: colors.ink, fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    backgroundColor: '#FFF9F3',
    color: colors.text,
    shadowColor: colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 8,
  },
  inlineSuggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  inlineSuggest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listItemCompact: { paddingVertical: 8 },
  categoryBlock: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFF9F3',
    gap: 4,
  },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  itemLeft: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  itemTitle: { fontSize: 16, fontWeight: '600', color: colors.text, fontFamily: 'Manrope_600SemiBold' },
  itemTitleCompact: { fontSize: 15 },
  itemDone: { color: colors.muted, textDecorationLine: 'line-through' },
  itemRight: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  offlineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  offlineControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  offlineCard: { marginTop: 10, padding: 12, backgroundColor: colors.offline, borderRadius: 12 },
  syncCard: { marginTop: 10, padding: 12, backgroundColor: '#ECFDF3', borderRadius: 12 },
  activityCard: { marginTop: 10, padding: 12, backgroundColor: '#FFF4EA', borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 6 },
  activityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { color: colors.text, fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  metaMuted: { color: colors.muted, fontSize: 13, fontFamily: 'Manrope_400Regular' },
  metaMutedCompact: { fontSize: 12 },
  recipeCard: {
    width: 240,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
    backgroundColor: colors.card,
  },
  recipeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recipeTitle: { fontSize: 17, fontWeight: '700', color: colors.text, fontFamily: 'Manrope_700Bold' },
  recipeDesc: { color: colors.muted, marginTop: 6, fontSize: 14, fontFamily: 'Manrope_400Regular' },
  recipeTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  recipeMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  selectedRecipe: { marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.accentSoft },
  gatedText: { color: colors.warning, marginTop: 6 },
  map: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 12, backgroundColor: '#FFF4EA' },
  mapLegend: { marginBottom: 10, flexDirection: 'row', gap: 8, alignItems: 'center' },
  mapRows: { gap: 12 },
  aisle: { backgroundColor: colors.card, padding: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  aisleLabel: { fontWeight: '700', color: colors.text, fontFamily: 'Manrope_700Bold' },
  aisleTrack: { flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  pin: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: '#FFF4EA' },
  pinActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent, borderWidth: 1, shadowColor: colors.accent, shadowOpacity: 0.24, shadowRadius: 8 },
  pinText: { fontSize: 16 },
  pinLabel: { fontSize: 13, color: colors.text, fontFamily: 'Manrope_400Regular' },
  routeLine: { height: 3, backgroundColor: colors.accent, marginTop: 14, borderRadius: 3 },
  navCtaRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  primaryButton: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 10,
  },
  primaryButtonText: { color: colors.ink, fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  routeHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.accentSoft,
    marginBottom: 10,
  },
  routeSteps: { marginTop: 12, gap: 10 },
  routeStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  routeStepCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeStepText: { fontWeight: '700', color: colors.accent, fontFamily: 'Manrope_700Bold' },
  progressBar: { height: 8, backgroundColor: colors.border, borderRadius: 999, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.accent },
  floorGrid: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FFF4EA',
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    position: 'relative',
  },
  floorOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  floorPathLine: { position: 'absolute', height: 3, backgroundColor: colors.accent, borderRadius: 2, opacity: 0.7 },
  floorPathDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  floorCurrentDot: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: colors.success,
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  floorRow: { flexDirection: 'row' },
  floorCell: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  floorNode: { alignItems: 'center', gap: 4, padding: 4 },
  floorNodeIcon: { fontSize: 16 },
  floorNodeLabel: { fontSize: 11, color: colors.text, textAlign: 'center', fontFamily: 'Manrope_400Regular' },
  tierGrid: { gap: 10 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: {
    flexBasis: '48%',
    backgroundColor: '#FFF4EA',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 6,
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  suggestCard: { marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.accentSoft },
  suggestActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  floorForm: { marginTop: 10, gap: 8 },
  floorInputs: { gap: 8 },
  floorInput: { width: '100%' },
  floorInputSmall: { flex: 1 },
  swipeDelete: {
    backgroundColor: colors.warning,
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
    borderRadius: 12,
    marginVertical: 4,
  },
  swipeCheck: {
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    width: 70,
    borderRadius: 12,
    marginVertical: 4,
  },
  navInfoCard: {
    backgroundColor: '#FFF9F3',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  navPills: { flexDirection: 'row', gap: 6 },
  pdrCard: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFF4EA',
    gap: 8,
  },
  pdrRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  glassCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    marginTop: 10,
  },
  quickChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 8 },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickChipText: { color: colors.text, fontWeight: '600', fontFamily: 'Manrope_600SemiBold' },
  recentRow: { marginBottom: 8, gap: 6 },
  recentChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  recentChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#FFF4EA', borderWidth: 1, borderColor: colors.border },
  ghostButton: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFF4EA',
  },
  tierCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, backgroundColor: colors.card },
  tierCardActive: { borderColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.12, shadowRadius: 6 },
  tierHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  tierTitle: { fontSize: 16, fontWeight: '700', color: colors.text, fontFamily: 'Manrope_700Bold' },
  tierPerk: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  weekPlan: { marginTop: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 150,
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: colors.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  fabText: { color: colors.ink, fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  fabBadge: { backgroundColor: colors.card, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  fabBadgeText: { color: colors.accent, fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  aiDrawer: {
    position: 'absolute',
    bottom: 170,
    right: 16,
    left: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  aiHeader: { marginBottom: 8 },
  aiAction: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  aiInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginBottom: 10,
  },
  aiInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF9F3',
    color: colors.text,
    fontFamily: 'Manrope_400Regular',
  },
  aiSend: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  aiCandidates: { marginBottom: 10, gap: 6 },
  aiCandidateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  aiCandidate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFF4EA',
  },
  smartBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 72,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    shadowColor: colors.shadow,
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  smartButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFF9F3',
  },
  smartButtonText: { color: colors.text, fontFamily: 'Manrope_600SemiBold' },
  smartButtonAccent: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
    shadowColor: colors.shadow,
    shadowOpacity: 0.14,
    shadowRadius: 8,
  },
  smartButtonAccentText: { color: colors.ink, fontFamily: 'Manrope_700Bold' },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: '#FFF1E1',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: 10,
    paddingTop: 8,
    shadowColor: colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabLabel: { color: colors.muted, marginTop: 4, fontSize: 12, fontFamily: 'Manrope_600SemiBold' },
  tabIndicator: { marginTop: 6, height: 3, width: 28, borderRadius: 999, backgroundColor: colors.accent },
  planControls: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  planWrap: {
    marginTop: 10,
    height: 420,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: '#FFF9F3',
  },
  planImage: { width: '100%', height: '100%' },
  planOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  planPathDot: { position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(217,118,82,0.55)' },
  planCurrentDot: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: '#fff',
  },
});
