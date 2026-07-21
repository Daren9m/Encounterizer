'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Bookmark,
  BookmarkCheck,
  Backpack,
  BookOpen,
  ChevronLeft,
  GraduationCap,
  PackageOpen,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { useSpells } from '@/app/hooks/useSpells';
import CustomSpellPanel from '@/components/CustomSpellPanel';
import PrintButton from '@/components/PrintButton';
import ToolPageHeader from '@/components/ToolPageHeader';
import { levelLabel, type Spell } from '@/data/spells';
import {
  CLASS_NAMES,
  EQUIPMENT_CATEGORIES,
  FEAT_CATEGORIES,
  filterReferenceLibrary,
  getReferenceCategoryLabel,
  getReferenceEntrySummary,
  isReferenceBookmarkList,
  MAGIC_ITEM_CATEGORIES,
  MAGIC_ITEM_RARITIES,
  REFERENCE_CATEGORIES,
  RULE_GROUP_OPTIONS,
  SPELL_CLASSES,
  SPELL_SCHOOLS,
  buildReferenceLibraryEntries,
  type ReferenceCategoryFilter,
  type ReferenceLibraryEntry,
  type ReferenceLibraryFilters,
} from '@/lib/reference-library';
import { storageLoad } from '@/lib/storage';
import type {
  Background,
  Feat,
  MagicItem,
  Species,
  SrdClassEntry,
  SrdEquipmentItem,
  SrdReferenceArticle,
  SrdTextSection,
} from '@/lib/srd-content-types';
import { usePersistentState } from '@/lib/use-persistent-state';

function initialFilters(category: ReferenceCategoryFilter): ReferenceLibraryFilters {
  return { query: '', category };
}

