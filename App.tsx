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
import { pilotStoreMap, type StoreMap, type StoreMapAnchor, type StoreMapNode } from './navigation/storeMap';
import { computePolylineForOrder, computeRouteOrder } from './navigation/routing';
import { NEUE_FIXED_PIXELS_PER_METER, planConfigs, type PlanId } from './navigation/houseFloorplan';
import { ModelMap3D } from './navigation/ModelMap3D';
import { IndoorPlan2D } from './render/IndoorPlan2D';
import { useIndoorPositioning, type IndoorPositioningState } from './positioning/useIndoorPositioning';
import { useIndoorNavigation } from './nav/useIndoorNavigation';

const neueModel = require('./assets/wg.glb');
const neueFixedStartPx = { x: 582, y: 728 };
const neueFixedStartMeters = { x: neueFixedStartPx.x / NEUE_FIXED_PIXELS_PER_METER, y: neueFixedStartPx.y / NEUE_FIXED_PIXELS_PER_METER };

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
type PdrPoint = { x: number; y: number };
type NavNode = StoreMapNode;

type PlanTool = 'start' | 'measure' | 'anchor';

const FloorplanImageCanvas: React.FC<{
  source: any;
  imagePixelsPerMeter: number;
  path: PdrPoint[];
  current?: PdrPoint;
  onTapMeters?: (pMeters: PdrPoint, pImagePx: { x: number; y: number }) => void;
  camera?: { follow?: boolean; zoom?: number; target?: PdrPoint | null };
}> = ({ source, imagePixelsPerMeter, path, current, onTapMeters, camera }) => {
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

  const camZoom = clamp(camera?.zoom ?? 1, 1, 6);
  const camFollow = camera?.follow ?? false;
  const target = camFollow ? (camera?.target ?? current ?? null) : null;
  const targetC = layout && target ? toContainer(target) : null;
  const camTx = layout && targetC ? layout.w / 2 - camZoom * targetC.x : 0;
  const camTy = layout && targetC ? layout.h / 2 - camZoom * targetC.y : 0;

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
          const ux = (x - camTx) / camZoom;
          const uy = (y - camTy) / camZoom;
          const ix = Math.max(0, Math.min(imgW, (ux - offsetX) / scale));
          const iy = Math.max(0, Math.min(imgH, (uy - offsetY) / scale));
          onTapMeters?.({ x: ix / ppm, y: iy / ppm }, { x: ix, y: iy });
        }}
      >
        <View
          style={{
            flex: 1,
            transform: [{ scale: camZoom }, { translateX: camTx }, { translateY: camTy }],
          }}
        >
          <Image source={source} style={styles.planImage} resizeMode="contain" />
          <View pointerEvents="none" style={styles.planOverlay}>
            {layout ? (
              <>
                {path.map((p, idx) => {
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
                })}
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
  camera?: { follow?: boolean; zoom?: number; target?: PdrPoint | null };
}> = ({ nodes, routeOrder, visited, gridSize = 6, startId, onSelectNode, path = [], current, camera }) => {
  const [cellSize, setCellSize] = React.useState(0);
  const [container, setContainer] = React.useState<{ w: number; h: number } | null>(null);
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
        const h = e.nativeEvent.layout.height;
        setContainer({ w, h });
        setCellSize(w / gridSize);
      }}
    >
      {cellSize > 0 ? (
        (() => {
          const camZoom = clamp(camera?.zoom ?? 1, 1, 6);
          const camFollow = camera?.follow ?? false;
          const target = camFollow ? (camera?.target ?? current ?? null) : null;
          const cw = container?.w ?? cellSize * gridSize;
          const ch = container?.h ?? cellSize * gridSize;
          const camTx = target ? cw / 2 - camZoom * (target.x * cellSize) : 0;
          const camTy = target ? ch / 2 - camZoom * (target.y * cellSize) : 0;

          return (
            <View
              style={{
                width: cellSize * gridSize,
                height: cellSize * gridSize,
                transform: [{ scale: camZoom }, { translateX: camTx }, { translateY: camTy }],
              }}
            >
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
                        style={[styles.floorCell, { backgroundColor: bg, width: cellSize, height: cellSize }]}
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
        })()
      ) : null}
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
  positioning: IndoorPositioningState;
  pdrActive: boolean;
  togglePdr: () => void;
  startNodeId: string;
  onSelectStart: (id: string) => void;
  onScanWifi?: () => void;
  wifiCorrections?: boolean;
  onToggleWifiCorrections?: (enabled: boolean) => void;
  strideScale?: number;
  onAdjustStrideScale?: (delta: number) => void;
  onResetHeading?: () => void;
  testMode?: boolean;
  onRecenter: () => void;
  mapMode: 'pilot' | 'house';
  onChangeMapMode: (m: 'pilot' | 'house') => void;
  planId: 'neue';
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
  positioning,
  pdrActive,
  togglePdr,
  startNodeId,
  onSelectStart,
  onScanWifi,
  wifiCorrections,
  onToggleWifiCorrections,
  strideScale,
  onAdjustStrideScale,
  onResetHeading,
  onRecenter,
  mapMode,
  onChangeMapMode,
  planId,
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
  const [mapFollow, setMapFollow] = React.useState(true);
  const [mapZoom, setMapZoom] = React.useState(2);
  const [mapView, setMapView] = React.useState<'3d' | '2d'>('2d');
  const [map3dKey, setMap3dKey] = React.useState(0);
  const [mapRotate, setMapRotate] = React.useState(true);
  const [mapBearingDeg, setMapBearingDeg] = React.useState(0);
  const [freeTarget, setFreeTarget] = React.useState<PdrPoint | null>(null);
  const [followOffset, setFollowOffset] = React.useState<PdrPoint>({ x: 0, y: 0 });
  const [navOn, setNavOn] = React.useState(false);
  const [destinationId, setDestinationId] = React.useState<string | null>(null);
  const [panel, setPanel] = React.useState<'route' | 'positioning' | 'setup'>('route');
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const gridSize = storeMap.gridSize;
  const allNodes = useMemo(() => [...storeMap.nodes, ...customNodes], [storeMap.nodes, customNodes]);

  const currentPose = positioning.pose;
  const pdrPath = positioning.path;
  const isHouse = mapMode === 'house';
  const mapTarget = useMemo(() => {
    if (currentPose) return { x: currentPose.x, y: currentPose.y };
    const last = pdrPath[pdrPath.length - 1];
    if (last) return last;
    const start = allNodes.find((n) => n.id === startNodeId);
    return start ? ({ x: start.x, y: start.y } as PdrPoint) : null;
  }, [allNodes, currentPose, pdrPath, startNodeId]);
  const planResolved = useMemo(() => (isHouse ? Image.resolveAssetSource(planImage) : null), [isHouse, planImage]);
  const planMeters = useMemo(() => {
    const ppm = Math.max(0.0001, planImagePixelsPerMeter);
    return {
      width: (planResolved?.width ?? 1) / ppm,
      height: (planResolved?.height ?? 1) / ppm,
    };
  }, [planResolved, planImagePixelsPerMeter]);

  const poiNodes = useMemo(() => storeMap.nodes.filter((n) => n.type === 'poi'), [storeMap.nodes]);
  const destinationNode = useMemo(
    () => (destinationId ? storeMap.nodes.find((n) => n.id === destinationId) ?? null : null),
    [destinationId, storeMap.nodes],
  );
  const nav = useIndoorNavigation({
    enabled: !!destinationId,
    map: storeMap,
    current: currentPose
      ? { x: currentPose.x, y: currentPose.y }
      : mapTarget
      ? { x: mapTarget.x, y: mapTarget.y }
      : null,
    destinationId,
    reroute: { offRouteMeters: 2.2, persistMs: navOn ? 3000 : 1e9 },
  });

  const mapFollowRef = React.useRef(mapFollow);
  const mapTargetRef = React.useRef(mapTarget);
  React.useEffect(() => {
    mapFollowRef.current = mapFollow;
  }, [mapFollow]);
  React.useEffect(() => {
    mapTargetRef.current = mapTarget;
  }, [mapTarget]);

  const cameraTarget = mapFollow
    ? mapTarget
      ? { x: mapTarget.x + followOffset.x, y: mapTarget.y + followOffset.y }
      : null
    : (freeTarget ?? mapTarget);

  const onCameraChange = React.useCallback(
    (patch: { follow?: boolean; zoom?: number; target?: { x: number; y: number } | null; rotationDeg?: number; bearingDeg?: number }) => {
      if (patch.zoom !== undefined) setMapZoom((_) => clamp(patch.zoom ?? 2, 1, 6));
      if (patch.rotationDeg !== undefined) setMapBearingDeg(patch.rotationDeg ?? 0);
      if (patch.bearingDeg !== undefined) setMapBearingDeg(patch.bearingDeg ?? 0);
      if (patch.follow === true) {
        setMapFollow(true);
        setFreeTarget(null);
        setFollowOffset({ x: 0, y: 0 });
      } else if (patch.follow === false) {
        setMapFollow(false);
        setFollowOffset({ x: 0, y: 0 });
      }
      if (patch.target) {
        const followOn = mapFollowRef.current;
        const base = mapTargetRef.current;
        if (followOn && base) {
          setFollowOffset({ x: patch.target.x - base.x, y: patch.target.y - base.y });
        } else {
          setFreeTarget({ x: patch.target.x, y: patch.target.y });
        }
      }
    },
    [],
  );

  return (
    <Section title="Indoor Navigation" subtitle="Tap to set start, pick a POI, start navigation.">
      <View style={styles.glassCard}>
        <View style={styles.listControlRow}>
          <Text style={styles.sectionTitle}>Map</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isHouse ? (
              <View style={styles.segment}>
                {(['3d', '2d'] as const).map((v) => (
                  <Pressable
                    key={v}
                    style={[styles.segmentButton, mapView === v && styles.segmentButtonActive]}
                    onPress={() => {
                      setMapView(v);
                      if (v === '3d') setMap3dKey((k) => k + 1);
                    }}
                  >
                    <Text style={[styles.metaText, mapView === v && { color: colors.ink }]}>{v === '3d' ? '3D' : '2D'}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.inlineSwitch}>
              <Text style={styles.metaText}>Follow</Text>
              <Switch
                value={mapFollow}
                onValueChange={(v) => {
                  setMapFollow(v);
                  if (v) {
                    setFreeTarget(null);
                    setFollowOffset({ x: 0, y: 0 });
                  }
                }}
              />
            </View>
            <View style={styles.inlineSwitch}>
              <Text style={styles.metaText}>Rotate</Text>
              <Switch value={mapRotate} onValueChange={setMapRotate} />
            </View>
            <Pressable style={styles.ghostButton} onPress={() => setMapZoom((z) => clamp(Math.round((z - 0.2) * 10) / 10, 1, 6))}>
              <Ionicons name="remove" size={16} color={colors.accent} />
              <Text style={styles.metaText}>Zoom</Text>
            </Pressable>
            <Badge label={`x${mapZoom.toFixed(1)}`} tone="accent" />
            <Pressable style={styles.ghostButton} onPress={() => setMapZoom((z) => clamp(Math.round((z + 0.2) * 10) / 10, 1, 6))}>
              <Ionicons name="add" size={16} color={colors.accent} />
              <Text style={styles.metaText}>Zoom</Text>
            </Pressable>
            <Pressable
              style={styles.ghostButton}
              onPress={() => {
                setMapZoom(2);
                setMapFollow(true);
                setMapRotate(true);
              }}
            >
              <Ionicons name="refresh" size={16} color={colors.accent} />
              <Text style={styles.metaText}>Reset view</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.pdrRow}>
          <View style={styles.inlineSwitch}>
            <Text style={styles.metaText}>PDR</Text>
            <Switch value={pdrActive} onValueChange={togglePdr} />
          </View>
          <Pressable style={styles.ghostButton} onPress={onRecenter}>
            <Ionicons name="locate-outline" size={16} color={colors.accent} />
            <Text style={styles.metaText}>Recenter</Text>
          </Pressable>
          {onResetHeading ? (
            <Pressable style={styles.ghostButton} onPress={onResetHeading}>
              <Ionicons name="compass" size={16} color={colors.accent} />
              <Text style={styles.metaText}>Align</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {isHouse ? (
        mapView === '3d' ? (
          <ModelMap3D
            key={`3d-${map3dKey}`}
            style={[styles.planWrap, styles.planWrap3d]}
            model={neueModel}
            planMeters={planMeters}
            target={cameraTarget}
            follow={mapFollow}
            zoom={mapZoom}
            headingDeg={currentPose?.headingDeg ?? 0}
            rotateWithHeading={mapRotate}
            bearingDeg={mapBearingDeg}
            onCameraChange={onCameraChange}
            route={nav.route?.path.points ?? null}
            destination={destinationNode ? { x: destinationNode.x, y: destinationNode.y } : null}
          />
        ) : (
          <IndoorPlan2D
            style={styles.planWrap}
            source={planImage}
            imagePixelsPerMeter={planImagePixelsPerMeter}
            gesturesEnabled={planTool !== 'measure'}
            poiHitTestEnabled={planTool !== 'measure'}
            current={currentPose ? { x: currentPose.x, y: currentPose.y } : null}
            raw={positioning.rawPose ? { x: positioning.rawPose.x, y: positioning.rawPose.y } : null}
            headingDeg={currentPose?.headingDeg ?? 0}
            route={nav.route?.path.points ?? null}
            destinationId={destinationId}
            pois={poiNodes.map((p) => ({ id: p.id, label: p.label, x: p.x, y: p.y }))}
            onSelectPoi={(id) => setDestinationId(id)}
            camera={{ follow: mapFollow, zoom: mapZoom, target: cameraTarget, rotationDeg: mapBearingDeg }}
            onCameraChange={onCameraChange}
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
        )
      ) : (
        <FloorplanCanvas
          nodes={allNodes}
          gridSize={gridSize}
          routeOrder={routeOrder}
          visited={visited}
          startId={startNodeId}
          onSelectNode={(node) => onSelectStart(node.id)}
          path={pdrPath}
          current={pdrPath[pdrPath.length - 1]}
          camera={{ follow: mapFollow, zoom: mapZoom, target: cameraTarget }}
        />
      )}

      <View style={styles.navInfoCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="map-outline" size={18} color={colors.accent} />
          <View style={{ gap: 2 }}>
            <Text style={[styles.sectionTitle, { fontSize: 16 }]}>Navigation</Text>
            <Text style={styles.metaMuted}>
              {isHouse ? 'House plan' : 'Pilot store'} • {pdrActive ? 'PDR on' : 'PDR off'}
            </Text>
          </View>
        </View>
        <View style={styles.segment}>
          {(['route', 'positioning', 'setup'] as const).map((id) => (
            <Pressable
              key={id}
              style={[styles.segmentButton, panel === id && styles.segmentButtonActive]}
              onPress={() => setPanel(id)}
            >
              <Text style={[styles.metaText, panel === id && { color: colors.ink }]}>
                {id === 'route' ? 'Route' : id === 'positioning' ? 'Position' : 'Setup'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {panel === 'positioning' ? (
      <View style={styles.glassCard}>
        <View style={styles.listControlRow}>
          <Text style={styles.sectionTitle}>Positioning</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {Platform.OS === 'ios' ? <Badge label="iOS: PDR-only" tone="muted" /> : null}
            <Badge label={`PDR ${positioning.pdrConfidence}`} tone="accent" />
            {navOn && destinationId ? (
              <Badge label={nav.offRoute ? 'Off-route' : 'On-route'} tone={nav.offRoute ? 'accent' : 'success'} />
            ) : null}
          </View>
        </View>

        {isHouse ? (
          <Text style={styles.metaMuted}>Set start: switch to 2D, set Tool=Start, then tap the plan.</Text>
        ) : (
          <>
            <Text style={styles.metaMuted}>Start node</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
              {allNodes.map((n) => {
                const active = n.id === startNodeId;
                return (
                  <Pressable key={n.id} style={[styles.pin, active && styles.pinActive]} onPress={() => onSelectStart(n.id)}>
                    <Text style={styles.pinText}>
                      {active ? '⭐' : n.type === 'entry' ? '🟢' : n.type === 'exit' ? '🏁' : n.sectionId ? '🛒' : '📍'}
                    </Text>
                    <Text style={styles.pinLabel}>{n.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        <View style={styles.pdrRow}>
          <Pressable style={[styles.primaryButton, { paddingVertical: 8 }]} onPress={togglePdr}>
            <Text style={styles.primaryButtonText}>{pdrActive ? 'Stop PDR' : 'Start PDR'}</Text>
          </Pressable>
          <Pressable style={styles.ghostButton} onPress={onRecenter}>
            <Ionicons name="refresh" size={16} color={colors.accent} />
            <Text style={styles.metaText}>Recenter</Text>
          </Pressable>
          {onResetHeading ? (
            <Pressable style={styles.ghostButton} onPress={onResetHeading}>
              <Ionicons name="compass" size={16} color={colors.accent} />
              <Text style={styles.metaText}>Align</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.pdrRow}>
          {onAdjustStrideScale ? (
            <>
              <Pressable style={styles.ghostButton} onPress={() => onAdjustStrideScale(-0.05)}>
                <Ionicons name="remove" size={16} color={colors.accent} />
                <Text style={styles.metaText}>Stride</Text>
              </Pressable>
              <Badge label={`x${(strideScale ?? 1).toFixed(2)}`} tone="accent" />
              <Pressable style={styles.ghostButton} onPress={() => onAdjustStrideScale(0.05)}>
                <Ionicons name="add" size={16} color={colors.accent} />
                <Text style={styles.metaText}>Stride</Text>
              </Pressable>
            </>
          ) : null}

          {onToggleWifiCorrections && Platform.OS !== 'ios' ? (
            <View style={styles.inlineSwitch}>
              <Text style={styles.metaText}>Wi‑Fi corr</Text>
              <Switch value={!!wifiCorrections} onValueChange={onToggleWifiCorrections} />
            </View>
          ) : null}
          {onScanWifi ? (
            <Pressable style={styles.ghostButton} onPress={onScanWifi}>
              <Ionicons name="wifi" size={16} color={colors.accent} />
              <Text style={styles.metaText}>Scan</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.pdrRow}>
          <Badge label={`Steps ${positioning.steps}`} tone="accent" />
          <Badge label={`Heading ${(currentPose?.headingDeg ?? 0).toFixed(0)}°`} />
          <Badge label={`Snap ${currentPose?.snapped ? 'on' : 'off'}`} tone={currentPose?.snapped ? 'success' : 'muted'} />
          <Badge label={`Src ${currentPose?.source ?? '—'}`} />
          <Badge label={`Wi‑Fi ${positioning.wifi.status}`} />
        </View>

        {positioning.wifi.note ? <Text style={styles.metaMuted}>Wi‑Fi: {positioning.wifi.note}</Text> : null}
      </View>
      ) : null}

      {panel === 'route' ? (isHouse ? (
        <View style={styles.glassCard}>
          <View style={styles.listControlRow}>
            <Text style={styles.sectionTitle}>Route</Text>
            {nav.route ? <Badge label={`${Math.round(nav.route.lengthMeters)} m`} tone="accent" /> : null}
          </View>

          <Text style={styles.metaMuted}>Destination</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
            {poiNodes.map((n) => {
              const active = destinationId === n.id;
              return (
                <Pressable
                  key={n.id}
                  style={[styles.pin, active && styles.pinActive]}
                  onPress={() => setDestinationId(n.id)}
                >
                  <Text style={styles.pinText}>{active ? '★' : '📍'}</Text>
                  <Text style={styles.pinLabel}>{n.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.pdrRow}>
            <Pressable
              style={[styles.primaryButton, { paddingVertical: 8 }]}
              onPress={() => setNavOn((v) => !v)}
              disabled={!destinationId}
            >
              <Ionicons name="navigate" size={18} color={colors.text} />
              <Text style={styles.primaryButtonText}>{navOn ? 'Stop navigation' : 'Start navigation'}</Text>
            </Pressable>
            <Pressable style={styles.ghostButton} onPress={() => nav.recalc()} disabled={!destinationId}>
              <Ionicons name="refresh" size={16} color={colors.accent} />
              <Text style={styles.metaText}>Reroute</Text>
            </Pressable>
            <Pressable
              style={styles.ghostButton}
              onPress={() => {
                setDestinationId(null);
                setNavOn(false);
              }}
              disabled={!destinationId}
            >
              <Ionicons name="close" size={16} color={colors.muted} />
              <Text style={styles.metaText}>Clear</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionSubtitle}>
            {navOn
              ? nav.nextInstruction
              : destinationId
              ? 'Route preview shown. Tap “Start navigation” for turn-by-turn.'
              : 'Pick a destination to preview a route.'}
          </Text>

          {nav.route ? (
            <View style={styles.routeSteps}>
              {nav.route.maneuvers.slice(0, 8).map((m) => (
                <View key={`${m.type}-${m.atIndex}`} style={styles.routeStep}>
                  <View style={styles.routeStepCircle}>
                    <Text style={styles.routeStepText}>
                      {m.type === 'left'
                        ? 'L'
                        : m.type === 'right'
                        ? 'R'
                        : m.type === 'uturn'
                        ? 'U'
                        : m.type === 'arrive'
                        ? '✓'
                        : '•'}
                    </Text>
                  </View>
                  <Text style={styles.metaText}>
                    {m.instruction} • {Math.round(m.distanceFromStartMeters)}m
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.glassCard}>
          <View style={styles.listControlRow}>
            <Text style={styles.sectionTitle}>Pilot</Text>
            <Badge label={`${pendingCount} pending`} tone="muted" />
          </View>
          <View style={styles.pdrRow}>
            <Pressable style={styles.primaryButton} onPress={optimiseRoute}>
              <Ionicons name="navigate" size={18} color={colors.text} />
              <Text style={styles.primaryButtonText}>Optimize route</Text>
            </Pressable>
            <Pressable style={styles.ghostButton} onPress={clearNodes}>
              <Ionicons name="trash-outline" size={18} color={colors.muted} />
              <Text style={styles.metaText}>Clear custom</Text>
            </Pressable>
          </View>
          <Text style={styles.metaMuted}>Route order: {routeOrder.join(' → ')}</Text>
        </View>
      )) : null}

      {panel === 'setup' ? (isHouse ? (
        <View style={styles.glassCard}>
          <View style={styles.listControlRow}>
            <Text style={styles.sectionTitle}>Setup</Text>
            <View style={styles.segment}>
              {(['house', 'pilot'] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[styles.segmentButton, mapMode === m && styles.segmentButtonActive]}
                  onPress={() => onChangeMapMode(m)}
                >
                  <Text style={[styles.metaText, mapMode === m && { color: colors.ink }]}>
                    {m === 'house' ? 'House' : 'Pilot'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.listControlRow}>
            <Text style={styles.sectionTitle}>Tap mode</Text>
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
            {planTool === 'measure' ? (
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

          <Text style={styles.metaMuted}>
            {planTool === 'start'
              ? 'Tap on the 2D map to set your start position.'
              : planTool === 'measure'
              ? 'Tap A then B on the 2D map to measure distance.'
              : 'Tap on the 2D map to place/update a Wi‑Fi anchor.'}
          </Text>

          <View style={styles.planControls}>
            <Text style={styles.metaText}>Scale (px/m)</Text>
            <Badge label={`${NEUE_FIXED_PIXELS_PER_METER} (fixed)`} tone="accent" />
            <Pressable
              style={styles.ghostButton}
              onPress={() => {
                setPlanCalA(null);
                setPlanCalB(null);
                setPlanCalMeters('');
                setPlanImagePixelsPerMeter(NEUE_FIXED_PIXELS_PER_METER);
              }}
            >
              <Ionicons name="refresh" size={16} color={colors.accent} />
              <Text style={styles.metaText}>Reset scale</Text>
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

          <Text style={styles.metaMuted}>Tip: Use “Measure” and enter known distance to fine-tune px/m.</Text>
        </View>
      ) : (
        <View style={styles.glassCard}>
          <View style={styles.listControlRow}>
            <Text style={styles.sectionTitle}>Setup</Text>
            <View style={styles.segment}>
              {(['house', 'pilot'] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[styles.segmentButton, mapMode === m && styles.segmentButtonActive]}
                  onPress={() => onChangeMapMode(m)}
                >
                  <Text style={[styles.metaText, mapMode === m && { color: colors.ink }]}>
                    {m === 'house' ? 'House' : 'Pilot'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <Text style={styles.metaMuted}>Switch to House to use the 2D/3D floorplan maps.</Text>
        </View>
      )) : null}
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
  const togglePdr = React.useCallback(() => setPdrActive((v) => !v), []);
  const [navMapMode, setNavMapMode] = useState<'pilot' | 'house'>('house');
  const planId: PlanId = 'neue';
  const activePlan = useMemo(() => planConfigs[planId], [planId]);
  const [planTool, setPlanTool] = useState<PlanTool>('start');
  const [planMeasureA, setPlanMeasureA] = useState<{ x: number; y: number } | null>(null);
  const [planMeasureB, setPlanMeasureB] = useState<{ x: number; y: number } | null>(null);
  const [planAnchorsById, setPlanAnchorsById] = useState<Record<PlanId, StoreMapAnchor[]>>(() => ({
    neue: [{ bssid: '8c:19:b5:d8:b1:6d', label: 'Home Wi‑Fi', x: 1, y: 1, floor: 0, source: 'live', confidence: 0.9 }],
  }));
  const activeStoreMap: StoreMap = useMemo(() => {
    if (navMapMode !== 'house') return defaultStoreMap;
    const anchors = planAnchorsById.neue ?? [];
    return { ...activePlan.map, anchors };
  }, [navMapMode, activePlan, planAnchorsById]);
  const [planImagePixelsPerMeter, setPlanImagePixelsPerMeter] = useState<number>(NEUE_FIXED_PIXELS_PER_METER);
  const setPlanImagePixelsPerMeterFixed = React.useCallback((_n: number) => {
    setPlanImagePixelsPerMeter(NEUE_FIXED_PIXELS_PER_METER);
  }, []);
  const [planCalA, setPlanCalA] = useState<{ x: number; y: number } | null>(null);
  const [planCalB, setPlanCalB] = useState<{ x: number; y: number } | null>(null);
  const [planCalMeters, setPlanCalMeters] = useState('');
  const [startOverride, setStartOverride] = useState<PdrPoint | null>(neueFixedStartMeters);
  const [startNodeId, setStartNodeId] = useState<string>('entry');
  const [strideScale, setStrideScale] = useState(1);
  const [wifiCorrections, setWifiCorrections] = useState(Platform.OS !== 'ios');
  const getStartCoord = React.useCallback((): PdrPoint => {
    if (startOverride) return startOverride;
    const all = [...activeStoreMap.nodes, ...customNodes];
    const node = all.find((n) => n.id === startNodeId) || all[0];
    return { x: node?.x ?? 0.5, y: node?.y ?? 0.5 };
  }, [startOverride, startNodeId, activeStoreMap, customNodes]);
  const indoorPos = useIndoorPositioning({
    enabled: pdrActive,
    map: activeStoreMap,
    start: getStartCoord(),
    strideScale,
    wifiEnabled: wifiCorrections,
    wifiScanIntervalMs: 3200,
    snap: {
      maxSnapMeters: navMapMode === 'house' ? 1.7 : 1.2,
      hardClamp: navMapMode === 'house',
      switchPenaltyMeters: navMapMode === 'house' ? 1.25 : 0.35,
    },
  });

  const adjustStrideScale = React.useCallback((delta: number) => {
    setStrideScale((prev) => {
      const next = clamp(Math.round((prev + delta) * 100) / 100, 0.6, 1.5);
      return next;
    });
  }, []);

  const alignHeadingToMag = indoorPos.actions.alignHeadingToMag;
  const resetTo = indoorPos.actions.resetTo;
  const scanWifiNow = indoorPos.actions.scanWifiNow;

  const resetHeadingToMag = React.useCallback(() => {
    alignHeadingToMag();
  }, [alignHeadingToMag]);
  const recenterPdr = React.useCallback(() => {
    resetTo(getStartCoord());
  }, [getStartCoord, resetTo]);

  const scanWifiOnce = React.useCallback(async () => {
    await scanWifiNow();
  }, [scanWifiNow]);

  React.useEffect(() => {
    if (!pdrActive) return;
    resetTo(getStartCoord());
  }, [activeStoreMap.id, getStartCoord, pdrActive, resetTo]);

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
    if (Platform.OS === 'ios') setWifiCorrections(false);
  }, []);

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
              positioning={indoorPos.state}
              pdrActive={pdrActive}
              togglePdr={togglePdr}
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
                  indoorPos.actions.resetTo({ x: node.x, y: node.y });
                }
              }}
              strideScale={strideScale}
              onAdjustStrideScale={adjustStrideScale}
              onResetHeading={resetHeadingToMag}
              onScanWifi={wifiCorrections && Platform.OS !== 'ios' ? scanWifiOnce : undefined}
              wifiCorrections={wifiCorrections}
              onToggleWifiCorrections={(enabled) => {
                if (Platform.OS === 'ios') return;
                setWifiCorrections(enabled);
              }}
              onRecenter={recenterPdr}
              mapMode={navMapMode}
	              onChangeMapMode={(m) => {
	                setNavMapMode(m);
	                setStartOverride(m === 'house' ? neueFixedStartMeters : null);
                  if (Platform.OS === 'ios') setWifiCorrections(false);
	                setPlanCalA(null);
	                setPlanCalB(null);
	                setPlanCalMeters('');
	                setPlanTool('start');
	                setPlanMeasureA(null);
	                setPlanMeasureB(null);
	              }}
	              planId={planId}
	              planImage={activePlan.image}
              planImagePixelsPerMeter={planImagePixelsPerMeter}
              setPlanImagePixelsPerMeter={setPlanImagePixelsPerMeterFixed}
              planDefaultImagePixelsPerMeter={activePlan.defaultImagePixelsPerMeter}
              planTool={planTool}
              setPlanTool={setPlanTool}
              planMeasureA={planMeasureA}
              planMeasureB={planMeasureB}
              setPlanMeasureA={setPlanMeasureA}
              setPlanMeasureB={setPlanMeasureB}
		              onSetAnchorAt={(pMeters) => {
		                setPlanAnchorsById((prev) => {
		                  const existing = prev.neue ?? [];
		                  const best = indoorPos.state.wifi.fix?.best?.bssid;
		                  const updated: StoreMapAnchor[] =
		                    existing.length > 0
		                      ? [
		                          {
		                            ...existing[0],
		                            bssid: best ?? existing[0].bssid,
		                            x: pMeters.x,
		                            y: pMeters.y,
		                            floor: 0,
		                            source: 'live' as const,
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
		                            source: 'live' as const,
		                            confidence: 0.9,
		                          },
		                        ];
		                  return { ...prev, neue: updated };
		                });
		              }}
              planCalA={planCalA}
              planCalB={planCalB}
              setPlanCalA={setPlanCalA}
              setPlanCalB={setPlanCalB}
	              planCalMeters={planCalMeters}
	              setPlanCalMeters={setPlanCalMeters}
		              onPlanTap={(pMeters, pPx) => {
		                setStartOverride(pMeters);
                    indoorPos.actions.resetTo(pMeters);
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
    marginTop: 12,
    height: 520,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: '#FFF9F3',
  },
  planWrap3d: {
    // iOS GL surfaces don't always render reliably when clipped (borderRadius + overflow hidden).
    overflow: 'visible',
    borderRadius: 0,
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
