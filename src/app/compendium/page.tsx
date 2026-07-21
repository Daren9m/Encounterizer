'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, PackageOpen, Search, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import PrintButton from '@/components/PrintButton';
import ToolPageHeader from '@/components/ToolPageHeader';
import type { Background, Feat, MagicItem, Species } from '@/lib/srd-content-types';
import {
  FEAT_CATEGORIES,
  filterSrdCompendium,
  getSrdCompendiumCategoryLabel,
  getSrdCompendiumEntrySummary,
  MAGIC_ITEM_CATEGORIES,
  MAGIC_ITEM_RARITIES,
  SRD_COMPENDIUM_CATEGORIES,
  SRD_COMPENDIUM_ENTRIES,
  type SrdCompendiumCategoryFilter,
  type SrdCompendiumEntry,
  type SrdCompendiumFilters,
} from '@/lib/srd-compendium';

const DEFAULT_FILTERS: SrdCompendiumFilters = {
  query: '',
  category: 'all',
};

const EXISTING_SRD_REFERENCES = [
  { href: '/monsters', label: 'Bestiary', count: 331, description: 'Monster stat blocks' },
  { href: '/spells', label: 'Spells', count: 339, description: 'Full spell descriptions' },
  { href: '/reference', label: 'Rules', count: 33, description: 'Table-ready rules entries' },
];