export default function ReferenceLibrary({
  initialCategory = 'all',
}: {
  initialCategory?: ReferenceCategoryFilter;
}) {
  const allSpells = useSpells();
  const entries = useMemo(() => buildReferenceLibraryEntries(allSpells), [allSpells]);
  const [filters, setFilters] = useState<ReferenceLibraryFilters>(() => initialFilters(initialCategory));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [bookmarkKeys, setBookmarkKeys, bookmarksHydrated] = usePersistentState<string[]>(
    'referenceBookmarks',
    [],
    isReferenceBookmarkList,
  );
  const migratedSpellPins = useRef(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bookmarksHydrated || migratedSpellPins.current) return;
    migratedSpellPins.current = true;
    const pinnedSpellIds = storageLoad<string[]>('pinnedSpells', [], isReferenceBookmarkList);
    if (pinnedSpellIds.length === 0) return;
    setBookmarkKeys((current) => Array.from(new Set([
      ...current,
      ...pinnedSpellIds.map((id) => `spells:${id}`),
    ])));
  }, [bookmarksHydrated, setBookmarkKeys]);

  const bookmarkSet = useMemo(() => new Set(bookmarkKeys), [bookmarkKeys]);
  const availableKeys = useMemo(() => new Set(entries.map((entry) => entry.key)), [entries]);
  const bookmarkCount = useMemo(
    () => bookmarkKeys.filter((key) => availableKeys.has(key)).length,
    [availableKeys, bookmarkKeys],
  );
  const results = useMemo(
    () => filterReferenceLibrary(filters, entries, bookmarkSet),
    [bookmarkSet, entries, filters],
  );
  const selected = useMemo(() => {
    if (!selectedKey) return null;
    return results.find((entry) => entry.key === selectedKey) ?? null;
  }, [results, selectedKey]);
  const hasFilters = filters.query.trim() !== ''
    || filters.category !== initialCategory
    || Boolean(filters.ruleGroup)
    || Boolean(filters.classKind)
    || Boolean(filters.className)
    || filters.spellLevel !== undefined
    || Boolean(filters.spellSchool)
    || Boolean(filters.spellClass)
    || Boolean(filters.concentration)
    || Boolean(filters.ritual)
    || Boolean(filters.equipmentCategory)
    || Boolean(filters.magicItemRarity)
    || Boolean(filters.magicItemCategory)
    || Boolean(filters.attunement)
    || Boolean(filters.featCategory)
    || Boolean(filters.bookmarkedOnly);

  function chooseCategory(category: ReferenceCategoryFilter) {
    setFilters((current) => ({
      query: current.query,
      category,
      bookmarkedOnly: current.bookmarkedOnly,
    }));
  }

  function toggleBookmark(key: string) {
    setBookmarkKeys((current) => current.includes(key)
      ? current.filter((candidate) => candidate !== key)
      : [...current, key]);
  }

  function selectEntry(entry: ReferenceLibraryEntry) {
    setSelectedKey(entry.key);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      window.requestAnimationFrame(() => {
        detailRef.current?.focus({ preventScroll: true });
        detailRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
      });
    }
  }

  return (
    <div className="animate-fade-in">
      <ToolPageHeader
        path="/reference"
        description="Search rules, classes, spells, equipment, magic items, feats, backgrounds, and species in one table-ready reference."
        actions={(
          <div className="flex flex-col items-end gap-2">
            <span className="text-sm text-[var(--text-2)]">{entries.length} references</span>
            {selected && <PrintButton label="Print selected" />}
          </div>
        )}
      />

      <section aria-label="Reference filters" className="card panel-accent mb-5 print:hidden">
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search the reference library"
            placeholder="Search rules, classes, equipment, spells, traits, effects..."
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            className="w-full pl-10 text-base"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Reference type">
          <button
            type="button"
            className={`filter-chip ${filters.category === 'all' && !filters.bookmarkedOnly ? 'active' : ''}`}
            aria-pressed={filters.category === 'all' && !filters.bookmarkedOnly}
            onClick={() => {
              chooseCategory('all');
              setFilters((current) => ({ ...current, bookmarkedOnly: false }));
            }}
          >
            All <span className="ml-1 opacity-75">{entries.length}</span>
          </button>
          {REFERENCE_CATEGORIES.map((category) => {
            const count = category.id === 'spells'
              ? entries.filter((entry) => entry.category === 'spells').length
              : category.count;
            return (
              <button
                key={category.id}
                type="button"
                className={`filter-chip ${filters.category === category.id ? 'active' : ''}`}
                aria-pressed={filters.category === category.id}
                onClick={() => chooseCategory(category.id)}
              >
                {category.label} <span className="ml-1 opacity-75">{count}</span>
              </button>
            );
          })}
          <button
            type="button"
            className={`filter-chip ${filters.bookmarkedOnly ? 'active' : ''}`}
            aria-pressed={Boolean(filters.bookmarkedOnly)}
            onClick={() => setFilters((current) => ({
              ...current,
              bookmarkedOnly: !current.bookmarkedOnly,
            }))}
          >
            <Bookmark size={13} className="mr-1 inline" aria-hidden="true" />
            Saved <span className="ml-1 opacity-75">{bookmarkCount}</span>
          </button>
        </div>

        <ContextFilters filters={filters} setFilters={setFilters} />

        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--text-3)]">
          <span aria-live="polite">{results.length} matching {results.length === 1 ? 'reference' : 'references'}</span>
          <span className="ml-auto hidden sm:inline">Bookmarks stay in this browser.</span>
          {hasFilters && (
            <button
              type="button"
              className="min-h-10 px-2 font-medium text-[var(--text-2)] hover:text-[var(--bronze-light)]"
              onClick={() => setFilters(initialFilters(initialCategory))}
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      {filters.category === 'spells' && <CustomSpellPanel allSpells={allSpells} />}

      <div className="grid gap-5 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.65fr)]">
        <div
          ref={resultsRef}
          tabIndex={-1}
          aria-label="Reference results"
          className="space-y-1 print:hidden lg:max-h-[76vh] lg:overflow-y-auto lg:pr-2"
        >
          {results.map((entry) => (
            <div
              key={entry.key}
              className={`flex items-stretch rounded-lg border transition-colors ${
                selected?.key === entry.key
                  ? 'border-[var(--bronze)] bg-[var(--steel-800)]'
                  : 'border-transparent hover:bg-[var(--steel-900)]'
              }`}
            >
              <button
                type="button"
                onClick={() => selectEntry(entry)}
                aria-pressed={selected?.key === entry.key}
                className="min-w-0 flex-1 px-3 py-3 text-left"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <strong className="block text-sm text-[var(--text-1)]">{entry.name}</strong>
                    <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-3)]">
                      {getReferenceEntrySummary(entry)}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-[var(--bronze-wash)] px-2 py-1 text-[10px] font-semibold text-[var(--bronze-light)]">
                    {getReferenceCategoryLabel(entry.category)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                aria-label={`${bookmarkSet.has(entry.key) ? 'Remove bookmark from' : 'Bookmark'} ${entry.name}`}
                aria-pressed={bookmarkSet.has(entry.key)}
                title={bookmarkSet.has(entry.key) ? 'Remove bookmark' : 'Bookmark'}
                onClick={() => toggleBookmark(entry.key)}
                className="w-12 shrink-0 rounded-r-lg text-[var(--text-3)] hover:text-[var(--bronze-light)]"
              >
                {bookmarkSet.has(entry.key)
                  ? <BookmarkCheck size={18} className="mx-auto text-[var(--bronze-light)]" aria-hidden="true" />
                  : <Bookmark size={18} className="mx-auto" aria-hidden="true" />}
              </button>
            </div>
          ))}
          {results.length === 0 && (
            <div className="empty-state">
              <p>{filters.bookmarkedOnly ? 'No saved references match these filters.' : 'No references match these filters.'}</p>
              <button
                type="button"
                className="btn-secondary mt-4"
                onClick={() => setFilters(initialFilters(initialCategory))}
              >
                {filters.bookmarkedOnly ? 'Show all references' : 'Clear filters'}
              </button>
            </div>
          )}
        </div>

        <div ref={detailRef} tabIndex={-1} className="scroll-mt-24">
          {selected ? (
            <div className="lg:sticky lg:top-24">
              <button
                type="button"
                className="btn-ghost mb-3 w-full print:hidden lg:hidden"
                onClick={() => {
                  resultsRef.current?.focus({ preventScroll: true });
                  resultsRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'start' });
                }}
              >
                <ChevronLeft size={16} aria-hidden="true" />
                Back to results
              </button>
              <ResourceDetail
                entry={selected}
                bookmarked={bookmarkSet.has(selected.key)}
                onToggleBookmark={() => toggleBookmark(selected.key)}
              />
            </div>
          ) : (
            <div className="card py-14 text-center text-[var(--text-2)] print:hidden">
              <BookOpen size={42} className="mx-auto mb-3 text-[var(--text-3)]" aria-hidden="true" />
              <h2 className="text-xl">Choose a reference</h2>
              <p className="mt-2 text-sm">Select any result to open the full entry.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ContextFilters({
  filters,
  setFilters,
}: {
  filters: ReferenceLibraryFilters;
  setFilters: React.Dispatch<React.SetStateAction<ReferenceLibraryFilters>>;
}) {
  if (filters.category === 'rules') {
    return (
      <div className="mt-3 max-w-sm">
        <select
          aria-label="Filter rules by source section"
          value={filters.ruleGroup ?? ''}
          onChange={(event) => setFilters((current) => ({
            ...current,
            ruleGroup: event.target.value
              ? event.target.value as ReferenceLibraryFilters['ruleGroup']
              : undefined,
          }))}
          className="w-full"
        >
          <option value="">All rule sections</option>
          {RULE_GROUP_OPTIONS.map((group) => <option key={group}>{group}</option>)}
        </select>
      </div>
    );
  }

  if (filters.category === 'classes') {
    return (
      <div className="mt-3 grid gap-2 sm:max-w-2xl sm:grid-cols-2">
        <select
          aria-label="Filter classes and subclasses"
          value={filters.classKind ?? ''}
          onChange={(event) => setFilters((current) => ({
            ...current,
            classKind: event.target.value ? event.target.value as ReferenceLibraryFilters['classKind'] : undefined,
          }))}
        >
          <option value="">Classes and subclasses</option>
          <option value="Class">Classes only</option>
          <option value="Subclass">Subclasses only</option>
        </select>
        <select
          aria-label="Filter by parent class"
          value={filters.className ?? ''}
          onChange={(event) => setFilters((current) => ({ ...current, className: event.target.value || undefined }))}
        >
          <option value="">All parent classes</option>
          {CLASS_NAMES.map((className) => <option key={className}>{className}</option>)}
        </select>
      </div>
    );
  }

  if (filters.category === 'spells') {
    return (
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <select
          aria-label="Filter spells by level"
          value={filters.spellLevel ?? ''}
          onChange={(event) => setFilters((current) => ({
            ...current,
            spellLevel: event.target.value === '' ? undefined : Number(event.target.value),
          }))}
        >
          <option value="">All levels</option>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => (
            <option key={level} value={level}>{levelLabel(level)}</option>
          ))}
        </select>
        <select
          aria-label="Filter spells by school"
          value={filters.spellSchool ?? ''}
          onChange={(event) => setFilters((current) => ({
            ...current,
            spellSchool: event.target.value
              ? event.target.value as ReferenceLibraryFilters['spellSchool']
              : undefined,
          }))}
        >
          <option value="">All schools</option>
          {SPELL_SCHOOLS.map((school) => <option key={school}>{school}</option>)}
        </select>
        <select
          aria-label="Filter spells by class"
          value={filters.spellClass ?? ''}
          onChange={(event) => setFilters((current) => ({ ...current, spellClass: event.target.value || undefined }))}
        >
          <option value="">All classes</option>
          {SPELL_CLASSES.map((spellClass) => <option key={spellClass}>{spellClass}</option>)}
        </select>
        <select
          aria-label="Filter spells by concentration"
          value={filters.concentration ?? ''}
          onChange={(event) => setFilters((current) => ({
            ...current,
            concentration: event.target.value
              ? event.target.value as ReferenceLibraryFilters['concentration']
              : undefined,
          }))}
        >
          <option value="">Any concentration</option>
          <option value="yes">Concentration</option>
          <option value="no">No concentration</option>
        </select>
        <select
          aria-label="Filter spells by ritual"
          value={filters.ritual ?? ''}
          onChange={(event) => setFilters((current) => ({
            ...current,
            ritual: event.target.value ? event.target.value as ReferenceLibraryFilters['ritual'] : undefined,
          }))}
        >
          <option value="">Any ritual</option>
          <option value="yes">Ritual</option>
          <option value="no">Not a ritual</option>
        </select>
      </div>
    );
  }

  if (filters.category === 'magic-items') {
    return (
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <select
          aria-label="Filter magic items by rarity"
          value={filters.magicItemRarity ?? ''}
          onChange={(event) => setFilters((current) => ({
            ...current,
            magicItemRarity: event.target.value
              ? event.target.value as ReferenceLibraryFilters['magicItemRarity']
              : undefined,
          }))}
        >
          <option value="">All rarities</option>
          {MAGIC_ITEM_RARITIES.map((rarity) => <option key={rarity}>{rarity}</option>)}
        </select>
        <select
          aria-label="Filter magic items by category"
          value={filters.magicItemCategory ?? ''}
          onChange={(event) => setFilters((current) => ({
            ...current,
            magicItemCategory: event.target.value
              ? event.target.value as ReferenceLibraryFilters['magicItemCategory']
              : undefined,
          }))}
        >
          <option value="">All item categories</option>
          {MAGIC_ITEM_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
        </select>
        <select
          aria-label="Filter magic items by attunement"
          value={filters.attunement ?? ''}
          onChange={(event) => setFilters((current) => ({
            ...current,
            attunement: event.target.value ? event.target.value as ReferenceLibraryFilters['attunement'] : undefined,
          }))}
        >
          <option value="">Any attunement</option>
          <option value="required">Attunement required</option>
          <option value="not-required">No attunement</option>
        </select>
      </div>
    );
  }

  if (filters.category === 'equipment') {
    return (
      <div className="mt-3 max-w-sm">
        <select
          aria-label="Filter equipment by category"
          value={filters.equipmentCategory ?? ''}
          onChange={(event) => setFilters((current) => ({
            ...current,
            equipmentCategory: event.target.value
              ? event.target.value as ReferenceLibraryFilters['equipmentCategory']
              : undefined,
          }))}
          className="w-full"
        >
          <option value="">All equipment categories</option>
          {EQUIPMENT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
        </select>
      </div>
    );
  }

  if (filters.category === 'feats') {
    return (
      <div className="mt-3 max-w-sm">
        <select
          aria-label="Filter feats by category"
          value={filters.featCategory ?? ''}
          onChange={(event) => setFilters((current) => ({
            ...current,
            featCategory: event.target.value
              ? event.target.value as ReferenceLibraryFilters['featCategory']
              : undefined,
          }))}
          className="w-full"
        >
          <option value="">All feat categories</option>
          {FEAT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
        </select>
      </div>
    );
  }

  return null;
}

function ResourceDetail({
  entry,
  bookmarked,
  onToggleBookmark,
}: {
  entry: ReferenceLibraryEntry;
  bookmarked: boolean;
  onToggleBookmark: () => void;
}) {
  switch (entry.category) {
    case 'rules':
      return <RuleDetail rule={entry.resource} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark} />;
    case 'classes':
      return <ClassDetail characterClass={entry.resource} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark} />;
    case 'spells':
      return <SpellDetail spell={entry.resource} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark} />;
    case 'equipment':
      return <EquipmentDetail equipment={entry.resource} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark} />;
    case 'magic-items':
      return <MagicItemDetail item={entry.resource} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark} />;
    case 'feats':
      return <FeatDetail feat={entry.resource} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark} />;
    case 'backgrounds':
      return <BackgroundDetail background={entry.resource} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark} />;
    case 'species':
      return <SpeciesDetail species={entry.resource} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark} />;
  }
}

