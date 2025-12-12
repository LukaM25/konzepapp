import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, SafeAreaView, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
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
import { Accelerometer, Barometer, Gyroscope, Magnetometer } from 'expo-sensors';

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
type FloorNode = { id: string; row: number; col: number; label: string; sectionId?: string };
type PdrState = {
  steps: number;
  heading: number;
  floor: number;
  pressure: number;
  status: 'idle' | 'tracking' | 'denied';
};
type WifiAnchor = { bssid: string; label: string; row: number; col: number; source: 'mock' | 'live'; confidence?: number };
type PdrPoint = { x: number; y: number };

const wrapHeading = (deg: number) => {
  const h = deg % 360;
  return h < 0 ? h + 360 : h;
};
const headingDiff = (a: number, b: number) => {
  const d = ((a - b + 540) % 360) - 180;
  return d;
};

const tabs: { id: TabId; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'home', label: 'Home', icon: 'home-outline' },
  { id: 'list', label: 'Liste', icon: 'checkbox-outline' },
  { id: 'recipes', label: 'Rezepte', icon: 'restaurant-outline' },
  { id: 'nav', label: 'Navigation', icon: 'map-outline' },
  { id: 'plans', label: 'Pläne', icon: 'card-outline' },
];

const wifiAnchorsConfig: WifiAnchor[] = [
  { bssid: 'AA:BB:CC:DD:EE:01', label: 'Router', row: 0, col: 0, source: 'mock', confidence: 0.85 },
  { bssid: 'AA:BB:CC:DD:EE:02', label: 'AP', row: 5, col: 5, source: 'mock', confidence: 0.7 },
];

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

