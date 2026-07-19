'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
  // useSearchParams requires a Suspense boundary under static prerendering.
  return (
    <Suspense
      fallback={(
        <div className="empty-state" role="status" aria-live="polite">
          Preparing the handout…
        </div>
      )}
    >
      <PlayerScreen />
    </Suspense>
  );
}

function PlayerScreen() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<PlayerView | null>(null);
  const [missing, setMissing] = useState(false);

  // One-shot hydration — the same param contract as the DM share URL.
  useEffect(() => {
    const clampInt = (raw: string | null, lo: number, hi: number): number | null => {
      if (raw === null) return null;
      const n = Number(raw);
      return Number.isInteger(n) ? Math.max(lo, Math.min(hi, n)) : null;
    };
    const seed = clampInt(searchParams.get('seed'), 0, 0x7fffffff);
    if (seed === null) {
      setMissing(true);
      return;
    }
    const KINDS = getNoncombatKinds().map(k => k.value);
    const kindP = searchParams.get('kind');
    const kind = KINDS.includes(kindP as NoncombatKind) ? (kindP as NoncombatKind) : undefined;
    const diffP = searchParams.get('diff');
    const difficulty = DIFFICULTIES.includes(diffP as Difficulty) ? (diffP as Difficulty) : undefined;
    const themeP = searchParams.get('theme');
    const theme = THEME_OPTIONS.some(o => o.value === themeP) ? (themeP as ThemeChoice) : 'any';
    const toneP = searchParams.get('tone');
    const tone = TONE_OPTIONS.some(o => o.value === toneP) ? (toneP as Tone) : 'standard';
    const timeP = searchParams.get('time');
    const timeBudget = TIME_OPTIONS.some(o => o.value === timeP) ? (timeP as TimeBudget) : 'standard';
    const r = generateNoncombat({
      kind, difficulty, theme, tone, timeBudget,
      partyLevel: clampInt(searchParams.get('lvl'), 1, 20) ?? 5,
      partySize: clampInt(searchParams.get('size'), 1, 8) ?? 4,
      seed,
    });
    setView(toPlayerView(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (missing) {
    return (
      <div className="empty-state">
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