function RuleDetail({ rule, bookmarked, onToggleBookmark }: { rule: SrdReferenceArticle; bookmarked: boolean; onToggleBookmark: () => void }) {
  return (
    <article className="card">
      <DetailHeader eyebrow={rule.group} title={rule.name} icon={<BookOpen size={20} aria-hidden="true" />} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark}>
        <p className="mt-1 text-sm text-[var(--text-2)]">{rule.summary}</p>
      </DetailHeader>
      <TextSections sections={rule.sections} />
      <SourceFooter />
    </article>
  );
}

function ClassDetail({ characterClass, bookmarked, onToggleBookmark }: { characterClass: SrdClassEntry; bookmarked: boolean; onToggleBookmark: () => void }) {
  return (
    <article className="card">
      <DetailHeader eyebrow={`${characterClass.className} ${characterClass.kind}`} title={characterClass.name} icon={<GraduationCap size={20} aria-hidden="true" />} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark}>
        <p className="mt-1 text-sm text-[var(--text-2)]">{characterClass.summary}</p>
      </DetailHeader>
      <TextSections sections={characterClass.sections} />
      <SourceFooter />
    </article>
  );
}

function EquipmentDetail({ equipment, bookmarked, onToggleBookmark }: { equipment: SrdEquipmentItem; bookmarked: boolean; onToggleBookmark: () => void }) {
  const facts = [
    ...(equipment.cost ? [{ label: 'Cost', value: equipment.cost }] : []),
    ...(equipment.weight ? [{ label: 'Weight', value: equipment.weight }] : []),
    ...equipment.facts,
  ];
  return (
    <article className="card">
      <DetailHeader eyebrow={equipment.category} title={equipment.name} icon={<Backpack size={20} aria-hidden="true" />} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark}>
        <p className="mt-1 text-sm text-[var(--text-2)]">{equipment.summary}</p>
      </DetailHeader>
      {facts.length > 0 && (
        <dl className="my-4 grid gap-2 sm:grid-cols-2">
          {facts.map((item) => <Fact key={item.label} term={item.label}>{item.value}</Fact>)}
        </dl>
      )}
      {equipment.description && <Prose text={equipment.description} />}
      <SourceFooter />
    </article>
  );
}

