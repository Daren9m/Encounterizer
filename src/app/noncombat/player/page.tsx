'use client';

import { useEffect, useMemo, useState } from 'react';
import { generateNoncombat, getNoncombatKinds } from '@/lib/noncombat/generate';
import type { NoncombatKind } from '@/lib/noncombat/generate';
import { toPlayerView } from '@/lib/noncombat/player-view';
import type { PlayerView } from '@/lib/noncombat/player-view';
import { THEME_OPTIONS, TONE_OPTIONS, TIME_OPTIONS } from '@/lib/noncombat/theming';
import type { ThemeChoice, Tone, TimeBudget, Difficulty } from '@/lib/noncombat/types';
import PuzzleHandout from '@/components/PuzzleHandout';
import PrintButton from '@/components/PrintButton';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];

export default function PlayerPage() {
  return <PlayerScreen />;
}

function PlayerScreen() {
  // The query is read from the location after mount (and on back/forward)
  // rather than via next/navigation's useSearchParams, which suspends
  // hydration and under `next dev` left hard-loaded links permanently
  // dehydrated. `null` means "not read yet" — the prerendered HTML and the
  // first client render both show the preparing state, so hydration matches.
  const [query, setQuery] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setQuery(window.location.search);
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  // The player view is a pure projection of the DM share URL.
  const { view, missing } = useMemo<{ view: PlayerView | null; missing: boolean }>(() => {
    const params = new URLSearchParams(query ?? '');
    const clampInt = (raw: string | null, lo: number, hi: number): number | null => {
      if (raw === null) return null;
      const n = Number(raw);
      return Number.isInteger(n) ? Math.max(lo, Math.min(hi, n)) : null;
    };
    const seed = clampInt(params.get('seed'), 0, 0x7fffffff);
    if (seed === null) {
      return { view: null, missing: true };
    }
    const KINDS = getNoncombatKinds().map(k => k.value);
    const kindP = params.get('kind');
    const kind = KINDS.includes(kindP as NoncombatKind) ? (kindP as NoncombatKind) : undefined;
    const diffP = params.get('diff');
    const difficulty = DIFFICULTIES.includes(diffP as Difficulty) ? (diffP as Difficulty) : undefined;
    const themeP = params.get('theme');
    const theme = THEME_OPTIONS.some(o => o.value === themeP) ? (themeP as ThemeChoice) : 'any';
    const toneP = params.get('tone');
    const tone = TONE_OPTIONS.some(o => o.value === toneP) ? (toneP as Tone) : 'standard';
    const timeP = params.get('time');
    const timeBudget = TIME_OPTIONS.some(o => o.value === timeP) ? (timeP as TimeBudget) : 'standard';
    const r = generateNoncombat({
      kind, difficulty, theme, tone, timeBudget,
      partyLevel: clampInt(params.get('lvl'), 1, 20) ?? 5,
      partySize: clampInt(params.get('size'), 1, 8) ?? 4,
      seed,
    });
    return { view: toPlayerView(r), missing: false };
  }, [query]);

  if (query === null) {
    return (
      <div className="empty-state" role="status" aria-live="polite">
        Preparing the handout…
      </div>
    );
  }
  if (missing) {
    return (
      <div className="empty-state" role="status" aria-live="polite">
        <p className="micro-label">Player handout</p>
        <h1 className="mt-2 text-xl">This link is missing its scene</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--text-3)]">
          Ask your DM for a fresh player link — it carries everything this page needs.
        </p>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="empty-state" role="status" aria-live="polite">
        Preparing the handout…
      </div>
    );
  }
  return (
    <div className="animate-fade-in mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-3xl">{view.title}</h1>
        <div className="print:hidden">
          <PrintButton label="Print Handout" />
        </div>
      </div>
      <div className="card border-l-4 border-l-[var(--bronze)]">
        <p className="text-base italic whitespace-pre-line">{view.readAloud}</p>
      </div>
      {view.handout && <PuzzleHandout spec={view.handout} />}
    </div>
  );
}
