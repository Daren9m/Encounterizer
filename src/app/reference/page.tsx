'use client';

import Link from 'next/link';
import { BookOpen, Download, Sparkles } from 'lucide-react';
import PrintButton from '@/components/PrintButton';
import RulesReference from '@/components/RulesReference';
import ToolPageHeader from '@/components/ToolPageHeader';
import {
  RULES_REFERENCE_CATEGORIES,
  RULES_REFERENCE_ENTRIES,
  SRD_5_2_1_URL,
  rulesReferenceToMarkdown,
} from '@/data/rules-reference';

const CONDITION_COUNT = RULES_REFERENCE_ENTRIES.filter((entry) => entry.category === 'conditions').length;

function downloadReference() {
  const contents = [
    '# DM Rules Reference',
    '',
    'Concise table reference based on the 2024 rules in SRD 5.2.1.',
    `Source: System Reference Document 5.2.1 by Wizards of the Coast LLC (${SRD_5_2_1_URL}).`,
    'Licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/legalcode).',
    '',
    rulesReferenceToMarkdown(),
    '',
  ].join('\n');
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'dm-rules-reference.md';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function ReferencePage() {
  return (
    <div className="animate-fade-in">
      <ToolPageHeader
        path="/reference"
        description="Search the rules that interrupt play most often—conditions, saves, combat timing, recovery, movement, and visibility—in one table-ready reference."
        actions={(
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={downloadReference}>
              <Download size={16} aria-hidden="true" />
              Markdown
            </button>
            <PrintButton label="Print reference" />
          </div>
        )}
      />

      <header className="mb-4 hidden print:block">
        <h1 className="text-3xl">DM Rules Reference</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">2024 rules · SRD 5.2.1</p>
      </header>

      <section className="card panel-accent mb-6 print:hidden" aria-labelledby="reference-overview-heading">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(24rem,1fr)] lg:items-end">
          <div>
            <p className="micro-label">At the table</p>
            <h2 id="reference-overview-heading" className="mt-1 text-2xl">Find the ruling. Keep the scene moving.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-2)]">
              Start with a topic or search the exact term you heard. Each entry leads with the practical ruling, then keeps the exceptions and timing close underneath.
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-[var(--steel-800)] bg-[var(--steel-800)] sm:grid-cols-4 lg:grid-cols-2">
            <ReferenceMetric label="Topics" value={RULES_REFERENCE_CATEGORIES.length.toString()} />
            <ReferenceMetric label="Conditions" value={CONDITION_COUNT.toString()} />
            <ReferenceMetric label="References" value={RULES_REFERENCE_ENTRIES.length.toString()} />
            <ReferenceMetric label="Rules source" value="SRD 5.2.1" />
          </dl>
        </div>
      </section>

      <section aria-labelledby="rules-browser-heading">
        <div className="mb-3 print:hidden">
          <p className="micro-label">Quick reference</p>
          <h2 id="rules-browser-heading" className="mt-1 text-2xl">Rules at a glance</h2>
          <p className="mt-1 text-sm text-[var(--text-3)]">Search across summaries, effects, and common table terms, or narrow the list by topic.</p>
        </div>
        <RulesReference />
      </section>

      <aside className="card mt-6 print:hidden" aria-labelledby="reference-library-heading">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="micro-label">Reference library</p>
            <h2 id="reference-library-heading" className="mt-1 text-xl">Need the creature or spell behind the rule?</h2>
            <p className="mt-1 text-sm text-[var(--text-3)]">Continue into the searchable SRD libraries without leaving the reference section.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/monsters" className="btn-ghost text-sm">
              <BookOpen size={16} aria-hidden="true" />
              Browse the Bestiary
            </Link>
            <Link href="/spells" className="btn-ghost text-sm">
              <Sparkles size={16} aria-hidden="true" />
              Browse Spells
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ReferenceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--steel-900)] px-3 py-3">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-3)]">{label}</dt>
      <dd className="mt-1 font-display text-lg font-semibold text-[var(--text-1)]">{value}</dd>
    </div>
  );
}