function TextSections({ sections }: { sections: SrdTextSection[] }) {
  return (
    <div className="mt-4 space-y-5">
      {sections.map((section, index) => (
        <section key={`${index}:${section.heading ?? section.text.slice(0, 30)}`}>
          {section.heading && <h3 className="mb-2 text-lg">{section.heading}</h3>}
          {section.text && <Prose text={section.text} />}
        </section>
      ))}
    </div>
  );
}

function DetailHeader({
  eyebrow,
  title,
  icon,
  bookmarked,
  onToggleBookmark,
  children,
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  bookmarked: boolean;
  onToggleBookmark: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-[var(--line-subtle)] pb-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line-subtle)] bg-[var(--bronze-wash)] text-[var(--bronze-light)] print:hidden">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="micro-label">{eyebrow}</p>
          <h2 className="mt-1 text-2xl leading-tight sm:text-3xl">{title}</h2>
          {children}
        </div>
        <button
          type="button"
          aria-pressed={bookmarked}
          onClick={onToggleBookmark}
          className={`btn-secondary shrink-0 print:hidden ${bookmarked ? 'border-[var(--bronze)] text-[var(--bronze-light)]' : ''}`}
        >
          {bookmarked ? <BookmarkCheck size={17} aria-hidden="true" /> : <Bookmark size={17} aria-hidden="true" />}
          <span className="hidden sm:inline">{bookmarked ? 'Saved' : 'Save'}</span>
        </button>
      </div>
    </header>
  );
}

