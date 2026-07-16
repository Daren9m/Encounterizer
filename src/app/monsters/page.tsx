'use client';

import { useState, useMemo, useCallback } from 'react';
import { Skull } from 'lucide-react';
import { filterMonsters, getMonsterSummaryStats } from '@/lib/monster-filter';
import type { Monster, MonsterFilter } from '@/lib/types';
import FilterPanel from '@/components/FilterPanel';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import CustomMonsterPanel from '@/components/CustomMonsterPanel';
import PrintButton from '@/components/PrintButton';
import { useMonsters } from '@/app/hooks/useMonsters';
import { usePersistentState } from '@/lib/use-persistent-state';

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
  const [viewMode, setViewMode] = usePersistentState<ViewMode>(
    'bestiaryViewMode', 'grid', (v): v is ViewMode => v === 'grid' || v === 'list',
  );

  const { all: allMonsters, custom } = useMonsters();
  const results = useMemo(() => filterMonsters(allMonsters, filter), [allMonsters, filter]);
  const stats = useMemo(() => getMonsterSummaryStats(results), [results]);

  const handleSelect = useCallback((monster: Monster) => {
    setSelectedMonster(prev => prev?.id === monster.id ? null : monster);
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-[var(--bronze)]">Monster Bestiary</h1>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--text-2)]">
            {results.length} of {allMonsters.length} monsters
            {custom.length > 0 && ` (${custom.length} custom)`}
          </span>
          <div className="flex border border-[var(--steel-800)] rounded overflow-hidden ml-2 print:hidden">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              className={`px-3 py-1 text-xs ${viewMode === 'grid' ? 'bg-[var(--bronze)] text-[var(--steel-950)] font-bold' : 'bg-[var(--steel-900)] text-[var(--text-2)]'}`}
            >
              Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={`px-3 py-1 text-xs ${viewMode === 'list' ? 'bg-[var(--bronze)] text-[var(--steel-950)] font-bold' : 'bg-[var(--steel-900)] text-[var(--text-2)]'}`}
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
        <div className="flex flex-wrap gap-2 mb-4 text-xs print:hidden">
          {Object.entries(stats.typeDistribution)
            .sort(([, a], [, b]) => b - a)
            .map(([type, count]) => (
              <span key={type} className="bg-[var(--steel-900)] border border-[var(--steel-800)] px-2 py-1 rounded">
                {type} <span className="text-[var(--bronze)] font-bold">{count}</span>
              </span>
            ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Monster List */}
        <div className="lg:col-span-2 print:hidden">
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
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs font-bold text-[var(--bronze)] uppercase tracking-wider border-b border-[var(--steel-800)]">
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
                      ? 'bg-[var(--steel-800)] border border-[var(--bronze)]'
                      : 'hover:bg-[var(--steel-900)] border border-transparent'
                  }`}
                >
                  <div className="col-span-4 font-bold truncate">
                    {monster.name}
                    {monster.isLegendary && <span className="ml-1 text-[var(--bronze)]" title="Legendary">*</span>}
                  </div>
                  <div className="col-span-2 text-[var(--text-2)] truncate">
                    {monster.size} {monster.type}
                  </div>
                  <div className="col-span-1 text-center text-[var(--bronze)] font-bold">
                    {crDisplay(monster.challengeRating)}
                  </div>
                  <div className="col-span-1 text-center">{monster.armor.ac}</div>
                  <div className="col-span-1 text-center">{monster.hitPoints}</div>
                  <div className="col-span-3 text-xs text-[var(--text-2)] truncate">
                    {formatSpeedShort(monster)}
                  </div>
                </button>
              ))}
            </div>
          )}

          {results.length === 0 && (
            <div className="text-center py-12 text-[var(--text-2)]">
              No monsters match your filters. Try broadening your search.
            </div>
          )}
        </div>

        {/* Stat Block Detail */}
        <div className="lg:col-span-1 print:col-span-3">
          {selectedMonster ? (
            <div className="sticky top-4">
              <div className="mb-2 flex justify-end">
                <PrintButton label="Print Stat Block" />
              </div>
              <MonsterStatBlock monster={selectedMonster} />
            </div>
          ) : (
            <div className="card text-center py-12 text-[var(--text-2)]">
              <div className="mb-3 flex justify-center" aria-hidden="true">
                <Skull size={40} className="text-[var(--text-3)]" />
              </div>
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
        isSelected ? 'border-[var(--bronze)] ring-1 ring-[var(--bronze)]' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-[var(--text-1)]">{monster.name}</h3>
          <p className="text-xs text-[var(--text-2)]">
            {monster.size} {monster.type}
            {monster.subtype ? ` (${monster.subtype})` : ''}
          </p>
        </div>
        <span className="text-sm font-bold text-[var(--bronze)] whitespace-nowrap">
          CR {crDisplay(monster.challengeRating)}
        </span>
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1 mt-2">
        {monster.movementModes.filter(m => m !== 'Walk').map(mode => (
          <span key={mode} className="text-xs bg-[var(--steel-800)] px-2 py-0.5 rounded">
            {mode}
          </span>
        ))}
        {monster.isLegendary && (
          <span className="text-xs bg-[var(--bronze)] text-[var(--steel-950)] px-2 py-0.5 rounded font-bold">
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
              <span key={dt} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--steel-800)] text-[var(--text-2)]">
                {dt}
              </span>
            ))}
        </div>
      )}

      {/* Stats row */}
      <div className="flex gap-3 mt-2 text-xs text-[var(--text-2)]">
        <span>AC {monster.armor.ac}</span>
        <span>HP {monster.hitPoints}</span>
        <span>{monster.xp.toLocaleString()} XP</span>
      </div>

      {/* Environments */}
      <div className="mt-1 text-[10px] text-[var(--text-2)] opacity-60 truncate">
        {monster.environments.join(' · ')}
      </div>
    </button>
  );
}
