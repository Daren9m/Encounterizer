'use client';

import Link from 'next/link';
import { Download, ExternalLink } from 'lucide-react';
import PrintButton from '@/components/PrintButton';
import RulesReference from '@/components/RulesReference';
import ToolPageHeader from '@/components/ToolPageHeader';
import {
  SRD_5_2_1_URL,
  rulesReferenceToMarkdown,
} from '@/data/rules-reference';

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
        description="Find conditions and common rulings without slowing the game."
        actions={(
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary text-sm" onClick={downloadReference}>
              <Download size={16} aria-hidden="true" />
              Download .md
            </button>
            <PrintButton label="Print" />
          </div>
        )}
      />

      <header className="mb-4 hidden print:block">
        <h1 className="text-3xl">DM Rules Reference</h1>
        <p className="mt-1 text-sm text-[var(--text-3)]">2024 rules · SRD 5.2.1</p>
      </header>

      <RulesReference variant="page" />

      <nav
        aria-label="Related references"
        className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--line-subtle)] pt-4 text-sm print:hidden"
      >
        <span className="text-[var(--text-3)]">More references</span>
        <Link href="/monsters" className="font-medium text-[var(--text-2)] hover:text-[var(--bronze-light)]">
          Bestiary
        </Link>
        <Link href="/spells" className="font-medium text-[var(--text-2)] hover:text-[var(--bronze-light)]">
          Spells
        </Link>
        <Link href="/compendium" className="font-medium text-[var(--text-2)] hover:text-[var(--bronze-light)]">
          Items &amp; character options
        </Link>
        <a
          href={SRD_5_2_1_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-[var(--text-2)] hover:text-[var(--bronze-light)]"
        >
          Full SRD
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </nav>
    </div>
  );
}
