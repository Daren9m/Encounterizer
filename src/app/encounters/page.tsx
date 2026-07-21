'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { formatMonsterSize } from '@/lib/monster-size';
import { useMonsters } from '@/app/hooks/useMonsters';
import { usePartyLibrary } from '@/app/hooks/usePartyLibrary';
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
import { parseFlavorVersionParam, type FlavorVersion } from '@/lib/flavor-pools';
import { randomSeed, seededRandom } from '@/lib/random';
import {
  ENCOUNTER_RECIPES,
  buildRecipePlan,
  fillRecipeSlots,
  getRecipeById,
  getRecipePlaybookPreview,
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
import PartyPersistenceStatus from '@/components/PartyPersistenceStatus';
import BattleReportCard from '@/components/BattleReportCard';
import EncounterRecipePlaybook from '@/components/EncounterRecipePlaybook';
import PrintButton from '@/components/PrintButton';
import ResetGeneratorButton from '@/components/ResetGeneratorButton';
import ToolPageHeader from '@/components/ToolPageHeader';
import { simulateBattle } from '@/lib/battle-sim';
import { battlefieldFromMap } from '@/lib/sim/movement';
import { monsterToSimMonster } from '@/lib/monster-to-sim';
import {
  buildSimPlayer,
  defaultPartyConfig,
  getTemplateById,
  syncPartyConfigMembers,
} from '@/data/class-templates';
import { usePersistentState } from '@/lib/use-persistent-state';
import { storageLoad, storageSave } from '@/lib/storage';
import { type BattleReport, type PartyConfig } from '@/lib/battle-sim-types';
import {
  encounterExportFilename,
  encounterPlayerHandoutMarkdown,
  encounterToFoundry,
  encounterToMarkdown,
} from '@/lib/encounter-export';
import {
  battleFromEncounter,
} from '@/lib/battle-organizer';
import { getBrowserBattleStore, replaceBattleState } from '@/app/hooks/useBattleStore';
import { getActiveParty } from '@/lib/party';
import { setActiveParty as activateParty } from '@/lib/party-manager';
import { partyToForecastConfig } from '@/lib/party-adapters';
import {
  cloneEncounterPartyContext,
  contextFromActiveParty,
  contextFromCustomParty,
  contextToBudgetParty,
  contextToForecastConfig,
  isEncounterPartyContext,
  MAX_ENCOUNTER_PARTY_MEMBERS,
  partyLevelRange,
  readEncounterPartyShareParams,
  reconcilePartySelection,
  representativePartyLevel,
  serializeAnonymousPartySnapshot,
  writeEncounterPartyShareParams,
  type EncounterPartyContext,
} from '@/lib/encounter-party';

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
  partyContext: EncounterPartyContext;
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
  flavorVersion: FlavorVersion;
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
  // Scalar fallbacks keep old clients useful. The versioned snapshot carries
  // exact mixed levels and combat profiles without durable identity.
  writeEncounterPartyShareParams(params, cfg.partyContext);
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
  if (cfg.flavorVersion !== 1) params.set('fv', String(cfg.flavorVersion));
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
  version?: 1;
  id: string;
  name: string;
  savedAt: number;
  encounter: Encounter;
  /** Optional so encounters saved before durable parties still load. */
  partyContext?: EncounterPartyContext;
  forecast?: {
    report: BattleReport;
    signature: string;
  };
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

function forecastSignature(
  encounter: Encounter | null,
  partyContext: EncounterPartyContext,
): string {
  const sourceIdentity = partyContext.source === 'library'
    ? `${partyContext.partyId}:${partyContext.selectedMemberIds.join(',')}`
    : partyContext.source;
  return `${encounterSignature(encounter)}::${sourceIdentity}::${serializeAnonymousPartySnapshot(partyContext.snapshot)}`;
}

type EncounterPartyMode = 'pending' | 'active' | 'custom' | 'snapshot';

// ─── Page ─────────────────────────────────────────────────────────

export default function EncounterPage() {
  return <EncounterBuilder />;
}

function EncounterBuilder() {
  const router = useRouter();
  const { all: allMonsters } = useMonsters();
  const {
    library: partyLibrary,
    hydrated: partyLibraryHydrated,
    updateLibrary,
  } = usePartyLibrary();
  const durableParty = partyLibrary ? getActiveParty(partyLibrary) : null;
  const availableParties = partyLibrary?.parties.filter((party) => party.archivedAt === undefined) ?? [];
  const [partyMode, setPartyMode] = useState<EncounterPartyMode>('pending');
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [snapshotPartyContext, setSnapshotPartyContext] =
    useState<EncounterPartyContext | null>(null);

  const [partySize, setPartySize] = useState(4);
  const [partyLevel, setPartyLevel] = useState(3);
  const [partySizeInput, setPartySizeInput] = useState('4');
  const [partyLevelInput, setPartyLevelInput] = useState('3');
  const [difficulty, setDifficulty] = useState<Difficulty>('Moderate');
  const [environment, setEnvironment] = useState<Environment>('Forest');
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [isSeeded, setIsSeeded] = useState(false);
  const [generatedPartySnapshotSignature, setGeneratedPartySnapshotSignature] = useState('');
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
  // Battle Forecast state
  const [customPartyConfig, setCustomPartyConfig] = useState<PartyConfig | null>(null);
  const [showPartySetup, setShowPartySetup] = useState(false);
  const [report, setReport] = useState<BattleReport | null>(null);
  const [reportSignature, setReportSignature] = useState('');
  const [reportRosterSignature, setReportRosterSignature] = useState('');
  const [simRunning, setSimRunning] = useState(false);
  const [whatIfReports, setWhatIfReports] = useState<WhatIfResult[]>([]);
  const forecastRunId = useRef(0);
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

  const temporaryPartyConfig = useMemo<PartyConfig>(() => ({
    version: 1,
    members: (customPartyConfig?.members.length
      ? customPartyConfig.members
      : defaultPartyConfig(partySize, partyLevel))
      .slice(0, MAX_ENCOUNTER_PARTY_MEMBERS),
  }), [customPartyConfig, partyLevel, partySize]);

  // When another tab or the inline selector changes the active party, treat
  // the new roster as fully attending until the encounter-scoped selection is
  // synchronized. This avoids briefly announcing a false zero-person party.
  const effectiveSelectedMemberIds = partyMode === 'active'
    && durableParty
    && selectedPartyId !== durableParty.id
    ? reconcilePartySelection(durableParty)
    : selectedMemberIds;

  const effectivePartyContext: EncounterPartyContext = partyMode === 'active' && durableParty
    ? contextFromActiveParty(durableParty, effectiveSelectedMemberIds)
    : partyMode === 'snapshot' && snapshotPartyContext
    ? snapshotPartyContext
    : contextFromCustomParty(temporaryPartyConfig);

  const effectiveForecastConfig: PartyConfig = partyMode === 'active' && durableParty
    ? partyToForecastConfig(durableParty, effectiveSelectedMemberIds)
    : partyMode === 'snapshot' && snapshotPartyContext
    ? contextToForecastConfig(snapshotPartyContext)
    : temporaryPartyConfig;

  // Every encounter calculation now reads one immutable party snapshot.
  const party = contextToBudgetParty(effectivePartyContext);
  const effectivePartySize = party.members.length;
  const effectiveLevelRange = partyLevelRange(effectivePartyContext.snapshot);
  const customPartyInputsValid = partySizeValidation.error === null
    && partyLevelValidation.error === null;
  const partySetupValid = partyMode !== 'pending'
    && effectivePartySize > 0
    && (partyMode !== 'custom' || customPartyInputsValid);

  // Seeded token placement rides map.seed (third rng stream), so a
  // shared link reproduces map AND starting positions with zero extra
  // params, and "Regenerate Map" re-places automatically.
  const placement = useMemo(
    () => (encounter?.map
      ? placeTokens(encounter.map, encounter.monsters, effectivePartySize, encounter.map.seed ?? encounter.seed)
      : null),
    [encounter, effectivePartySize],
  );

  // The single source of encounter totals for the meter, badge, and header stats
  const summary = useMemo(
    () => summarizeEncounter(encounter?.monsters ?? [], party),
    [encounter, party],
  );
  const forecastIsStale = report !== null
    && (
      !partySetupValid
      || reportSignature !== forecastSignature(encounter, effectivePartyContext)
      || reportRosterSignature !== effectiveForecastConfig.members
        .map((member) => member.name)
        .join('\u001f')
    );
  const currentPartySnapshotSignature = serializeAnonymousPartySnapshot(
    effectivePartyContext.snapshot,
  );
  const partyChangedSinceGeneration = encounter !== null
    && generatedPartySnapshotSignature !== ''
    && generatedPartySnapshotSignature !== currentPartySnapshotSignature;
  const shareLinkIsCurrent = isSeeded && partySetupValid && !partyChangedSinceGeneration;

  const configuredPartySummary = useMemo(() => {
    const members = effectiveForecastConfig.members;
    if (members.length === 0) return 'No adventurers attending';
    const levels = members.map((member) => member.level);
    const lowestLevel = Math.min(...levels);
    const highestLevel = Math.max(...levels);
    const levelLabel = lowestLevel === highestLevel
      ? `level ${lowestLevel}`
      : `levels ${lowestLevel}\u2013${highestLevel}`;

    return `${members.length} adventurer${members.length === 1 ? '' : 's'} \u00b7 ${levelLabel}`;
  }, [effectiveForecastConfig]);
  const effectiveLevelLabel = effectiveLevelRange
    ? effectiveLevelRange.min === effectiveLevelRange.max
      ? `level ${effectiveLevelRange.min}`
      : `levels ${effectiveLevelRange.min}\u2013${effectiveLevelRange.max}`
    : 'no levels selected';

  // Monsters for manual add search
  const manualResults = useMemo(() => {
    if (!manualSearch.trim()) return allMonsters.slice(0, 20);
    return filterMonsters(allMonsters, { search: manualSearch }).slice(0, 20);
  }, [allMonsters, manualSearch]);

  const invalidateForecast = useCallback(() => {
    forecastRunId.current += 1;
    setReport(null);
    setReportSignature('');
    setReportRosterSignature('');
    setSimRunning(false);
    setWhatIfReports([]);
  }, []);

  const cancelPendingForecast = useCallback(() => {
    forecastRunId.current += 1;
    setSimRunning(false);
    setWhatIfReports([]);
  }, []);

  const openPartySetup = useCallback(() => {
    if (partyMode !== 'custom') return;
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
  }, [partyMode]);

  const reviewPartyControls = useCallback(() => {
    const target = document.getElementById(
      partyMode === 'active'
        ? 'enc-party-attendance'
        : partyMode === 'snapshot'
        ? 'enc-party-snapshot'
        : 'party-controls-heading',
    );
    target?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant' as ScrollBehavior
        : 'smooth',
      block: 'center',
    });
    window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
  }, [partyMode]);

  const closePartySetup = useCallback(() => {
    setShowPartySetup(false);
    window.requestAnimationFrame(() => configurePartyButtonRef.current?.focus());
  }, []);

  const closeDetailsEditor = useCallback(() => {
    setEditingDetails(false);
    window.requestAnimationFrame(() => editDetailsButtonRef.current?.focus());
  }, [setEditingDetails]);

  const closeSaveEncounter = useCallback(() => {
    setSavingName(null);
    window.requestAnimationFrame(() => saveEncounterButtonRef.current?.focus());
  }, [setSavingName]);

  const runGenerate = useCallback((cfg: GenerateConfig) => {
    const generatorFilter = withoutEnvironmentFilter(cfg.filter);
    const budgetParty = contextToBudgetParty(cfg.partyContext);
    const enc = generateEncounter(
      allMonsters,
      {
        party: budgetParty,
        difficulty: cfg.difficulty,
        environment: cfg.environment,
        filter: generatorFilter,
        seed: cfg.seed,
        flavorVersion: cfg.flavorVersion,
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
    setGeneratedPartySnapshotSignature(serializeAnonymousPartySnapshot(cfg.partyContext.snapshot));
    setLinkCopied(false);
    setExpandedMonster(null);
    setEditingDetails(false);
    invalidateForecast();
    writeUrl({ ...cfg, filter: generatorFilter });
  }, [allMonsters, invalidateForecast, setEditingDetails, setExpandedMonster]);

  const runRecipe = useCallback((recipeId: string, cfg: GenerateConfig) => {
    const recipe = getRecipeById(recipeId);
    if (!recipe) {
      setRecipeError('That recipe is not available.');
      return;
    }
    const generatorFilter = withoutEnvironmentFilter(cfg.filter);
    const filteredPool = filterMonsters(allMonsters, generatorFilter);
    const budgetParty = contextToBudgetParty(cfg.partyContext);
    const representativeLevel = representativePartyLevel(cfg.partyContext.snapshot);
    const filled = fillRecipeSlots(
      recipe,
      filteredPool,
      representativeLevel,
      cfg.environment,
      seededRandom(cfg.seed),
      getPartyXpBudget(budgetParty, cfg.difficulty),
    );
    if (filled.length === 0) {
      setRecipeError('No monsters match this recipe and the current filters. Broaden the filters and try again.');
      return;
    }
    const byMonster = new Map<string, { monster: Monster; count: number; recipeRole: string }>();
    for (const slot of filled) {
      const existing = byMonster.get(slot.monster.id);
      byMonster.set(slot.monster.id, {
        monster: slot.monster,
        count: (existing?.count ?? 0) + slot.count,
        recipeRole: existing && !existing.recipeRole.split(' / ').includes(slot.role)
          ? `${existing.recipeRole} / ${slot.role}`
          : existing?.recipeRole ?? slot.role,
      });
    }
    const monsters = [...byMonster.values()];
    const totalXp = monsters.reduce((sum, entry) => sum + entry.monster.xp * entry.count, 0);
    const next: Encounter = {
      id: `recipe-${recipe.id}-${cfg.seed}`,
      name: recipe.name,
      description: `${recipe.description}\n\nHook: ${recipe.narrativeHook}`,
      environment: cfg.environment,
      difficulty: assessEncounterDifficulty(totalXp, budgetParty),
      monsters,
      totalXp,
      seed: cfg.seed,
      tactics: `${recipe.tactics}\n\nScaling: ${recipe.scaling}\n\nTerrain: ${recipe.terrainSuggestions.join('; ')}`,
      recipePlan: buildRecipePlan(recipe, filled, {
        environment: cfg.environment,
        partyLevel: representativeLevel,
        partySize: cfg.partyContext.snapshot.members.length,
        seed: cfg.seed,
      }),
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
    setGeneratedPartySnapshotSignature(serializeAnonymousPartySnapshot(cfg.partyContext.snapshot));
    setLinkCopied(false);
    setExpandedMonster(null);
    setEditingDetails(false);
    invalidateForecast();
    writeUrl({ ...cfg, filter: generatorFilter, recipeId });
  }, [allMonsters, invalidateForecast, setEditingDetails, setExpandedMonster]);

  // One-shot hydration from a shared link (?seed=...)
  const didInit = useRef(false);
  const loadedSharedParty = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    // Read params from the location directly: effects only run client-side,
    // and unlike useSearchParams this never suspends hydration (which under
    // `next dev` left hard-loaded share links permanently dehydrated).
    const searchParams = new URLSearchParams(window.location.search);

    const size = clampInt(searchParams.get('size'), 1, 10);
    const level = clampInt(searchParams.get('level'), 1, 20);
    const sharedParty = readEncounterPartyShareParams(searchParams);
    const diff = searchParams.get('diff');
    const env = searchParams.get('env');
    const seed = clampInt(searchParams.get('seed'), 0, 0x7fffffff);
    const sharedFlavorVersion = parseFlavorVersionParam(searchParams.get('fv'));
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

    const displaySize = sharedParty?.size ?? size;
    const displayLevel = sharedParty?.level ?? level;
    if (displaySize !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot share-link hydration preserves the seeded replay contract.
      setPartySize(displaySize);
      setPartySizeInput(String(displaySize));
    }
    if (displayLevel !== null) {
      setPartyLevel(displayLevel);
      setPartyLevelInput(String(displayLevel));
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

    if (seed !== null && sharedParty && isDifficulty(diff) && isEnvironment(env)) {
      loadedSharedParty.current = true;
      if (sharedParty.mode === 'snapshot') {
        setSnapshotPartyContext(sharedParty.context);
        setPartyMode('snapshot');
      } else {
        // Legacy scalar links remain a temporary custom setup.
        setCustomPartyConfig(contextToForecastConfig(sharedParty.context));
        setPartyMode('custom');
      }
      const sharedConfig: GenerateConfig = {
        partyContext: sharedParty.context,
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
        flavorVersion: sharedFlavorVersion,
      };
      if (recipeId && getRecipeById(recipeId)) runRecipe(recipeId, sharedConfig);
      else runGenerate(sharedConfig);
    }
  }, [runGenerate, runRecipe, setCustomPartyConfig]);

  // A normal visit defaults to the active durable party. Shared links resolve
  // above first and deliberately leave the Party Library untouched.
  const didInitializePartyMode = useRef(false);
  useEffect(() => {
    if (didInitializePartyMode.current || !partyLibraryHydrated) return;
    didInitializePartyMode.current = true;
    if (loadedSharedParty.current || partyMode !== 'pending') return;
    if (durableParty) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initialize encounter-scoped attendance from the hydrated library snapshot.
      setSelectedMemberIds(reconcilePartySelection(durableParty));
      setSelectedPartyId(durableParty.id);
      setPartyMode('active');
    } else {
      setPartyMode('custom');
    }
  }, [durableParty, partyLibraryHydrated, partyMode]);

  const activePartyId = durableParty?.id ?? null;
  useEffect(() => {
    if (partyMode !== 'active') return;
    if (!durableParty) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a removed/archived active party falls back to isolated custom values.
      setSelectedMemberIds([]);
      setSelectedPartyId(null);
      setPartyMode('custom');
      cancelPendingForecast();
      return;
    }
    if (selectedPartyId === activePartyId) return;
    setSelectedMemberIds(reconcilePartySelection(durableParty));
    setSelectedPartyId(durableParty.id);
    cancelPendingForecast();
  }, [activePartyId, cancelPendingForecast, durableParty, partyMode, selectedPartyId]);

  function chooseActiveParty() {
    if (!durableParty) return;
    setSelectedMemberIds(reconcilePartySelection(durableParty));
    setSelectedPartyId(durableParty.id);
    setPartyMode('active');
    setShowPartySetup(false);
    cancelPendingForecast();
  }

  function chooseCustomParty() {
    setPartyMode('custom');
    setShowPartySetup(false);
    cancelPendingForecast();
  }

  function chooseSnapshotParty() {
    if (!snapshotPartyContext) return;
    setPartyMode('snapshot');
    setShowPartySetup(false);
    cancelPendingForecast();
  }

  function toggleAttendance(memberId: string) {
    if (!durableParty) return;
    setSelectedMemberIds(reconcilePartySelection(
      durableParty,
      effectiveSelectedMemberIds.includes(memberId)
        ? effectiveSelectedMemberIds.filter((id) => id !== memberId)
        : [...effectiveSelectedMemberIds, memberId],
    ));
    setSelectedPartyId(durableParty.id);
    cancelPendingForecast();
  }

  const focusInvalidPartyField = useCallback(() => {
    const invalidId = partyMode === 'active' && effectivePartySize === 0
      ? 'enc-party-attendance'
      : partyMode === 'custom' && partySizeValidation.error
      ? 'enc-party-size'
      : partyMode === 'custom' && partyLevelValidation.error
      ? 'enc-party-level'
      : 'party-controls-heading';
    document.getElementById(invalidId)?.focus();
  }, [effectivePartySize, partyLevelValidation.error, partyMode, partySizeValidation.error]);

  function handleGenerate() {
    if (!partySetupValid) {
      focusInvalidPartyField();
      return;
    }

    runGenerate({
      partyContext: cloneEncounterPartyContext(effectivePartyContext),
      difficulty, environment,
      includeMap, mapLayout, mapScale, mapFeatureDensity, mapTerrainVariety,
      filter: monsterFilter, seed: randomSeed(), flavorVersion: 2,
    });
  }

  function handleRecipe(recipeId: string) {
    if (!partySetupValid) {
      setRecipeError('Fix the party details before using a recipe.');
      focusInvalidPartyField();
      return;
    }
    runRecipe(recipeId, {
      partyContext: cloneEncounterPartyContext(effectivePartyContext),
      difficulty, environment,
      includeMap, mapLayout, mapScale, mapFeatureDensity, mapTerrainVariety,
      filter: monsterFilter, seed: randomSeed(), flavorVersion: 2, recipeId,
    });
  }

  function handlePartySizeChange(value: number) {
    const nextSize = Math.max(1, Math.min(10, value));
    setPartySize(nextSize);
    setEncounter((current) => current ? {
      ...current,
      difficulty: assessEncounterDifficulty(current.totalXp, buildParty(nextSize, partyLevel)),
    } : current);
    setCustomPartyConfig((current) => ({
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
    setCustomPartyConfig((current) => ({
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
    setGeneratedPartySnapshotSignature('');
    setLinkCopied(false);
    setShowFilters(false);
    setExpandedMonster(null);
    setShowManualAdd(false);
    setManualSearch('');
    setShowRecipes(false);
    setRecipeError('');
    setShowPartySetup(false);
    setCustomPartyConfig({ version: 1, members: defaultPartyConfig(4, 3) });
    setSnapshotPartyContext(null);
    if (durableParty) {
      setSelectedMemberIds(reconcilePartySelection(durableParty));
      setSelectedPartyId(durableParty.id);
      setPartyMode('active');
    } else {
      setSelectedMemberIds([]);
      setSelectedPartyId(null);
      setPartyMode('custom');
    }
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
    if (!shareLinkIsCurrent) return;
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [shareLinkIsCurrent]);

  const runForecast = useCallback((
    config: PartyConfig,
    enc: Encounter,
    partyContext: EncounterPartyContext,
  ) => {
    const runId = ++forecastRunId.current;
    setSimRunning(true);
    setWhatIfReports([]);
    // Let the skeleton paint before the (fast but synchronous) simulation.
    setTimeout(() => {
      if (runId !== forecastRunId.current) return;
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
      const nextReport = simulateBattle(players, monsters, {
        seed: randomSeed(),
        ...(battlefield ? { battlefield } : {}),
      });
      if (runId !== forecastRunId.current) return;
      setReport(nextReport);
      setReportSignature(forecastSignature(enc, partyContext));
      setReportRosterSignature(config.members.map((member) => member.name).join('\u001f'));
      setSimRunning(false);
    }, 30);
  }, []);

  function handleForecastClick() {
    if (!encounter || encounter.monsters.length === 0) return;
    if (!partySetupValid) {
      focusInvalidPartyField();
      return;
    }
    if (effectiveForecastConfig.members.length === 0) {
      if (partyMode === 'custom') openPartySetup();
      else document.getElementById('enc-party-attendance')?.focus();
      return;
    }
    runForecast(
      effectiveForecastConfig,
      encounter,
      cloneEncounterPartyContext(effectivePartyContext),
    );
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
    if (!encounter || !report || forecastIsStale || effectiveForecastConfig.members.length === 0) return;
    const current = encounter.monsters.find((entry) => entry.monster.id === monsterId);
    if (!current || (delta < 0 && current.count <= 0)) return;
    const roster = encounter.monsters
      .map((entry) => entry.monster.id === monsterId ? { ...entry, count: entry.count + delta } : entry)
      .filter((entry) => entry.count > 0);
    if (roster.length === 0) return;
    const players = effectiveForecastConfig.members.map((member, index) => buildSimPlayer(member, index));
    const monsters = roster.flatMap((entry) =>
      Array.from({ length: entry.count }, (_, index) => monsterToSimMonster(entry.monster, index, entry.count))
    );
    const battlefield = encounter.map
      ? battlefieldFromMap(
          encounter.map,
          placeTokens(encounter.map, roster, effectiveForecastConfig.members.length, encounter.map.seed ?? encounter.seed),
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
  }, [effectiveForecastConfig, encounter, forecastIsStale, report]);

  const handleExport = useCallback((format: 'json' | 'markdown' | 'foundry' | 'player') => {
    if (!encounter) return;
    const currentEncounter = summary.assessment
      ? { ...encounter, difficulty: summary.assessment }
      : encounter;
    if (format === 'json') {
      downloadEncounter(JSON.stringify(currentEncounter, null, 2), 'application/json', encounterExportFilename(currentEncounter, 'json'));
    } else if (format === 'markdown') {
      downloadEncounter(encounterToMarkdown(currentEncounter), 'text/markdown', encounterExportFilename(currentEncounter, 'md'));
    } else if (format === 'foundry') {
      downloadEncounter(JSON.stringify(encounterToFoundry(currentEncounter), null, 2), 'application/json', encounterExportFilename(currentEncounter, 'foundry.json'));
    } else {
      downloadEncounter(encounterPlayerHandoutMarkdown(currentEncounter), 'text/markdown', encounterExportFilename(currentEncounter, 'player-handout.md'));
    }
  }, [downloadEncounter, encounter, summary.assessment]);

  const handlePrintPlayerHandout = useCallback(() => {
    document.body.classList.add('player-handout-print');
    const cleanup = () => document.body.classList.remove('player-handout-print');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1000);
  }, []);

  function handleRunBattle() {
    if (!encounter || encounter.monsters.length === 0) return;
    if (!partySetupValid) {
      focusInvalidPartyField();
      return;
    }
    const existing = getBrowserBattleStore()?.getSnapshot().battle ?? null;
    if (
      existing?.combatants.length
      && !window.confirm(`Replace the current battle “${existing.name}” with “${encounter.name}”?`)
    ) return;

    const currentEncounter = summary.assessment
      ? { ...encounter, difficulty: summary.assessment }
      : encounter;
    const nextBattle = battleFromEncounter(
      currentEncounter,
      effectiveForecastConfig.members,
      cloneEncounterPartyContext(effectivePartyContext),
    );
    if (!replaceBattleState(nextBattle).ok) {
      window.alert('The battle is ready in this tab, but this browser could not save it for a later visit.');
    }
    // Client navigation keeps the shared in-memory battle snapshot alive if
    // persistence is unavailable; a hard reload would discard that draft.
    router.push('/battle/');
  }

  function handleSaveEncounter() {
    if (!encounter || savingName === null || !partySetupValid) return;
    const name = savingName.trim() || encounter.name;
    const frozenParty = cloneEncounterPartyContext(effectivePartyContext);
    const savedEncounter = summary.assessment
      ? { ...encounter, difficulty: summary.assessment }
      : encounter;
    const savedRecord: SavedEncounter = {
      version: 1,
      id: `saved-${Date.now()}`,
      name,
      savedAt: Date.now(),
      encounter: savedEncounter,
      partyContext: frozenParty,
      ...(!forecastIsStale && report
        ? {
            forecast: {
              report,
              signature: forecastSignature(savedEncounter, frozenParty),
            },
          }
        : {}),
    };
    setSavedEncounters((prev) => [
      savedRecord,
      ...prev,
    ].slice(0, MAX_SAVED_ENCOUNTERS));
    closeSaveEncounter();
  }

  function handleLoadSaved(saved: SavedEncounter) {
    forecastRunId.current += 1;
    setSimRunning(false);
    setEncounter(saved.encounter);
    setIsSeeded(false); // the pool may have changed since it was saved
    setGeneratedPartySnapshotSignature('');
    clearUrlSeed();
    setExpandedMonster(null);
    setWhatIfReports([]);
    if (saved.partyContext && isEncounterPartyContext(saved.partyContext)) {
      const frozenParty = cloneEncounterPartyContext(saved.partyContext);
      setSnapshotPartyContext(frozenParty);
      setPartyMode('snapshot');
      setReport(saved.forecast?.report ?? null);
      setReportSignature(saved.forecast
        ? forecastSignature(saved.encounter, frozenParty)
        : '');
      setReportRosterSignature(saved.forecast
        ? contextToForecastConfig(frozenParty).members
          .map((member) => member.name)
          .join('\u001f')
        : '');
    } else {
      setSnapshotPartyContext(null);
      if (durableParty) {
        setSelectedMemberIds(reconcilePartySelection(durableParty));
        setSelectedPartyId(durableParty.id);
        setPartyMode('active');
      } else {
        setPartyMode('custom');
      }
      setReport(null);
      setReportSignature('');
      setReportRosterSignature('');
    }
    setEditingDetails(false);
  }

  return (
    <div className="animate-fade-in">
      <ToolPageHeader
        path="/encounters"
        description="Set the party, shape the battlefield, and generate a balanced encounter using the 2024 rules—then forecast how it is likely to play out."
      />
      <PartyPersistenceStatus errorsOnly />
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
                Choose who is at the table, then set the tone for the fight. Optional tools stay tucked away until you need them.
              </p>
            </div>
          </div>
          <div className="workflow-context" role="status">
            <span className="micro-label">Current brief</span>
            <strong>
              {partyMode === 'pending'
                ? 'Loading party…'
                : partySetupValid
                ? `${effectivePartySize} ${effectivePartySize === 1 ? 'hero' : 'heroes'} · ${effectiveLevelLabel} · ${difficulty} target`
                : 'Party details need attention'}
            </strong>
          </div>
        </header>

        <div className="setup-grid">
          <section className="setup-group self-start" aria-labelledby="party-controls-heading">
            <div className="setup-group-heading">
              <span className="setup-group-icon" aria-hidden="true"><Users size={18} /></span>
              <div>
                <h3 id="party-controls-heading" tabIndex={-1} className="text-base">Party</h3>
                <p>Choose the party and who’s here today.</p>
              </div>
            </div>
            {partyMode === 'pending' ? (
              <div className="surface-inset animate-pulse p-4" role="status">
                <p className="text-sm text-[var(--text-3)]">Loading your Party Library…</p>
              </div>
            ) : partyMode === 'snapshot' && snapshotPartyContext ? (
              <div id="enc-party-snapshot" tabIndex={-1} className="surface-inset space-y-3 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between md:flex-col xl:flex-row">
                  <div>
                    <p className="micro-label">
                      {snapshotPartyContext.source === 'shared' ? 'Shared party setup' : 'Saved party setup'}
                    </p>
                    <p className="mt-1 font-semibold text-[var(--text-1)]">
                      {effectivePartySize} {effectivePartySize === 1 ? 'adventurer' : 'adventurers'} · {effectiveLevelLabel}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--text-3)]">
                      A frozen copy of the party math keeps this scene reproducible. Character names and notes are not included.
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-3)]">
                      {difficulty} budget {getPartyXpBudget(party, difficulty).toLocaleString()} XP
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:w-full md:flex-col xl:w-auto xl:flex-row">
                    {durableParty && (
                      <button type="button" className="btn-secondary w-full text-xs sm:w-auto md:w-full xl:w-auto" onClick={chooseActiveParty}>
                        Use active party
                      </button>
                    )}
                    <button type="button" className="btn-ghost w-full text-xs sm:w-auto md:w-full xl:w-auto" onClick={chooseCustomParty}>
                      Use custom values
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <fieldset>
                  <legend className="sr-only">Party source</legend>
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
                    <label
                      aria-disabled={!durableParty || undefined}
                      className={`option-card option-card-toggle ${partyMode === 'active' ? 'is-active' : ''} ${!durableParty ? 'cursor-not-allowed opacity-60' : ''}`}
                    >
                      <Users size={18} aria-hidden="true" />
                      <span className="option-card-copy">
                        <strong>Use active party</strong>
                        <small>{durableParty ? durableParty.name : 'No saved party yet'}</small>
                      </span>
                      <input
                        type="radio"
                        name="encounter-party-source"
                        value="active"
                        checked={partyMode === 'active'}
                        disabled={!durableParty}
                        onChange={chooseActiveParty}
                      />
                    </label>
                    <label className={`option-card option-card-toggle ${partyMode === 'custom' ? 'is-active' : ''}`}>
                      <SlidersHorizontal size={18} aria-hidden="true" />
                      <span className="option-card-copy">
                        <strong>Use custom values</strong>
                        <small>Temporary for this encounter</small>
                      </span>
                      <input
                        type="radio"
                        name="encounter-party-source"
                        value="custom"
                        checked={partyMode === 'custom'}
                        onChange={chooseCustomParty}
                      />
                    </label>
                  </div>
                </fieldset>

                {snapshotPartyContext && (
                  <button
                    type="button"
                    className="btn-ghost w-full justify-center text-xs sm:w-auto"
                    onClick={chooseSnapshotParty}
                  >
                    Return to {snapshotPartyContext.source === 'shared' ? 'shared' : 'saved'} party setup
                  </button>
                )}

                {partyMode === 'active' && durableParty ? (
                  <div className="surface-inset space-y-3 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        {availableParties.length > 1 ? (
                          <>
                            <label htmlFor="enc-active-party" className="field-label">Active party</label>
                            <select
                              id="enc-active-party"
                              value={durableParty.id}
                              className="w-full text-sm"
                              onChange={(event) => {
                                const nextPartyId = event.target.value;
                                const nextParty = availableParties.find((savedParty) => savedParty.id === nextPartyId);
                                if (!nextParty) return;
                                setSelectedPartyId(nextParty.id);
                                setSelectedMemberIds(reconcilePartySelection(nextParty));
                                cancelPendingForecast();
                                void updateLibrary((library) => activateParty(library, nextPartyId)).then((result) => {
                                  if (result.ok) return;
                                  setSelectedPartyId(durableParty.id);
                                  setSelectedMemberIds(reconcilePartySelection(durableParty));
                                });
                              }}
                            >
                              {availableParties.map((savedParty) => (
                                <option key={savedParty.id} value={savedParty.id}>{savedParty.name}</option>
                              ))}
                            </select>
                          </>
                        ) : (
                          <p className="font-semibold text-[var(--text-1)]">{durableParty.name}</p>
                        )}
                        <p className="mt-0.5 text-xs text-[var(--text-3)]">
                          {effectivePartySize} of {durableParty.members.length} attending · {effectiveLevelLabel}
                        </p>
                        {availableParties.length > 1 && (
                          <p className="mt-1 text-xs text-[var(--text-3)]">
                            Changing this selection updates the active party across DM tools.
                          </p>
                        )}
                      </div>
                      <Link href="/party/" className="btn-ghost text-xs">Manage parties</Link>
                    </div>
                    <fieldset
                      id="enc-party-attendance"
                      tabIndex={-1}
                      aria-invalid={effectivePartySize === 0 ? true : undefined}
                      aria-describedby={effectivePartySize === 0 ? 'enc-party-attendance-error' : 'enc-party-attendance-hint'}
                    >
                      <legend className="field-label">Attendance</legend>
                      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
                        {durableParty.members.map((member) => {
                          const attending = effectiveSelectedMemberIds.includes(member.id);
                          const attendanceCapped = !attending
                            && effectiveSelectedMemberIds.length >= MAX_ENCOUNTER_PARTY_MEMBERS;
                          return (
                            <label
                              key={member.id}
                              className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${attendanceCapped ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${attending
                                ? 'border-[var(--border-interactive)] bg-[var(--bronze-wash)]'
                                : 'border-[var(--border-subtle)] bg-[var(--surface-subtle)] text-[var(--text-3)]'}`}
                            >
                              <input
                                type="checkbox"
                                checked={attending}
                                disabled={attendanceCapped}
                                onChange={() => toggleAttendance(member.id)}
                              />
                              <span className="min-w-0 flex-1">
                                <strong className="block truncate text-sm text-[var(--text-1)]">{member.name || 'Unnamed adventurer'}</strong>
                                <small className="block text-[11px] text-[var(--text-3)]">
                                  Level {member.level} · {member.classLabel || getTemplateById(member.templateId)?.name || 'Adventurer'}
                                </small>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                    {durableParty.members.length > MAX_ENCOUNTER_PARTY_MEMBERS && (
                      <p className="field-hint">
                        Up to {MAX_ENCOUNTER_PARTY_MEMBERS} characters can attend one encounter.
                      </p>
                    )}
                    {effectivePartySize === 0 ? (
                      <p id="enc-party-attendance-error" className="field-error" role="alert">
                        {durableParty.members.length === 0
                          ? <>This party has no characters. <Link href="/party/" className="underline">Add a character</Link> to continue.</>
                          : 'Select at least one attending character.'}
                      </p>
                    ) : (
                      <p id="enc-party-attendance-hint" className="text-xs text-[var(--text-3)]">
                        {effectivePartySize} attending · {effectiveLevelLabel} · {difficulty} budget {getPartyXpBudget(party, difficulty).toLocaleString()} XP
                      </p>
                    )}
                    <p className="text-xs leading-relaxed text-[var(--text-3)]">
                      Attendance will be included when you save or start combat. It does not remove anyone from the Party Library.
                    </p>
                  </div>
                ) : (
                  <div className="surface-inset p-3">
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-[var(--text-1)]">Temporary party</p>
                        <p className="mt-0.5 text-xs text-[var(--text-3)]">These values affect this encounter only and never edit a saved party.</p>
                      </div>
                      {!durableParty && <Link href="/party/" className="btn-ghost text-xs">Create a saved party</Link>}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
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
                        <label htmlFor="enc-party-level" className="field-label">Starting level</label>
                        <input
                          id="enc-party-level"
                          type="number" min={1} max={20} step={1} inputMode="numeric"
                          value={partyLevelInput}
                          onChange={e => handlePartyLevelInputChange(e.target.value)}
                          aria-invalid={partyLevelValidation.error ? true : undefined}
                          aria-describedby={partyLevelValidation.error ? 'enc-party-level-error' : 'enc-party-level-hint'}
                          className="w-full"
                        />
                        <p id="enc-party-level-hint" className="field-hint">Applied to every temporary character</p>
                        {partyLevelValidation.error && (
                          <p id="enc-party-level-error" className="field-error" role="alert">
                            {partyLevelValidation.error}
                          </p>
                        )}
                      </div>
                    </div>
                    {customPartyInputsValid && (
                      <p className="mt-3 text-xs text-[var(--text-3)]">
                        {effectivePartySize} heroes · {effectiveLevelLabel} · {difficulty} budget {getPartyXpBudget(party, difficulty).toLocaleString()} XP
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="setup-group self-start" aria-labelledby="encounter-controls-heading">
            <div className="setup-group-heading">
              <span className="setup-group-icon" aria-hidden="true"><SlidersHorizontal size={18} /></span>
              <div>
                <h3 id="encounter-controls-heading" className="text-base">Encounter brief</h3>
                <p>What should the fight feel like?</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 xl:grid-cols-2">
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
                        {getRecipePlaybookPreview(recipe.id) && (
                          <span className="mt-2 block text-[10px] font-semibold text-[var(--text-3)]">
                            {getRecipePlaybookPreview(recipe.id)?.objective} · {getRecipePlaybookPreview(recipe.id)?.beats} live cues
                          </span>
                        )}
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
                    {saved.partyContext && isEncounterPartyContext(saved.partyContext)
                      ? `${saved.partyContext.snapshot.members.length} heroes · `
                      : ''}
                    {saved.forecast ? 'forecast saved · ' : ''}
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
                  {formatMonsterSize(m)} {m.type} · AC {m.armor.ac} · {m.hitPoints} HP
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
                  Assessed for {effectivePartySize} {effectivePartySize === 1 ? 'hero' : 'heroes'} at {effectiveLevelLabel}. The current setup target is <strong>{difficulty}</strong>.
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
                    disabled={!partySetupValid}
                    className="btn-secondary text-sm"
                  >
                    <Save size={16} aria-hidden="true" />
                    Save
                  </button>
                )}
                {shareLinkIsCurrent && (
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
                {shareLinkIsCurrent && (
                  <p id="share-link-description" className="basis-full text-xs leading-relaxed text-[var(--text-3)]">
                    Share links include anonymous levels and combat values—never character names, player names, or notes.
                  </p>
                )}
                {partyChangedSinceGeneration && (
                  <p className="basis-full text-xs font-medium text-[var(--bronze-light)]" role="status">
                    The party changed. Generate again before sharing so the link matches this setup.
                  </p>
                )}
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
                  <p className="field-hint">Includes this party setup and the current forecast, when available.</p>
                </div>
                <button type="submit" disabled={!partySetupValid} className="btn-primary text-sm">
                  <Check size={16} aria-hidden="true" />
                  Save encounter
                </button>
                <button type="button" onClick={closeSaveEncounter} className="btn-ghost text-sm">
                  Cancel
                </button>
              </form>
            )}
          </section>

          {encounter.recipePlan && <EncounterRecipePlaybook plan={encounter.recipePlan} />}

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
                        {em.recipeRole && (
                          <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-[var(--bronze)]">{em.recipeRole}</span>
                        )}
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
            <div className="surface-inset mt-4 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <span className="next-step-icon" aria-hidden="true"><Users size={20} /></span>
              <div className="min-w-0 flex-1">
                <p className="micro-label">Your adventuring party</p>
                <h3 className="mt-1 text-lg">{configuredPartySummary}</h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-3)]">
                  Used for both the combat forecast and the initiative tracker.
                </p>
              </div>
              {partyMode === 'custom' ? (
                <button
                  ref={configurePartyButtonRef}
                  type="button"
                  onClick={openPartySetup}
                  aria-expanded={showPartySetup}
                  aria-controls="encounter-party-setup"
                  className="btn-secondary w-full text-sm sm:w-auto"
                >
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  {showPartySetup ? 'Editing profiles' : 'Tune temporary profiles'}
                </button>
              ) : partyMode === 'active' ? (
                <button type="button" onClick={reviewPartyControls} className="btn-secondary w-full text-sm sm:w-auto">
                  <Users size={16} aria-hidden="true" />
                  Review attendance
                </button>
              ) : (
                <button type="button" onClick={reviewPartyControls} className="btn-secondary w-full text-sm sm:w-auto">
                  <Users size={16} aria-hidden="true" />
                  Review party setup
                </button>
              )}
            </div>
            {showPartySetup && partyMode === 'custom' && (
              <div
                id="encounter-party-setup"
                ref={partySetupRef}
                tabIndex={-1}
                className="mt-4 scroll-mt-6"
                aria-label="Encounter party setup"
              >
                <PartySetupPanel
                  members={temporaryPartyConfig.members}
                  eyebrow="Temporary encounter party"
                  title="Tune forecast profiles"
                  description="These combat profiles stay with the temporary encounter setup and never edit your Party Library."
                  saveLabel="Use these profiles"
                  onSave={(members) => {
                    setCustomPartyConfig({ version: 1, members });
                    const nextSize = members.length;
                    const nextLevel = nextSize > 0
                      ? Math.round(members.reduce((total, member) => total + member.level, 0) / nextSize)
                      : partyLevel;
                    setPartySize(nextSize);
                    setPartySizeInput(String(nextSize));
                    setPartyLevel(nextLevel);
                    setPartyLevelInput(String(nextLevel));
                    invalidateForecast();
                    closePartySetup();
                  }}
                  onCancel={closePartySetup}
                />
              </div>
            )}
            <div className="next-step-grid">
              <article className="next-step-card">
                <span className="next-step-icon" aria-hidden="true"><Play size={20} /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg">Forecast the outcome</h3>
                  <p>Simulate 1,000 battles to estimate win rate, remaining HP, knockouts, and the deadliest foe.</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleForecastClick}
                      disabled={simRunning || !partySetupValid}
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
                  <button
                    type="button"
                    onClick={handleRunBattle}
                    disabled={!partySetupValid}
                    className="btn-primary mt-4 w-full text-sm sm:w-auto"
                  >
                    <Swords size={16} aria-hidden="true" />
                    Open battle organizer
                  </button>
                </div>
              </article>
            </div>
          </section>
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
              stale={forecastIsStale}
              onRerun={() => {
                if (!partySetupValid) {
                  focusInvalidPartyField();
                  return;
                }
                if (encounter) {
                  runForecast(
                    effectiveForecastConfig,
                    encounter,
                    cloneEncounterPartyContext(effectivePartyContext),
                  );
                }
              }}
              onEditParty={partyMode === 'custom' ? openPartySetup : reviewPartyControls}
              partyActionLabel={partyMode === 'custom'
                ? 'Edit temporary profiles'
                : partyMode === 'active'
                ? 'Review attendance'
                : snapshotPartyContext?.source === 'shared'
                ? 'Review shared party'
                : 'Review saved party'}
            />
          )}
          {!simRunning && report && encounter.recipePlan && (
            <EncounterRecipePlaybook plan={encounter.recipePlan} variant="forecast" />
          )}
          {!simRunning && report && !forecastIsStale && (
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
                Suggested starting positions — bronze ring: party (P1–P{effectivePartySize}), red ring: monsters.
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
