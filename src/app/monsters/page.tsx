'use client';

import { useState, useMemo } from 'react';
import { SRD_MONSTERS } from '@/data/srd-monsters';
import { filterMonsters } from '@/lib/monster-filter';
import type { Monster, MonsterFilter } from '@/lib/types';
import FilterPanel from '@/components/FilterPanel';
import MonsterStatBlock from '@/components/MonsterStatBlock';

function crDisplay(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return cr.toString();
}

export default function BestiaryPage() {
  const [filter, setFilter] = useState<MonsterFilter>({});
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);

  const results = useMemo(() => filterMonsters(SRD_MONSTERS, filter), [filter]);

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold text-[var(--gold)] mb-6">Monster Bestiary</h1>

      <FilterPanel filter={filter} onChange={setFilter} resultCount={results.length} />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Monster List */}
        <div className="lg:col-span-2">
          <div className="grid sm:grid-cols-2 gap-3">
            {results.map(monster => (
              <button
                key={monster.id}
                type="button"
                onClick={() => setSelectedMonster(
                  selectedMonster?.id === monster.id ? null : monster
                )}
                className={`card text-left cursor-pointer transition-all ${
                  selectedMonster?.id === monster.id
                    ? 'border-[var(--gold)] ring-1 ring-[var(--gold)]'
                    : ''
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
                </div>

                <div className="flex gap-3 mt-2 text-xs text-[var(--parchment-dark)]">
                  <span>AC {monster.armor.ac}</span>
                  <span>HP {monster.hitPoints}</span>
                  <span>{monster.xp.toLocaleString()} XP</span>
                </div>
              </button>
            ))}
          </div>

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
              Select a monster to view its stat block
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
