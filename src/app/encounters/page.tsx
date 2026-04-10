'use client';

import { useState, useMemo, useCallback } from 'react';
import { ALL_MONSTERS } from '@/data';
import { filterMonsters } from '@/lib/monster-filter';
import {
  generateEncounter,
  getPartyXpThreshold,
  getEncounterDifficulty,
} from '@/lib/encounter-generator';
import { generateMap } from '@/lib/map-generator';
import type {
  Encounter, EncounterMonster, Difficulty, Environment,
  Party, Monster, MonsterFilter,
} from '@/lib/types';
import { getEncounterMultiplier } from '@/lib/types';
import DifficultyBadge from '@/components/DifficultyBadge';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import MapGrid from '@/components/MapGrid';
import FilterPanel from '@/components/FilterPanel';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard', 'Deadly'];
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

export default function EncounterPage() {
  const [partySize, setPartySize] = useState(4);
  const [partyLevel, setPartyLevel] = useState(3);
  const [difficulty, setDifficulty] = useState<Difficulty>('Medium');
  const [environment, setEnvironment] = useState<Environment>('Forest');
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [monsterFilter, setMonsterFilter] = useState<MonsterFilter>({});
  const [expandedMonster, setExpandedMonster] = useState<string | null>(null);
  const [includeMap, setIncludeMap] = useState(true);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualSearch, setManualSearch] = useState('');

  // Current party for XP calculations
  const party = useMemo(() => buildParty(partySize, partyLevel), [partySize, partyLevel]);

  // XP thresholds for the difficulty meter
  const thresholds = useMemo(() => ({
    easy: getPartyXpThreshold(party, 'Easy'),
    medium: getPartyXpThreshold(party, 'Medium'),
    hard: getPartyXpThreshold(party, 'Hard'),
    deadly: getPartyXpThreshold(party, 'Deadly'),
  }), [party]);

  // Current encounter XP (for real-time difficulty)
  const encounterXp = useMemo(() => {
    if (!encounter) return { total: 0, adjusted: 0, count: 0 };
    const total = encounter.monsters.reduce((s, em) => s + em.monster.xp * em.count, 0);
    const count = encounter.monsters.reduce((s, em) => s + em.count, 0);
    const mult = getEncounterMultiplier(count, partySize);
    return { total, adjusted: Math.round(total * mult), count };
  }, [encounter, partySize]);

  const currentDifficulty = useMemo(() => {
    if (!encounter || encounterXp.count === 0) return null;
    return getEncounterDifficulty(encounterXp.total, encounterXp.count, party);
  }, [encounter, encounterXp, party]);

  // Monsters for manual add search
  const manualResults = useMemo(() => {
    if (!manualSearch.trim()) return ALL_MONSTERS.slice(0, 20);
    return filterMonsters(ALL_MONSTERS, { search: manualSearch }).slice(0, 20);
  }, [manualSearch]);

  function handleGenerate() {
    const enc = generateEncounter(
      ALL_MONSTERS,
      { party, difficulty, environment, filter: monsterFilter },
      filterMonsters
    );
    if (includeMap) {
      enc.map = generateMap({ environment, seed: Date.now() });
    }
    setEncounter(enc);
    setExpandedMonster(null);
  }

  const handleAddMonster = useCallback((monster: Monster) => {
    setEncounter(prev => {
      if (!prev) {
        // Create a new encounter shell
        return {
          id: `enc-${Date.now()}`,
          name: 'Custom Encounter',
          description: 'A manually built encounter.',
          environment,
          difficulty: 'Medium',
          monsters: [{ monster, count: 1 }],
          totalXp: monster.xp,
          adjustedXp: monster.xp,
        };
      }
      const existing = prev.monsters.find(em => em.monster.id === monster.id);
      const monsters = existing
        ? prev.monsters.map(em =>
            em.monster.id === monster.id ? { ...em, count: em.count + 1 } : em
          )
        : [...prev.monsters, { monster, count: 1 }];
      const totalXp = monsters.reduce((s, em) => s + em.monster.xp * em.count, 0);
      const totalCount = monsters.reduce((s, em) => s + em.count, 0);
      const mult = getEncounterMultiplier(totalCount, partySize);
      return { ...prev, monsters, totalXp, adjustedXp: Math.round(totalXp * mult) };
    });
  }, [environment, partySize]);

  const handleRemoveMonster = useCallback((monsterId: string) => {
    setEncounter(prev => {
      if (!prev) return prev;
      const monsters = prev.monsters
        .map(em => em.monster.id === monsterId ? { ...em, count: em.count - 1 } : em)
        .filter(em => em.count > 0);
      const totalXp = monsters.reduce((s, em) => s + em.monster.xp * em.count, 0);
      const totalCount = monsters.reduce((s, em) => s + em.count, 0);
      const mult = getEncounterMultiplier(totalCount, partySize);
      return { ...prev, monsters, totalXp, adjustedXp: Math.round(totalXp * mult) };
    });
  }, [partySize]);

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
              onChange={e => setPartySize(Math.max(1, Number(e.target.value)))}
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
        <DifficultyMeter thresholds={thresholds} adjustedXp={encounterXp.adjusted} />

        <div className="flex flex-wrap items-center gap-3 mt-4">
          <button type="button" onClick={handleGenerate} className="btn-gold text-lg">
            Auto-Generate
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
        </div>

        {showFilters && (
          <div className="mt-4 animate-fade-in">
            <FilterPanel filter={monsterFilter} onChange={setMonsterFilter} />
          </div>
        )}
      </div>

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
              {currentDifficulty && <DifficultyBadge difficulty={currentDifficulty} />}
            </div>
            {encounter.description && (
              <p className="text-[var(--parchment-dark)] mb-4 italic">{encounter.description}</p>
            )}

            <div className="grid sm:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-[var(--gold)] font-bold">Total XP: </span>
                {encounterXp.total.toLocaleString()}
              </div>
              <div>
                <span className="text-[var(--gold)] font-bold">Adjusted XP: </span>
                {encounterXp.adjusted.toLocaleString()}
              </div>
              <div>
                <span className="text-[var(--gold)] font-bold">Monsters: </span>
                {encounterXp.count}
              </div>
              <div>
                <span className="text-[var(--gold)] font-bold">Environment: </span>
                {encounter.environment}
              </div>
            </div>
          </div>

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
  thresholds,
  adjustedXp,
}: {
  thresholds: { easy: number; medium: number; hard: number; deadly: number };
  adjustedXp: number;
}) {
  const max = thresholds.deadly * 1.3;
  const pct = (v: number) => Math.min((v / max) * 100, 100);

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-[var(--parchment-dark)] mb-1">
        <span>Easy ({thresholds.easy})</span>
        <span>Medium ({thresholds.medium})</span>
        <span>Hard ({thresholds.hard})</span>
        <span>Deadly ({thresholds.deadly})</span>
      </div>
      <div className="relative h-6 bg-[var(--dungeon-dark)] rounded overflow-hidden border border-[var(--dungeon-accent)]">
        {/* Threshold markers */}
        <div className="absolute top-0 bottom-0 border-r border-green-600" style={{ left: `${pct(thresholds.easy)}%` }} />
        <div className="absolute top-0 bottom-0 border-r border-yellow-600" style={{ left: `${pct(thresholds.medium)}%` }} />
        <div className="absolute top-0 bottom-0 border-r border-orange-600" style={{ left: `${pct(thresholds.hard)}%` }} />
        <div className="absolute top-0 bottom-0 border-r border-red-600" style={{ left: `${pct(thresholds.deadly)}%` }} />

        {/* Current XP bar */}
        {adjustedXp > 0 && (
          <div
            className="absolute top-0 bottom-0 transition-all duration-300"
            style={{
              width: `${pct(adjustedXp)}%`,
              background: adjustedXp >= thresholds.deadly
                ? 'linear-gradient(90deg, #2e7d32, #f57f17, #d84315, #b71c1c)'
                : adjustedXp >= thresholds.hard
                ? 'linear-gradient(90deg, #2e7d32, #f57f17, #d84315)'
                : adjustedXp >= thresholds.medium
                ? 'linear-gradient(90deg, #2e7d32, #f57f17)'
                : '#2e7d32',
            }}
          />
        )}

        {/* XP label */}
        {adjustedXp > 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white drop-shadow-md">
            {adjustedXp.toLocaleString()} XP (adjusted)
          </div>
        )}
      </div>
    </div>
  );
}
