'use client';

import { useState } from 'react';
import { SRD_MONSTERS } from '@/data/srd-monsters';
import { filterMonsters } from '@/lib/monster-filter';
import { generateEncounter } from '@/lib/encounter-generator';
import { generateMap } from '@/lib/map-generator';
import type { Encounter, Difficulty, Environment, Party, MonsterFilter } from '@/lib/types';
import DifficultyBadge from '@/components/DifficultyBadge';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import MapGrid from '@/components/MapGrid';
import FilterPanel from '@/components/FilterPanel';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard', 'Deadly'];
const ENVIRONMENTS: Environment[] = [
  'Arctic', 'Coastal', 'Desert', 'Forest', 'Grassland', 'Hill',
  'Mountain', 'Swamp', 'Underdark', 'Underwater', 'Urban',
];

function crDisplay(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return cr.toString();
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

  function handleGenerate() {
    const party: Party = {
      id: 'party',
      name: 'Adventuring Party',
      members: Array.from({ length: partySize }, (_, i) => ({
        name: `Player ${i + 1}`,
        level: partyLevel,
        className: 'Adventurer',
      })),
    };

    const enc = generateEncounter(
      SRD_MONSTERS,
      { party, difficulty, environment, filter: monsterFilter },
      filterMonsters
    );

    if (includeMap) {
      enc.map = generateMap({ environment, seed: Date.now() });
    }

    setEncounter(enc);
    setExpandedMonster(null);
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold text-[var(--gold)] mb-6">Encounter Generator</h1>

      {/* Controls */}
      <div className="card mb-6">
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">
              Party Size
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={partySize}
              onChange={e => setPartySize(Math.max(1, Number(e.target.value)))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">
              Party Level
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={partyLevel}
              onChange={e => setPartyLevel(Math.max(1, Math.min(20, Number(e.target.value))))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">
              Difficulty
            </label>
            <select
              value={difficulty}
              onChange={e => setDifficulty(e.target.value as Difficulty)}
              className="w-full"
            >
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">
              Environment
            </label>
            <select
              value={environment}
              onChange={e => setEnvironment(e.target.value as Environment)}
              className="w-full"
            >
              {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={handleGenerate} className="btn-gold text-lg">
            Generate Encounter
          </button>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={includeMap}
              onChange={e => setIncludeMap(e.target.checked)}
              className="accent-[var(--gold)]"
            />
            Include Battle Map
          </label>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className="btn-secondary text-sm"
          >
            {showFilters ? 'Hide' : 'Show'} Monster Filters
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 animate-fade-in">
            <FilterPanel filter={monsterFilter} onChange={setMonsterFilter} />
          </div>
        )}
      </div>

      {/* Results */}
      {encounter && (
        <div className="animate-fade-in space-y-6">
          {/* Encounter Header */}
          <div className="card">
            <div className="flex items-start justify-between mb-3">
              <h2 className="text-2xl font-bold text-[var(--gold)]">{encounter.name}</h2>
              <DifficultyBadge difficulty={encounter.difficulty} />
            </div>
            <p className="text-[var(--parchment-dark)] mb-4 italic">{encounter.description}</p>

            <div className="grid sm:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-[var(--gold)] font-bold">Total XP: </span>
                {encounter.totalXp.toLocaleString()}
              </div>
              <div>
                <span className="text-[var(--gold)] font-bold">Adjusted XP: </span>
                {encounter.adjustedXp.toLocaleString()}
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
                  <button
                    type="button"
                    onClick={() => setExpandedMonster(
                      expandedMonster === em.monster.id ? null : em.monster.id
                    )}
                    className="w-full text-left flex items-center justify-between p-3 rounded bg-[var(--dungeon-dark)] hover:bg-[var(--dungeon-accent)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="bg-[var(--dragon-red)] text-white rounded-full w-8 h-8 flex items-center justify-center font-bold">
                        {em.count}x
                      </span>
                      <div>
                        <span className="font-bold">{em.monster.name}</span>
                        <span className="text-sm text-[var(--parchment-dark)] ml-2">
                          CR {crDisplay(em.monster.challengeRating)} | AC {em.monster.armor.ac} | HP {em.monster.hitPoints}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm text-[var(--gold)]">
                      {(em.monster.xp * em.count).toLocaleString()} XP
                    </span>
                  </button>

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
