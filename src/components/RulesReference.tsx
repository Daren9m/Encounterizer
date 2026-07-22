'use client';

import { useId, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import {
  filterRulesReference,
  RULES_REFERENCE_CATEGORIES,
  SRD_5_2_1_URL,
  type RulesReferenceCategoryId,
  type RulesReferenceEntry,
} from '@/data/rules-reference';

const DEFAULT_OPEN = new Set(['saving-throws', 'typical-dcs', 'cover', 'concentration', 'death-saves']);

const SHORT_CATEGORY_LABELS: Record<RulesReferenceCategoryId, string> = {
  'checks-saves': 'Checks',
  conditions: 'Conditions',
  combat: 'Combat',
  'damage-recovery': 'Damage',
  'movement-visibility': 'Movement',
};

type RulesReferenceVariant = 'embedded' | 'page';

export default function RulesReference({ variant = 'embedded' }: { variant?: RulesReferenceVariant }) {
  const instanceId = useId();
  const searchId = `${instanceId}-search`;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<RulesReferenceCategoryId | 'all'>('all');
  const [openIds, setOpenIds] = useState<Set<string>>(() => (
    variant === 'embedded' ? new Set(DEFAULT_OPEN) : new Set()
  ));
  const entries = useMemo(() => filterRulesReference(query, category), [category, query]);
  const pageVariant = variant === 'page';
  const showCategoryGroups = pageVariant && category === 'all' && query.trim().length === 0;
  const groupedEntries = useMemo(() => (
    showCategoryGroups
      ? RULES_REFERENCE_CATEGORIES.map((item) => ({
          ...item,
          entries: entries.filter((entry) => entry.category === item.id),
        })).filter((group) => group.entries.length > 0)
      : []
  ), [entries, showCategoryGroups]);
  const activeCategory = category === 'all'
    ? 'all categories'
    : RULES_REFERENCE_CATEGORIES.find((item) => item.id === category)?.label.toLocaleLowerCase() ?? 'the selected topic';
  const resultSummary = entries.length === 0
    ? `No references match ${query.trim() ? `“${query.trim()}”` : activeCategory}.`
    : `${entries.length} ${entries.length === 1 ? 'reference' : 'references'}`;

  function setAll(open: boolean) {
    setOpenIds((current) => {
      const next = new Set(current);
      entries.forEach((entry) => {
        if (open) next.add(entry.id);
        else next.delete(entry.id);
      });
      return next;
    });
  }

  function toggleEntry(entryId: string) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  const renderEntry = (entry: RulesReferenceEntry) => (
    <ReferenceEntry
      key={entry.id}
      entry={entry}
      instanceId={instanceId}
      open={openIds.has(entry.id)}
      variant={variant}
      onToggle={() => toggleEntry(entry.id)}
    />
  );

  return (
    <div className={`rules-reference ${pageVariant ? '' : 'rounded-lg bg-[var(--steel-950)] p-3 sm:p-4'}`}>
      <div className="rules-reference-controls print:hidden">
        <div>
          <label
            htmlFor={searchId}
            className={pageVariant ? 'sr-only' : 'micro-label mb-1.5 block'}
          >
            Search the reference
          </label>
          <div className="relative">
            <Search
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[var(--text-3)] ${pageVariant ? 'left-3.5' : 'left-3'}`}
              size={pageVariant ? 19 : 17}
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="search"
              className={`w-full ${pageVariant ? '!min-h-14 !rounded-xl !pl-11 !text-base' : '!pl-10'}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={pageVariant ? 'Search conditions, saves, actions, cover…' : 'Conditions, saves, actions, cover…'}
              autoComplete="off"
            />
          </div>
        </div>

        <fieldset className="mt-3 min-w-0">
          <legend className={pageVariant ? 'sr-only' : 'micro-label mb-1.5'}>Filter by topic</legend>
          <div className={pageVariant ? '-mx-1 overflow-x-auto px-1 pb-1' : ''}>
            <div className={pageVariant ? 'flex min-w-max gap-2' : 'flex flex-wrap gap-2'}>
              <button
                type="button"
                className={`filter-chip shrink-0 ${category === 'all' ? 'active' : ''}`}
                aria-pressed={category === 'all'}
                onClick={() => setCategory('all')}
              >
                All
              </button>
              {RULES_REFERENCE_CATEGORIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`filter-chip shrink-0 ${category === item.id ? 'active' : ''}`}
                  aria-pressed={category === item.id}
                  onClick={() => setCategory(item.id)}
                >
                  {pageVariant ? SHORT_CATEGORY_LABELS[item.id] : item.label}
                </button>
              ))}
            </div>
          </div>
        </fieldset>

        <div className={`flex items-center gap-3 text-xs text-[var(--text-3)] ${pageVariant ? 'mt-2' : 'mt-3 justify-between'}`}>
          <span role="status" aria-live="polite" aria-atomic="true">{resultSummary}</span>
          {!pageVariant && entries.length > 0 && (
            <span className="flex gap-1">
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-md px-2 hover:text-[var(--bronze-light)]"
                onClick={() => setAll(true)}
              >
                Expand all
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-md px-2 hover:text-[var(--bronze-light)]"
                onClick={() => setAll(false)}
              >
                Collapse all
              </button>
            </span>
          )}
        </div>
      </div>

      {entries.length > 0 ? (
        showCategoryGroups ? (
          <div className="mt-5 space-y-7">
            {groupedEntries.map((group) => (
              <section key={group.id} aria-labelledby={`${instanceId}-${group.id}-group-heading`}>
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id={`${instanceId}-${group.id}-group-heading`} className="text-lg">
                    {group.label}
                  </h2>
                  <span className="text-xs text-[var(--text-3)]">
                    {group.entries.length}
                  </span>
                </div>
                <div className="mt-2 divide-y divide-[var(--line-subtle)] border-y border-[var(--line-subtle)]">
                  {group.entries.map(renderEntry)}
                </div>
              </section>
            ))}
          </div>
        ) : pageVariant ? (
          <section className="mt-4" aria-labelledby={`${instanceId}-results-heading`}>
            <h2 id={`${instanceId}-results-heading`} className="sr-only">Rule references</h2>
            <div className="divide-y divide-[var(--line-subtle)] border-y border-[var(--line-subtle)]">
              {entries.map(renderEntry)}
            </div>
          </section>
        ) : (
          <div className="rules-reference-results mt-3 grid gap-2 print:grid-cols-1">
            {entries.map(renderEntry)}
          </div>
        )
      ) : (
        <p className="mt-4 rounded-lg border border-dashed border-[var(--steel-800)] p-5 text-center text-sm text-[var(--text-3)]">
          {query.trim()
            ? <>No reference matches “{query.trim()}”. Try a broader term or another topic.</>
            : <>No references are available in this topic.</>}
        </p>
      )}

      <p className={`${pageVariant ? 'mt-5' : 'mt-3'} text-[10px] leading-relaxed text-[var(--text-3)] print:text-[9px]`}>
        Concise table reference based on the 2024 rules in SRD 5.2.1. Specific features and effects can override these general rules.
        {' '}
        <a
          className="text-[var(--bronze-light)] underline print:no-underline"
          href={SRD_5_2_1_URL}
          target="_blank"
          rel="noreferrer"
        >
          Open the full SRD
        </a>.
      </p>
    </div>
  );
}