export default function CompendiumPage() {
  const [filters, setFilters] = useState<SrdCompendiumFilters>(DEFAULT_FILTERS);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => filterSrdCompendium(filters), [filters]);
  const selected = useMemo(() => {
    if (!selectedKey) return null;
    const entry = SRD_COMPENDIUM_ENTRIES.find((candidate) => candidate.key === selectedKey);
    return entry && results.some((candidate) => candidate.key === entry.key) ? entry : null;
  }, [results, selectedKey]);
  const hasFilters = filters.query.trim() !== ''
    || filters.category !== 'all'
    || Boolean(filters.magicItemRarity)
    || Boolean(filters.magicItemCategory)
    || Boolean(filters.attunement)
    || Boolean(filters.featCategory);

  function chooseCategory(category: SrdCompendiumCategoryFilter) {
    setFilters((current) => ({
      ...DEFAULT_FILTERS,
      query: current.query,
      category,
    }));
  }

  function selectEntry(entry: SrdCompendiumEntry) {
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
        path="/compendium"
        description="Search every SRD 5.2.1 magic item, feat, background, and species, then open a focused rules view for the table."
        actions={(
          <div className="flex flex-col items-end gap-2">
            <span className="text-sm text-[var(--text-2)]">{SRD_COMPENDIUM_ENTRIES.length} resources</span>
            {selected && <PrintButton label="Print selected" />}
          </div>
        )}
      />

      <section aria-labelledby="srd-library-coverage" className="card panel-accent mb-5 print:hidden">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow mb-2">Complete structured library</p>
            <h2 id="srd-library-coverage" className="text-xl">Every imported SRD resource is searchable</h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-2)]">
              This compendium completes the character-and-item side of the library. Monsters,
              spells, and table rules keep their purpose-built browsers.
            </p>
          </div>
          <nav aria-label="Other SRD references" className="grid gap-2 sm:grid-cols-3 lg:min-w-[32rem]">
            {EXISTING_SRD_REFERENCES.map((reference) => (
              <Link
                key={reference.href}
                href={reference.href}
                className="rounded-lg border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-3 py-2 transition-colors hover:border-[var(--bronze)]"
              >
                <span className="block text-sm font-semibold text-[var(--text-1)]">
                  {reference.label} <span className="text-[var(--bronze)]">{reference.count}</span>
                </span>
                <span className="mt-0.5 block text-[11px] text-[var(--text-3)]">{reference.description}</span>
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <section aria-label="Compendium filters" className="card mb-5 print:hidden">
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search the SRD compendium"
            placeholder="Search names, traits, prerequisites, effects, equipment..."
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            className="w-full pl-10 text-base"
            autoFocus
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Resource type">
          <button
            type="button"
            className={`filter-chip ${filters.category === 'all' ? 'active' : ''}`}
            aria-pressed={filters.category === 'all'}
            onClick={() => chooseCategory('all')}
          >
            All <span className="ml-1 opacity-75">{SRD_COMPENDIUM_ENTRIES.length}</span>
          </button>
          {SRD_COMPENDIUM_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`filter-chip ${filters.category === category.id ? 'active' : ''}`}
              aria-pressed={filters.category === category.id}
              onClick={() => chooseCategory(category.id)}
            >
              {category.label} <span className="ml-1 opacity-75">{category.count}</span>
            </button>
          ))}
        </div>

        {filters.category === 'magic-items' && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <select
              aria-label="Filter magic items by rarity"
              value={filters.magicItemRarity ?? ''}
              onChange={(event) => setFilters((current) => ({
                ...current,
                magicItemRarity: event.target.value
                  ? event.target.value as SrdCompendiumFilters['magicItemRarity']
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
                  ? event.target.value as SrdCompendiumFilters['magicItemCategory']
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
                attunement: event.target.value
                  ? event.target.value as SrdCompendiumFilters['attunement']
                  : undefined,
              }))}
            >
              <option value="">Any attunement</option>
              <option value="required">Attunement required</option>
              <option value="not-required">No attunement</option>
            </select>
          </div>
        )}

        {filters.category === 'feats' && (
          <div className="mt-3 max-w-sm">
            <select
              aria-label="Filter feats by category"
              value={filters.featCategory ?? ''}
              onChange={(event) => setFilters((current) => ({
                ...current,
                featCategory: event.target.value
                  ? event.target.value as SrdCompendiumFilters['featCategory']
                  : undefined,
              }))}
              className="w-full"
            >
              <option value="">All feat categories</option>
              {FEAT_CATEGORIES.map((category) => <option key={category}>{category}</option>)}
            </select>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--text-3)]">
          <span aria-live="polite">{results.length} matching {results.length === 1 ? 'resource' : 'resources'}</span>
          {hasFilters && (
            <button
              type="button"
              className="min-h-10 px-2 font-medium text-[var(--text-2)] hover:text-[var(--bronze-light)]"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              Clear filters
            </button>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.65fr)]">
        <div
          ref={resultsRef}
          tabIndex={-1}
          aria-label="Compendium results"
          className="space-y-1 print:hidden lg:max-h-[76vh] lg:overflow-y-auto lg:pr-2"
        >
          {results.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => selectEntry(entry)}
              aria-pressed={selected?.key === entry.key}
              className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                selected?.key === entry.key
                  ? 'border-[var(--bronze)] bg-[var(--steel-800)]'
                  : 'border-transparent hover:bg-[var(--steel-900)]'
              }`}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <strong className="block text-sm text-[var(--text-1)]">{entry.name}</strong>
                  <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-3)]">
                    {getSrdCompendiumEntrySummary(entry)}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-[var(--bronze-wash)] px-2 py-1 text-[10px] font-semibold text-[var(--bronze-light)]">
                  {getSrdCompendiumCategoryLabel(entry.category)}
                </span>
              </span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="empty-state">
              <p>No SRD resources match those filters.</p>
              <button type="button" className="btn-secondary mt-4" onClick={() => setFilters(DEFAULT_FILTERS)}>
                Show all resources
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
              <ResourceDetail entry={selected} />
            </div>
          ) : (
            <div className="card py-14 text-center text-[var(--text-2)] print:hidden">
              <BookOpen size={42} className="mx-auto mb-3 text-[var(--text-3)]" aria-hidden="true" />
              <h2 className="text-xl">Choose a resource</h2>
              <p className="mt-2 text-sm">Select an item, feat, background, or species to read its full SRD entry.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResourceDetail({ entry }: { entry: SrdCompendiumEntry }) {
  switch (entry.category) {
    case 'magic-items':
      return <MagicItemDetail item={entry.resource} />;
    case 'feats':
      return <FeatDetail feat={entry.resource} />;
    case 'backgrounds':
      return <BackgroundDetail background={entry.resource} />;
    case 'species':
      return <SpeciesDetail species={entry.resource} />;
  }
}

function DetailHeader({
  eyebrow,
  title,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-[var(--line-subtle)] pb-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line-subtle)] bg-[var(--bronze-wash)] text-[var(--bronze-light)] print:hidden">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="micro-label">{eyebrow}</p>
          <h2 className="mt-1 text-2xl leading-tight sm:text-3xl">{title}</h2>
          {children}
        </div>
      </div>
    </header>
  );
}

function SourceFooter() {
  return (
    <footer className="mt-6 border-t border-[var(--line-subtle)] pt-3 text-xs text-[var(--text-3)]">
      System Reference Document 5.2.1 · CC BY 4.0 · <Link href="/credits" className="underline hover:text-[var(--bronze-light)]">Credits</Link>
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

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-[var(--line-subtle)] bg-[var(--surface-inset)] px-3 py-2">
      <dt className="micro-label">{term}</dt>
      <dd className="mt-1 text-sm leading-relaxed text-[var(--text-1)]">{children}</dd>
    </div>
  );
}

function MagicItemDetail({ item }: { item: MagicItem }) {
  return (
    <article className="card">
      <DetailHeader eyebrow="Magic Item" title={item.name} icon={<PackageOpen size={20} aria-hidden="true" />}>
        <p className="mt-1 text-sm italic text-[var(--text-2)]">
          {item.categoryDetail ?? item.category}, {item.rarityText.toLocaleLowerCase()}
          {item.requiresAttunement ? ` (requires attunement${item.attunement ? ` ${item.attunement}` : ''})` : ''}
        </p>
      </DetailHeader>
      <dl className="my-4 grid gap-2 sm:grid-cols-2">
        <Fact term="Category">{item.categoryDetail ?? item.category}</Fact>
        <Fact term="Rarity">{item.rarityText}</Fact>
        <Fact term="Attunement">
          {item.requiresAttunement ? item.attunement || 'Required' : 'Not required'}
        </Fact>
        <Fact term="Rarity bands">{item.rarities.join(', ')}</Fact>
      </dl>
      <Prose text={item.description} />
      <SourceFooter />
    </article>
  );
}

function FeatDetail({ feat }: { feat: Feat }) {
  return (
    <article className="card">
      <DetailHeader eyebrow={`${feat.category} Feat`} title={feat.name} icon={<ShieldCheck size={20} aria-hidden="true" />}>
        {feat.prerequisite && <p className="mt-1 text-sm italic text-[var(--text-2)]">Prerequisite: {feat.prerequisite}</p>}
      </DetailHeader>
      <div className="mt-4">
        <Prose text={feat.description} />
      </div>
      <SourceFooter />
    </article>
  );
}

function BackgroundDetail({ background }: { background: Background }) {
  return (
    <article className="card">
      <DetailHeader eyebrow="Background" title={background.name} icon={<UserRound size={20} aria-hidden="true" />} />
      <dl className="my-4 grid gap-2 sm:grid-cols-2">
        <Fact term="Ability Scores">{background.abilityScores.join(', ')}</Fact>
        <Fact term="Origin Feat">{background.feat}</Fact>
        <Fact term="Skill Proficiencies">{background.skillProficiencies.join(', ')}</Fact>
        <Fact term="Tool Proficiency">{background.toolProficiency}</Fact>
        <div className="sm:col-span-2">
          <Fact term="Equipment">{background.equipment}</Fact>
        </div>
      </dl>
      <Prose text={background.description} />
      <SourceFooter />
    </article>
  );
}

function SpeciesDetail({ species }: { species: Species }) {
  return (
    <article className="card">
      <DetailHeader eyebrow="Species" title={species.name} icon={<Sparkles size={20} aria-hidden="true" />} />
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
      <SourceFooter />
    </article>
  );
}
