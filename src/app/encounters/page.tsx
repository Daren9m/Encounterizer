'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Minus, Plus, Swords, X } from 'lucide-react';
import { filterMonsters } from '@/lib/monster-filter';
import { useMonsters } from '@/app/hooks/useMonsters';
import {
  assessEncounterDifficulty,
  generateEncounter,
  summarizeEncounter,
} from '@/lib/encounter-generator';
import {
  generateMap,
  type MapFeatureDensity,
  type MapTerrainVariety,
} from '@/lib/map-generator';
import { randomSeed } from '@/lib/random';
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
  mapWidth: number;
  mapHeight: number;
  mapFeatureDensity: MapFeatureDensity;
  mapTerrainVariety: MapTerrainVariety;
  filter: MonsterFilter;
  seed: number;
}

function writeUrl(cfg: GenerateConfig): void {
  const params = new URLSearchParams();
  params.set('size', String(cfg.partySize));
  params.set('level', String(cfg.partyLevel));
  params.set('diff', cfg.difficulty);
  params.set('env', cfg.environment);
  if (cfg.includeMap) {
    params.set('map', '1');
    params.set('mw', String(cfg.mapWidth));
    params.set('mh', String(cfg.mapHeight));
    params.set('md', cfg.mapFeatureDensity);
    params.set('mv', cfg.mapTerrainVariety);
  }
  params.set('seed', String(cfg.seed));
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
  mapWidth?: number;
  mapHeight?: number;
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
  const [mapWidth, setMapWidth] = useState(24);
  const [mapHeight, setMapHeight] = useState(18);
  const [mapFeatureDensity, setMapFeatureDensity] = useState<MapFeatureDensity>('Balanced');
  const [mapTerrainVariety, setMapTerrainVariety] = useState<MapTerrainVariety>('Varied');
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualSearch, setManualSearch] = useState('');

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
  const partySetupRef = useRef<HTMLDivElement>(null);

  // Saved encounters + save-name input
  const [savedEncounters, setSavedEncounters, savedHydrated] =
    usePersistentState<SavedEncounter[]>('savedEncounters', []);
  const [savingName, setSavingName] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);

  // Persisted page settings. Declared BEFORE the URL-init effect so a shared
  // link's params win over remembered settings.
  const settingsHydrated = useRef(false);
  useEffect(() => {
    const stored = storageLoad<EncounterSettings | null>(
      'encounterSettings', null,
      (v): v is EncounterSettings | null => v === null || isEncounterSettings(v),
    );
    if (stored) {
      setPartySize(stored.partySize);
      setPartyLevel(stored.partyLevel);
      setPartySizeInput(String(stored.partySize));
      setPartyLevelInput(String(stored.partyLevel));
      setDifficulty(stored.difficulty);
      setEnvironment(stored.environment);
      setIncludeMap(stored.includeMap);
      setMapWidth(stored.mapWidth ?? 24);
      setMapHeight(stored.mapHeight ?? 18);
      setMapFeatureDensity(stored.mapFeatureDensity ?? 'Balanced');
      setMapTerrainVariety(stored.mapTerrainVariety ?? 'Varied');
    }
    settingsHydrated.current = true;
  }, []);
  useEffect(() => {
    if (!settingsHydrated.current) return;
    storageSave('encounterSettings', {
      partySize, partyLevel, difficulty, environment, includeMap,
      mapWidth, mapHeight, mapFeatureDensity, mapTerrainVariety,
    } satisfies EncounterSettings);
  }, [
    partySize, partyLevel, difficulty, environment, includeMap,
    mapWidth, mapHeight, mapFeatureDensity, mapTerrainVariety,
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

  const runGenerate = useCallback((cfg: GenerateConfig) => {
    const enc = generateEncounter(
      allMonsters,
      {
        party: buildParty(cfg.partySize, cfg.partyLevel),
        difficulty: cfg.difficulty,
        environment: cfg.environment,
        filter: cfg.filter,
        seed: cfg.seed,
      },
      filterMonsters,
    );
    if (cfg.includeMap) {
      enc.map = generateMap({
        environment: cfg.environment,
        width: cfg.mapWidth,
        height: cfg.mapHeight,
        featureDensity: cfg.mapFeatureDensity,
        terrainVariety: cfg.mapTerrainVariety,
        seed: cfg.seed,
      });
    }
    setEncounter(enc);
    setIsSeeded(true);
    setLinkCopied(false);
    setExpandedMonster(null);
    setEditingDetails(false);
    invalidateForecast();
    writeUrl(cfg);
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
    const withMap = searchParams.get('map') === '1';
    const sharedMapWidth = clampInt(searchParams.get('mw'), 10, 40) ?? 24;
    const sharedMapHeight = clampInt(searchParams.get('mh'), 10, 30) ?? 18;
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
      setMapWidth(sharedMapWidth);
      setMapHeight(sharedMapHeight);
      setMapFeatureDensity(sharedMapDensity);
      setMapTerrainVariety(sharedMapVariety);
    }

    if (seed !== null && size !== null && level !== null && isDifficulty(diff) && isEnvironment(env)) {
      runGenerate({
        partySize: size,
        partyLevel: level,
        difficulty: diff,
        environment: env,
        includeMap: withMap,
        mapWidth: sharedMapWidth,
        mapHeight: sharedMapHeight,
        mapFeatureDensity: sharedMapDensity,
        mapTerrainVariety: sharedMapVariety,
        filter,
        seed,
      });
    }
  }, [searchParams, runGenerate]);

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
      includeMap, mapWidth, mapHeight, mapFeatureDensity, mapTerrainVariety,
      filter: monsterFilter, seed: randomSeed(),
    });
  }

  function handlePartySizeChange(value: number) {
    const nextSize = Math.max(1, Math.min(10, value));
    setPartySize(nextSize);
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
    setMapWidth(24);
    setMapHeight(18);
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
        width: mapWidth,
        height: mapHeight,
        featureDensity: mapFeatureDensity,
        terrainVariety: mapTerrainVariety,
        seed: randomSeed(),
      }),
    } : prev);
    setIsSeeded(false);
    clearUrlSeed();
  }

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, []);

  const runForecast = useCallback((config: PartyConfig, enc: Encounter) => {
    setSimRunning(true);
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

  const handleExport = useCallback(() => {
    if (!encounter) return;
    const json = JSON.stringify(encounter, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `encounter-${encounter.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [encounter]);

  const handleSaveEncounter = useCallback(() => {
    if (!encounter || savingName === null) return;
    const name = savingName.trim() || encounter.name;
    setSavedEncounters((prev) => [
      { id: `saved-${Date.now()}`, name, savedAt: Date.now(), encounter },
      ...prev,
    ].slice(0, MAX_SAVED_ENCOUNTERS));
    setSavingName(null);
  }, [encounter, savingName, setSavedEncounters]);

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

      {/* Controls */}
      <div className="card panel-accent mb-6 print:hidden">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="micro-label">Encounter setup</p>
            <h2 className="mt-1 text-xl">Shape the fight</h2>
          </div>
          <span className="text-sm text-[var(--text-3)]">
            {partyInputsValid
              ? `${partySize} heroes · level ${partyLevel} · ${difficulty}`
              : 'Fix party details to generate'}
          </span>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label htmlFor="enc-party-size" className="micro-label block mb-1">
              Party Size
            </label>
            <input
              id="enc-party-size"
              type="number" min={1} max={10} step={1} inputMode="numeric"
              value={partySizeInput}
              onChange={e => handlePartySizeInputChange(e.target.value)}
              aria-invalid={partySizeValidation.error ? true : undefined}
              aria-describedby={partySizeValidation.error ? 'enc-party-size-error' : undefined}
              className="w-full"
            />
            {partySizeValidation.error && (
              <p id="enc-party-size-error" className="mt-1 text-xs text-[var(--accent-danger-light)]" role="alert">
                {partySizeValidation.error}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="enc-party-level" className="micro-label block mb-1">
              Party Level
            </label>
            <input
              id="enc-party-level"
              type="number" min={1} max={20} step={1} inputMode="numeric"
              value={partyLevelInput}
              onChange={e => handlePartyLevelInputChange(e.target.value)}
              aria-invalid={partyLevelValidation.error ? true : undefined}
              aria-describedby={partyLevelValidation.error ? 'enc-party-level-error' : undefined}
              className="w-full"
            />
            {partyLevelValidation.error && (
              <p id="enc-party-level-error" className="mt-1 text-xs text-[var(--accent-danger-light)]" role="alert">
                {partyLevelValidation.error}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="enc-difficulty" className="micro-label block mb-1">
              Difficulty
            </label>
            <select id="enc-difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)} className="w-full">
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="enc-environment" className="micro-label block mb-1">
              Environment
            </label>
            <select id="enc-environment" value={environment} onChange={e => setEnvironment(e.target.value as Environment)} className="w-full">
              {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>

        {includeMap && (
          <fieldset className="rounded-md border border-[var(--steel-800)] p-3 mb-4">
            <legend className="micro-label px-1">Battle Map Options</legend>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label htmlFor="enc-map-width" className="text-xs text-[var(--text-2)] block mb-1">Width</label>
                <input
                  id="enc-map-width" type="number" min={10} max={40} value={mapWidth}
                  onChange={e => setMapWidth(Math.max(10, Math.min(40, Number(e.target.value))))}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="enc-map-height" className="text-xs text-[var(--text-2)] block mb-1">Height</label>
                <input
                  id="enc-map-height" type="number" min={10} max={30} value={mapHeight}
                  onChange={e => setMapHeight(Math.max(10, Math.min(30, Number(e.target.value))))}
                  className="w-full"
                />
              </div>
              <div>
                <label htmlFor="enc-map-density" className="text-xs text-[var(--text-2)] block mb-1">Object Density</label>
                <select
                  id="enc-map-density" value={mapFeatureDensity}
                  onChange={e => setMapFeatureDensity(e.target.value as MapFeatureDensity)}
                  className="w-full"
                >
                  {MAP_DENSITIES.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="enc-map-variety" className="text-xs text-[var(--text-2)] block mb-1">Terrain Mix</label>
                <select
                  id="enc-map-variety" value={mapTerrainVariety}
                  onChange={e => setMapTerrainVariety(e.target.value as MapTerrainVariety)}
                  className="w-full"
                >
                  {MAP_VARIETIES.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </div>
          </fieldset>
        )}

        {/* Difficulty Meter */}
        <DifficultyMeter
          assessment={summary.assessment}
          totalMonsterHp={summary.totalMonsterHp}
          totalXp={summary.totalXp}
        />

        <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={handleGenerate} className="btn-primary text-base sm:text-lg">
              {encounter ? 'Generate a New Encounter' : 'Generate Encounter'}
            </button>
            <button
              type="button"
              onClick={() => setShowManualAdd(!showManualAdd)}
              aria-expanded={showManualAdd}
              className="btn-ghost"
            >
              {showManualAdd ? 'Hide Manual Add' : 'Add Monsters Manually'}
            </button>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-[var(--text-2)]">
              <input
                type="checkbox" checked={includeMap}
                onChange={e => setIncludeMap(e.target.checked)}
              />
              Include battle map
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              aria-expanded={showFilters}
              className="btn-ghost text-sm"
            >
              {showFilters ? 'Hide' : 'Show'} Monster Filters
            </button>
            <ResetGeneratorButton onReset={handleReset} label="Reset Builder" />
          </div>
        </div>

        {encounter && (
          <div className="mt-4 flex flex-col gap-3 border-t border-[var(--line-subtle)] pt-4 sm:flex-row sm:items-center">
            <span className="micro-label shrink-0">Current encounter</span>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleExport} className="btn-secondary text-sm">
                Export JSON
              </button>
              <PrintButton label="Print Encounter" />
              {encounter.monsters.length > 0 && (
                savingName === null ? (
                  <button
                    type="button"
                    onClick={() => setSavingName(encounter.name)}
                    className="btn-secondary text-sm"
                  >
                    Save Encounter
                  </button>
                ) : (
                  <span className="flex flex-wrap items-center gap-1">
                    <label htmlFor="save-encounter-name" className="sr-only">
                      Name for this saved encounter
                    </label>
                    <input
                      id="save-encounter-name"
                      type="text"
                      className="w-44 text-sm"
                      value={savingName}
                      autoFocus
                      onChange={(e) => setSavingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEncounter();
                        if (e.key === 'Escape') setSavingName(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleSaveEncounter}
                      className="btn-primary text-sm"
                      aria-label="Save encounter"
                    >
                      <Check size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSavingName(null)}
                      className="btn-secondary text-sm"
                      aria-label="Cancel saving"
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </span>
                )
              )}
              {isSeeded && (
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="btn-secondary text-sm"
                  aria-describedby="share-link-description"
                >
                  {linkCopied ? 'Link Copied' : 'Copy Share Link'}
                </button>
              )}
              <span id="share-link-description" className="sr-only">
                The link recreates this encounter using the built-in bestiary.
              </span>
            </div>
          </div>
        )}

        {showFilters && (
          <div className="mt-4 animate-fade-in">
            <FilterPanel filter={monsterFilter} onChange={setMonsterFilter} />
          </div>
        )}
      </div>

      {/* Saved Encounters */}
      {savedHydrated && savedEncounters.length > 0 && (
        <details className="card mb-6 print:hidden">
          <summary className="cursor-pointer font-display">
            Saved Encounters ({savedEncounters.length})
          </summary>
          <ul className="mt-3 divide-y divide-[var(--steel-800)]">
            {savedEncounters.map((saved) => (
              <li key={saved.id} className="flex items-center justify-between py-2 gap-2 text-sm">
                <div className="min-w-0">
                  <span className="font-bold">{saved.name}</span>
                  <span className="text-[var(--text-2)] ml-2">
                    {saved.encounter.difficulty} ·{' '}
                    {saved.encounter.monsters.reduce((sum, em) => sum + em.monster.hitPoints * em.count, 0).toLocaleString()} HP ·{' '}
                    {saved.encounter.monsters.reduce((s, em) => s + em.count, 0)} monsters ·{' '}
                    {new Date(saved.savedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
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
                    className="text-[var(--accent-danger)] hover:text-[var(--accent-danger-light)] px-1 inline-flex items-center"
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
        <div className="card mb-6 animate-fade-in print:hidden">
          <h3 className="text-lg mb-3">Add Monsters</h3>
          <input
            id="enc-manual-search"
            type="text"
            placeholder="Search monsters by name..."
            aria-label="Search monsters to add"
            value={manualSearch}
            onChange={e => setManualSearch(e.target.value)}
            className="w-full mb-3"
          />
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
            {manualResults.map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleAddMonster(m)}
                className="text-left p-2 rounded bg-[var(--steel-950)] hover:bg-[var(--steel-800)] transition-colors text-sm"
              >
                <span className="font-bold">{m.name}</span>
                <span className="text-[var(--bronze)] ml-2">CR {crDisplay(m.challengeRating)}</span>
                <div className="text-xs text-[var(--text-2)]">
                  {m.size} {m.type} | AC {m.armor.ac} | HP {m.hitPoints}
                </div>
              </button>
            ))}
          </div>
        </div>
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
          {/* Encounter Header */}
          <div className="card">
            <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row">
              {editingDetails ? (
                <>
                  <label htmlFor="encounter-name" className="sr-only">Encounter name</label>
                  <input
                    id="encounter-name"
                    type="text"
                    value={encounter.name}
                    onChange={e => updateEncounterNarrative('name', e.target.value)}
                    className="text-2xl font-bold flex-1 print:hidden"
                  />
                  <h2 className="text-2xl hidden print:block">{encounter.name}</h2>
                </>
              ) : (
                <h2 className="text-2xl">{encounter.name}</h2>
              )}
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                {summary.assessment && <DifficultyBadge difficulty={summary.assessment} />}
                <button
                  type="button"
                  onClick={() => setEditingDetails(value => !value)}
                  className={editingDetails ? 'btn-primary text-xs print:hidden' : 'btn-secondary text-xs print:hidden'}
                >
                  {editingDetails ? 'Done Editing' : 'Edit Details'}
                </button>
              </div>
            </div>
            {editingDetails ? (
              <>
                <label htmlFor="encounter-description" className="micro-label block mb-1 print:hidden">Description</label>
                <textarea
                  id="encounter-description"
                  value={encounter.description}
                  onChange={e => updateEncounterNarrative('description', e.target.value)}
                  rows={3}
                  className="w-full mb-4 print:hidden"
                />
                {encounter.description && (
                  <p className="text-[var(--text-2)] mb-4 italic hidden print:block">{encounter.description}</p>
                )}
              </>
            ) : encounter.description && (
              <p className="text-[var(--text-2)] mb-4 italic">{encounter.description}</p>
            )}

            <div className="grid sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-[var(--bronze)] font-bold">Monster HP: </span>
                {summary.totalMonsterHp.toLocaleString()}
              </div>
              <div>
                <span className="text-[var(--bronze)] font-bold">Creatures: </span>
                {summary.monsterCount}
              </div>
              <div>
                <span className="text-[var(--bronze)] font-bold">Environment: </span>
                {encounter.environment}
              </div>
              <div>
                <span className="text-[var(--text-2)] font-bold">Rules XP: </span>
                {summary.totalXp.toLocaleString()}
                <span className="text-xs text-[var(--text-2)] block">
                  {difficulty} cap {summary.budgets[difficulty].toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Battle Forecast */}
          <section className="relative overflow-hidden rounded-lg border-2 border-[var(--bronze)] bg-[linear-gradient(135deg,rgba(188,138,67,0.18),rgba(49,57,72,0.92))] p-5 shadow-lg print:hidden">
            <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[rgba(188,138,67,0.14)]" aria-hidden="true" />
            <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="rounded-full bg-[var(--bronze)] p-2 text-[#1d1105]">
                  <Swords size={24} aria-hidden="true" />
                </span>
                <div>
                  <h3 className="text-2xl">Battle Forecast</h3>
                  <p className="text-sm text-[var(--text-2)] max-w-2xl">
                    Simulate 1,000 battles to see win rate, remaining party HP, likely knockouts, and the deadliest monster.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleForecastClick}
                disabled={simRunning}
                className="btn-primary text-base whitespace-nowrap disabled:opacity-50 disabled:cursor-wait"
              >
                {simRunning ? 'Forecasting…' : report ? 'Refresh Forecast' : 'Run Battle Forecast'}
              </button>
            </div>
          </section>
          {showPartySetup && (
            <div
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
                  setShowPartySetup(false);
                  if (encounter && encounter.monsters.length > 0) {
                    runForecast(config, encounter);
                  }
                }}
                onCancel={() => setShowPartySetup(false)}
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

          {/* Monsters */}
          <div className="card">
            <h3 className="text-xl mb-4">Monsters</h3>
            <div className="space-y-3">
              {encounter.monsters.map(em => (
                <div key={em.monster.id}>
                  <div className="flex flex-col gap-3 rounded-lg bg-[var(--steel-950)] p-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => setExpandedMonster(
                        expandedMonster === em.monster.id ? null : em.monster.id
                      )}
                      aria-expanded={expandedMonster === em.monster.id}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left transition-colors hover:text-[var(--bronze-light)]"
                    >
                      <span className="bg-[var(--steel-800)] text-[var(--bronze)] rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
                        {em.count}x
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
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--steel-800)] text-[var(--bronze)] transition-colors hover:bg-[var(--steel-700)] print:hidden"
                        title="Add one more"
                        aria-label={`Add one more ${em.monster.name}`}
                      ><Plus size={16} aria-hidden="true" /></button>
                      <button
                        type="button"
                        onClick={() => handleRemoveMonster(em.monster.id)}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--steel-800)] text-[var(--accent-danger)] transition-colors hover:bg-[var(--steel-700)] print:hidden"
                        title="Remove one"
                        aria-label={`Remove one ${em.monster.name}`}
                      ><Minus size={16} aria-hidden="true" /></button>
                    </div>
                  </div>

                  {expandedMonster === em.monster.id && (
                    <div className="mt-2 ml-4 animate-fade-in print:hidden">
                      <MonsterStatBlock monster={em.monster} />
                    </div>
                  )}
                  <div className="hidden print:block mt-4 break-inside-avoid">
                    <MonsterStatBlock monster={em.monster} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tactics */}
          {(encounter.tactics || editingDetails) && (
            <div className={`card ${!encounter.tactics ? 'print:hidden' : ''}`}>
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
            <div className="card">
              <h3 className="text-xl mb-3">Treasure</h3>
              <p className="text-sm text-[var(--text-2)]">{encounter.treasure}</p>
            </div>
          )}

          {/* Map */}
          {encounter.map && (
            <div className="card overflow-x-auto">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-xl">Battle Map</h3>
                  <p className="text-xs text-[var(--text-2)] print:hidden">
                    {mapWidth}×{mapHeight} · {mapFeatureDensity} objects · {mapTerrainVariety} terrain
                  </p>
                </div>
                <button type="button" onClick={handleRegenerateMap} className="btn-secondary text-sm print:hidden">
                  Regenerate Map
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
              {encounter.map.rooms && <RoomKeyPanel rooms={encounter.map.rooms} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Difficulty Meter ─────────────────────────────────────────────

function DifficultyMeter({
  assessment,
  totalMonsterHp,
  totalXp,
}: {
  assessment: Difficulty | null;
  totalMonsterHp: number;
  totalXp: number;
}) {
  const activeIndex = assessment ? DIFFICULTIES.indexOf(assessment) : -1;
  const colors = ['#6f7785', '#7acb9a', '#e3c567', '#e69c55', '#d05a59'];

  return (
    <div className="mt-3" role="group" aria-label="Encounter difficulty and monster hit points">
      <div className="grid grid-cols-5 gap-1 text-[10px] sm:text-xs text-center text-[var(--text-2)] mb-1">
        {DIFFICULTIES.map(level => (
          <span key={level} className={assessment === level ? 'font-bold text-[var(--text-1)]' : ''}>
            {level}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1 h-7 rounded overflow-hidden" aria-hidden="true">
        {DIFFICULTIES.map((level, index) => (
          <div
            key={level}
            className="transition-all duration-300 border border-[var(--steel-800)]"
            style={{
              backgroundColor: index <= activeIndex ? colors[index] : 'var(--steel-950)',
              opacity: index <= activeIndex ? 1 : 0.65,
            }}
          />
        ))}
      </div>
      <div className="flex justify-between items-baseline gap-3 mt-1">
        <span className="text-sm font-bold text-[var(--bronze)]">
          {totalMonsterHp.toLocaleString()} monster HP
        </span>
        <span className="text-[10px] text-[var(--text-2)]" title="Used for the official 2024 encounter budget calculation">
          {totalXp.toLocaleString()} rules XP
        </span>
      </div>
    </div>
  );
}
