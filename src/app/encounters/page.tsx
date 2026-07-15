'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { filterMonsters } from '@/lib/monster-filter';
import { useMonsters } from '@/app/hooks/useMonsters';
import {
  assessEncounterDifficulty,
  generateEncounter,
  summarizeEncounter,
} from '@/lib/encounter-generator';
import { generateMap } from '@/lib/map-generator';
import { randomSeed } from '@/lib/random';
import type {
  Encounter, Difficulty, Environment,
  Party, Monster, MonsterFilter,
} from '@/lib/types';
import DifficultyBadge from '@/components/DifficultyBadge';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import MapGrid from '@/components/MapGrid';
import FilterPanel from '@/components/FilterPanel';
import PartySetupPanel from '@/components/PartySetupPanel';
import BattleReportCard from '@/components/BattleReportCard';
import { simulateBattle } from '@/lib/battle-sim';
import { monsterToSimMonster } from '@/lib/monster-to-sim';
import { buildSimPlayer, defaultPartyConfig } from '@/data/class-templates';
import { usePersistentState } from '@/lib/use-persistent-state';
import { storageLoad, storageSave } from '@/lib/storage';
import {
  PARTY_CONFIG_STORAGE_KEY,
  type BattleReport,
  type PartyConfig,
} from '@/lib/battle-sim-types';

const DIFFICULTIES: Difficulty[] = ['Low', 'Moderate', 'High'];
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
  filter: MonsterFilter;
  seed: number;
}