const baseFloorNodes: FloorNode[] = [
  { id: 'entry', row: 0, col: 0, label: 'Eingang' },
  { id: 'exit', row: 5, col: 5, label: 'Kasse' },
];

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
  nodes: FloorNode[];
  routeOrder: string[];
  visited: string[];
  gridSize?: number;
  startId?: string;
  onSelectNode?: (node: FloorNode) => void;
  path?: PdrPoint[];
  current?: PdrPoint;
}> = ({ nodes, routeOrder, visited, gridSize = 6, startId, onSelectNode, path = [], current }) => {
  const [cellSize, setCellSize] = React.useState(0);
  const cells = Array.from({ length: gridSize }, (_, row) =>
    Array.from({ length: gridSize }, (_, col) => {
      const node = nodes.find((n) => n.row === row && n.col === col);
      const isRoute = node ? routeOrder.includes(node.id) : false;
      const isVisited = node ? visited.includes(node.id) : false;
      const isEntry = node?.id === 'entry';
      const isExit = node?.id === 'exit';
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
  items: ShoppingItem[];
  customNodes: FloorNode[];
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
  wifiAnchor: WifiAnchor | null;
  wifiStatus: 'mock' | 'live' | 'off';
  onMockAnchor: (anchor: WifiAnchor) => void;
  wifiConfidence: number;
  testMode: boolean;
  pdrConfidence: 'good' | 'ok' | 'low';
  onRecenter: () => void;
}> = ({
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
  wifiAnchor,
  wifiStatus,
  onMockAnchor,
  wifiConfidence,
  testMode,
  pdrConfidence,
  onRecenter,
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

  const findFreeSlot = () => {
    const occupied = [...baseFloorNodes, ...customNodes].map((n) => `${n.row}-${n.col}`);
    for (let r = 0; r < 6; r += 1) {
      for (let c = 0; c < 6; c += 1) {
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
          <Text style={styles.sectionTitle}>Route aktiv</Text>
          <Text style={styles.metaMuted}>{orderedSections.length} Stopps • ~{estimatedMinutes} min</Text>
        </View>
        <View style={styles.navPills}>
          <Badge label={`${pending.length} offen`} tone="accent" />
          <Badge label={`${customNodes.length} Gänge`} tone="muted" />
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
        </View>
        <View style={styles.pdrRow}>
          {wifiAnchorsConfig.map((anchor) => (
            <Pressable key={anchor.bssid} style={styles.ghostButton} onPress={() => onMockAnchor(anchor)}>
              <Ionicons name="wifi" size={16} color={colors.accent} />
              <Text style={styles.metaText}>{anchor.label}</Text>
            </Pressable>
          ))}
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

      {!testMode && (
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
                placeholder="Row (0-5)"
                keyboardType="numeric"
                value={form.row}
                onChangeText={(v) => setForm({ row: v })}
              />
              <TextInput
                style={[styles.searchInput, styles.floorInputSmall]}
                placeholder="Col (0-5)"
                keyboardType="numeric"
                value={form.col}
                onChangeText={(v) => setForm({ col: v })}
              />
            </View>
            <View style={[styles.row, { gap: 8, marginTop: 6 }]}>
              <Pressable
                style={styles.primaryButton}
                onPress={() => {
                  const r = Math.max(0, Math.min(5, Number(form.row) || 0));
                  const c = Math.max(0, Math.min(5, Number(form.col) || 0));
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

      {!testMode && (
        <Pressable style={[styles.primaryButton, { marginTop: 10 }]} onPress={optimiseRoute}>
          <Ionicons name="navigate" size={18} color={colors.text} />
          <Text style={styles.primaryButtonText}>Route optimieren</Text>
        </Pressable>
      )}

      <View style={styles.mapLegend}>
        <Text style={styles.metaMuted}>Tippe auf einen Punkt, um den Start zu setzen.</Text>
        <Badge label={`Start: ${startNodeId}`} />
        {wifiAnchor ? <Badge label={`Anchor: ${wifiAnchor.label}`} tone="accent" /> : null}
      </View>

      <FloorplanCanvas
        nodes={[...baseFloorNodes, ...customNodes]}
        routeOrder={routeOrder}
        visited={visited}
        startId={startNodeId}
        onSelectNode={(node) => onSelectStart(node.id)}
        path={pdrPath}
        current={pdrPath[pdrPath.length - 1]}
      />

      {!testMode && (
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

      {!testMode && (
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
  const [customNodes, setCustomNodes] = useState<FloorNode[]>([]);
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
  const [pdrState, setPdrState] = useState<PdrState>({ steps: 0, heading: 0, floor: 0, pressure: 0, status: 'idle' });
  const pdrBaseline = React.useRef<number | null>(null);
  const [startNodeId, setStartNodeId] = useState<string>('entry');
  const [pdrPath, setPdrPath] = useState<PdrPoint[]>([]);
  const headingRef = React.useRef(0);
  const magHeadingRef = React.useRef(0);
  const lastStepsRef = React.useRef(0);
  const gyroHeadingRef = React.useRef(0);
  const lastGyroTs = React.useRef<number | null>(null);
  const [pdrConfidence, setPdrConfidence] = useState<'good' | 'ok' | 'low'>('ok');
  const accelBaseline = React.useRef(0);
  const accelPeak = React.useRef(0);
  const lastStepTime = React.useRef<number>(0);
  const stepLengthRef = React.useRef(0.6);
  const getStartCoord = React.useCallback((): PdrPoint => {
    const all = [...baseFloorNodes, ...customNodes];
    const node = all.find((n) => n.id === startNodeId) || all[0];
    return { x: (node?.col ?? 0) + 0.5, y: (node?.row ?? 0) + 0.5 };
  }, [startNodeId, customNodes]);
  const [wifiAnchor, setWifiAnchor] = useState<WifiAnchor | null>(null);
  const [wifiStatus, setWifiStatus] = useState<'mock' | 'live' | 'off'>('mock');
  const [wifiConfidence, setWifiConfidence] = useState(0.7);
  const recenterPdr = React.useCallback(() => {
    const all = [...baseFloorNodes, ...customNodes];
    const node = all.find((n) => n.id === startNodeId) || all[0];
    setPdrPath([{ x: (node?.col ?? 0) + 0.5, y: (node?.row ?? 0) + 0.5 }]);
    setPdrState((s) => ({ ...s, steps: 0 }));
    lastStepsRef.current = 0;
  }, [customNodes, startNodeId]);

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
    // prevent overlap on same cell
    const exists = customNodes.some((n) => n.row === row && n.col === col);
    if (exists) return;
    setCustomNodes((prev) => [...prev, { id, label, row, col, sectionId }]);
  };

  const clearCustomNodes = () => {
    setCustomNodes([]);
    setRouteOrder(['entry', 'exit']);
    setFloorForm({ label: '', section: '', row: '0', col: '0' });
  };

  const optimiseRoute = () => {
    const pending = items.filter((i) => i.status === 'pending');
    const targets = pending
      .map((it) => {
        const section = storeSections.find((s) =>
          s.items.some((name) => name.toLowerCase() === it.name.toLowerCase()),
        );
        return section;
      })
      .filter(Boolean) as StoreSection[];

    const nodeOrder: FloorNode[] = [];
    targets.forEach((section) => {
      const matchNode =
        customNodes.find((n) => n.sectionId === section.id) ||
        customNodes.find((n) => n.label.toLowerCase().includes(section.label.toLowerCase()));
      if (matchNode && !nodeOrder.some((n) => n.id === matchNode.id)) {
        nodeOrder.push(matchNode);
      }
    });

    // simple sort: row then col for deterministic "fastest" placeholder
    const sorted = nodeOrder.sort((a, b) => a.row - b.row || a.col - b.col).map((n) => n.id);
    const start = nodeOrder.find((n) => n.id === startNodeId) || baseFloorNodes.find((n) => n.id === startNodeId) || baseFloorNodes[0];
    setRouteOrder([start?.id || 'entry', ...sorted.filter((id) => id !== (start?.id || 'entry')), 'exit']);
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
    let gyroSub: any;
    let magSub: any;
    let baroSub: any;
    let accelSub: any;
    const start = async () => {
      if (!pdrActive) return;
      setPdrState((s) => ({ ...s, status: 'tracking', steps: 0 }));
      lastStepsRef.current = 0;
      setPdrPath([getStartCoord()]);
      headingRef.current = 0;
      gyroHeadingRef.current = 0;
      magHeadingRef.current = 0;
      lastGyroTs.current = null;

      // Magnetometer: heavily smoothed, only used as a slow corrector
      magSub = Magnetometer.addListener(({ x, y }) => {
        const angle = Math.atan2(y, x) * (180 / Math.PI);
        const heading = wrapHeading(angle);
        const diff = headingDiff(heading, magHeadingRef.current);
        const factor = Math.abs(diff) < 30 ? 0.12 : 0.04;
        magHeadingRef.current = wrapHeading(magHeadingRef.current + diff * factor);
      });
      Magnetometer.setUpdateInterval(200);

      // Heading: gyro integration + complementary blend with mag
      gyroSub = Gyroscope.addListener(({ z, timestamp }) => {
        const ts = timestamp || Date.now();
        if (lastGyroTs.current) {
          const dt = (ts - lastGyroTs.current) / 1000;
          gyroHeadingRef.current = wrapHeading(gyroHeadingRef.current + (z || 0) * (180 / Math.PI) * dt);
        }
        lastGyroTs.current = ts;
        const fused = wrapHeading(gyroHeadingRef.current * 0.96 + magHeadingRef.current * 0.04);
        const delta = headingDiff(fused, headingRef.current);
        const limited = Math.max(-5, Math.min(5, delta));
        headingRef.current = wrapHeading(headingRef.current + limited);
        setPdrState((s) => ({ ...s, heading: headingRef.current }));
      });
      Gyroscope.setUpdateInterval(100);

      accelSub = Accelerometer.addListener(({ x, y, z, timestamp }) => {
        const ts = timestamp || Date.now();
        const mag = Math.sqrt((x || 0) ** 2 + (y || 0) ** 2 + (z || 0) ** 2);
        if (!accelBaseline.current) accelBaseline.current = mag;
        accelBaseline.current = accelBaseline.current * 0.95 + mag * 0.05; // slow drift
        const diff = Math.abs(mag - accelBaseline.current);
        accelPeak.current = Math.max(accelPeak.current * 0.9, diff);
        const threshold = Math.max(0.12, accelBaseline.current * 0.015);
        const now = ts;
        const minInterval = 250; // ms
        if (diff > threshold && now - lastStepTime.current > minInterval) {
          lastStepTime.current = now;
          const stepLen = Math.max(0.45, Math.min(1.0, 0.6 + diff * 0.05));
          stepLengthRef.current = stepLen;
          const hRad = (headingRef.current * Math.PI) / 180;
          setPdrPath((prev) => {
            const coords: PdrPoint[] = [...prev];
            const current = coords[coords.length - 1] || getStartCoord();
            let x = current.x + Math.sin(hRad) * stepLen;
            let y = current.y - Math.cos(hRad) * stepLen;
            x = Math.max(0, Math.min(6, x));
            y = Math.max(0, Math.min(6, y));
            coords.push({ x, y });
            return coords.slice(-200);
          });
          setPdrState((s) => ({ ...s, steps: s.steps + 1 }));
        }
        // confidence heuristic
        const headingVar = Math.abs(headingDiff(gyroHeadingRef.current, headingRef.current));
        const quality = headingVar < 10 && diff > threshold ? 'good' : headingVar < 25 ? 'ok' : 'low';
        setPdrConfidence(quality as 'good' | 'ok' | 'low');
      });
      Accelerometer.setUpdateInterval(60);

      baroSub = Barometer.addListener(({ pressure }) => {
        if (pdrBaseline.current === null) {
          pdrBaseline.current = pressure;
        }
        const delta = (pdrBaseline.current ?? pressure) - pressure;
        const approxMeters = delta * 8.3; // rough meters per hPa
        const floor = Math.round(approxMeters / 3);
        setPdrState((s) => ({ ...s, pressure, floor }));
      });
    };

    const stop = () => {
      gyroSub?.remove?.();
      magSub?.remove?.();
      baroSub?.remove?.();
      accelSub?.remove?.();
    };

    start();
    return () => stop();
  }, [pdrActive]);

  React.useEffect(() => {
    if (!pdrActive) {
      pdrBaseline.current = null;
      setPdrState((s) => ({ ...s, status: 'idle' }));
      lastStepsRef.current = 0;
    }
  }, [pdrActive]);

  React.useEffect(() => {
    setPdrPath([getStartCoord()]);
  }, [getStartCoord]);

  React.useEffect(() => {
    if (!pdrActive || !wifiAnchor) return;
    const anchorCoord: PdrPoint = { x: wifiAnchor.col + 0.5, y: wifiAnchor.row + 0.5 };
    const conf = wifiConfidence || wifiAnchor.confidence || 0.7;
    setPdrPath((prev) => {
      const current = prev[prev.length - 1] || anchorCoord;
      const dist = Math.hypot(current.x - anchorCoord.x, current.y - anchorCoord.y);
      if (dist > 3 && conf < 0.6) return prev; // low confidence, ignore far anchor
      if (dist > 3) {
        // hard reset if far
        return [anchorCoord];
      }
      const blend = Math.min(1, conf * 0.7);
      const blended = {
        x: current.x * (1 - blend) + anchorCoord.x * blend,
        y: current.y * (1 - blend) + anchorCoord.y * blend,
      };
      return [...prev, blended].slice(-50);
    });
  }, [wifiAnchor, pdrActive]);

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
                const exists = [...baseFloorNodes, ...customNodes].some((n) => n.id === id);
                if (exists) {
                  setRouteOrder((prev) => [id, ...prev.filter((p) => p !== id && p !== 'entry'), 'exit']);
                }
                const all = [...baseFloorNodes, ...customNodes];
                const node = all.find((n) => n.id === id);
                if (node) {
                  setPdrPath([{ x: node.col + 0.5, y: node.row + 0.5 }]);
                  lastStepsRef.current = 0;
                }
              }}
              pdrPath={pdrPath}
              wifiAnchor={wifiAnchor}
              wifiStatus={wifiStatus}
              wifiConfidence={wifiConfidence}
              onMockAnchor={(anchor) => {
                setWifiAnchor(anchor);
                setWifiStatus('mock');
                setWifiConfidence(anchor.confidence ?? 0.7);
              }}
              pdrConfidence={pdrConfidence}
              onRecenter={recenterPdr}
              testMode
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
});