function SpellDetail({
  spell,
  bookmarked,
  onToggleBookmark,
}: {
  spell: Spell;
  bookmarked: boolean;
  onToggleBookmark: () => void;
}) {
  return (
    <article className="card">
      <DetailHeader
        eyebrow={`${levelLabel(spell.level)} ${spell.school}`}
        title={spell.name}
        icon={<Sparkles size={20} aria-hidden="true" />}
        bookmarked={bookmarked}
        onToggleBookmark={onToggleBookmark}
      >
        <p className="mt-1 text-xs text-[var(--text-2)]">
          {spell.components}
          {spell.concentration && <strong className="ml-2 text-[var(--bronze)]">Concentration</strong>}
          {spell.ritual && <strong className="ml-2">Ritual</strong>}
        </p>
      </DetailHeader>
      <div className="my-4 flex flex-wrap gap-1">
        {spell.classes.map((spellClass) => (
          <span key={spellClass} className="rounded bg-[var(--steel-800)] px-2 py-1 text-[10px] text-[var(--text-2)]">{spellClass}</span>
        ))}
      </div>
      <dl className="mb-4 grid gap-2 sm:grid-cols-2">
        <Fact term="Casting Time">{spell.castingTime}</Fact>
        <Fact term="Range">{spell.range}{spell.area ? ` · ${spell.area}` : ''}</Fact>
        <Fact term="Duration">{spell.duration}</Fact>
        <Fact term="Mechanic">
          {[spell.saveType ? `${spell.saveType} save` : undefined, spell.attackType ? `${spell.attackType} spell attack` : undefined, spell.damageType].filter(Boolean).join(' · ') || 'Spell effect'}
        </Fact>
      </dl>
      <p className="mb-3 text-sm font-bold">{spell.effectSummary}</p>
      {spell.upcast && (
        <p className="mb-3 text-sm text-[var(--text-2)]">
          <strong className="text-[var(--bronze)]">At Higher Levels:</strong> {spell.upcast}
        </p>
      )}
      <Prose text={spell.description} />
      <SourceFooter source={spell.source} />
    </article>
  );
}