function writeUrl(cfg: GenerateConfig): void {
  const params = new URLSearchParams();
  params.set('size', String(cfg.partySize));
  params.set('level', String(cfg.partyLevel));
  params.set('diff', cfg.difficulty);
  params.set('env', cfg.environment);
  if (cfg.includeMap) params.set('map', '1');
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
  const [difficulty, setDifficulty] = useState<Difficulty>('Moderate');
  const [environment, setEnvironment] = useState<Environment>('Forest');
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [isSeeded, setIsSeeded] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [monsterFilter, setMonsterFilter] = useState<MonsterFilter>({});
  const [expandedMonster, setExpandedMonster] = useState<string | null>(null);
  const [includeMap, setIncludeMap] = useState(true);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualSearch, setManualSearch] = useState('');

  // Battle Forecast state
  const [partyConfig, setPartyConfig] = usePersistentState<PartyConfig | null>(
    PARTY_CONFIG_STORAGE_KEY,
    null,
    (v): v is PartyConfig | null => v === null || isPartyConfig(v),
  );
  const [showPartySetup, setShowPartySetup] = useState(false);
  const [report, setReport] = useState<BattleReport | null>(null);
  const [reportSignature, setReportSignature] = useState('');
  const [simRunning, setSimRunning] = useState(false);

  // Saved encounters + save-name input
  const [savedEncounters, setSavedEncounters, savedHydrated] =
    usePersistentState<SavedEncounter[]>('savedEncounters', []);
  const [savingName, setSavingName] = useState<string | null>(null);

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
      setDifficulty(stored.difficulty);
      setEnvironment(stored.environment);
      setIncludeMap(stored.includeMap);
    }
    settingsHydrated.current = true;
  }, []);
  useEffect(() => {
    if (!settingsHydrated.current) return;
    storageSave('encounterSettings', {
      partySize, partyLevel, difficulty, environment, includeMap,
    } satisfies EncounterSettings);
  }, [partySize, partyLevel, difficulty, environment, includeMap]);

  // Current party for XP budgets
  const party = useMemo(() => buildParty(partySize, partyLevel), [partySize, partyLevel]);

  // The single source of XP truth for the meter, badge, and header stats
  const summary = useMemo(
    () => summarizeEncounter(encounter?.monsters ?? [], party),
    [encounter, party],
  );

  // Monsters for manual add search
  const manualResults = useMemo(() => {
    if (!manualSearch.trim()) return allMonsters.slice(0, 20);
    return filterMonsters(allMonsters, { search: manualSearch }).slice(0, 20);
  }, [allMonsters, manualSearch]);

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
      enc.map = generateMap({ environment: cfg.environment, seed: cfg.seed });
    }
    setEncounter(enc);
    setIsSeeded(true);
    setLinkCopied(false);
    setExpandedMonster(null);
    writeUrl(cfg);
  }, [allMonsters]);

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

    if (size !== null) setPartySize(size);
    if (level !== null) setPartyLevel(level);
    if (isDifficulty(diff)) setDifficulty(diff);
    if (isEnvironment(env)) setEnvironment(env);
    if (Object.keys(filter).length > 0) setMonsterFilter(filter);
    if (seed !== null) setIncludeMap(withMap);

    if (seed !== null && size !== null && level !== null && isDifficulty(diff) && isEnvironment(env)) {
      runGenerate({
        partySize: size,
        partyLevel: level,
        difficulty: diff,
        environment: env,
        includeMap: withMap,
        filter,
        seed,
      });
    }
  }, [searchParams, runGenerate]);

  function handleGenerate() {
    runGenerate({
      partySize, partyLevel, difficulty, environment,
      includeMap, filter: monsterFilter, seed: randomSeed(),
    });
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
      setReport(simulateBattle(players, monsters, { seed: randomSeed() }));
      setReportSignature(encounterSignature(enc));
      setSimRunning(false);
    }, 30);
  }, []);

  function handleForecastClick() {
    if (!encounter || encounter.monsters.length === 0) return;
    if (!partyConfig || partyConfig.members.length === 0) {
      setShowPartySetup(true);
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
  }, [environment, party]);

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
  }, [party]);

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
  }, []);

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold text-[var(--gold)] mb-6">Encounter Builder</h1>

      {/* Controls */}
      <div className="card mb-6">
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">
              Party Size
            </label>
            <input
              type="number" min={1} max={10} value={partySize}
              onChange={e => setPartySize(Math.max(1, Math.min(10, Number(e.target.value))))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">
              Party Level
            </label>
            <input
              type="number" min={1} max={20} value={partyLevel}
              onChange={e => setPartyLevel(Math.max(1, Math.min(20, Number(e.target.value))))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">
              Difficulty
            </label>
            <select value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)} className="w-full">
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">
              Environment
            </label>
            <select value={environment} onChange={e => setEnvironment(e.target.value as Environment)} className="w-full">
              {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>

        {/* Difficulty Meter */}
        <DifficultyMeter budgets={summary.budgets} totalXp={summary.totalXp} />

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button type="button" onClick={handleGenerate} className="btn-gold text-lg">
            Auto-Generate
          </button>
          <button
            type="button"
            onClick={handleForecastClick}
            disabled={!encounter || encounter.monsters.length === 0 || simRunning}
            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              !encounter || encounter.monsters.length === 0
                ? 'Generate or build an encounter first'
                : 'Simulate this battle 1,000 times'
            }
          >
            ⚔ Battle Forecast
          </button>
          <button
            type="button"
            onClick={() => setShowManualAdd(!showManualAdd)}
            className="btn-primary"
          >
            {showManualAdd ? 'Hide' : 'Add Monsters Manually'}
          </button>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox" checked={includeMap}
              onChange={e => setIncludeMap(e.target.checked)}
              className="accent-[var(--gold)]"
            />
            Include Map
          </label>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary text-sm"
          >
            {showFilters ? 'Hide' : 'Show'} Monster Filters
          </button>
          {encounter && (
            <button type="button" onClick={handleExport} className="btn-secondary text-sm">
              Export JSON
            </button>
          )}
          {encounter && encounter.monsters.length > 0 && (
            savingName === null ? (
              <button
                type="button"
                onClick={() => setSavingName(encounter.name)}
                className="btn-secondary text-sm"
              >
                Save
              </button>
            ) : (
              <span className="flex items-center gap-1">
                <label htmlFor="save-encounter-name" className="sr-only">
                  Name for this saved encounter
                </label>
                <input
                  id="save-encounter-name"
                  type="text"
                  className="text-sm w-44"
                  value={savingName}
                  autoFocus
                  onChange={(e) => setSavingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEncounter();
                    if (e.key === 'Escape') setSavingName(null);
                  }}
                />
                <button type="button" onClick={handleSaveEncounter} className="btn-gold text-sm">
                  ✓
                </button>
                <button
                  type="button"
                  onClick={() => setSavingName(null)}
                  className="btn-secondary text-sm"
                  aria-label="Cancel saving"
                >
                  ✕
                </button>
              </span>
            )
          )}
          {encounter && isSeeded && (
            <button
              type="button"
              onClick={handleCopyLink}
              className="btn-secondary text-sm"
              title="Anyone opening this link regenerates this exact encounter (with the built-in bestiary)"
            >
              {linkCopied ? 'Copied!' : 'Copy Link'}
            </button>
          )}
        </div>

        {showFilters && (
          <div className="mt-4 animate-fade-in">
            <FilterPanel filter={monsterFilter} onChange={setMonsterFilter} />
          </div>
        )}
      </div>

      {/* Saved Encounters */}
      {savedHydrated && savedEncounters.length > 0 && (
        <details className="card mb-6">
          <summary className="cursor-pointer font-bold text-[var(--gold)]">
            Saved Encounters ({savedEncounters.length})
          </summary>
          <ul className="mt-3 divide-y divide-[var(--dungeon-accent)]">
            {savedEncounters.map((saved) => (
              <li key={saved.id} className="flex items-center justify-between py-2 gap-2 text-sm">
                <div className="min-w-0">
                  <span className="font-bold">{saved.name}</span>
                  <span className="text-[var(--parchment-dark)] ml-2">
                    {saved.encounter.difficulty} · {saved.encounter.totalXp.toLocaleString()} XP ·{' '}
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
                    className="text-red-400 hover:text-red-300 px-1"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Battle Forecast party setup */}
      {showPartySetup && (
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
      )}

      {/* Manual Monster Add Panel */}
      {showManualAdd && (
        <div className="card mb-6 animate-fade-in">
          <h3 className="text-lg font-bold text-[var(--gold)] mb-3">Add Monsters</h3>
          <input
            type="text"
            placeholder="Search monsters by name..."
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
                className="text-left p-2 rounded bg-[var(--dungeon-dark)] hover:bg-[var(--dungeon-accent)] transition-colors text-sm"
              >
                <span className="font-bold">{m.name}</span>
                <span className="text-[var(--gold)] ml-2">CR {crDisplay(m.challengeRating)}</span>
                <div className="text-xs text-[var(--parchment-dark)]">
                  {m.size} {m.type} | AC {m.armor.ac} | HP {m.hitPoints}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {encounter && encounter.monsters.length > 0 && (
        <div className="animate-fade-in space-y-6">
          {/* Encounter Header */}
          <div className="card">
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-2xl font-bold text-[var(--gold)]">{encounter.name}</h2>
              {summary.assessment && <DifficultyBadge difficulty={summary.assessment} />}
            </div>
            {encounter.description && (
              <p className="text-[var(--parchment-dark)] mb-4 italic">{encounter.description}</p>
            )}

            <div className="grid sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-[var(--gold)] font-bold">Total XP: </span>
                {summary.totalXp.toLocaleString()}
              </div>
              <div>
                <span className="text-[var(--gold)] font-bold">{difficulty} Budget: </span>
                {summary.budgets[difficulty].toLocaleString()}
              </div>
              <div>
                <span className="text-[var(--gold)] font-bold">Monsters: </span>
                {summary.monsterCount}
              </div>
              <div>
                <span className="text-[var(--gold)] font-bold">Environment: </span>
                {encounter.environment}
              </div>
            </div>
          </div>

          {/* Battle Forecast */}
          {simRunning && (
            <div className="card animate-pulse" role="status" aria-label="Running battle forecast">
              <h3 className="text-xl font-bold text-[var(--gold)] mb-2">Battle Forecast</h3>
              <p className="text-sm text-[var(--parchment-dark)]">
                Simulating 1,000 battles…
              </p>
              <div className="h-24 mt-3 rounded bg-[var(--dungeon-dark)]" />
            </div>
          )}
          {!simRunning && report && summary.assessment && (
            <BattleReportCard
              report={report}
              xpLabel={summary.assessment}
              stale={reportSignature !== encounterSignature(encounter)}
              onRerun={() => encounter && partyConfig && runForecast(partyConfig, encounter)}
              onEditParty={() => setShowPartySetup(true)}
            />
          )}

          {/* Monsters */}
          <div className="card">
            <h3 className="text-xl font-bold text-[var(--gold)] mb-4">Monsters</h3>
            <div className="space-y-3">
              {encounter.monsters.map(em => (
                <div key={em.monster.id}>
                  <div className="flex items-center justify-between p-3 rounded bg-[var(--dungeon-dark)]">
                    <button
                      type="button"
                      onClick={() => setExpandedMonster(
                        expandedMonster === em.monster.id ? null : em.monster.id
                      )}
                      className="flex items-center gap-3 text-left flex-1 hover:opacity-80 transition-opacity"
                    >
                      <span className="bg-[var(--dragon-red)] text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm">
                        {em.count}x
                      </span>
                      <div>
                        <span className="font-bold">{em.monster.name}</span>
                        <span className="text-sm text-[var(--parchment-dark)] ml-2">
                          CR {crDisplay(em.monster.challengeRating)} | AC {em.monster.armor.ac} | HP {em.monster.hitPoints}
                        </span>
                      </div>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--gold)]">
                        {(em.monster.xp * em.count).toLocaleString()} XP
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAddMonster(em.monster)}
                        className="w-7 h-7 rounded bg-green-800 hover:bg-green-700 text-white font-bold text-sm"
                        title="Add one more"
                      >+</button>
                      <button
                        type="button"
                        onClick={() => handleRemoveMonster(em.monster.id)}
                        className="w-7 h-7 rounded bg-red-800 hover:bg-red-700 text-white font-bold text-sm"
                        title="Remove one"
                      >-</button>
                    </div>
                  </div>

                  {expandedMonster === em.monster.id && (
                    <div className="mt-2 ml-4 animate-fade-in">
                      <MonsterStatBlock monster={em.monster} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tactics */}
          {encounter.tactics && (
            <div className="card">
              <h3 className="text-xl font-bold text-[var(--gold)] mb-3">Tactics</h3>
              <div className="text-sm text-[var(--parchment-dark)] whitespace-pre-line">
                {encounter.tactics}
              </div>
            </div>
          )}

          {/* Treasure */}
          {encounter.treasure && (
            <div className="card">
              <h3 className="text-xl font-bold text-[var(--gold)] mb-3">Treasure</h3>
              <p className="text-sm text-[var(--parchment-dark)]">{encounter.treasure}</p>
            </div>
          )}

          {/* Map */}
          {encounter.map && (
            <div className="card overflow-x-auto">
              <h3 className="text-xl font-bold text-[var(--gold)] mb-3">Battle Map</h3>
              <MapGrid map={encounter.map} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Difficulty Meter ─────────────────────────────────────────────

function DifficultyMeter({
  budgets,
  totalXp,
}: {
  budgets: Record<Difficulty, number>;
  totalXp: number;
}) {
  // The zone past High is "Extreme" territory; scale the bar so it exists.
  const max = budgets.High * 1.3;
  const pct = (v: number) => Math.min((v / max) * 100, 100);

  const gradient =
    totalXp > budgets.High
      ? 'linear-gradient(90deg, #2e7d32, #f57f17, #d84315, #b71c1c)'
      : totalXp > budgets.Moderate
      ? 'linear-gradient(90deg, #2e7d32, #f57f17, #d84315)'
      : totalXp > budgets.Low
      ? 'linear-gradient(90deg, #2e7d32, #f57f17)'
      : '#2e7d32';

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-[var(--parchment-dark)] mb-1">
        <span>Low ({budgets.Low.toLocaleString()})</span>
        <span>Moderate ({budgets.Moderate.toLocaleString()})</span>
        <span>High ({budgets.High.toLocaleString()})</span>
        <span className="text-[#b71c1c] font-bold">Extreme</span>
      </div>
      <div className="relative h-6 bg-[var(--dungeon-dark)] rounded overflow-hidden border border-[var(--dungeon-accent)]">
        {/* Budget markers */}
        <div className="absolute top-0 bottom-0 border-r border-green-600" style={{ left: `${pct(budgets.Low)}%` }} />
        <div className="absolute top-0 bottom-0 border-r border-yellow-600" style={{ left: `${pct(budgets.Moderate)}%` }} />
        <div className="absolute top-0 bottom-0 border-r border-red-600" style={{ left: `${pct(budgets.High)}%` }} />

        {/* Current XP bar */}
        {totalXp > 0 && (
          <div
            className="absolute top-0 bottom-0 transition-all duration-300"
            style={{ width: `${pct(totalXp)}%`, background: gradient }}
          />
        )}

        {/* XP label */}
        {totalXp > 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-md">
            {totalXp.toLocaleString()} XP
          </div>
        )}
      </div>
    </div>
  );
}
