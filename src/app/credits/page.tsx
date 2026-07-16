import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BESTIARY_META } from '@/data/bestiary-meta';

export const metadata: Metadata = {
  title: 'Credits & Licensing',
  description:
    'Licensing and attribution for Encounterizer — SRD 5.2.1 content under CC-BY-4.0, application code under MIT.',
};

export default function CreditsPage() {
  return (
    <div className="animate-fade-in max-w-3xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold text-[var(--bronze)]">Credits &amp; Licensing</h1>

      <section className="card space-y-3">
        <h2 className="text-xl font-bold text-[var(--bronze)]">Game Content</h2>
        <p>
          This work includes material from the System Reference Document 5.2.1 (&ldquo;SRD
          5.2.1&rdquo;) by Wizards of the Coast LLC, available at{' '}
          <a
            href="https://www.dndbeyond.com/srd"
            className="text-[var(--bronze)] underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            dndbeyond.com/srd
          </a>
          . The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International
          License, available at{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/legalcode"
            className="text-[var(--bronze)] underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            creativecommons.org/licenses/by/4.0/legalcode
          </a>
          .
        </p>
        <p className="text-sm text-[var(--text-2)]">
          The bestiary contains {BESTIARY_META.count} monster stat blocks derived from the SRD
          5.2.1 ({BESTIARY_META.license}). Spell summaries are likewise derived from SRD content.
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-bold text-[var(--bronze)]">Unofficial Content</h2>
        <p className="text-sm">
          Encounterizer is unofficial fan content and is not affiliated with, endorsed,
          sponsored, or specifically approved by Wizards of the Coast LLC. Dungeons &amp;
          Dragons, D&amp;D, and their respective logos are trademarks of Wizards of the Coast
          LLC.
        </p>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-bold text-[var(--bronze)]">Application</h2>
        <p className="text-sm">
          The Encounterizer application code is open source under the{' '}
          <a
            href="https://github.com/Daren9m/Encounterizer/blob/main/LICENSE"
            className="text-[var(--bronze)] underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            MIT License
          </a>
          . Everything runs in your browser — no accounts, no servers, no tracking, and your
          imported custom monsters never leave your device.
        </p>
        <p className="text-sm text-[var(--text-2)]">
          Built with Next.js, TypeScript, and Tailwind CSS.{' '}
          <a
            href="https://github.com/Daren9m/Encounterizer"
            className="text-[var(--bronze)] underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            Source on GitHub
          </a>
          .
        </p>
      </section>

      <p className="text-center">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[var(--bronze)] underline hover:text-[var(--bronze-light)]">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to Encounterizer
        </Link>
      </p>
    </div>
  );
}