function SourceFooter({ source = 'SRD 5.2.1' }: { source?: string }) {
  return (
    <footer className="mt-6 border-t border-[var(--line-subtle)] pt-3 text-xs text-[var(--text-3)]">
      {source} · CC BY 4.0 · <Link href="/credits" className="underline hover:text-[var(--bronze-light)]">Credits</Link>
    </footer>
  );
}

function Prose({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {text.split(/\n{2,}/).filter(Boolean).map((paragraph, index) => (
        <p key={`${index}:${paragraph.slice(0, 24)}`} className="whitespace-pre-line">{paragraph}</p>
      ))}
    </div>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-3 py-2">
      <dt className="micro-label">{term}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-[var(--text-1)]">{children}</dd>
    </div>
  );
}

function MagicItemDetail({ item, bookmarked, onToggleBookmark }: { item: MagicItem; bookmarked: boolean; onToggleBookmark: () => void }) {
  return (
    <article className="card">
      <DetailHeader eyebrow="Magic Item" title={item.name} icon={<PackageOpen size={20} aria-hidden="true" />} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark}>
        <p className="mt-1 text-sm italic text-[var(--text-2)]">
          {item.categoryDetail ?? item.category}, {item.rarityText.toLocaleLowerCase()}
          {item.requiresAttunement ? ` (requires attunement${item.attunement ? ` ${item.attunement}` : ''})` : ''}
        </p>
      </DetailHeader>
      <dl className="my-4 grid gap-2 sm:grid-cols-2">
        <Fact term="Category">{item.categoryDetail ?? item.category}</Fact>
        <Fact term="Rarity">{item.rarityText}</Fact>
        <Fact term="Attunement">{item.requiresAttunement ? item.attunement || 'Required' : 'Not required'}</Fact>
        <Fact term="Rarity bands">{item.rarities.join(', ')}</Fact>
      </dl>
      <Prose text={item.description} />
      <SourceFooter source={item.source} />
    </article>
  );
}

