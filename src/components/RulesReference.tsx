'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import {
  filterRulesReference,
  RULES_REFERENCE_CATEGORIES,
  type RulesReferenceCategoryId,
} from '@/data/rules-reference';

const DEFAULT_OPEN = new Set(['saving-throws', 'typical-dcs', 'cover', 'concentration', 'death-saves']);

export default function RulesReference() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<RulesReferenceCategoryId | 'all'>('all');
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(DEFAULT_OPEN));
  const entries = useMemo(() => filterRulesReference(query, category), [category, query]);

  function setAll(open: boolean) {
    setOpenIds(open ? new Set(entries.map((entry) => entry.id)) : new Set());
  }

  return <div className="rules-reference rounded-lg bg-[var(--steel-950)] p-3 sm:p-4">
    <div className="rules-reference-controls print:hidden">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" size={17} aria-hidden="true" />
        <input
          type="text"
          className="w-full !pl-10"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search conditions, saves, actions, cover…"
          aria-label="Search rules reference"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Rules reference categories">
        <button type="button" className={`filter-chip ${category === 'all' ? 'active' : ''}`} onClick={() => setCategory('all')}>All</button>
        {RULES_REFERENCE_CATEGORIES.map((item) => <button key={item.id} type="button" className={`filter-chip ${category === item.id ? 'active' : ''}`} onClick={() => setCategory(item.id)}>{item.label}</button>)}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-[var(--text-3)]">
        <span>{entries.length} references</span>
        <span className="flex gap-3"><button type="button" className="hover:text-[var(--bronze-light)]" onClick={() => setAll(true)}>Expand all</button><button type="button" className="hover:text-[var(--bronze-light)]" onClick={() => setAll(false)}>Collapse all</button></span>
      </div>
    </div>

    {entries.length > 0 ? <div className="mt-3 grid gap-2 lg:grid-cols-2 print:grid-cols-1">
      {entries.map((entry) => {
        const open = openIds.has(entry.id);
        return <article key={entry.id} className="rules-reference-entry overflow-hidden rounded-lg border border-[var(--steel-800)] bg-[var(--steel-900)]">
          <button
            type="button"
            className="flex w-full items-start gap-3 p-3 text-left print:hidden"
            onClick={() => setOpenIds((current) => {
              const next = new Set(current);
              if (open) next.delete(entry.id); else next.add(entry.id);
              return next;
            })}
            aria-expanded={open}
          >
            <span className="min-w-0 flex-1"><strong className="block text-sm text-[var(--text-1)]">{entry.title}</strong><span className="mt-1 block text-xs leading-relaxed text-[var(--text-2)]">{entry.summary}</span></span>
            {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          </button>
          <div className="hidden p-3 pb-1 print:block"><h4 className="text-base">{entry.title}</h4><p className="mt-1 text-xs leading-relaxed text-[var(--text-2)]">{entry.summary}</p></div>
          <div className={`${open ? 'block' : 'hidden'} border-t border-[var(--steel-800)] px-3 pb-3 pt-2 print:block print:border-0 print:pt-0`}>
            {entry.details.length > 0 ? <ul className="space-y-1 text-xs leading-relaxed text-[var(--text-2)]">{entry.details.map((detail) => <li key={detail} className="flex gap-2"><span className="text-[var(--bronze)]" aria-hidden="true">•</span><span>{detail}</span></li>)}</ul> : <p className="text-xs italic text-[var(--text-3)]">No additional effects.</p>}
          </div>
        </article>;
      })}
    </div> : <p className="mt-4 rounded-lg border border-dashed border-[var(--steel-800)] p-5 text-center text-sm text-[var(--text-3)]">No reference matches “{query}”.</p>}

    <p className="mt-3 text-[10px] leading-relaxed text-[var(--text-3)] print:text-[9px]">
      Concise table reference based on the 2024 rules in SRD 5.2.1. Specific features and effects can override these general rules.
      {' '}<a className="text-[var(--bronze-light)] underline print:no-underline" href="https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf" target="_blank" rel="noreferrer">Open the full SRD</a>.
    </p>
  </div>;
}