function ReferenceEntry({
  entry,
  instanceId,
  open,
  variant,
  onToggle,
}: {
  entry: RulesReferenceEntry;
  instanceId: string;
  open: boolean;
  variant: RulesReferenceVariant;
  onToggle: () => void;
}) {
  const pageVariant = variant === 'page';
  const contentId = `${instanceId}-${entry.id}-details`;
  const headingId = `${instanceId}-${entry.id}-heading`;

  return (
    <article
      aria-labelledby={headingId}
      className={pageVariant
        ? 'rules-reference-entry'
        : 'rules-reference-entry overflow-hidden rounded-lg border border-[var(--steel-800)] bg-[var(--steel-900)]'}
    >
      <h3 id={headingId} aria-label={entry.title} className="print:hidden">
        <button
          type="button"
          className={`flex w-full items-start gap-3 text-left ${pageVariant ? 'min-h-14 px-1 py-4 sm:px-2' : 'min-h-11 p-3'}`}
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={contentId}
        >
          <span className="min-w-0 flex-1">
            <strong className={`block text-[var(--text-1)] ${pageVariant ? 'text-base' : 'text-sm'}`}>
              {entry.title}
            </strong>
            <span className={`mt-1 block leading-relaxed text-[var(--text-2)] ${pageVariant ? 'text-sm' : 'text-xs'}`}>
              {entry.summary}
            </span>
          </span>
          {open
            ? <ChevronUp size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            : <ChevronDown size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
        </button>
      </h3>

      <div className={`${pageVariant ? 'px-1' : 'p-3 pb-1'} hidden print:block`}>
        <h4 className="text-base">{entry.title}</h4>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-2)]">{entry.summary}</p>
      </div>

      <div
        id={contentId}
        className={`${open ? 'block' : 'hidden'} border-t ${pageVariant ? 'border-[var(--line-subtle)] px-1 pb-4 pt-3 text-sm sm:px-2' : 'border-[var(--steel-800)] px-3 pb-3 pt-2'} print:block print:border-0 print:pt-0`}
      >
        {entry.details.length > 0 ? (
          <ul className={`${pageVariant ? 'space-y-1.5 text-sm' : 'space-y-1 text-xs'} leading-relaxed text-[var(--text-2)]`}>
            {entry.details.map((detail) => (
              <li key={detail} className="flex gap-2">
                <span className="text-[var(--bronze)]" aria-hidden="true">•</span>
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${pageVariant ? 'text-sm' : 'text-xs'} italic text-[var(--text-3)]`}>No additional effects.</p>
        )}
        <p className="mt-2 border-t border-[var(--line-subtle)] pt-2 text-[10px] leading-relaxed text-[var(--text-3)]">
          <span className="sr-only">Rules source: </span>
          {entry.sources.map((source, index) => (
            <span key={`${source.section}-${source.page}-${index}`}>
              {index > 0 && <span aria-hidden="true"> · </span>}
              <a
                className="hover:text-[var(--bronze-light)] hover:underline print:no-underline"
                href={SRD_5_2_1_URL}
                target="_blank"
                rel="noreferrer"
                title={source.section}
                aria-label={`${source.document}, ${source.section}, page ${source.page}`}
              >
                {source.document} · p. {source.page}
              </a>
            </span>
          ))}
        </p>
      </div>
    </article>
  );
}
