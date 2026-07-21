'use client';

import Link from 'next/link';
import { Shield, Users } from 'lucide-react';
import type { DmPartySummary } from '@/lib/party-adapters';

export interface DmPartyPanelProps {
  summary: DmPartySummary | null;
  loading?: boolean;
  unavailable?: boolean;
}

function levelLabel(summary: DmPartySummary): string {
  if (!summary.levelRange) return 'No heroes';
  return summary.levelRange.min === summary.levelRange.max
    ? `Level ${summary.levelRange.min}`
    : `Levels ${summary.levelRange.min}–${summary.levelRange.max}`;
}

function signed(value: number | undefined): string {
  if (value === undefined) return '—';
  return value >= 0 ? `+${value}` : String(value);
}

export default function DmPartyPanel({
  summary,
  loading = false,
  unavailable = false,
}: DmPartyPanelProps) {
  if (loading) {
    return <div className="empty-state !py-6" role="status">Loading the active party…</div>;
  }

  if (!summary) {
    return (
      <div className="empty-state !py-6">
        <Users className="mx-auto mb-2 text-[var(--bronze)]" size={30} aria-hidden="true" />
        <p className="font-semibold">
          {unavailable ? 'Party Library unavailable' : 'No active party'}
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-[var(--text-3)]">
          {unavailable
            ? 'The saved party could not be opened. Your other screen items are still available.'
            : 'Choose or create a party to keep table-ready character details on this screen.'}
        </p>
        <Link href="/party/" className="btn-secondary mt-3 text-sm print:hidden">
          Manage parties
        </Link>
      </div>
    );
  }

  return (
    <section aria-label={`${summary.name} party overview`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[var(--text-1)]">{summary.name}</p>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">
            {summary.memberCount} {summary.memberCount === 1 ? 'hero' : 'heroes'} · {levelLabel(summary)}
          </p>
        </div>
        <Link href="/party/" className="btn-ghost text-xs print:hidden">Manage party</Link>
      </div>

      {summary.members.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {summary.members.map((member) => (
            <li key={member.id} className="surface-inset min-w-0 p-3">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--text-1)]">{member.name}</p>
                  <p className="truncate text-xs text-[var(--text-3)]">
                    Level {member.level} · {member.classLabel}
                  </p>
                </div>
                <Shield size={16} className="mt-0.5 shrink-0 text-[var(--bronze)]" aria-hidden="true" />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div><dt className="meta-label">AC</dt><dd className="mt-1 font-semibold">{member.armorClass}</dd></div>
                <div><dt className="meta-label">Init</dt><dd className="mt-1 font-semibold">{signed(member.initiativeBonus)}</dd></div>
                <div><dt className="meta-label">Passive</dt><dd className="mt-1 font-semibold">{member.passivePerception ?? '—'}</dd></div>
              </dl>
              {member.notes?.trim() && (
                <p className="mt-3 whitespace-pre-wrap border-t border-[var(--border-subtle)] pt-2 text-xs leading-relaxed text-[var(--text-2)]">
                  {member.notes.trim()}
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state !py-5">
          <p className="font-semibold">This party has no heroes yet</p>
          <Link href="/party/" className="btn-secondary mt-3 text-sm print:hidden">Add heroes</Link>
        </div>
      )}
    </section>
  );
}
