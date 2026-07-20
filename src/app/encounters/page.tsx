'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BookOpen,
  Box,
  Check,
  ChevronDown,
  FileJson,
  FileText,
  Filter,
  Map as MapIcon,
  Minus,
  Pencil,
  Play,
  Plus,
  Printer,
  Save,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Swords,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { filterMonsters } from '@/lib/monster-filter';
import { useMonsters } from '@/app/hooks/useMonsters';
import {
  assessEncounterDifficulty,
  generateEncounter,
  getPartyXpBudget,
  summarizeEncounter,
} from '@/lib/encounter-generator';
import {
  generateMap,
  isMapLayout,
  isMapScale,
  MAP_LAYOUT_OPTIONS,
  MAP_SCALE_OPTIONS,
  type MapFeatureDensity,
  type MapLayout,
  type MapScale,
  type MapTerrainVariety,
} from '@/lib/map-generator';
import { randomSeed, seededRandom } from '@/lib/random';
import {
  ENCOUNTER_RECIPES,
  fillRecipeSlots,
  getRecipeById,
} from '@/lib/encounter-recipes';
import { validateBoundedIntegerInput } from '@/lib/number-input';
import type {
  Encounter, Difficulty, Environment,
  Party, Monster, MonsterFilter,
} from '@/lib/types';
import DifficultyBadge from '@/components/DifficultyBadge';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import MapSvg from '@/components/MapSvg';
import RoomKeyPanel from '@/components/RoomKeyPanel';
import { placeTokens } from '@/lib/token-placement';
import FilterPanel from '@/components/FilterPanel';
import PartySetupPanel from '@/components/PartySetupPanel';
import BattleReportCard from '@/components/BattleReportCard';
import PrintButton from '@/components/PrintButton';
import ResetGeneratorButton from '@/components/ResetGeneratorButton';
import ToolPageHeader from '@/components/ToolPageHeader';
import { simulateBattle } from '@/lib/battle-sim';
import { battlefieldFromMap } from '@/lib/sim/movement';
import { monsterToSimMonster } from '@/lib/monster-to-sim';
import {
  buildSimPlayer,
  defaultPartyConfig,
  syncPartyConfigMembers,
} from '@/data/class-templates';
import { usePersistentState } from '@/lib/use-persistent-state';
import { storageLoad, storageSave } from '@/lib/storage';
import {
  PARTY_CONFIG_STORAGE_KEY,
  type BattleReport,
  type PartyConfig,
} from '@/lib/battle-sim-types';
import {
  encounterExportFilename,
  encounterPlayerHandoutMarkdown,
  encounterToFoundry,
  encounterToMarkdown,
} from '@/lib/encounter-export';
import {
  battleFromEncounter,
  isBattleState,
  type BattleState,
} from '@/lib/battle-organizer';

const DIFFICULTIES: Difficulty[] = ['Trivial', 'Low', 'Moderate', 'High', 'Extreme'];
const MAP_DENSITIES: MapFeatureDensity[] = ['Sparse', 'Balanced', 'Dense'];
const MAP_VARIETIES: MapTerrainVariety[] = ['Focused', 'Varied', 'Wild'];
const ENVIRONMENTS: Environment[] = [
  'Arctic', 'Coastal', 'Desert', 'Forest', 'Grassland', 'Hill',
  'Mountain', 'Swamp', 'Underdark', 'Underwater', 'Urban', 'Planar',
];

function crDisplay(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return cr.toString();
}

function buildParty(size: number, level: number): Party {
  return {
    id: 'party',
    name: 'Adventuring Party',
    members: Array.from({ length: size }, (_, i) => ({
      name: `Player ${i + 1}`,
      level,
      className: 'Adventurer',
    })),
  };
}

// ─── Shareable URL state ──────────────────────────────────────────

interface GenerateConfig {
  partySize: number;
  partyLevel: number;
  difficulty: Difficulty;
  environment: Environment;
  includeMap: boolean;
  mapLayout: MapLayout;
  mapScale: MapScale;
  /** Legacy shared links only — exact dimensions bypass scale mode. */
  mapWidth?: number;
  mapHeight?: number;
  mapFeatureDensity: MapFeatureDensity;
  mapTerrainVariety: MapTerrainVariety;
  filter: MonsterFilter;
  seed: number;
  recipeId?: string;
}

/** MapOptions fragment shared by every generateMap call site. */
function mapOptionsFrom(cfg: GenerateConfig) {
  return {
    layout: cfg.mapLayout,
    scale: cfg.mapScale,
    ...(cfg.mapWidth !== undefined ? { width: cfg.mapWidth } : {}),
    ...(cfg.mapHeight !== undefined ? { height: cfg.mapHeight } : {}),
    featureDensity: cfg.mapFeatureDensity,
    terrainVariety: cfg.mapTerrainVariety,
  };
}

function writeUrl(cfg: GenerateConfig): void {
  const params = new URLSearchParams();
  params.set('size', String(cfg.partySize));
  params.set('level', String(cfg.partyLevel));
  params.set('diff', cfg.difficulty);
  params.set('env', cfg.environment);
  if (cfg.includeMap) {
    params.set('map', '1');
    if (cfg.mapWidth !== undefined && cfg.mapHeight !== undefined) {
      // Legacy exact dimensions round-trip unchanged.
      params.set('mw', String(cfg.mapWidth));
      params.set('mh', String(cfg.mapHeight));
    } else {
      params.set('ms', cfg.mapScale);
    }
    if (cfg.mapLayout !== 'auto') params.set('ml', cfg.mapLayout);
    params.set('md', cfg.mapFeatureDensity);
    params.set('mv', cfg.mapTerrainVariety);
  }
  params.set('seed', String(cfg.seed));
  if (cfg.recipeId) params.set('recipe', cfg.recipeId);
  if (Object.keys(cfg.filter).length > 0) params.set('f', JSON.stringify(cfg.filter));
  window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
}

function clearUrlSeed(): void {
  const params = new URLSearchParams(window.location.search);
  params.delete('seed');
  const query = params.toString();
  window.history.replaceState(
    null, '', query ? `${window.location.pathname}?${query}` : window.location.pathname,
  );
}

