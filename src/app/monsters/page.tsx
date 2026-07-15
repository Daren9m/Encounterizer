'use client';

import { useState, useMemo, useCallback } from 'react';
import { filterMonsters, getMonsterSummaryStats } from '@/lib/monster-filter';
import type { Monster, MonsterFilter } from '@/lib/types';
import FilterPanel from '@/components/FilterPanel';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import CustomMonsterPanel from '@/components/CustomMonsterPanel';
import { useMonsters } from '@/app/hooks/useMonsters';

function crDisplay(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return cr.toString();
}

type ViewMode = 'grid' | 'list';

export default function BestiaryPage() {
  const [filter, setFilter] = useState<MonsterFilter>({});
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  const { all: allMonsters, custom } = useMonsters();
  const results = useMemo(() => filterMonsters(allMonsters, filter), [allMonsters, filter]);
  const stats = useMemo(() => getMonsterSummaryStats(results), [results]);

  const handleSelect = useCallback((monster: Monster) => {
    setSelectedMonster(prev => prev?.id === monster.id ? null : monster);
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-[var(--gold)]">Monster Bestiary</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--parchment-dark)]">
            {results.length} of {allMonsters.length} monsters
            {custom.length > 0 && ` (${custom.length} custom)`}
          </span>
          <div className="flex border border-[var(--dungeon-accent)] rounded overflow-hidden ml-2">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 text-xs ${viewMode === 'grid' ? 'bg-[var(--gold)] text-[var(--dungeon-dark)] font-bold' : 'bg-[var(--dungeon-mid)] text-[var(--parchment-dark)]'}`}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 text-xs ${viewMode === 'list' ? 'bg-[var(--gold)] text-[var(--dungeon-dark)] font-bold' : 'bg-[var(--dungeon-mid)] text-[var(--parchment-dark)]'}`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      <CustomMonsterPanel allMonsters={allMonsters} />

      <FilterPanel filter={filter} onChange={setFilter} resultCount={results.length} />

      {/* Summary bar */}
      {Object.keys(stats.typeDistribution).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          {Object.entries(stats.typeDistribution)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <span key={type} className="bg-[var(--dungeon-mid)] border border-[var(--dungeon-accent)] px-2 py-1 rounded">
                {type} <span className="text-[var(--gold)] font-bold">{count}</span>
              </span>
            ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Monster List */}
        <div className="lg:col-span-2">
          {viewMode === 'grid' ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {results.map(monster => (
                <MonsterCard
                  key={monster.id}
                  monster={monster}
                  isSelected={selectedMonster?.id === monster.id}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {/* List header */}
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-bold text-[var(--gold)] uppercase tracking-wider border-b border-[var(--dungeon-accent)]">
                <div className="col-span-4">Name</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-1 text-center">CR</div>
                <div className="col-span-1 text-center">AC</div>
                <div className="col-span-1 text-center">HP</div>
                <div className="col-span-3">Movement</div>
              </div>
              {results.map(monster => (
                <button
                  key={monster.id}
                  type="button"
                  onClick={() => handleSelect(monster)}
                  className={`grid grid-cols-12 gap-2 px-3 py-2 w-full text-left text-sm rounded transition-colors ${
                    selectedMonster?.id === monster.id
                      ? 'bg-[var(--dungeon-accent)] border border-[var(--gold)]'
                      : 'hover:bg-[var(--dungeon-mid)] border border-transparent'
                  }`}
                >
                  <div className="col-span-4 font-bold truncate">
                    {monster.name}
                    {monster.isLegendary && <span className="ml-1 text-[var(--gold)]" title="Legendary">*</span>}
                  </div>
                  <div className="col-span-2 text-[var(--parchment-dark)] truncate">
                    {monster.size} {monster.type}
                  </div>
                  <div className="col-span-1 text-center text-[var(--gold)] font-bold">
                    {crDisplay(monster.challengeRating)}
                  </div>
                  <div className="col-span-1 text-center">{monster.armor.ac}</div>
                  <div className="col-span-1 text-center">{monster.hitPoints}</div>
                  <div className="col-span-3 text-xs text-[var(--parchment-dark)] truncate">
                    {formatSpeedShort(monster)}
                  </div>
                </button>
              ))}
            </div>
          )}

          {results.length === 0 && (
            <div className="text-center py-12 text-[var(--parchment-dark)]">
              No monsters match your filters. Try broadening your search.
            </div>
          )}
        </div>

        {/* Stat Block Detail */}
        <div className="lg:col-span-1">
          {selectedMonster ? (
            <div className="sticky top-4">
              <MonsterStatBlock monster={selectedMonster} />
            </div>
          ) : (
            <div className="card text-center py-12 text-[var(--parchment-dark)]">
              <div className="text-4xl mb-3">🐉</div>
              <p>Select a monster to view its full stat block</p>
              <p className="text-xs mt-2 opacity-60">Click any monster card or row</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatSpeedShort(monster: Monster): string {
  const parts: string[] = [];
  if (monster.speed.walk) parts.push(`${monster.speed.walk} ft.`);
  if (monster.speed.fly) parts.push(`Fly ${monster.speed.fly}`);
  if (monster.speed.swim) parts.push(`Swim ${monster.speed.swim}`);
  if (monster.speed.burrow) parts.push(`Burrow ${monster.speed.burrow}`);
  if (monster.speed.climb) parts.push(`Climb ${monster.speed.climb}`);
  return parts.join(', ');
}

function MonsterCard({
  monster,
  isSelected,
  onSelect,
}: {
  monster: Monster;
  isSelected: boolean;
  onSelect: (m: Monster) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(monster)}
      className={`card text-left cursor-pointer transition-all ${
        isSelected ? 'border-[var(--gold)] ring-1 ring-[var(--gold)]' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-[var(--parchment)]">{monster.name}</h3>
          <p className="text-xs text-[var(--parchment-dark)]">
            {monster.size} {monster.type}
            {monster.subtype ? ` (${monster.subtype})` : ''}
          </p>
        </div>
        <span className="text-sm font-bold text-[var(--gold)] whitespace-nowrap">
          CR {crDisplay(monster.challengeRating)}
        </span>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1 mt-2">
        {monster.movementModes.filter(m => m !== 'Walk').map(mode => (
          <span key={mode} className="text-xs bg-[var(--dungeon-accent)] px-2 py-0.5 rounded">
            {mode}
          </span>
        ))}
        {monster.isLegendary && (
          <span className="text-xs bg-[var(--gold)] text-[var(--dungeon-dark)] px-2 py-0.5 rounded font-bold">
            Legendary
          </span>
        )}
        {monster.hasSpellcasting && (
          <span className="text-xs bg-purple-800 px-2 py-0.5 rounded">
            Spellcaster
          </span>
        )}
        {monster.hasLair && (
          <span className="text-xs bg-green-800 px-2 py-0.5 rounded">
            Lair
          </span>
        )}
      </div>

      {/* Damage types dealt */}
      {monster.attackDamageTypes.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {monster.attackDamageTypes
            .filter(d => !['Piercing', 'Slashing', 'Bludgeoning'].includes(d))
            .map(dt => (
              <span key={dt} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--dragon-red)] text-[var(--parchment)] opacity-80">
                {dt}
              </span>
            ))}
        </div>
      )}

      {/* Stats row */}
      <div className="flex gap-3 mt-2 text-xs text-[var(--parchment-dark)]">
        <span>AC {monster.armor.ac}</span>
        <span>HP {monster.hitPoints}</span>
        <span>{monster.xp.toLocaleString()} XP</span>
      </div>

      {/* Environments */}
      <div className="mt-1 text-[10px] text-[var(--parchment-dark)] opacity-60 truncate">
        {monster.environments.join(' · ')}
      </div>
    </button>
  );
}
