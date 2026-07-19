'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ChevronUp,
  FileJson,
  FileText,
  Maximize2,
  Pencil,
  Pin,
  PinOff,
  X,
} from 'lucide-react';
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
import MonsterEditor from '@/components/MonsterEditor';
import { monsterToMarkdown, safeMonsterFilename } from '@/lib/monster-export';

function crDisplay(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return cr.toString();
}

type ViewMode = 'grid' | 'list';
type CardSize = 'compact' | 'standard' | 'large';
type ColumnCount = 'auto' | '1' | '2' | '3' | '4';

function isCardSize(value: unknown): value is CardSize {
  return value === 'compact' || value === 'standard' || value === 'large';
}

function isColumnCount(value: unknown): value is ColumnCount {
  return value === 'auto' || value === '1' || value === '2' || value === '3' || value === '4';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isMonsterEditMap(value: unknown): value is Record<string, Monster> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((monster) => (
      typeof monster === 'object'
      && monster !== null
      && typeof (monster as Monster).id === 'string'
      && typeof (monster as Monster).name === 'string'
    ));
}

function downloadText(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function BestiaryPage() {
  const [filter, setFilter] = useState<MonsterFilter>({ sortBy: 'family' });
  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [isHandoutOpen, setIsHandoutOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isPinnedListOpen, setIsPinnedListOpen] = useState(true);
  const detailRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const handoutTriggerRef = useRef<HTMLButtonElement>(null);
  const handoutCloseRef = useRef<HTMLButtonElement>(null);
  const pageContentRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = usePersistentState<ViewMode>(
    'bestiaryViewMode', 'grid', (v): v is ViewMode => v === 'grid' || v === 'list',
  );
  const [cardSize, setCardSize] = usePersistentState<CardSize>(
    'bestiaryCardSize', 'standard', isCardSize,
  );
  const [columnCount, setColumnCount] = usePersistentState<ColumnCount>(
    'bestiaryColumnCount', 'auto', isColumnCount,
  );
  const [pinnedIds, setPinnedIds] = usePersistentState<string[]>(
    'bestiaryPinnedMonsters', [], isStringArray,
  );
  const [monsterEdits, setMonsterEdits] = usePersistentState<Record<string, Monster>>(
    'bestiaryMonsterEdits', {}, isMonsterEditMap,
  );

  const { all: allMonsters, custom } = useMonsters();
  const monsters = useMemo(
    () => allMonsters.map((monster) => monsterEdits[monster.id] ?? monster),
    [allMonsters, monsterEdits],
  );
  const results = useMemo(() => filterMonsters(monsters, filter), [monsters, filter]);
  const stats = useMemo(() => getMonsterSummaryStats(results), [results]);
  const pinnedMonsters = useMemo(
    () => pinnedIds.map((id) => monsters.find((monster) => monster.id === id)).filter((monster): monster is Monster => Boolean(monster)),
    [monsters, pinnedIds],
  );

  const focusDetailOnSmallScreen = useCallback(() => {
    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.requestAnimationFrame(() => {
        detailRef.current?.focus({ preventScroll: true });
        detailRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
      });
    }
  }, []);

  const openMonster = useCallback((monster: Monster) => {
    setIsHandoutOpen(false);
    setIsEditorOpen(false);
    setSelectedMonster(monster);
    focusDetailOnSmallScreen();
  }, [focusDetailOnSmallScreen]);

  const handleSelect = useCallback((monster: Monster) => {
    setIsHandoutOpen(false);
    setIsEditorOpen(false);
    const next = selectedMonster?.id === monster.id ? null : monster;
    setSelectedMonster(next);
    if (next) focusDetailOnSmallScreen();
  }, [focusDetailOnSmallScreen, selectedMonster]);

  const togglePin = useCallback((monsterId: string) => {
    setPinnedIds((current) => (
      current.includes(monsterId)
        ? current.filter((id) => id !== monsterId)
        : [...current, monsterId]
    ));
  }, [setPinnedIds]);

  const saveMonsterEdit = useCallback((monster: Monster) => {
    setMonsterEdits((current) => ({ ...current, [monster.id]: monster }));
    setSelectedMonster(monster);
  }, [setMonsterEdits]);

  const resetMonsterEdit = useCallback((monsterId: string) => {
    setMonsterEdits((current) => {
      const next = { ...current };
      delete next[monsterId];
      return next;
    });
    const original = allMonsters.find((monster) => monster.id === monsterId);
    if (original) setSelectedMonster(original);
  }, [allMonsters, setMonsterEdits]);

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
    <div className="relative left-1/2 w-[calc(100vw-2rem)] max-w-[110rem] -translate-x-1/2 animate-fade-in sm:w-[calc(100vw-3rem)] lg:w-[calc(100vw-4rem)]">
      {isHandoutOpen && selectedMonster && getMonsterImage(selectedMonster.id) && createPortal(
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
        </div>,
        document.body,
      )}

      <div ref={pageContentRef} aria-hidden={isHandoutOpen || undefined}>
      <ToolPageHeader
        path="/monsters"
        description="Search the SRD bestiary by the details that matter at the table, then open a focused stat-block inspector or player-safe image handout."
        actions={(
          <div className="flex flex-col gap-2 sm:items-end">
            <span className="text-sm text-[var(--text-2)]" aria-live="polite">
              {results.length} of {monsters.length} monsters
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

      <FilterPanel
        filter={filter}
        onChange={setFilter}
        resultCount={results.length}
        defaultSortBy="family"
      />

      {viewMode === 'grid' && (
        <div className="surface-inset mb-3 flex flex-wrap items-end gap-x-4 gap-y-2 px-3 py-2.5 print:hidden">
          <div>
            <span className="micro-label mb-1 block">Card size</span>
            <div className="segmented-control" role="group" aria-label="Monster card size">
              {([
                ['compact', 'Compact'],
                ['standard', 'Standard'],
                ['large', 'Large'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className="segmented-option !min-h-8 !px-2.5 !py-1 text-xs"
                  aria-pressed={cardSize === value}
                  onClick={() => setCardSize(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="bestiary-columns" className="micro-label mb-1 block">Columns</label>
            <select
              id="bestiary-columns"
              value={columnCount}
              onChange={(event) => setColumnCount(event.target.value as ColumnCount)}
              className="!min-h-8 !py-1 text-xs"
            >
              <option value="auto">Auto fit</option>
              <option value="1">1 column</option>
              <option value="2">2 columns</option>
              <option value="3">3 columns</option>
              <option value="4">4 columns</option>
            </select>
          </div>
          <p className="ml-auto self-center text-xs text-[var(--text-3)]">
            Auto fit uses the available width on wide screens.
          </p>
        </div>
      )}

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

      <div className={selectedMonster
        ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]'
        : 'grid gap-6'}>
        {/* Monster List */}
        <div ref={resultsRef} tabIndex={-1} aria-label="Monster results" className="bestiary-results min-w-0 print:hidden">
          {viewMode === 'grid' ? (
            <div className="bestiary-grid items-start gap-3" data-card-size={cardSize} data-columns={columnCount}>
              {results.map(monster => (
                <MonsterCard
                  key={monster.id}
                  monster={monster}
                  isSelected={selectedMonster?.id === monster.id}
                  isPinned={pinnedIds.includes(monster.id)}
                  onSelect={handleSelect}
                  onTogglePin={togglePin}
                  cardSize={cardSize}
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
                const isPinned = pinnedIds.includes(monster.id);
                return (
                  <div key={monster.id} className="relative">
                    <button
                     type="button"
                     onClick={() => handleSelect(monster)}
                     aria-pressed={selectedMonster?.id === monster.id}
                     aria-label={`View ${monster.name} stat block`}
                     className={`grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-lg border px-3 py-3 pr-12 text-left text-sm transition-colors sm:grid-cols-12 sm:gap-2 sm:py-2 ${
                      selectedMonster?.id === monster.id
                        ? 'border-[var(--bronze)] bg-[var(--steel-800)]'
                        : 'border-transparent hover:bg-[var(--steel-900)]'
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
                    <button
                      type="button"
                      onClick={() => togglePin(monster.id)}
                      className={`absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg transition-colors ${isPinned ? 'bg-[var(--bronze)] text-[#1d1105]' : 'text-[var(--text-3)] hover:bg-[var(--steel-800)] hover:text-[var(--bronze)]'}`}
                      aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${monster.name}`}
                      aria-pressed={isPinned}
                    >
                      <Pin size={15} aria-hidden="true" />
                    </button>
                  </div>
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
        {selectedMonster && (
          <div ref={detailRef} tabIndex={-1} className="min-w-0 scroll-mt-24 print:col-span-12">
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
              <div className="mb-2 flex flex-wrap justify-end gap-2 print:hidden">
                <button
                  type="button"
                  onClick={() => togglePin(selectedMonster.id)}
                  className="btn-ghost !min-h-9 !px-3 text-xs"
                  aria-pressed={pinnedIds.includes(selectedMonster.id)}
                >
                  {pinnedIds.includes(selectedMonster.id)
                    ? <PinOff size={14} aria-hidden="true" />
                    : <Pin size={14} aria-hidden="true" />}
                  {pinnedIds.includes(selectedMonster.id) ? 'Unpin' : 'Pin'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditorOpen((open) => !open)}
                  className="btn-ghost !min-h-9 !px-3 text-xs"
                  aria-expanded={isEditorOpen}
                >
                  <Pencil size={14} aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => downloadText(
                    `${safeMonsterFilename(selectedMonster.name)}.json`,
                    `${JSON.stringify(selectedMonster, null, 2)}\n`,
                    'application/json',
                  )}
                  className="btn-ghost !min-h-9 !px-3 text-xs"
                >
                  <FileJson size={14} aria-hidden="true" />
                  JSON
                </button>
                <button
                  type="button"
                  onClick={() => downloadText(
                    `${safeMonsterFilename(selectedMonster.name)}.md`,
                    monsterToMarkdown(selectedMonster),
                    'text/markdown',
                  )}
                  className="btn-ghost !min-h-9 !px-3 text-xs"
                >
                  <FileText size={14} aria-hidden="true" />
                  Markdown
                </button>
                {getMonsterImage(selectedMonster.id) && (
                  <button
                    ref={handoutTriggerRef}
                    type="button"
                    onClick={() => setIsHandoutOpen(true)}
                    className="btn-secondary !min-h-9 !px-3 text-xs"
                  >
                    <Maximize2 size={16} aria-hidden="true" />
                    Handout
                  </button>
                )}
                <PrintButton label="Print" />
              </div>
              {isEditorOpen && (
                <MonsterEditor
                  key={`${selectedMonster.id}-${monsterEdits[selectedMonster.id] ? 'edited' : 'original'}`}
                  monster={selectedMonster}
                  canReset={Boolean(monsterEdits[selectedMonster.id])}
                  onSave={saveMonsterEdit}
                  onReset={() => resetMonsterEdit(selectedMonster.id)}
                  onClose={() => setIsEditorOpen(false)}
                />
              )}
              <MonsterStatBlock
                monster={selectedMonster}
                physicalDescription={getMonsterPhysicalDescription(selectedMonster.id)}
              />
            </div>
          </div>
        )}
      </div>

      {pinnedMonsters.length > 0 && (
        <aside className="fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--bronze)] bg-[var(--steel-900)] shadow-2xl print:hidden" aria-label="Pinned monsters">
          <button
            type="button"
            onClick={() => setIsPinnedListOpen((open) => !open)}
            className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left"
            aria-expanded={isPinnedListOpen}
          >
            <span className="inline-flex items-center gap-2 font-semibold">
              <Pin size={16} className="text-[var(--bronze)]" aria-hidden="true" />
              Pinned monsters
              <span className="rounded-full bg-[var(--steel-950)] px-2 py-0.5 text-xs text-[var(--bronze)]">{pinnedMonsters.length}</span>
            </span>
            {isPinnedListOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronUp size={16} aria-hidden="true" />}
          </button>
          {isPinnedListOpen && (
            <ul className="max-h-72 overflow-y-auto border-t border-[var(--steel-800)] p-1.5">
              {pinnedMonsters.map((monster) => (
                <li key={monster.id} className="flex items-center gap-1 rounded-lg hover:bg-[var(--steel-800)]">
                  <button type="button" onClick={() => openMonster(monster)} className="min-w-0 flex-1 px-2 py-2 text-left">
                    <span className="block truncate text-sm font-semibold">{monster.name}</span>
                    <span className="block text-xs text-[var(--text-3)]">CR {crDisplay(monster.challengeRating)} · AC {monster.armor.ac} · {monster.hitPoints} HP</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePin(monster.id)}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-3)] hover:text-[var(--bronze)]"
                    aria-label={`Unpin ${monster.name}`}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      )}
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
  isPinned,
  onSelect,
  onTogglePin,
  cardSize,
  physicalDescription,
}: {
  monster: Monster;
  isSelected: boolean;
  isPinned: boolean;
  onSelect: (m: Monster) => void;
  onTogglePin: (monsterId: string) => void;
  cardSize: CardSize;
  physicalDescription?: string;
}) {
  const portraitClass = cardSize === 'compact'
    ? 'w-16'
    : cardSize === 'large' ? 'w-32' : 'w-24';
  const paddingClass = cardSize === 'compact'
    ? '!p-2.5'
    : cardSize === 'large' ? '!p-4' : '!p-3';

  return (
    <article
      className={`card relative w-full overflow-hidden transition-all hover:-translate-y-0.5 hover:border-[rgba(232,161,94,0.55)] ${paddingClass} ${
        isSelected ? 'border-[var(--bronze)] ring-1 ring-[var(--bronze)]' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(monster)}
        aria-pressed={isSelected}
        aria-label={`View ${monster.name} stat block`}
        className="w-full cursor-pointer pr-7 text-left"
      >
      <div className={`flex items-start ${cardSize === 'compact' ? 'gap-2.5' : 'gap-3'}`}>
        <MonsterPortrait
          monsterId={monster.id}
          sizes="128px"
          className={`aspect-[4/5] shrink-0 rounded-lg ${portraitClass}`}
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

      {physicalDescription && cardSize !== 'compact' && (
        <p className={`mt-2 hidden text-xs leading-relaxed text-[var(--text-2)] ${cardSize === 'large' ? 'sm:line-clamp-4' : 'sm:line-clamp-2'}`}>
          {physicalDescription}
        </p>
      )}

      {/* Badges */}
      <div className={`flex flex-wrap gap-1 ${cardSize === 'compact' ? 'mt-1' : 'mt-2'}`}>
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
      {cardSize !== 'compact' && monster.attackDamageTypes.length > 0 && (
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
      {cardSize !== 'compact' && (
        <div className="mt-1 truncate text-[10px] text-[var(--text-3)]">
          {monster.environments.join(' · ')}
        </div>
      )}
        </div>
      </div>
      </button>
      <button
        type="button"
        onClick={() => onTogglePin(monster.id)}
        className={`absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${isPinned ? 'bg-[var(--bronze)] text-[#1d1105]' : 'bg-[var(--steel-950)] text-[var(--text-3)] hover:text-[var(--bronze)]'}`}
        aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${monster.name}`}
        aria-pressed={isPinned}
      >
        <Pin size={14} aria-hidden="true" />
      </button>
    </article>
  );
}