function clampInt(raw: string | null, min: number, max: number): number | null {
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function isDifficulty(v: string | null): v is Difficulty {
  return v !== null && (DIFFICULTIES as string[]).includes(v);
}

function isEnvironment(v: string | null): v is Environment {
  return v !== null && (ENVIRONMENTS as string[]).includes(v);
}

function withoutEnvironmentFilter(filter: MonsterFilter): MonsterFilter {
  const next = { ...filter };
  delete next.environments;
  return next;
}

function isMapFeatureDensity(v: unknown): v is MapFeatureDensity {
  return typeof v === 'string' && (MAP_DENSITIES as string[]).includes(v);
}

function isMapTerrainVariety(v: unknown): v is MapTerrainVariety {
  return typeof v === 'string' && (MAP_VARIETIES as string[]).includes(v);
}

function isPartyConfig(v: unknown): v is PartyConfig {
  return (
    typeof v === 'object' && v !== null
    && (v as PartyConfig).version === 1
    && Array.isArray((v as PartyConfig).members)
  );
}

interface EncounterSettings {
  partySize: number;
  partyLevel: number;
  difficulty: Difficulty;
  environment: Environment;
  includeMap: boolean;
  /** Pre-layouts persisted shape — accepted, no longer written. */
  mapWidth?: number;
  mapHeight?: number;
  mapLayout?: MapLayout;
  mapScale?: MapScale;
  mapFeatureDensity?: MapFeatureDensity;
  mapTerrainVariety?: MapTerrainVariety;
}

function isEncounterSettings(v: unknown): v is EncounterSettings {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as EncounterSettings;
  return (
    typeof s.partySize === 'number'
    && typeof s.partyLevel === 'number'
    && isDifficulty(s.difficulty)
    && isEnvironment(s.environment)
    && typeof s.includeMap === 'boolean'
    && (s.mapWidth === undefined || typeof s.mapWidth === 'number')
    && (s.mapHeight === undefined || typeof s.mapHeight === 'number')
    && (s.mapLayout === undefined || isMapLayout(s.mapLayout))
    && (s.mapScale === undefined || isMapScale(s.mapScale))
    && (s.mapFeatureDensity === undefined || isMapFeatureDensity(s.mapFeatureDensity))
    && (s.mapTerrainVariety === undefined || isMapTerrainVariety(s.mapTerrainVariety))
  );
}

interface SavedEncounter {
  id: string;
  name: string;
  savedAt: number;
  encounter: Encounter;
}

interface WhatIfResult {
  label: string;
  report: BattleReport;
}

const MAX_SAVED_ENCOUNTERS = 20;

/** Stable fingerprint of an encounter's composition for staleness checks. */
function encounterSignature(encounter: Encounter | null): string {
  if (!encounter) return '';
  return encounter.monsters
    .map((em) => `${em.monster.id}x${em.count}`)
    .sort()
    .join('|');
}

// ─── Page ─────────────────────────────────────────────────────────

export default function EncounterPage() {
  // useSearchParams requires a Suspense boundary under static prerendering.
  return (
    <Suspense fallback={null}>
      <EncounterBuilder />
    </Suspense>
  );
}

function EncounterBuilder() {
  const searchParams = useSearchParams();
  const { all: allMonsters } = useMonsters();

  const [partySize, setPartySize] = useState(4);
  const [partyLevel, setPartyLevel] = useState(3);
  const [partySizeInput, setPartySizeInput] = useState('4');
  const [partyLevelInput, setPartyLevelInput] = useState('3');
  const [difficulty, setDifficulty] = useState<Difficulty>('Moderate');
  const [environment, setEnvironment] = useState<Environment>('Forest');
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [isSeeded, setIsSeeded] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [monsterFilter, setMonsterFilter] = useState<MonsterFilter>({});
  const [expandedMonster, setExpandedMonster] = useState<string | null>(null);
  const [includeMap, setIncludeMap] = useState(true);
  const [mapLayout, setMapLayout] = useState<MapLayout>('auto');
  const [mapScale, setMapScale] = useState<MapScale>('Standard');
  const [mapFeatureDensity, setMapFeatureDensity] = useState<MapFeatureDensity>('Balanced');
  const [mapTerrainVariety, setMapTerrainVariety] = useState<MapTerrainVariety>('Varied');
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [showRecipes, setShowRecipes] = useState(false);
  const [recipeError, setRecipeError] = useState('');

  const partySizeValidation = validateBoundedIntegerInput(
    partySizeInput, 'Party size', 1, 10,
  );
  const partyLevelValidation = validateBoundedIntegerInput(
    partyLevelInput, 'Party level', 1, 20,
  );
  const partyInputsValid = partySizeValidation.error === null
    && partyLevelValidation.error === null;

  // Battle Forecast state
  const [partyConfig, setPartyConfig, partyConfigHydrated] = usePersistentState<PartyConfig | null>(
    PARTY_CONFIG_STORAGE_KEY,
    null,
    (v): v is PartyConfig | null => v === null || isPartyConfig(v),
  );
  const [showPartySetup, setShowPartySetup] = useState(false);
  const [report, setReport] = useState<BattleReport | null>(null);
  const [reportSignature, setReportSignature] = useState('');
  const [simRunning, setSimRunning] = useState(false);
  const [whatIfReports, setWhatIfReports] = useState<WhatIfResult[]>([]);
  const partySetupRef = useRef<HTMLDivElement>(null);
  const configurePartyButtonRef = useRef<HTMLButtonElement>(null);

  // Saved encounters + save-name input
  const [savedEncounters, setSavedEncounters, savedHydrated] =
    usePersistentState<SavedEncounter[]>('savedEncounters', []);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const saveEncounterButtonRef = useRef<HTMLButtonElement>(null);
  const editDetailsButtonRef = useRef<HTMLButtonElement>(null);

  // Persisted page settings. Declared BEFORE the URL-init effect so a shared
  // link's params win over remembered settings.
  const settingsHydrated = useRef(false);
  useEffect(() => {
    const stored = storageLoad<EncounterSettings | null>(
      'encounterSettings', null,
      (v): v is EncounterSettings | null => v === null || isEncounterSettings(v),
    );
    if (stored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot localStorage hydration must apply the saved control snapshot together.
      setPartySize(stored.partySize);
      setPartyLevel(stored.partyLevel);
      setPartySizeInput(String(stored.partySize));
      setPartyLevelInput(String(stored.partyLevel));
      setDifficulty(stored.difficulty);
      setEnvironment(stored.environment);
      setIncludeMap(stored.includeMap);
      setMapLayout(stored.mapLayout ?? 'auto');
      setMapScale(stored.mapScale ?? 'Standard');
      setMapFeatureDensity(stored.mapFeatureDensity ?? 'Balanced');
      setMapTerrainVariety(stored.mapTerrainVariety ?? 'Varied');
    }
    settingsHydrated.current = true;
  }, []);
  useEffect(() => {
    if (!settingsHydrated.current) return;
    storageSave('encounterSettings', {
      partySize, partyLevel, difficulty, environment, includeMap,
      mapLayout, mapScale, mapFeatureDensity, mapTerrainVariety,
    } satisfies EncounterSettings);
  }, [
    partySize, partyLevel, difficulty, environment, includeMap,
    mapLayout, mapScale, mapFeatureDensity, mapTerrainVariety,
  ]);

  // Bring a persisted forecast party up to the builder's current party size
  // and level once both local-storage sources have hydrated.
  const didSyncPartyConfig = useRef(false);
  useEffect(() => {
    if (didSyncPartyConfig.current || !partyConfigHydrated || !settingsHydrated.current) return;
    didSyncPartyConfig.current = true;
    setPartyConfig((current) => ({
      version: 1,
      members: syncPartyConfigMembers(current?.members ?? [], partySize, partyLevel),
    }));
  }, [partyConfigHydrated, partyLevel, partySize, setPartyConfig]);

  // Current party for XP budgets
  const party = useMemo(() => buildParty(partySize, partyLevel), [partySize, partyLevel]);

  // Seeded token placement rides map.seed (third rng stream), so a
  // shared link reproduces map AND starting positions with zero extra
  // params, and "Regenerate Map" re-places automatically.
  const placement = useMemo(
    () => (encounter?.map
      ? placeTokens(encounter.map, encounter.monsters, partySize, encounter.map.seed ?? encounter.seed)
      : null),
    [encounter, partySize],
  );

  // The single source of encounter totals for the meter, badge, and header stats
  const summary = useMemo(
    () => summarizeEncounter(encounter?.monsters ?? [], party),
    [encounter, party],
  );

  // Monsters for manual add search
  const manualResults = useMemo(() => {
    if (!manualSearch.trim()) return allMonsters.slice(0, 20);
    return filterMonsters(allMonsters, { search: manualSearch }).slice(0, 20);
  }, [allMonsters, manualSearch]);

  const invalidateForecast = useCallback(() => {
    setReport(null);
    setReportSignature('');
    setSimRunning(false);
    setWhatIfReports([]);
  }, []);

  const openPartySetup = useCallback(() => {
    setShowPartySetup(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        partySetupRef.current?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'instant' as ScrollBehavior
            : 'smooth',
          block: 'start',
        });
        partySetupRef.current?.focus({ preventScroll: true });
      });
    });
  }, []);

  const closePartySetup = useCallback(() => {
    setShowPartySetup(false);
    window.requestAnimationFrame(() => configurePartyButtonRef.current?.focus());
  }, []);

  const closeDetailsEditor = useCallback(() => {
    setEditingDetails(false);
    window.requestAnimationFrame(() => editDetailsButtonRef.current?.focus());
  }, []);

  const closeSaveEncounter = useCallback(() => {
    setSavingName(null);
    window.requestAnimationFrame(() => saveEncounterButtonRef.current?.focus());
  }, []);

  const runGenerate = useCallback((cfg: GenerateConfig) => {
    const generatorFilter = withoutEnvironmentFilter(cfg.filter);
    const enc = generateEncounter(
      allMonsters,
      {
        party: buildParty(cfg.partySize, cfg.partyLevel),
        difficulty: cfg.difficulty,
        environment: cfg.environment,
        filter: generatorFilter,
        seed: cfg.seed,
      },
      filterMonsters,
    );
    if (cfg.includeMap) {
      enc.map = generateMap({
        environment: cfg.environment,
        ...mapOptionsFrom(cfg),
        seed: cfg.seed,
      });
    }
    setRecipeError('');
    setEncounter(enc);
    setIsSeeded(true);
    setLinkCopied(false);
    setExpandedMonster(null);
    setEditingDetails(false);
    invalidateForecast();
    writeUrl({ ...cfg, filter: generatorFilter });
  }, [allMonsters, invalidateForecast]);

  const runRecipe = useCallback((recipeId: string, cfg: GenerateConfig) => {
    const recipe = getRecipeById(recipeId);
    if (!recipe) {
      setRecipeError('That recipe is not available.');
      return;
    }
    const generatorFilter = withoutEnvironmentFilter(cfg.filter);
    const filteredPool = filterMonsters(allMonsters, generatorFilter);
    const filled = fillRecipeSlots(
      recipe,
      filteredPool,
      cfg.partyLevel,
      cfg.environment,
      seededRandom(cfg.seed),
      getPartyXpBudget(buildParty(cfg.partySize, cfg.partyLevel), cfg.difficulty),
    );
    if (filled.length === 0) {
      setRecipeError('No monsters match this recipe and the current filters. Broaden the filters and try again.');
      return;
    }
    const byMonster = new Map<string, { monster: Monster; count: number }>();
    for (const slot of filled) {
      const existing = byMonster.get(slot.monster.id);
      byMonster.set(slot.monster.id, {
        monster: slot.monster,
        count: (existing?.count ?? 0) + slot.count,
      });
    }
    const monsters = [...byMonster.values()];
    const totalXp = monsters.reduce((sum, entry) => sum + entry.monster.xp * entry.count, 0);
    const next: Encounter = {
      id: `recipe-${recipe.id}-${cfg.seed}`,
      name: recipe.name,
      description: `${recipe.description}\n\nHook: ${recipe.narrativeHook}`,
      environment: cfg.environment,
      difficulty: assessEncounterDifficulty(totalXp, buildParty(cfg.partySize, cfg.partyLevel)),
      monsters,
      totalXp,
      seed: cfg.seed,
      tactics: `${recipe.tactics}\n\nScaling: ${recipe.scaling}\n\nTerrain: ${recipe.terrainSuggestions.join('; ')}`,
    };
    if (cfg.includeMap) {
      next.map = generateMap({
        environment: cfg.environment,
        ...mapOptionsFrom(cfg),
        seed: cfg.seed,
      });
    }
    setEncounter(next);
    setRecipeError('');
    setIsSeeded(true);
    setLinkCopied(false);
    setExpandedMonster(null);
    setEditingDetails(false);
    invalidateForecast();
    writeUrl({ ...cfg, filter: generatorFilter, recipeId });
  }, [allMonsters, invalidateForecast]);

  // One-shot hydration from a shared link (?seed=...)
  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const size = clampInt(searchParams.get('size'), 1, 10);
    const level = clampInt(searchParams.get('level'), 1, 20);
    const diff = searchParams.get('diff');
    const env = searchParams.get('env');
    const seed = clampInt(searchParams.get('seed'), 0, 0x7fffffff);
    const recipeId = searchParams.get('recipe');
    const withMap = searchParams.get('map') === '1';
    const sharedMapLayout = isMapLayout(searchParams.get('ml'))
      ? searchParams.get('ml') as MapLayout : 'auto';
    const sharedMapScale = isMapScale(searchParams.get('ms'))
      ? searchParams.get('ms') as MapScale : 'Standard';
    // Legacy links carry exact dimensions; new links carry a scale.
    const legacyMapWidth = searchParams.get('ms') === null
      ? clampInt(searchParams.get('mw'), 10, 60) : null;
    const legacyMapHeight = searchParams.get('ms') === null
      ? clampInt(searchParams.get('mh'), 10, 45) : null;
    const sharedMapDensity = isMapFeatureDensity(searchParams.get('md'))
      ? searchParams.get('md') as MapFeatureDensity : 'Balanced';
    const sharedMapVariety = isMapTerrainVariety(searchParams.get('mv'))
      ? searchParams.get('mv') as MapTerrainVariety : 'Varied';

    let filter: MonsterFilter = {};
    const rawFilter = searchParams.get('f');
    if (rawFilter) {
      try {
        const parsed: unknown = JSON.parse(rawFilter);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          filter = parsed as MonsterFilter;
        }
      } catch {
        // malformed filter param — ignore it
      }
    }

    if (size !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot share-link hydration preserves the seeded replay contract.
      setPartySize(size);
      setPartySizeInput(String(size));
    }
    if (level !== null) {
      setPartyLevel(level);
      setPartyLevelInput(String(level));
    }
    if (isDifficulty(diff)) setDifficulty(diff);
    if (isEnvironment(env)) setEnvironment(env);
    if (Object.keys(filter).length > 0) setMonsterFilter(filter);
    if (seed !== null) setIncludeMap(withMap);
    if (seed !== null && withMap) {
      setMapLayout(sharedMapLayout);
      setMapScale(sharedMapScale);
      setMapFeatureDensity(sharedMapDensity);
      setMapTerrainVariety(sharedMapVariety);
    }

    if (seed !== null && size !== null && level !== null && isDifficulty(diff) && isEnvironment(env)) {
      const sharedConfig: GenerateConfig = {
        partySize: size,
        partyLevel: level,
        difficulty: diff,
        environment: env,
        includeMap: withMap,
        mapLayout: sharedMapLayout,
        mapScale: sharedMapScale,
        ...(legacyMapWidth !== null ? { mapWidth: legacyMapWidth } : {}),
        ...(legacyMapHeight !== null ? { mapHeight: legacyMapHeight } : {}),
        mapFeatureDensity: sharedMapDensity,
        mapTerrainVariety: sharedMapVariety,
        filter,
        seed,
      };
      if (recipeId && getRecipeById(recipeId)) runRecipe(recipeId, sharedConfig);
      else runGenerate(sharedConfig);
    }
  }, [searchParams, runGenerate, runRecipe]);

  function handleGenerate() {
    if (!partyInputsValid) {
      const invalidId = partySizeValidation.error
        ? 'enc-party-size'
        : 'enc-party-level';
      document.getElementById(invalidId)?.focus();
      return;
    }

    runGenerate({
      partySize, partyLevel, difficulty, environment,
      includeMap, mapLayout, mapScale, mapFeatureDensity, mapTerrainVariety,
      filter: monsterFilter, seed: randomSeed(),
    });
  }

  function handleRecipe(recipeId: string) {
    if (!partyInputsValid) {
      setRecipeError('Fix the party details before using a recipe.');
      const invalidId = partySizeValidation.error
        ? 'enc-party-size'
        : 'enc-party-level';
      document.getElementById(invalidId)?.focus();
      return;
    }
    runRecipe(recipeId, {
      partySize, partyLevel, difficulty, environment,
      includeMap, mapLayout, mapScale, mapFeatureDensity, mapTerrainVariety,
      filter: monsterFilter, seed: randomSeed(), recipeId,
    });
  }

  function handlePartySizeChange(value: number) {
    const nextSize = Math.max(1, Math.min(10, value));
    setPartySize(nextSize);
    setEncounter((current) => current ? {
      ...current,
      difficulty: assessEncounterDifficulty(current.totalXp, buildParty(nextSize, partyLevel)),
    } : current);
    setPartyConfig((current) => ({
      version: 1,
      members: syncPartyConfigMembers(current?.members ?? [], nextSize, partyLevel),
    }));
    invalidateForecast();
  }

  function handlePartySizeInputChange(raw: string) {
    setPartySizeInput(raw);
    const validation = validateBoundedIntegerInput(raw, 'Party size', 1, 10);
    if (validation.value !== null) handlePartySizeChange(validation.value);
  }

  function handlePartyLevelChange(value: number) {
    const nextLevel = Math.max(1, Math.min(20, value));
    setPartyLevel(nextLevel);
    setEncounter((current) => current ? {
      ...current,
      difficulty: assessEncounterDifficulty(current.totalXp, buildParty(partySize, nextLevel)),
    } : current);
    setPartyConfig((current) => ({
      version: 1,
      members: syncPartyConfigMembers(current?.members ?? [], partySize, nextLevel),
    }));
    invalidateForecast();
  }

  function handlePartyLevelInputChange(raw: string) {
    setPartyLevelInput(raw);
    const validation = validateBoundedIntegerInput(raw, 'Party level', 1, 20);
    if (validation.value !== null) handlePartyLevelChange(validation.value);
  }

  function handleReset() {
    setPartySize(4);
    setPartyLevel(3);
    setPartySizeInput('4');
    setPartyLevelInput('3');
    setDifficulty('Moderate');
    setEnvironment('Forest');
    setIncludeMap(true);
    setMapLayout('auto');
    setMapScale('Standard');
    setMapFeatureDensity('Balanced');
    setMapTerrainVariety('Varied');
    setMonsterFilter({});
    setEncounter(null);
    setIsSeeded(false);
    setLinkCopied(false);
    setShowFilters(false);
    setExpandedMonster(null);
    setShowManualAdd(false);
    setManualSearch('');
    setShowRecipes(false);
    setRecipeError('');
    setShowPartySetup(false);
    setPartyConfig({ version: 1, members: defaultPartyConfig(4, 3) });
    setSavingName(null);
    setEditingDetails(false);
    invalidateForecast();
    window.history.replaceState(null, '', window.location.pathname);
  }

  function handleRegenerateMap() {
    setEncounter(prev => prev ? {
      ...prev,
      map: generateMap({
        environment: prev.environment,
        layout: mapLayout,
        scale: mapScale,
        featureDensity: mapFeatureDensity,
        terrainVariety: mapTerrainVariety,
        seed: randomSeed(),
      }),
    } : prev);
    setIsSeeded(false);
    clearUrlSeed();
    invalidateForecast();
  }

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, []);

  const runForecast = useCallback((config: PartyConfig, enc: Encounter) => {
    setSimRunning(true);
    setWhatIfReports([]);
    // Let the skeleton paint before the (fast but synchronous) simulation.
    setTimeout(() => {
      const players = config.members.map((m, i) => buildSimPlayer(m, i));
      const monsters = enc.monsters.flatMap((em) =>
        Array.from({ length: em.count }, (_, i) => monsterToSimMonster(em.monster, i, em.count)),
      );
      // With a map attached, the forecast fights on it: the same token
      // placement the map displays becomes the spawn grid.
      const battlefield = enc.map
        ? battlefieldFromMap(
            enc.map,
            placeTokens(enc.map, enc.monsters, config.members.length, enc.map.seed ?? enc.seed),
          )
        : undefined;
      setReport(simulateBattle(players, monsters, {
        seed: randomSeed(),
        ...(battlefield ? { battlefield } : {}),
      }));
      setReportSignature(encounterSignature(enc));
      setSimRunning(false);
    }, 30);
  }, []);

  function handleForecastClick() {
    if (!encounter || encounter.monsters.length === 0) return;
    if (!partyConfig || partyConfig.members.length === 0) {
      openPartySetup();
      return;
    }
    runForecast(partyConfig, encounter);
  }

  const handleAddMonster = useCallback((monster: Monster) => {
    setEncounter(prev => {
      if (!prev) {
        return {
          id: `enc-custom-${Date.now()}`,
          name: 'Custom Encounter',
          description: 'A manually built encounter.',
          environment,
          difficulty: assessEncounterDifficulty(monster.xp, party),
          monsters: [{ monster, count: 1 }],
          totalXp: monster.xp,
          seed: 0,
        };
      }
      const existing = prev.monsters.find(em => em.monster.id === monster.id);
      const monsters = existing
        ? prev.monsters.map(em =>
            em.monster.id === monster.id ? { ...em, count: em.count + 1 } : em
          )
        : [...prev.monsters, { monster, count: 1 }];
      const totalXp = monsters.reduce((s, em) => s + em.monster.xp * em.count, 0);
      return {
        ...prev, monsters, totalXp,
        difficulty: assessEncounterDifficulty(totalXp, party),
        seed: 0,
      };
    });
    // A manual edit detaches the encounter from its seed — the link would lie.
    setIsSeeded(false);
    clearUrlSeed();
    invalidateForecast();
  }, [environment, invalidateForecast, party]);

  const handleRemoveMonster = useCallback((monsterId: string) => {
    setEncounter(prev => {
      if (!prev) return prev;
      const monsters = prev.monsters
        .map(em => em.monster.id === monsterId ? { ...em, count: em.count - 1 } : em)
        .filter(em => em.count > 0);
      const totalXp = monsters.reduce((s, em) => s + em.monster.xp * em.count, 0);
      return {
        ...prev, monsters, totalXp,
        difficulty: assessEncounterDifficulty(totalXp, party),
        seed: 0,
      };
    });
    setIsSeeded(false);
    clearUrlSeed();
    invalidateForecast();
  }, [invalidateForecast, party]);

  function updateEncounterNarrative(
    field: 'name' | 'description' | 'tactics',
    value: string,
  ) {
    setEncounter(prev => prev ? { ...prev, [field]: value } : prev);
  }

  const downloadEncounter = useCallback((contents: string, mime: string, filename: string) => {
    const blob = new Blob([contents], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const runWhatIf = useCallback((monsterId: string, delta: 1 | -1) => {
    if (!encounter || !partyConfig || !report) return;
    const current = encounter.monsters.find((entry) => entry.monster.id === monsterId);
    if (!current || (delta < 0 && current.count <= 0)) return;
    const roster = encounter.monsters
      .map((entry) => entry.monster.id === monsterId ? { ...entry, count: entry.count + delta } : entry)
      .filter((entry) => entry.count > 0);
    if (roster.length === 0) return;
    const players = partyConfig.members.map((member, index) => buildSimPlayer(member, index));
    const monsters = roster.flatMap((entry) =>
      Array.from({ length: entry.count }, (_, index) => monsterToSimMonster(entry.monster, index, entry.count))
    );
    const battlefield = encounter.map
      ? battlefieldFromMap(
          encounter.map,
          placeTokens(encounter.map, roster, partyConfig.members.length, encounter.map.seed ?? encounter.seed),
        )
      : undefined;
    const nextReport = simulateBattle(players, monsters, {
      seed: report.seed,
      iterations: 500,
      ...(battlefield ? { battlefield } : {}),
    });
    setWhatIfReports((previous) => [
      ...previous.filter((entry) => !entry.label.endsWith(current.monster.name)),
      { label: `${delta > 0 ? '+1' : '-1'} ${current.monster.name}`, report: nextReport },
    ].slice(-3));
  }, [encounter, partyConfig, report]);

  const handleExport = useCallback((format: 'json' | 'markdown' | 'foundry' | 'player') => {
    if (!encounter) return;
    if (format === 'json') {
      downloadEncounter(JSON.stringify(encounter, null, 2), 'application/json', encounterExportFilename(encounter, 'json'));
    } else if (format === 'markdown') {
      downloadEncounter(encounterToMarkdown(encounter), 'text/markdown', encounterExportFilename(encounter, 'md'));
    } else if (format === 'foundry') {
      downloadEncounter(JSON.stringify(encounterToFoundry(encounter), null, 2), 'application/json', encounterExportFilename(encounter, 'foundry.json'));
    } else {
      downloadEncounter(encounterPlayerHandoutMarkdown(encounter), 'text/markdown', encounterExportFilename(encounter, 'player-handout.md'));
    }
  }, [downloadEncounter, encounter]);

  const handlePrintPlayerHandout = useCallback(() => {
    document.body.classList.add('player-handout-print');
    const cleanup = () => document.body.classList.remove('player-handout-print');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1000);
  }, []);

  const handleRunBattle = useCallback(() => {
    if (!encounter || encounter.monsters.length === 0) return;
    const existing = storageLoad<BattleState | null>(
      'battleOrganizer',
      null,
      (value): value is BattleState | null => value === null || isBattleState(value),
    );
    if (
      existing?.combatants.length
      && !window.confirm(`Replace the current battle “${existing.name}” with “${encounter.name}”?`)
    ) return;

    const members = partyConfig?.members.length
      ? partyConfig.members
      : defaultPartyConfig(partySize, partyLevel);
    const nextBattle = battleFromEncounter(encounter, members);
    if (!storageSave('battleOrganizer', nextBattle)) {
      window.alert('The battle could not be saved in this browser.');
      return;
    }
    window.location.assign('/battle/');
  }, [encounter, partyConfig, partyLevel, partySize]);

  const handleSaveEncounter = useCallback(() => {
    if (!encounter || savingName === null) return;
    const name = savingName.trim() || encounter.name;
    setSavedEncounters((prev) => [
      { id: `saved-${Date.now()}`, name, savedAt: Date.now(), encounter },
      ...prev,
    ].slice(0, MAX_SAVED_ENCOUNTERS));
    closeSaveEncounter();
  }, [closeSaveEncounter, encounter, savingName, setSavedEncounters]);

  const handleLoadSaved = useCallback((saved: SavedEncounter) => {
    setEncounter(saved.encounter);
    setIsSeeded(false); // the pool may have changed since it was saved
    clearUrlSeed();
    setExpandedMonster(null);
    setReport(null);
    setEditingDetails(false);
  }, []);

  return (
    <div className="animate-fade-in">
      <ToolPageHeader
        path="/encounters"
        description="Set the party, shape the battlefield, and generate a balanced encounter using the 2024 rules—then forecast how it is likely to play out."
      />
      <p className="sr-only" aria-live="polite">
        {encounter ? `${encounter.name} ready with ${summary.monsterCount} creatures.` : ''}
      </p>

      {/* Step 1: establish the encounter brief. */}
      <form
        className="workflow-shell mb-6 print:hidden"
        aria-labelledby="encounter-setup-heading"
        onSubmit={(event) => {
          event.preventDefault();
          handleGenerate();
        }}
      >
        <header className="workflow-header">
          <div className="workflow-title">
            <span className="workflow-step" aria-hidden="true">1</span>
            <div>
              <p className="micro-label">Build the encounter</p>
              <h2 id="encounter-setup-heading" className="mt-1 text-2xl">Set the scene</h2>
              <p className="mt-1 max-w-2xl text-sm text-[var(--text-2)]">
                Define the party and the kind of fight you want. Optional tools stay out of the way until you need them.
              </p>
            </div>
          </div>
          <div className="workflow-context" role="status">
            <span className="micro-label">Current brief</span>
            <strong>
              {partyInputsValid
                ? `${partySize} heroes · level ${partyLevel} · ${difficulty}`
                : 'Party details need attention'}
            </strong>
          </div>
        </header>

        <div className="setup-grid">
          <section className="setup-group" aria-labelledby="party-controls-heading">
            <div className="setup-group-heading">
              <span className="setup-group-icon" aria-hidden="true"><Users size={18} /></span>
              <div>
                <h3 id="party-controls-heading" className="text-base">Party</h3>
                <p>Who is walking into the room?</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="enc-party-size" className="field-label">Heroes</label>
                <input
                  id="enc-party-size"
                  type="number" min={1} max={10} step={1} inputMode="numeric"
                  value={partySizeInput}
                  onChange={e => handlePartySizeInputChange(e.target.value)}
                  aria-invalid={partySizeValidation.error ? true : undefined}
                  aria-describedby={partySizeValidation.error ? 'enc-party-size-error' : 'enc-party-size-hint'}
                  className="w-full"
                />
                <p id="enc-party-size-hint" className="field-hint">1–10 characters</p>
                {partySizeValidation.error && (
                  <p id="enc-party-size-error" className="field-error" role="alert">
                    {partySizeValidation.error}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="enc-party-level" className="field-label">Average level</label>
                <input
                  id="enc-party-level"
                  type="number" min={1} max={20} step={1} inputMode="numeric"
                  value={partyLevelInput}
                  onChange={e => handlePartyLevelInputChange(e.target.value)}
                  aria-invalid={partyLevelValidation.error ? true : undefined}
                  aria-describedby={partyLevelValidation.error ? 'enc-party-level-error' : 'enc-party-level-hint'}
                  className="w-full"
                />
                <p id="enc-party-level-hint" className="field-hint">Level 1–20</p>
                {partyLevelValidation.error && (
                  <p id="enc-party-level-error" className="field-error" role="alert">
                    {partyLevelValidation.error}
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="setup-group" aria-labelledby="encounter-controls-heading">
            <div className="setup-group-heading">
              <span className="setup-group-icon" aria-hidden="true"><SlidersHorizontal size={18} /></span>
              <div>
                <h3 id="encounter-controls-heading" className="text-base">Encounter brief</h3>
                <p>What should the fight feel like?</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="enc-difficulty" className="field-label">Target difficulty</label>
                <select id="enc-difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)} className="w-full">
                  {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <p className="field-hint">The generator aims inside this XP band.</p>
              </div>
              <div>
                <label htmlFor="enc-environment" className="field-label">Environment</label>
                <select id="enc-environment" value={environment} onChange={e => setEnvironment(e.target.value as Environment)} className="w-full">
                  {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <p className="field-hint">Shapes monster choices and the map.</p>
              </div>
            </div>
          </section>
        </div>

        <div className="optional-controls">
          <div className="optional-controls-heading">
            <div>
              <p className="micro-label">Optional tools</p>
              <p className="mt-1 text-sm text-[var(--text-2)]">Add constraints only when the encounter calls for them.</p>
            </div>
          </div>
          <div className="optional-controls-grid">
            <button
              type="button"
              className={`option-card ${showRecipes ? 'is-active' : ''}`}
              onClick={() => setShowRecipes((value) => !value)}
              aria-expanded={showRecipes}
              aria-controls="encounter-recipes-panel"
            >
              <BookOpen size={19} aria-hidden="true" />
              <span className="option-card-copy">
                <strong>Encounter recipes</strong>
                <small>Start from a proven pattern</small>
              </span>
              <ChevronDown className="option-card-chevron" size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`option-card ${showFilters ? 'is-active' : ''}`}
              onClick={() => setShowFilters(!showFilters)}
              aria-expanded={showFilters}
              aria-controls="encounter-filters-panel"
            >
              <Filter size={19} aria-hidden="true" />
              <span className="option-card-copy">
                <strong>Monster filters</strong>
                <small>{Object.keys(withoutEnvironmentFilter(monsterFilter)).length > 0 ? 'Custom filters applied' : 'Limit the available roster'}</small>
              </span>
              <ChevronDown className="option-card-chevron" size={17} aria-hidden="true" />
            </button>
            <label className={`option-card option-card-toggle ${includeMap ? 'is-active' : ''}`}>
              <MapIcon size={19} aria-hidden="true" />
              <span className="option-card-copy">
                <strong>Battle map</strong>
                <small>{includeMap ? 'Included with the encounter' : 'No map will be generated'}</small>
              </span>
              <input
                type="checkbox"
                 checked={includeMap}
                 onChange={e => setIncludeMap(e.target.checked)}
                 aria-label="Include a battle map"
                 aria-controls="encounter-map-options"
              />
            </label>
          </div>
        </div>

        {includeMap && (
          <details id="encounter-map-options" className="disclosure-panel mt-3">
            <summary>
              <span className="disclosure-summary-copy">
                <MapIcon size={17} aria-hidden="true" />
                <span>
                  <strong>Customize the battle map</strong>
                  <small>Optional layout, scale, object density, and terrain settings</small>
                </span>
              </span>
              <ChevronDown className="disclosure-chevron" size={18} aria-hidden="true" />
            </summary>
            <div className="grid gap-3 border-t border-[var(--line-subtle)] p-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="enc-map-layout" className="field-label">Layout</label>
                <select id="enc-map-layout" value={mapLayout} onChange={e => setMapLayout(e.target.value as MapLayout)} className="w-full">
                  {MAP_LAYOUT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="enc-map-scale" className="field-label">Scale</label>
                <select id="enc-map-scale" value={mapScale} onChange={e => setMapScale(e.target.value as MapScale)} className="w-full">
                  {MAP_SCALE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="enc-map-density" className="field-label">Object density</label>
                <select id="enc-map-density" value={mapFeatureDensity} onChange={e => setMapFeatureDensity(e.target.value as MapFeatureDensity)} className="w-full">
                  {MAP_DENSITIES.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="enc-map-variety" className="field-label">Terrain mix</label>
                <select id="enc-map-variety" value={mapTerrainVariety} onChange={e => setMapTerrainVariety(e.target.value as MapTerrainVariety)} className="w-full">
                  {MAP_VARIETIES.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </div>
          </details>
        )}

        {showRecipes && (
          <div id="encounter-recipes-panel" className="optional-panel mt-3 animate-fade-in">
            <div className="optional-panel-heading">
              <div>
                <p className="micro-label">Encounter recipes</p>
                <h3 className="mt-1 text-lg">Choose a starting pattern</h3>
              </div>
              <p>Recipes generate immediately using the party, difficulty, environment, and filters above.</p>
            </div>
            <div className="grid gap-5 p-4 lg:grid-cols-2">
              {(['combat', 'narrative'] as const).map((category) => (
                <section key={category} aria-labelledby={`recipe-${category}-heading`}>
                  <h4 id={`recipe-${category}-heading`} className="mb-2 text-sm font-semibold capitalize text-[var(--text-2)]">{category} recipes</h4>
                  <div className="space-y-2">
                    {ENCOUNTER_RECIPES.filter((recipe) => recipe.category === category).map((recipe) => (
                      <button key={recipe.id} type="button" className="selection-card" onClick={() => handleRecipe(recipe.id)}>
                        <span className="block font-semibold text-[var(--text-1)]">{recipe.name}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-[var(--text-2)]">{recipe.description}</span>
                        <span className="mt-2 block text-[10px] uppercase tracking-wide text-[var(--bronze)]">
                          {recipe.slots.map((slot) => `${slot.count}× ${slot.role}`).join(' · ')}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}

        {showFilters && (
          <div id="encounter-filters-panel" className="optional-panel mt-3 animate-fade-in">
            <div className="optional-panel-heading">
              <div>
                <p className="micro-label">Monster filters</p>
                <h3 className="mt-1 text-lg">Narrow the roster</h3>
              </div>
              <p>Filters constrain both generated encounters and recipes.</p>
            </div>
            <FilterPanel
              filter={monsterFilter}
              onChange={setMonsterFilter}
              embedded
              hideEnvironment
              hideSort
            />
          </div>
        )}

        {recipeError && <p className="mt-3 text-sm text-[var(--accent-danger)]" role="alert">{recipeError}</p>}

        <footer className="workflow-action-bar">
          <div className="workflow-primary-action">
            <button type="submit" className="btn-primary text-base">
              <Sparkles size={18} aria-hidden="true" />
              {encounter ? 'Generate a new encounter' : 'Generate encounter'}
            </button>
            <p>Creates a complete roster from this brief.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowManualAdd(!showManualAdd)}
              aria-expanded={showManualAdd}
              aria-controls="manual-encounter-builder"
              className="btn-secondary text-sm"
            >
              <Plus size={17} aria-hidden="true" />
              {showManualAdd
                ? (encounter ? 'Close monster picker' : 'Close manual builder')
                : (encounter ? 'Add monsters' : 'Build manually')}
            </button>
            <ResetGeneratorButton onReset={handleReset} label="Reset" />
          </div>
        </footer>
      </form>

      {/* Saved Encounters */}
      {savedHydrated && savedEncounters.length > 0 && (
        <details className="disclosure-panel !mx-0 mb-6 print:hidden">
          <summary>
            <span className="disclosure-summary-copy">
              <Save size={17} aria-hidden="true" />
              <span>
                <strong>Saved encounters</strong>
                <small>{savedEncounters.length} stored in this browser</small>
              </span>
            </span>
            <ChevronDown className="disclosure-chevron" size={18} aria-hidden="true" />
          </summary>
          <ul className="divide-y divide-[var(--line-subtle)] border-t border-[var(--line-subtle)] px-4">
            {savedEncounters.map((saved) => (
              <li key={saved.id} className="flex flex-col gap-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <span className="block font-bold">{saved.name}</span>
                  <span className="mt-0.5 block text-xs text-[var(--text-3)]">
                    {saved.encounter.difficulty} ·{' '}
                    {saved.encounter.monsters.reduce((sum, em) => sum + em.monster.hitPoints * em.count, 0).toLocaleString()} HP ·{' '}
                    {saved.encounter.monsters.reduce((s, em) => s + em.count, 0)} monsters ·{' '}
                    {new Date(saved.savedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => handleLoadSaved(saved)}
                    className="btn-secondary text-xs"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => setSavedEncounters((prev) => prev.filter((s) => s.id !== saved.id))}
                    aria-label={`Delete saved encounter ${saved.name}`}
                    className="icon-button icon-button-danger"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Manual Monster Add Panel */}
      {showManualAdd && (
        <section id="manual-encounter-builder" className="card mb-6 animate-fade-in print:hidden" aria-labelledby="manual-builder-heading">
          <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="setup-group-icon" aria-hidden="true"><Plus size={18} /></span>
              <div>
                <p className="micro-label">{encounter ? 'Edit roster' : 'Alternate build path'}</p>
                <h2 id="manual-builder-heading" className="mt-1 text-xl">
                  {encounter ? 'Add monsters to this encounter' : 'Build the roster manually'}
                </h2>
                <p className="mt-1 text-sm text-[var(--text-3)]">
                  Search the bestiary and add creatures one at a time{encounter ? ' to the current roster' : ''}.
                </p>
              </div>
            </div>
            <button type="button" onClick={() => setShowManualAdd(false)} className="btn-ghost text-sm">
              <X size={16} aria-hidden="true" />
              Close
            </button>
          </header>
          <label htmlFor="enc-manual-search" className="field-label">Search monsters</label>
          <input
            id="enc-manual-search"
            type="text"
            placeholder="Search monsters by name..."
            value={manualSearch}
            onChange={e => setManualSearch(e.target.value)}
            className="mb-3 w-full"
          />
          <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {manualResults.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleAddMonster(m)}
                className="selection-card text-sm"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-bold">{m.name}</span>
                  <span className="text-xs font-semibold text-[var(--bronze)]">CR {crDisplay(m.challengeRating)}</span>
                </span>
                <span className="mt-1 block text-xs text-[var(--text-3)]">
                  {m.size} {m.type} · AC {m.armor.ac} · {m.hitPoints} HP
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!encounter && !showManualAdd && (
        <div className="empty-state print:hidden">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--bronze-wash)] text-[var(--bronze)]">
            <Swords size={22} aria-hidden="true" />
          </div>
          <p className="micro-label">Encounter workspace</p>
          <h2 className="mt-2 text-xl">The table is ready for a threat</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--text-3)]">
            Generate a balanced roster above, or add monsters manually to tune the fight yourself.
          </p>
        </div>
      )}

      {/* Results */}
      {encounter && encounter.monsters.length > 0 && (
        <div className="animate-fade-in space-y-6">
          {/* Step 2: review and manage the generated encounter. */}
          <section className="card encounter-summary-card" aria-labelledby="encounter-summary-heading">
            <header className="encounter-summary-header">
              <div className="workflow-title min-w-0">
                <span className="workflow-step" aria-hidden="true">2</span>
                <div className="min-w-0 flex-1">
                  <p className="micro-label">Review the encounter</p>
                  {editingDetails ? (
                    <>
                      <label htmlFor="encounter-name" className="sr-only">Encounter name</label>
                      <input
                        id="encounter-name"
                        type="text"
                        value={encounter.name}
                        onChange={e => updateEncounterNarrative('name', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Escape') closeDetailsEditor();
                        }}
                        autoFocus
                        className="mt-1 w-full text-2xl font-bold print:hidden"
                      />
                      <h2 id="encounter-summary-heading" className="mt-1 hidden text-2xl print:block">{encounter.name}</h2>
                    </>
                  ) : (
                    <h2 id="encounter-summary-heading" className="mt-1 text-2xl sm:text-3xl">{encounter.name}</h2>
                  )}
                </div>
              </div>
              <button
                ref={editDetailsButtonRef}
                type="button"
                onClick={() => {
                  if (editingDetails) closeDetailsEditor();
                  else setEditingDetails(true);
                }}
                className={editingDetails ? 'btn-primary text-sm print:hidden' : 'btn-secondary text-sm print:hidden'}
              >
                {editingDetails ? <Check size={17} aria-hidden="true" /> : <Pencil size={16} aria-hidden="true" />}
                {editingDetails ? 'Done editing' : 'Edit details'}
              </button>
            </header>
            {editingDetails ? (
              <>
                <label htmlFor="encounter-description" className="field-label mt-4 print:hidden">Description</label>
                <textarea
                  id="encounter-description"
                  value={encounter.description}
                  onChange={e => updateEncounterNarrative('description', e.target.value)}
                  rows={3}
                  className="w-full print:hidden"
                />
                {encounter.description && (
                  <p className="mt-4 text-[var(--text-2)] italic hidden print:block">{encounter.description}</p>
                )}
              </>
            ) : encounter.description && (
              <p className="mt-4 max-w-5xl text-[var(--text-2)] italic">{encounter.description}</p>
            )}

            <div className="encounter-overview player-handout-hidden">
              <div className="difficulty-readout">
                <span className="meta-label">Calculated challenge</span>
                {summary.assessment && <DifficultyBadge difficulty={summary.assessment} />}
                <p>
                  Assessed for {partySize} level-{partyLevel} heroes. The current setup target is <strong>{difficulty}</strong>.
                </p>
              </div>
              <dl className="metric-grid">
                <div className="metric-item">
                  <dt>Creatures</dt>
                  <dd>{summary.monsterCount}</dd>
                </div>
                <div className="metric-item">
                  <dt>Monster HP</dt>
                  <dd>{summary.totalMonsterHp.toLocaleString()}</dd>
                </div>
                <div className="metric-item">
                  <dt>Rules XP</dt>
                  <dd>{summary.totalXp.toLocaleString()}</dd>
                </div>
                <div className="metric-item">
                  <dt>Environment</dt>
                  <dd>{encounter.environment}</dd>
                </div>
              </dl>
            </div>

            <DifficultyMeter
              assessment={summary.assessment}
              budgets={summary.budgets}
              targetDifficulty={difficulty}
              totalXp={summary.totalXp}
            />

            <div className="encounter-actions player-handout-hidden print:hidden" aria-label="Encounter actions">
              <div className="flex flex-wrap items-center gap-2">
                {encounter.monsters.length > 0 && savingName === null && (
                  <button
                    ref={saveEncounterButtonRef}
                    type="button"
                    onClick={() => setSavingName(encounter.name)}
                    className="btn-secondary text-sm"
                  >
                    <Save size={16} aria-hidden="true" />
                    Save
                  </button>
                )}
                {isSeeded && (
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="btn-secondary text-sm"
                    aria-describedby="share-link-description"
                  >
                    {linkCopied ? <Check size={16} aria-hidden="true" /> : <Share2 size={16} aria-hidden="true" />}
                    {linkCopied ? 'Link copied' : 'Copy share link'}
                  </button>
                )}
                <span id="share-link-description" className="sr-only">
                  The link recreates this encounter using the built-in bestiary.
                </span>
              </div>

              <details className="action-menu">
                <summary className="btn-secondary text-sm">
                  <FileText size={16} aria-hidden="true" />
                  Export &amp; print
                  <ChevronDown size={16} aria-hidden="true" className="action-menu-chevron" />
                </summary>
                <div className="action-menu-panel">
                  <p className="micro-label px-3 pb-2">Export encounter</p>
                  <div className="grid sm:grid-cols-2">
                    <button type="button" onClick={() => handleExport('markdown')} className="menu-action">
                      <FileText size={18} aria-hidden="true" />
                      <span><strong>Markdown</strong><small>Readable campaign notes</small></span>
                    </button>
                    <button type="button" onClick={() => handleExport('foundry')} className="menu-action">
                      <Box size={18} aria-hidden="true" />
                      <span><strong>Foundry data</strong><small>Virtual tabletop import</small></span>
                    </button>
                    <button type="button" onClick={() => handleExport('json')} className="menu-action">
                      <FileJson size={18} aria-hidden="true" />
                      <span><strong>JSON data</strong><small>Complete encounter record</small></span>
                    </button>
                    <button type="button" onClick={() => handleExport('player')} className="menu-action">
                      <UserRound size={18} aria-hidden="true" />
                      <span><strong>Player handout</strong><small>Markdown without DM notes</small></span>
                    </button>
                    <button type="button" onClick={handlePrintPlayerHandout} className="menu-action">
                      <Printer size={18} aria-hidden="true" />
                      <span><strong>Print player view</strong><small>Player-safe paper handout</small></span>
                    </button>
                    <PrintButton label="Print / save PDF" variant="menu" />
                  </div>
                </div>
              </details>
            </div>

            {savingName !== null && (
              <form
                className="save-encounter-row player-handout-hidden print:hidden"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSaveEncounter();
                }}
              >
                <div>
                  <label htmlFor="save-encounter-name" className="field-label">Save as</label>
                  <input
                    id="save-encounter-name"
                    type="text"
                    value={savingName}
                    autoFocus
                    onChange={(e) => setSavingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') closeSaveEncounter();
                    }}
                  />
                </div>
                <button type="submit" className="btn-primary text-sm">
                  <Check size={16} aria-hidden="true" />
                  Save encounter
                </button>
                <button type="button" onClick={closeSaveEncounter} className="btn-ghost text-sm">
                  Cancel
                </button>
              </form>
            )}
          </section>

          {/* Review the roster before choosing a forecast or live-combat action. */}
          <section className="card player-handout-hidden" aria-labelledby="monster-composition-heading">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="micro-label">Encounter roster</p>
                <h2 id="monster-composition-heading" className="mt-1 text-xl">Monster composition</h2>
                <p className="mt-1 text-xs text-[var(--text-3)]">Open a stat block or adjust the creature count before forecasting.</p>
              </div>
              <span className="meta-label">{summary.monsterCount} creatures · {encounter.monsters.length} stat blocks</span>
            </div>
            <div className="space-y-3">
              {encounter.monsters.map(em => (
                <div key={em.monster.id}>
                  <div className="surface-inset flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      ref={configurePartyButtonRef}
                      type="button"
                      onClick={() => setExpandedMonster(
                        expandedMonster === em.monster.id ? null : em.monster.id
                      )}
                      aria-expanded={expandedMonster === em.monster.id}
                      aria-controls={`monster-details-${em.monster.id}`}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:text-[var(--bronze-light)]"
                    >
                      <span className="bg-[var(--steel-800)] text-[var(--bronze)] rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
                        {em.count}×
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate font-bold sm:inline">{em.monster.name}</span>
                        <span className="block text-sm text-[var(--text-2)] sm:ml-2 sm:inline">
                          CR {crDisplay(em.monster.challengeRating)} | AC {em.monster.armor.ac} | {em.monster.hitPoints} HP each
                        </span>
                      </div>
                    </button>
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <span className="xp-capsule text-xs" title={`${(em.monster.xp * em.count).toLocaleString()} XP rules value`}>
                        {(em.monster.hitPoints * em.count).toLocaleString()} total HP
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddMonster(em.monster)}
                        className="icon-button print:hidden"
                        title="Add one more"
                        aria-label={`Add one more ${em.monster.name}`}
                      ><Plus size={16} aria-hidden="true" /></button>
                      <button
                        type="button"
                        onClick={() => handleRemoveMonster(em.monster.id)}
                        className="icon-button icon-button-danger print:hidden"
                        title="Remove one"
                        aria-label={`Remove one ${em.monster.name}`}
                      ><Minus size={16} aria-hidden="true" /></button>
                    </div>
                  </div>

                  {expandedMonster === em.monster.id && (
                    <div id={`monster-details-${em.monster.id}`} className="mt-2 animate-fade-in print:hidden sm:ml-4">
                      <MonsterStatBlock monster={em.monster} />
                    </div>
                  )}
                  <div className="encounter-stat-block-page hidden print:block mt-4 break-inside-avoid">
                    <MonsterStatBlock monster={em.monster} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Step 3: pick a clear next action. */}
          <section className="next-step-shell player-handout-hidden print:hidden" aria-labelledby="next-step-heading">
            <header className="workflow-title">
              <span className="workflow-step" aria-hidden="true">3</span>
              <div>
                <p className="micro-label">Choose what happens next</p>
                <h2 id="next-step-heading" className="mt-1 text-2xl">Test it or take it to the table</h2>
              </div>
            </header>
            <div className="next-step-grid">
              <article className="next-step-card">
                <span className="next-step-icon" aria-hidden="true"><Play size={20} /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg">Forecast the outcome</h3>
                  <p>Simulate 1,000 battles to estimate win rate, remaining HP, knockouts, and the deadliest foe.</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={openPartySetup}
                      aria-expanded={showPartySetup}
                      aria-controls="battle-forecast-party-setup"
                      className="btn-secondary w-full text-sm sm:w-auto"
                    >
                      <SlidersHorizontal size={16} aria-hidden="true" />
                      Configure party
                    </button>
                    <button
                      type="button"
                      onClick={handleForecastClick}
                      disabled={simRunning}
                      className="btn-primary w-full text-sm sm:w-auto"
                    >
                      <Sparkles size={16} aria-hidden="true" />
                      {simRunning ? 'Forecasting…' : report ? 'Refresh forecast' : 'Run forecast'}
                    </button>
                  </div>
                </div>
              </article>
              <article className="next-step-card">
                <span className="next-step-icon" aria-hidden="true"><Swords size={20} /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg">Start live combat</h3>
                  <p>Send this roster and party to the initiative tracker for play at the table.</p>
                  <button type="button" onClick={handleRunBattle} className="btn-primary mt-4 w-full text-sm sm:w-auto">
                    <Swords size={16} aria-hidden="true" />
                    Open battle organizer
                  </button>
                </div>
              </article>
            </div>
          </section>
          {showPartySetup && (
            <div
              id="battle-forecast-party-setup"
              ref={partySetupRef}
              tabIndex={-1}
              className="scroll-mt-6"
              aria-label="Battle forecast party setup"
            >
              <PartySetupPanel
                members={partyConfig?.members ?? defaultPartyConfig(partySize, partyLevel)}
                onSave={(members) => {
                  const config: PartyConfig = { version: 1, members };
                  setPartyConfig(config);
                  closePartySetup();
                  if (encounter && encounter.monsters.length > 0) {
                    runForecast(config, encounter);
                  }
                }}
                onCancel={closePartySetup}
              />
            </div>
          )}
          {simRunning && (
            <div className="card animate-pulse" role="status" aria-label="Running battle forecast">
              <h3 className="text-xl mb-2">Battle Forecast</h3>
              <p className="text-sm text-[var(--text-2)]">
                Simulating 1,000 battles…
              </p>
              <div className="h-24 mt-3 rounded bg-[var(--steel-950)]" />
            </div>
          )}
          {!simRunning && report && summary.assessment && (
            <BattleReportCard
              report={report}
              xpLabel={summary.assessment}
              stale={reportSignature !== encounterSignature(encounter)}
              onRerun={() => encounter && partyConfig && runForecast(partyConfig, encounter)}
              onEditParty={openPartySetup}
            />
          )}
          {!simRunning && report && (
            <section className="card player-handout-hidden space-y-4 print:hidden" aria-labelledby="what-if-heading">
              <div>
                <p className="micro-label">Smart insights</p>
                <h3 id="what-if-heading" className="mt-1 text-xl">What-if lab</h3>
                <p className="mt-1 text-sm text-[var(--text-2)]">
                  {report.partyWinRate > 0.9
                    ? 'The party is heavily favored. Try adding one creature and compare the same seeded forecast.'
                    : report.partyWinRate < 0.5
                      ? 'The monsters are favored. Try removing one creature before changing the whole encounter.'
                      : 'The result is competitive. Test one roster change at a time to protect the encounter concept.'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {encounter.monsters.map((entry) => (
                  <span key={entry.monster.id} className="inline-flex items-center rounded-lg border border-[var(--steel-800)] bg-[var(--steel-950)] p-1">
                    <span className="px-2 text-xs text-[var(--text-2)]">{entry.count}× {entry.monster.name}</span>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      aria-label={`Forecast with one more ${entry.monster.name}`}
                      onClick={() => runWhatIf(entry.monster.id, 1)}
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      aria-label={`Forecast with one fewer ${entry.monster.name}`}
                      onClick={() => runWhatIf(entry.monster.id, -1)}
                      disabled={encounter.monsters.length === 1 && entry.count === 1}
                    >
                      −1
                    </button>
                  </span>
                ))}
              </div>
              {whatIfReports.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <ForecastComparison label="Current roster" report={report} />
                  {whatIfReports.map((entry) => (
                    <ForecastComparison key={entry.label} label={entry.label} report={entry.report} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Tactics */}
          {(encounter.tactics || editingDetails) && (
            <div className={`card player-handout-hidden ${!encounter.tactics ? 'print:hidden' : ''}`}>
              <h3 className="text-xl mb-3">Tactics</h3>
              {editingDetails ? (
                <>
                  <label htmlFor="encounter-tactics" className="sr-only">Encounter tactics</label>
                  <textarea
                    id="encounter-tactics"
                    value={encounter.tactics ?? ''}
                    onChange={e => updateEncounterNarrative('tactics', e.target.value)}
                    rows={6}
                    className="w-full print:hidden"
                  />
                  <div className="text-sm text-[var(--text-2)] whitespace-pre-line hidden print:block">
                    {encounter.tactics}
                  </div>
                </>
              ) : (
                <div className="text-sm text-[var(--text-2)] whitespace-pre-line">
                  {encounter.tactics}
                </div>
              )}
            </div>
          )}

          {/* Treasure */}
          {encounter.treasure && (
            <div className="card player-handout-hidden">
              <h3 className="text-xl mb-3">Treasure</h3>
              <p className="text-sm text-[var(--text-2)]">{encounter.treasure}</p>
            </div>
          )}

          {/* Map */}
          {encounter.map && (
            <div className="card overflow-x-auto">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl">Battle Map</h3>
                  <p className="text-xs text-[var(--text-2)] print:hidden">
                    {encounter.map.width}×{encounter.map.height} · {encounter.map.genOptions?.featureDensity ?? mapFeatureDensity} objects · {encounter.map.genOptions?.terrainVariety ?? mapTerrainVariety} terrain
                  </p>
                </div>
                <button type="button" onClick={handleRegenerateMap} className="btn-secondary text-sm print:hidden">
                  Regenerate map
                </button>
              </div>
              <MapSvg map={encounter.map} tokens={placement?.tokens} />
              <p className="mt-2 text-xs text-[var(--text-3)]">
                Suggested starting positions — bronze ring: party (P1–P{partySize}), red ring: monsters.
              </p>
              {placement && placement.notes.length > 0 && (
                <p className="mt-1 text-xs text-[var(--text-3)] print:hidden">
                  {placement.notes.join(' ')}
                </p>
              )}
              {encounter.map.rooms && <div className="player-handout-hidden"><RoomKeyPanel rooms={encounter.map.rooms} /></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ForecastComparison({ label, report }: { label: string; report: BattleReport }) {
  return (
    <div className="rounded-lg border border-[var(--steel-800)] bg-[var(--steel-950)] p-3">
      <p className="text-sm font-semibold text-[var(--text-1)]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[var(--bronze)]">{Math.round(report.partyWinRate * 100)}%</p>
      <p className="text-xs text-[var(--text-2)]">party win rate · {report.simLabel}</p>
      <p className="mt-1 text-xs text-[var(--text-3)]">{report.avgRounds.toFixed(1)} rounds · {Math.round(report.avgPartyHpRemainingPct * 100)}% party HP</p>
    </div>
  );
}

// ─── Difficulty Meter ─────────────────────────────────────────────

function DifficultyMeter({
  assessment,
  budgets,
  targetDifficulty,
  totalXp,
}: {
  assessment: Difficulty | null;
  budgets: Record<Difficulty, number>;
  targetDifficulty: Difficulty;
  totalXp: number;
}) {
  const activeIndex = assessment ? DIFFICULTIES.indexOf(assessment) : -1;
  const previousCap = activeIndex > 0 ? budgets[DIFFICULTIES[activeIndex - 1]] : 0;
  const activeCap = assessment ? budgets[assessment] : 1;
  const progressWithinTier = activeIndex < 0
    ? 0
    : Math.max(0, Math.min(1, (totalXp - previousCap) / Math.max(1, activeCap - previousCap)));
  const markerPosition = activeIndex < 0
    ? 0
    : Math.min(100, ((activeIndex + progressWithinTier) / DIFFICULTIES.length) * 100);

  return (
    <div className="difficulty-meter player-handout-hidden" role="group" aria-label="Encounter challenge budget">
      <div className="difficulty-meter-heading">
        <div>
          <span className="meta-label">Rules XP budget</span>
          <strong>{totalXp.toLocaleString()} XP in this encounter</strong>
        </div>
        <p>
          Current {targetDifficulty} target cap <strong>{budgets[targetDifficulty].toLocaleString()} XP</strong>
        </p>
      </div>
      <p className="sr-only">
        Calculated challenge {assessment ?? 'not available'}. The encounter contains {totalXp.toLocaleString()} rules XP.
        The selected {targetDifficulty} target caps at {budgets[targetDifficulty].toLocaleString()} XP.
      </p>
      <div className="difficulty-scale" aria-hidden="true">
        {DIFFICULTIES.map((level, index) => (
          <span
            key={level}
            className={`difficulty-segment difficulty-segment-${level.toLowerCase()} ${index <= activeIndex ? 'is-filled' : ''}`}
          />
        ))}
        <span className="difficulty-marker" style={{ left: `${markerPosition}%` }} />
      </div>
      <div className="difficulty-labels">
        {DIFFICULTIES.map(level => (
          <span key={level} className={assessment === level ? 'is-current' : ''} aria-current={assessment === level ? 'true' : undefined}>
            <strong>{level}</strong>
            <small>{budgets[level].toLocaleString()}</small>
          </span>
        ))}
      </div>
    </div>
  );
}
