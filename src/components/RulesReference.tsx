'use client';

import { useId, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import {
  filterRulesReference,
  RULES_REFERENCE_CATEGORIES,
  SRD_5_2_1_URL,
  type RulesReferenceCategoryId,
} from '@/data/rules-reference';

const DEFAULT_OPEN = new Set(['saving-throws', 'typical-dcs', 'cover', 'concentration', 'death-saves']);

export default function RulesReference() {
  const instanceId = useId();
  const searchId = `${instanceId}-search`;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<RulesReferenceCategoryId | 'all'>('all');
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(DEFAULT_OPEN));
  const entries = useMemo(() => filterRulesReference(query, category), [category, query]);
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

  return <div className="rules-reference rounded-lg bg-[var(--steel-950)] p-3 sm:p-4">
    <div className="rules-reference-controls print:hidden">
      <div>
        <label htmlFor={searchId} className="micro-label mb-1.5 block">Search the reference</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" size={17} aria-hidden="true" />
          <input
            id={searchId}
            type="search"
            className="w-full !pl-10"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Conditions, saves, actions, cover…"
          />
        </div>
      </div>
      <fieldset className="mt-3">
        <legend className="micro-label mb-1.5">Filter by topic</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`filter-chip ${category === 'all' ? 'active' : ''}`} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All</button>
          {RULES_REFERENCE_CATEGORIES.map((item) => <button key={item.id} type="button" className={`filter-chip ${category === item.id ? 'active' : ''}`} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>)}
        </div>
      </fieldset>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--text-3)]">
        <span role="status" aria-live="polite" aria-atomic="true">{resultSummary}</span>
        {entries.length > 0 && <span className="flex gap-1">
          <button type="button" className="inline-flex min-h-11 items-center rounded-md px-2 hover:text-[var(--bronze-light)]" onClick={() => setAll(true)}>Expand all</button>
          <button type="button" className="inline-flex min-h-11 items-center rounded-md px-2 hover:text-[var(--bronze-light)]" onClick={() => setAll(false)}>Collapse all</button>
        </span>}
      </div>
    </div>

    {entries.length > 0 ? <div className="mt-3 grid gap-2 lg:grid-cols-2 print:grid-cols-1">
      {entries.map((entry) => {
        const open = openIds.has(entry.id);
        const contentId = `${instanceId}-${entry.id}-details`;
        const headingId = `${instanceId}-${entry.id}-heading`;
        return <article key={entry.id} aria-labelledby={headingId} className="rules-reference-entry overflow-hidden rounded-lg border border-[var(--steel-800)] bg-[var(--steel-900)]">
          <h3 id={headingId} aria-label={entry.title} className="print:hidden">
            <button
              type="button"
              className="flex min-h-11 w-full items-start gap-3 p-3 text-left"
              onClick={() => setOpenIds((current) => {
                const next = new Set(current);
                if (open) next.delete(entry.id); else next.add(entry.id);
                return next;
              })}
              aria-expanded={open}
              aria-controls={contentId}
            >
              <span className="min-w-0 flex-1"><strong className="block text-sm text-[var(--text-1)]">{entry.title}</strong><span className="mt-1 block text-xs leading-relaxed text-[var(--text-2)]">{entry.summary}</span></span>
              {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
            </button>
          </h3>
          <div className="hidden p-3 pb-1 print:block"><h4 className="text-base">{entry.title}</h4><p className="mt-1 text-xs leading-relaxed text-[var(--text-2)]">{entry.summary}</p></div>
          <div id={contentId} className={`${open ? 'block' : 'hidden'} border-t border-[var(--steel-800)] px-3 pb-3 pt-2 print:block print:border-0 print:pt-0`}>
            {entry.details.length > 0 ? <ul className="space-y-1 text-xs leading-relaxed text-[var(--text-2)]">{entry.details.map((detail) => <li key={detail} className="flex gap-2"><span className="text-[var(--bronze)]" aria-hidden="true">•</span><span>{detail}</span></li>)}</ul> : <p className="text-xs italic text-[var(--text-3)]">No additional effects.</p>}
            <p className="mt-2 border-t border-[var(--line-subtle)] pt-2 text-[10px] leading-relaxed text-[var(--text-3)]">
              <span className="sr-only">Rules source: </span>
              {entry.sources.map((source, index) => <span key={`${source.section}-${source.page}-${index}`}>
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
              </span>)}
            </p>
          </div>
        </article>;
      })}
    </div> : <p className="mt-4 rounded-lg border border-dashed border-[var(--steel-800)] p-5 text-center text-sm text-[var(--text-3)]">
      {query.trim() ? <>No reference matches “{query.trim()}”. Try a broader term or another topic.</> : <>No references are available in this topic.</>}
    </p>}

    <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-3)] print:text-[9px]">
      Concise table reference based on the 2024 rules in SRD 5.2.1. Specific features and effects can override these general rules.
      {' '}<a className="text-[var(--bronze-light)] underline print:no-underline" href={SRD_5_2_1_URL} target="_blank" rel="noreferrer">Open the full SRD</a>.
    </p>
  </div>;
}