function FeatDetail({ feat, bookmarked, onToggleBookmark }: { feat: Feat; bookmarked: boolean; onToggleBookmark: () => void }) {
  return (
    <article className="card">
      <DetailHeader eyebrow={`${feat.category} Feat`} title={feat.name} icon={<ShieldCheck size={20} aria-hidden="true" />} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark}>
        {feat.prerequisite && <p className="mt-1 text-sm italic text-[var(--text-2)]">Prerequisite: {feat.prerequisite}</p>}
      </DetailHeader>
      <div className="mt-4"><Prose text={feat.description} /></div>
      <SourceFooter source={feat.source} />
    </article>
  );
}

function BackgroundDetail({ background, bookmarked, onToggleBookmark }: { background: Background; bookmarked: boolean; onToggleBookmark: () => void }) {
  return (
    <article className="card">
      <DetailHeader eyebrow="Background" title={background.name} icon={<UserRound size={20} aria-hidden="true" />} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark} />
      <dl className="my-4 grid gap-2 sm:grid-cols-2">
        <Fact term="Ability Scores">{background.abilityScores.join(', ')}</Fact>
        <Fact term="Origin Feat">{background.feat}</Fact>
        <Fact term="Skill Proficiencies">{background.skillProficiencies.join(', ')}</Fact>
        <Fact term="Tool Proficiency">{background.toolProficiency}</Fact>
        <div className="sm:col-span-2"><Fact term="Equipment">{background.equipment}</Fact></div>
      </dl>
      <Prose text={background.description} />
      <SourceFooter source={background.source} />
    </article>
  );
}

function SpeciesDetail({ species, bookmarked, onToggleBookmark }: { species: Species; bookmarked: boolean; onToggleBookmark: () => void }) {
  return (
    <article className="card">
      <DetailHeader eyebrow="Species" title={species.name} icon={<Sparkles size={20} aria-hidden="true" />} bookmarked={bookmarked} onToggleBookmark={onToggleBookmark} />
      <dl className="my-4 grid gap-2 sm:grid-cols-3">
        <Fact term="Creature Type">{species.creatureType}</Fact>
        <Fact term="Size">{species.size}</Fact>
        <Fact term="Speed">{species.speed} feet</Fact>
      </dl>
      <section aria-labelledby={`${species.id}-traits`}>
        <h3 id={`${species.id}-traits`} className="micro-label mb-3">Species Traits</h3>
        <div className="space-y-4">
          {species.traits.map((trait) => (
            <section key={trait.name} className="border-l-2 border-[var(--bronze)] pl-3">
              <h4 className="font-display text-base text-[var(--text-1)]">{trait.name}</h4>
              <div className="mt-1"><Prose text={trait.description} /></div>
            </section>
          ))}
        </div>
      </section>
      <SourceFooter source={species.source} />
    </article>
  );
}
