'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Maximize2, Skull, X } from 'lucide-react';
import { filterMonsters, getMonsterSummaryStats } from '@/lib/monster-filter';
import type { Monster, MonsterFilter } from '@/lib/types';
import FilterPanel from '@/components/FilterPanel';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import CustomMonsterPanel from '@/components/CustomMonsterPanel';
import PrintButton from '@/components/PrintButton';
import MonsterPortrait from '@/components/MonsterPortrait';
import { useMonsters } from '@/app/hooks/useMonsters';
import { usePersistentState } from '@/lib/use-persistent-state';
import { getMonsterPhysicalDescription } from '@/data/monster-description-index';
import { getMonsterImage } from '@/data/monster-visual-index';
import ToolPageHeader from '@/components/ToolPageHeader';

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
  const [isHandoutOpen, setIsHandoutOpen] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const handoutTriggerRef = useRef<HTMLButtonElement>(null);
  const handoutCloseRef = useRef<HTMLButtonElement>(null);
  const pageContentRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = usePersistentState<ViewMode>(
    'bestiaryViewMode', 'grid', (v): v is ViewMode => v === 'grid' || v === 'list',
  );

  const { all: allMonsters, custom } = useMonsters();
  const results = useMemo(() => filterMonsters(allMonsters, filter), [allMonsters, filter]);
  const stats = useMemo(() => getMonsterSummaryStats(results), [results]);

  const handleSelect = useCallback((monster: Monster) => {
    setIsHandoutOpen(false);
    const next = selectedMonster?.id === monster.id ? null : monster;
    setSelectedMonster(next);
    if (next && window.matchMedia('(max-width: 1023px)').matches) {
      window.requestAnimationFrame(() => {
        detailRef.current?.focus({ preventScroll: true });
        detailRef.current?.scrollIntoView({
          behavior: 'instant' as ScrollBehavior,
          block: 'start',
        });
      });
    }
  }, [selectedMonster]);

  useEffect(() => {
    if (!isHandoutOpen) return;

    const previousOverflow = document.body.style.overflow;
    const opener = handoutTriggerRef.current;
    const pageContent = pageContentRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsHandoutOpen(false);
      if (event.key === 'Tab') {
        event.preventDefault();
        handoutCloseRef.current?.focus();
      }
    };

    document.body.style.overflow = 'hidden';
    if (pageContent) pageContent.inert = true;
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (pageContent) pageContent.inert = false;
      window.removeEventListener('keydown', handleKeyDown);
      opener?.focus();
    };
  }, [isHandoutOpen]);

  return (
    <div className="animate-fade-in">
      {isHandoutOpen && selectedMonster && getMonsterImage(selectedMonster.id) && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedMonster.name} image handout`}
          className="fixed inset-0 z-[100] bg-black print:hidden"
        >
          <MonsterPortrait
            monsterId={selectedMonster.id}
            sizes="100vw"
            fit="contain"
            className="h-full w-full"
          />
          <button
            ref={handoutCloseRef}
            type="button"
            autoFocus
            onClick={() => setIsHandoutOpen(false)}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-black/70 text-white transition-colors hover:border-[var(--bronze)] hover:text-[var(--bronze)]"
            aria-label="Close image handout"
          >
            <X size={24} aria-hidden="true" />
          </button>
        </div>
      )}

      <div ref={pageContentRef} aria-hidden={isHandoutOpen || undefined}>
      <ToolPageHeader
        path="/monsters"
        description="Search the SRD bestiary by the details that matter at the table, then open a focused stat-block inspector or player-safe image handout."
        actions={(
          <div className="flex flex-col gap-2 sm:items-end">
            <span className="text-sm text-[var(--text-2)]" aria-live="polite">
              {results.length} of {allMonsters.length} monsters
              {custom.length > 0 && ` · ${custom.length} custom`}
            </span>
            <div className="segmented-control" role="group" aria-label="Bestiary view">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
                className="segmented-option"
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                aria-pressed={viewMode === 'list'}
                className="segmented-option"
              >
                List
              </button>
            </div>
          </div>
        )}
      />
      <p className="sr-only" aria-live="polite">
        {selectedMonster ? `${selectedMonster.name} selected. Stat block ready.` : ''}
      </p>

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

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Monster List */}
        <div ref={resultsRef} tabIndex={-1} aria-label="Monster results" className="print:hidden lg:col-span-7">
          {viewMode === 'grid' ? (
            <div className="grid items-start gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {results.map(monster => (
                <MonsterCard
                  key={monster.id}
                  monster={monster}
                  isSelected={selectedMonster?.id === monster.id}
                  onSelect={handleSelect}
                  physicalDescription={getMonsterPhysicalDescription(monster.id)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {/* List header */}
              <div className="micro-label hidden grid-cols-12 gap-2 border-b border-[var(--steel-800)] px-3 py-2 sm:grid">
                <div className="col-span-4">Name</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-1 text-center">CR</div>
                <div className="col-span-1 text-center">AC</div>
                <div className="col-span-1 text-center">HP</div>
                <div className="col-span-3">Movement</div>
              </div>
              {results.map(monster => {
                const physicalDescription = getMonsterPhysicalDescription(monster.id);
                return (
                  <button
                   key={monster.id}
                   type="button"
                   onClick={() => handleSelect(monster)}
                   aria-pressed={selectedMonster?.id === monster.id}
                   aria-label={`View ${monster.name} stat block`}
                   className={`grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg px-3 py-3 text-left text-sm transition-colors sm:grid-cols-12 sm:gap-2 sm:py-2 ${
                    selectedMonster?.id === monster.id
                      ? 'bg-[var(--steel-800)] border border-[var(--bronze)]'
                      : 'hover:bg-[var(--steel-900)] border border-transparent'
                  }`}
                >
                  <div className="min-w-0 sm:col-span-4">
                    <div className="font-bold truncate">
                      {monster.name}
                      {monster.isLegendary && <span className="ml-1 text-[var(--bronze)]" title="Legendary">*</span>}
                    </div>
                    {physicalDescription && (
                      <div className="mt-0.5 truncate text-[10px] text-[var(--text-3)]">
                        {physicalDescription}
                      </div>
                    )}
                  </div>
                  <div className="hidden truncate text-[var(--text-2)] sm:col-span-2 sm:block">
                    {monster.size} {monster.type}
                  </div>
                  <div className="text-center font-bold text-[var(--bronze)] sm:col-span-1">
                    {crDisplay(monster.challengeRating)}
                  </div>
                  <div className="hidden text-center sm:col-span-1 sm:block">{monster.armor.ac}</div>
                  <div className="text-center text-xs text-[var(--text-2)] sm:col-span-1 sm:text-sm">{monster.hitPoints} HP</div>
                  <div className="hidden truncate text-xs text-[var(--text-2)] sm:col-span-3 sm:block">
                    {formatSpeedShort(monster)}
                  </div>
                  </button>
                );
              })}
            </div>
          )}

          {results.length === 0 && (
            <div className="text-center py-12 text-[var(--text-2)]">
              No monsters match your filters. Try broadening your search.
            </div>
          )}
        </div>

        {/* Stat Block Detail */}
        <div ref={detailRef} tabIndex={-1} className="scroll-mt-24 print:col-span-12 lg:col-span-5">
          {selectedMonster ? (
            <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-2">
              <button
                type="button"
                className="btn-ghost mb-3 w-full lg:hidden"
                onClick={() => {
                  resultsRef.current?.focus({ preventScroll: true });
                  resultsRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
                }}
              >
                Back to monster results
              </button>
              <MonsterPortrait
                monsterId={selectedMonster.id}
                sizes="(min-width: 1024px) 42vw, 100vw"
                className="mb-3 aspect-[4/5] rounded border border-[var(--steel-800)] shadow-lg print:hidden"
              />
              <div className="mb-2 flex justify-end gap-2">
                {getMonsterImage(selectedMonster.id) && (
                  <button
                    ref={handoutTriggerRef}
                    type="button"
                    onClick={() => setIsHandoutOpen(true)}
                    className="btn-primary inline-flex items-center gap-1.5 text-sm print:hidden"
                  >
                    <Maximize2 size={16} aria-hidden="true" />
                    Handout Mode
                  </button>
                )}
                <PrintButton label="Print Stat Block" />
              </div>
              <MonsterStatBlock
                monster={selectedMonster}
                physicalDescription={getMonsterPhysicalDescription(selectedMonster.id)}
              />
            </div>
          ) : (
            <div className="card text-center py-12 text-[var(--text-2)]">
              <div className="mb-3 flex justify-center" aria-hidden="true">
                <Skull size={40} className="text-[var(--text-3)]" />
              </div>
              <p>Select a monster to view its full stat block</p>
              <p className="text-xs mt-2 text-[var(--text-3)]">Click any monster card or row</p>
            </div>
          )}
        </div>
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
  physicalDescription,
}: {
  monster: Monster;
  isSelected: boolean;
  onSelect: (m: Monster) => void;
  physicalDescription?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(monster)}
      aria-pressed={isSelected}
      aria-label={`View ${monster.name} stat block`}
      className={`card w-full overflow-hidden text-left cursor-pointer transition-all ${
        isSelected ? 'border-[var(--bronze)] ring-1 ring-[var(--bronze)]' : ''
      }`}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <MonsterPortrait
          monsterId={monster.id}
          sizes="128px"
          className="aspect-[4/5] w-24 shrink-0 rounded-lg sm:w-32"
        />
        <div className="min-w-0 flex-1">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate">{monster.name}</h3>
          <p className="text-xs text-[var(--text-2)]">
            {monster.size} {monster.type}
            {monster.subtype ? ` (${monster.subtype})` : ''}
          </p>
        </div>
        <span className="text-sm font-bold text-[var(--bronze)] whitespace-nowrap">
          CR {crDisplay(monster.challengeRating)}
        </span>
      </div>

      {physicalDescription && (
        <p className="mt-2 hidden text-xs leading-relaxed text-[var(--text-2)] sm:line-clamp-3">
          {physicalDescription}
        </p>
      )}

      {/* Badges */}
      <div className="flex flex-wrap gap-1 mt-2">
        {monster.movementModes.filter(m => m !== 'Walk').map(mode => (
          <span key={mode} className="text-xs bg-[var(--steel-800)] px-2 py-0.5 rounded">
            {mode}
          </span>
        ))}
        {monster.isLegendary && (
          <span className="text-xs bg-[var(--bronze)] text-[#1d1105] px-2 py-0.5 rounded font-bold">
            Legendary
          </span>
        )}
        {monster.hasSpellcasting && (
          <span className="text-xs bg-[var(--steel-800)] text-[var(--bronze)] px-2 py-0.5 rounded">
            Spellcaster
          </span>
        )}
        {monster.hasLair && (
          <span className="text-xs bg-[var(--steel-800)] text-[var(--text-2)] px-2 py-0.5 rounded">
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
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--text-2)]">
        <span>AC {monster.armor.ac}</span>
        <span>HP {monster.hitPoints}</span>
        <span>{monster.xp.toLocaleString()} XP</span>
      </div>

      {/* Environments */}
      <div className="mt-1 text-[10px] text-[var(--text-3)] truncate">
        {monster.environments.join(' · ')}
      </div>
        </div>
      </div>
    </button>
  );
}
