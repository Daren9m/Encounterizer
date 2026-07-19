'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { generateNoncombat, getNoncombatKinds } from '@/lib/noncombat/generate';
import type { NoncombatKind, NoncombatResult } from '@/lib/noncombat/generate';
import { THEME_OPTIONS, TONE_OPTIONS, TIME_OPTIONS } from '@/lib/noncombat/theming';
import type { ThemeChoice, Tone, TimeBudget, Difficulty } from '@/lib/noncombat/types';
import { handoutToText } from '@/lib/noncombat/handout-text';
import { randomSeed } from '@/lib/random';
import { validateBoundedIntegerInput } from '@/lib/number-input';
import { usePersistentState } from '@/lib/use-persistent-state';
import PuzzleHandout from '@/components/PuzzleHandout';
import PrintButton from '@/components/PrintButton';
import ResetGeneratorButton from '@/components/ResetGeneratorButton';
import ToolPageHeader from '@/components/ToolPageHeader';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];

// ─── Share link ───────────────────────────────────────────────────
// Serializes exactly the levers a shared link needs to reproduce the
// result: `result.requested` (what the caller asked for) plus the
// concrete values the generator resolved (lvl/size/tone/time) and the
// seed. This URL contract is permanent — kind and difficulty are both
// omitted when the caller left them as "Any" (a seeded draw).

function buildShareUrl(r: NoncombatResult): string {
  const params = new URLSearchParams();
  params.set('seed', String(r.seed));
  if (r.requested.kind) params.set('kind', r.requested.kind);
  if (r.requested.difficulty) params.set('diff', r.requested.difficulty);
  params.set('lvl', String(r.partyLevel));
  params.set('size', String(r.partySize));
  params.set('theme', r.requested.theme);
  params.set('tone', r.tone);
  params.set('time', r.timeBudget);
  return `${window.location.origin}/noncombat?${params.toString()}`;
}

export default function NoncombatPage() {
  // useSearchParams requires a Suspense boundary under static prerendering.
  return (
    <Suspense
      fallback={(
        <div className="empty-state" role="status" aria-live="polite">
          Loading the scene generator…
        </div>
      )}
    >
      <NoncombatBuilder />
    </Suspense>
  );
}

function NoncombatBuilder() {
  const [kind, setKind] = usePersistentState<NoncombatKind | ''>('noncombatKind', '');
  const [difficulty, setDifficulty] = usePersistentState<Difficulty | ''>('noncombatDifficulty', '');
  const [partyLevel, setPartyLevel, partyLevelHydrated] = usePersistentState<number>('noncombatPartyLevel', 5);
  const [partySize, setPartySize, partySizeHydrated] = usePersistentState<number>('noncombatPartySize', 4);
  const [partyLevelInput, setPartyLevelInput] = useState('5');
  const [partySizeInput, setPartySizeInput] = useState('4');
  const [theme, setTheme] = usePersistentState<ThemeChoice>('noncombatTheme', 'any');
  const [tone, setTone] = usePersistentState<Tone>('noncombatTone', 'standard');
  const [timeBudget, setTimeBudget] = usePersistentState<TimeBudget>('noncombatTime', 'standard');
  const [result, setResult] = useState<NoncombatResult | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const resultRef = useRef<HTMLHeadingElement>(null);
  const [history, setHistory] = usePersistentState<NoncombatResult[]>(
    'noncombatHistory1', [], (v): v is NoncombatResult[] => Array.isArray(v),
  );

  const kinds = getNoncombatKinds();
  const partyLevelValidation = validateBoundedIntegerInput(
    partyLevelInput, 'Party level', 1, 20,
  );
  const partySizeValidation = validateBoundedIntegerInput(
    partySizeInput, 'Party size', 1, 8,
  );
  const partyInputsValid = partyLevelValidation.error === null
    && partySizeValidation.error === null;
  const partyInputsHydratedRef = useRef(false);

  useEffect(() => {
    if (!partyLevelHydrated || !partySizeHydrated || partyInputsHydratedRef.current) return;
    partyInputsHydratedRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      setPartyLevelInput(String(partyLevel));
      setPartySizeInput(String(partySize));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [partyLevel, partyLevelHydrated, partySize, partySizeHydrated]);

  function pushHistory(r: NoncombatResult) {
    setHistory(prev => [r, ...prev.filter(h => h.id !== r.id).slice(0, 9)]);
  }

  function announceAndFocusResult(r: NoncombatResult, action: 'generated' | 'rerolled' | 'loaded') {
    setStatusMessage(`${r.name} ${action} with seed ${r.seed}. Results below.`);
    window.requestAnimationFrame(() => {
      resultRef.current?.focus({ preventScroll: true });
      resultRef.current?.scrollIntoView({
        behavior: 'instant' as ScrollBehavior,
        block: 'start',
      });
    });
  }

  // One-shot hydration from a shared link (?seed=...). Persisted lever
  // state above is declared first so a shared link's params win over
  // remembered preferences.
  const KINDS = kinds.map(k => k.value);
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const clampInt = (raw: string | null, lo: number, hi: number): number | null => {
      if (raw === null) return null;
      const n = Number(raw);
      return Number.isInteger(n) ? Math.max(lo, Math.min(hi, n)) : null;
    };
    const seedParam = clampInt(searchParams.get('seed'), 0, 0x7fffffff);
    if (seedParam === null) return;
    const kindP = searchParams.get('kind');
    const kindV = KINDS.includes(kindP as NoncombatKind) ? (kindP as NoncombatKind) : undefined;
    const diffP = searchParams.get('diff');
    const diffV = DIFFICULTIES.includes(diffP as Difficulty) ? (diffP as Difficulty) : undefined;
    const lvl = clampInt(searchParams.get('lvl'), 1, 20) ?? 5;
    const size = clampInt(searchParams.get('size'), 1, 8) ?? 4;
    const themeP = searchParams.get('theme');
    const themeV = THEME_OPTIONS.some(o => o.value === themeP) ? (themeP as ThemeChoice) : 'any';
    const toneP = searchParams.get('tone');
    const toneV = TONE_OPTIONS.some(o => o.value === toneP) ? (toneP as Tone) : 'standard';
    const timeP = searchParams.get('time');
    const timeV = TIME_OPTIONS.some(o => o.value === timeP) ? (timeP as TimeBudget) : 'standard';
    setKind(kindV ?? ''); setDifficulty(diffV ?? ''); setPartyLevel(lvl); setPartySize(size);
    setPartyLevelInput(String(lvl)); setPartySizeInput(String(size));
    setTheme(themeV); setTone(toneV); setTimeBudget(timeV);
    const r = generateNoncombat({ kind: kindV, difficulty: diffV, partyLevel: lvl, partySize: size, theme: themeV, tone: toneV, timeBudget: timeV, seed: seedParam });
    setResult(r);
    setStatusMessage(`${r.name} loaded from the shared link.`);
    pushHistory(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGenerate(seedOverride?: number, kindOverride?: NoncombatKind) {
    if (!partyInputsValid) {
      const invalidId = partyLevelValidation.error
        ? 'noncombat-party-level'
        : 'noncombat-party-size';
      setStatusMessage('Fix the party level and size before generating a scene.');
      document.getElementById(invalidId)?.focus();
      return;
    }

    const r = generateNoncombat({
      kind: kindOverride ?? (kind || undefined),
      difficulty: difficulty || undefined,
      partyLevel,
      partySize,
      theme,
      tone,
      timeBudget,
      seed: seedOverride ?? randomSeed(),
    });
    setResult(r);
    setShowSolution(false);
    setLinkCopied(false);
    pushHistory(r);
    announceAndFocusResult(r, 'generated');
  }

  function handleReroll() {
    if (!result) return;
    const r = generateNoncombat({
      kind: result.requested.kind,
      difficulty: result.requested.difficulty,
      partyLevel: result.partyLevel,
      partySize: result.partySize,
      theme: result.requested.theme,
      tone: result.tone,
      timeBudget: result.timeBudget,
      seed: randomSeed(),
    });
    setResult(r);
    setShowSolution(false);
    setLinkCopied(false);
    pushHistory(r);
    announceAndFocusResult(r, 'rerolled');
  }

  function handleLoadHistory(historyResult: NoncombatResult) {
    setResult(historyResult);
    setShowSolution(false);
    setLinkCopied(false);
    announceAndFocusResult(historyResult, 'loaded');
  }

  function handleReset() {
    setKind('');
    setDifficulty('');
    setPartyLevel(5);
    setPartySize(4);
    setPartyLevelInput('5');
    setPartySizeInput('4');
    setTheme('any');
    setTone('standard');
    setTimeBudget('standard');
    setResult(null);
    setShowSolution(false);
    setLinkCopied(false);
    setStatusMessage('Generator reset. Choose settings to create a new scene.');
  }

  function handlePartyLevelInputChange(raw: string) {
    setPartyLevelInput(raw);
    const validation = validateBoundedIntegerInput(raw, 'Party level', 1, 20);
    if (validation.value !== null) setPartyLevel(validation.value);
  }

  function handlePartySizeInputChange(raw: string) {
    setPartySizeInput(raw);
    const validation = validateBoundedIntegerInput(raw, 'Party size', 1, 8);
    if (validation.value !== null) setPartySize(validation.value);
  }

  function handleCopyLink() {
    if (!result) return;
    navigator.clipboard.writeText(buildShareUrl(result)).then(() => {
      setLinkCopied(true);
      setStatusMessage('Share link copied to the clipboard.');
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {
      setLinkCopied(false);
      setStatusMessage('The share link could not be copied. Please try again.');
    });
  }

  function handleExport() {
    if (!result) return;
    const kindLabel = kinds.find(k => k.value === result.kind)?.label ?? result.kind;
    const lines: string[] = [`# ${result.name}`];
    if (result.resultKind === 'puzzle') {
      lines.push(`Kind: ${kindLabel} | Difficulty: ${result.difficulty} | Est. Time: ${result.estimatedMinutes} min`);
    } else {
      lines.push(`Kind: ${kindLabel} | Difficulty: ${result.difficulty}`);
    }
    lines.push(`Theme: ${result.theme} | Tone: ${result.tone} | Time: ${result.timeBudget} | Party: ${result.partySize} × level ${result.partyLevel} | Seed: ${result.seed}`);

    if (result.resultKind === 'puzzle') {
      lines.push('', '## DM Brief', result.dmBrief);
      if (result.dmAdjudication) {
        lines.push('', '### Adjudication', result.dmAdjudication);
      }
      lines.push('', '## Read Aloud', result.readAloud);
      if (result.handout) {
        lines.push('', '## Player Handout', handoutToText(result.handout));
      }
      if (result.stages && result.stages.length > 0) {
        lines.push('', '## Stages');
        for (const stage of result.stages) {
          lines.push(`### ${stage.title}`, stage.text, '');
        }
      }
      lines.push(
        '',
        '## Hints',
        ...result.hints.map((h, i) => `${i + 1}. ${h}`),
        '',
        '## Solution',
        result.solution,
        '',
        '## Failure Consequence',
        result.failureConsequence,
        '',
        '## Reward',
        result.reward,
      );
    } else {
      lines.push(
        '', '## Read Aloud', result.readAloud,
        '', '## Situation', result.situation,
        '', '## Stakes', result.stakes,
        '', '## Skill Checks', ...result.skillChecks.map(s => `- **${s.skill} (DC ${s.dc})**: Success — ${s.onSuccess} | Failure — ${s.onFailure}`),
      );
      if (result.structure) {
        lines.push(
          '',
          '## Challenge Structure',
          `${result.structure.successesNeeded} successes needed · ${result.structure.failuresAllowed} failures allowed`,
          ...result.structure.phases.map(p => `- ${p.title}: ${p.successes} successes (${p.primarySkills.join(', ')})`),
        );
      }
      if (result.stages && result.stages.length > 0) {
        lines.push('', '## Stages');
        for (const stage of result.stages) {
          lines.push(`### ${stage.title}`, stage.text, '');
        }
      }
      if (result.attitudeTrack) {
        lines.push(
          '',
          '## Attitude Track',
          `Start: ${result.attitudeTrack.start}`,
          ...result.attitudeTrack.stages.map(s =>
            `- ${s.attitude} (Influence DC ${s.influenceDc}): unlocks ${s.unlocks} | shift up: ${s.shiftUp} | shift down: ${s.shiftDown}`),
        );
      }
      if (result.chase) {
        lines.push(
          '',
          '## Chase Plan',
          `${result.chase.rounds} rounds`,
          ...result.chase.complications.map(c => `- Round ${c.round}: ${c.text} (${c.check})`),
          `Escape: ${result.chase.escapeCondition}`,
          `Catch: ${result.chase.catchCondition}`,
        );
      }
      if (result.clueWeb) {
        lines.push(
          '',
          '## Clue Web',
          `Truth: ${result.clueWeb.truth.culprit} — ${result.clueWeb.truth.method}, motive: ${result.clueWeb.truth.motive}`,
        );
        for (const node of result.clueWeb.nodes) {
          lines.push(`### ${node.revelation}`, ...node.clues.map(c => `- [${c.vector}] ${c.text} → ${c.pointsTo}`));
        }
        lines.push(`Red herring: ${result.clueWeb.redHerring.text} (disconfirmed by: ${result.clueWeb.redHerring.disconfirmedBy})`);
      }
      if (result.handout) {
        lines.push('', '## Player Handout', handoutToText(result.handout));
      }
      lines.push(
        '', '## Complication', result.complication,
        '', '## Outcomes', ...result.outcomes.map(o => `- **${o.label}**: ${o.description}`),
        '', '## Reward', result.reward,
      );
    }

    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.name.toLowerCase().replace(/\s+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade-in">
      <ToolPageHeader
        path="/noncombat"
        description="Build the moments around initiative—verified puzzles, social scenes, hazards, chases, and investigations with table-ready stakes, outcomes, and handouts."
      />
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </p>

      {/* Controls */}
      <div className="card panel-accent mb-6 print:hidden">
        <div className="mb-5">
          <p className="micro-label">Scene setup</p>
          <h2 className="mt-1 text-xl">Set the pressure, tone, and pace</h2>
        </div>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label htmlFor="noncombat-kind" className="micro-label block mb-1">Kind</label>
            <select id="noncombat-kind" value={kind} onChange={e => setKind(e.target.value as NoncombatKind | '')} className="w-full">
              <option value="">Any</option>
              {kinds.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="noncombat-difficulty" className="micro-label block mb-1">Difficulty</label>
            <select id="noncombat-difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty | '')} className="w-full">
              <option value="">Any</option>
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="noncombat-party-level" className="micro-label block mb-1">Party Level</label>
            <input
              id="noncombat-party-level"
              type="number"
              min={1}
              max={20}
              step={1}
              inputMode="numeric"
              value={partyLevelInput}
              onChange={e => handlePartyLevelInputChange(e.target.value)}
              aria-invalid={partyLevelValidation.error ? true : undefined}
              aria-describedby={partyLevelValidation.error ? 'noncombat-party-level-error' : undefined}
              className="w-full"
            />
            {partyLevelValidation.error && (
              <p id="noncombat-party-level-error" className="mt-1 text-xs text-[var(--accent-danger-light)]" role="alert">
                {partyLevelValidation.error}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="noncombat-party-size" className="micro-label block mb-1">Party Size</label>
            <input
              id="noncombat-party-size"
              type="number"
              min={1}
              max={8}
              step={1}
              inputMode="numeric"
              value={partySizeInput}
              onChange={e => handlePartySizeInputChange(e.target.value)}
              aria-invalid={partySizeValidation.error ? true : undefined}
              aria-describedby={partySizeValidation.error ? 'noncombat-party-size-error' : undefined}
              className="w-full"
            />
            {partySizeValidation.error && (
              <p id="noncombat-party-size-error" className="mt-1 text-xs text-[var(--accent-danger-light)]" role="alert">
                {partySizeValidation.error}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="noncombat-theme" className="micro-label block mb-1">Theme</label>
            <select id="noncombat-theme" value={theme} onChange={e => setTheme(e.target.value as ThemeChoice)} className="w-full">
              {THEME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="noncombat-tone" className="micro-label block mb-1">Tone</label>
            <select id="noncombat-tone" value={tone} onChange={e => setTone(e.target.value as Tone)} className="w-full">
              {TONE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="noncombat-time" className="micro-label block mb-1">Time Budget</label>
            <select id="noncombat-time" value={timeBudget} onChange={e => setTimeBudget(e.target.value as TimeBudget)} className="w-full">
              {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {/* Kind quick-cards */}
        <div
          className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-4"
          role="group"
          aria-label="Generate by scene kind"
        >
          {kinds.map(k => (
            <button key={k.value} type="button" onClick={() => { setKind(k.value); handleGenerate(undefined, k.value); }}
              aria-pressed={kind === k.value}
              className={`card-interactive p-3 text-left text-xs ${kind === k.value ? 'border-[var(--bronze)] ring-1 ring-[var(--bronze)]' : ''}`}>
              <div className="font-bold text-[var(--text-1)]">{k.label}</div>
              <div className="text-[var(--text-2)]">{k.description}</div>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line-subtle)] pt-4">
          <button type="button" onClick={() => handleGenerate()} className="btn-primary text-lg">
            {result ? 'Generate a New Scene' : 'Generate Scene'}
          </button>
          <ResetGeneratorButton onReset={handleReset} label="Reset Generator" />
          {result && (
            <>
              <button type="button" onClick={() => handleGenerate()} className="btn-secondary">Regenerate</button>
              <button type="button" onClick={handleExport} className="btn-secondary">Export Markdown</button>
              <button type="button" onClick={handleCopyLink} className="btn-secondary">
                {linkCopied ? 'Copied ✓' : 'Share Link'}
              </button>
              <PrintButton label={result.resultKind === 'puzzle' ? 'Print Puzzle' : 'Print Challenge'} />
            </>
          )}
        </div>
      </div>

      {/* Result Display */}
      {result && (
        <section
          aria-labelledby="noncombat-result-title"
          className="space-y-4 animate-fade-in"
        >
          {/* Shared header */}
          <div className="card">
            <div className="mb-2 flex flex-col items-start justify-between gap-3 sm:flex-row">
              <h2
                id="noncombat-result-title"
                ref={resultRef}
                tabIndex={-1}
                className="scroll-mt-24 text-2xl"
              >
                {result.name}
              </h2>
              <div className="flex flex-wrap gap-2">
                <span className={`px-3 py-1 rounded-full text-xs self-center ${
                  result.difficulty === 'Easy' ? 'badge-easy' : result.difficulty === 'Medium' ? 'badge-medium' : 'badge-hard'
                }`}>{result.difficulty}</span>
                <span className="px-3 py-1 rounded-full text-sm bg-[var(--steel-800)] text-[var(--text-2)]">
                  {kinds.find(k => k.value === result.kind)?.label}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="micro-label">
                {THEME_OPTIONS.find(o => o.value === result.theme)?.label ?? result.theme}
              </span>
              <span className="text-xs text-[var(--text-2)]">
                · Party {result.partySize} × level {result.partyLevel}
              </span>
              <button
                type="button"
                onClick={() => handleReroll()}
                className="min-h-11 rounded-full bg-[var(--steel-800)] px-3 py-1 text-xs text-[var(--text-2)] transition-colors hover:text-[var(--bronze)]"
                aria-label={`Reroll ${result.name} with a fresh seed and the same settings`}
                title="Reroll with a fresh seed, same levers"
              >
                Seed: {result.seed}
              </button>
            </div>
          </div>

          {result.resultKind === 'puzzle' ? (
            <>
              {/* DM Brief */}
              <div className="card border-l-4 border-l-[var(--accent-danger)]">
                <h3 className="text-lg mb-2">DM Brief (eyes only) · ~{result.estimatedMinutes} min</h3>
                <p className="text-sm">{result.dmBrief}</p>
                {result.dmAdjudication && (
                  <div className="mt-3">
                    <h4 className="text-sm font-bold text-[var(--bronze)]">Adjudication</h4>
                    <p className="text-sm">{result.dmAdjudication}</p>
                  </div>
                )}
              </div>

              {/* Read Aloud */}
              <div className="card border-l-4 border-l-[var(--bronze)]">
                <h3 className="text-lg mb-2">Read Aloud</h3>
                <p className="text-sm italic whitespace-pre-line">{result.readAloud}</p>
              </div>

              {/* Player Handout */}
              {result.handout && <PuzzleHandout spec={result.handout} />}

              {/* Stages */}
              {result.stages && result.stages.length > 0 && (
                <>
                  {result.stages.map((stage, i) => (
                    <div key={i} className="card border-l-4 border-l-[var(--bronze)]">
                      <h3 className="text-lg mb-2">{stage.title}</h3>
                      <p className="text-sm whitespace-pre-line">{stage.text}</p>
                    </div>
                  ))}
                </>
              )}

              {/* Hints */}
              <div className="card print:hidden">
                <h3 className="text-lg mb-2">Hints (reveal as needed)</h3>
                <div className="space-y-2">
                  {result.hints.map((hint, i) => (
                    <HintReveal key={`${result.id}-${i}`} index={i + 1} hint={hint} />
                  ))}
                </div>
              </div>

              {/* Solution (hidden by default) */}
              <div className="card print:hidden">
                <button
                  type="button"
                  onClick={() => setShowSolution(!showSolution)}
                  aria-expanded={showSolution}
                  aria-controls="noncombat-solution"
                  className="flex min-h-11 items-center gap-2 text-lg font-bold text-[var(--bronze)]"
                >
                  {showSolution
                    ? <ChevronDown size={18} aria-hidden="true" />
                    : <ChevronRight size={18} aria-hidden="true" />} Solution
                </button>
                {showSolution && (
                  <div id="noncombat-solution" className="mt-3 space-y-3 animate-fade-in">
                    <div>
                      <h4 className="text-sm">Answer</h4>
                      <p className="text-sm">{result.solution}</p>
                    </div>
                    <div>
                      <h4 className="text-sm">On Failure</h4>
                      <p className="text-sm">{result.failureConsequence}</p>
                    </div>
                    <div>
                      <h4 className="text-sm">Reward</h4>
                      <p className="text-sm">{result.reward}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Print-only: everything expanded for the DM's paper copy */}
              <div className="hidden print:block space-y-4">
                <div className="card">
                  <h3 className="text-lg mb-2">Hints</h3>
                  <ol className="text-sm list-decimal list-inside space-y-1">
                    {result.hints.map((hint, i) => (
                      <li key={i}>{hint}</li>
                    ))}
                  </ol>
                </div>
                <div className="card">
                  <h3 className="text-lg mb-2">Solution</h3>
                  <p className="text-sm">{result.solution}</p>
                  <h4 className="text-sm mt-3">On Failure</h4>
                  <p className="text-sm">{result.failureConsequence}</p>
                  <h4 className="text-sm mt-3">Reward</h4>
                  <p className="text-sm">{result.reward}</p>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Read Aloud */}
              <div className="card border-l-4 border-l-[var(--bronze)]">
                <h3 className="text-lg mb-2">Read Aloud</h3>
                <p className="text-sm italic">{result.readAloud}</p>
              </div>

              {/* Situation & Stakes */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="card">
                  <h3 className="text-lg mb-2">Situation</h3>
                  <p className="text-sm whitespace-pre-line">{result.situation}</p>
                </div>
                <div className="card">
                  <h3 className="text-lg mb-2">Stakes</h3>
                  <p className="text-sm whitespace-pre-line">{result.stakes}</p>
                </div>
              </div>

              {/* Skill Checks */}
              <div className="card">
                <h3 className="text-lg mb-3">Skill Checks</h3>
                <div className="space-y-3">
                  {result.skillChecks.map((sc, i) => (
                    <div key={i} className="p-3 rounded bg-[var(--steel-950)]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-[var(--text-1)]">{sc.skill}</span>
                        <span className="text-sm font-bold text-[var(--bronze)]">DC {sc.dc}</span>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2 text-xs">
                        <div><span className="text-[var(--difficulty-easy)] font-bold">Success:</span> {sc.onSuccess}</div>
                        <div><span className="text-[var(--accent-danger)] font-bold">Failure:</span> {sc.onFailure}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Challenge Structure */}
              {result.structure && (
                <div className="card">
                  <h3 className="text-lg mb-3">Challenge Structure</h3>
                  <p className="text-sm mb-3">
                    {result.structure.successesNeeded} successes needed · {result.structure.failuresAllowed} failures allowed
                  </p>
                  <div className="space-y-2">
                    {result.structure.phases.map((phase, i) => (
                      <div key={i} className="p-3 rounded bg-[var(--steel-950)] text-sm">
                        <span className="font-bold text-[var(--text-1)]">{phase.title}</span>
                        {' · '}{phase.successes} success{phase.successes === 1 ? '' : 'es'}{' · '}{phase.primarySkills.join(', ')}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Stages */}
              {result.stages && result.stages.length > 0 && (
                <>
                  {result.stages.map((stage, i) => (
                    <div key={i} className="card border-l-4 border-l-[var(--bronze)]">
                      <h3 className="text-lg mb-2">{stage.title}</h3>
                      <p className="text-sm whitespace-pre-line">{stage.text}</p>
                    </div>
                  ))}
                </>
              )}

              {/* Attitude Track */}
              {result.attitudeTrack && (
                <div className="card">
                  <h3 className="text-lg mb-3">Attitude Track</h3>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="micro-label">Starting attitude</span>
                    <span className="px-3 py-1 rounded-full text-xs bg-[var(--steel-800)] text-[var(--text-2)]">{result.attitudeTrack.start}</span>
                  </div>
                  <div className="space-y-2">
                    {result.attitudeTrack.stages.map((stage, i) => (
                      <div key={i} className="p-3 rounded bg-[var(--steel-950)] text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-[var(--text-1)]">{stage.attitude}</span>
                          <span className="text-xs font-bold text-[var(--bronze)]">Influence DC {stage.influenceDc}</span>
                        </div>
                        <p className="text-xs mb-1"><span className="text-[var(--text-2)] font-bold">Unlocks:</span> {stage.unlocks}</p>
                        <div className="grid sm:grid-cols-2 gap-2 text-xs">
                          <div><span className="text-[var(--difficulty-easy)] font-bold">Shift up:</span> {stage.shiftUp}</div>
                          <div><span className="text-[var(--accent-danger)] font-bold">Shift down:</span> {stage.shiftDown}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chase Rounds */}
              {result.chase && (
                <div className="card">
                  <h3 className="text-lg mb-3">Chase Rounds</h3>
                  <p className="text-sm mb-3">{result.chase.rounds} rounds</p>
                  <div className="space-y-2 mb-3">
                    {result.chase.complications.map((c, i) => (
                      <div key={i} className="p-3 rounded bg-[var(--steel-950)] text-sm">
                        <span className="font-bold text-[var(--bronze)]">Round {c.round}</span>{' · '}{c.text}{' · '}<span className="text-xs text-[var(--text-2)]">{c.check}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 text-xs">
                    <div><span className="text-[var(--difficulty-easy)] font-bold">Escape:</span> {result.chase.escapeCondition}</div>
                    <div><span className="text-[var(--accent-danger)] font-bold">Catch:</span> {result.chase.catchCondition}</div>
                  </div>
                </div>
              )}

              {/* Clue Web (DM eyes only) */}
              {result.clueWeb && (
                <div className="card border-l-4 border-l-[var(--accent-danger)]">
                  <h3 className="text-lg mb-2">Clue Web (eyes only)</h3>
                  <p className="text-sm mb-3">
                    <span className="font-bold text-[var(--bronze)]">Truth:</span> {result.clueWeb.truth.culprit} — {result.clueWeb.truth.method}, motive: {result.clueWeb.truth.motive}
                  </p>
                  <div className="space-y-2 mb-3">
                    {result.clueWeb.nodes.map((node, i) => (
                      <div key={i} className="p-3 rounded bg-[var(--steel-950)] text-sm">
                        <div className="font-bold text-[var(--text-1)] mb-1">{node.revelation}</div>
                        <ul className="text-xs space-y-1">
                          {node.clues.map((clue, j) => (
                            <li key={j}><span className="uppercase tracking-wide text-[var(--text-2)]">[{clue.vector}]</span> {clue.text} <span className="text-[var(--text-2)]">→ {clue.pointsTo}</span></li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs">
                    <span className="font-bold text-[var(--text-2)]">Red herring:</span> {result.clueWeb.redHerring.text}{' '}
                    <span className="font-bold text-[var(--text-2)]">Disconfirmed by:</span> {result.clueWeb.redHerring.disconfirmedBy}
                  </p>
                </div>
              )}

              {/* Player Handout */}
              {result.handout && <PuzzleHandout spec={result.handout} />}

              {/* Complication */}
              <div className="card border-l-4 border-l-[var(--accent-danger)]">
                <h3 className="text-lg mb-2">Complication</h3>
                <p className="text-sm">{result.complication}</p>
              </div>

              {/* Outcomes */}
              <div className="card">
                <h3 className="text-lg mb-3">Possible Outcomes</h3>
                <div className="space-y-2">
                  {result.outcomes.map((o, i) => (
                    <div key={i} className="p-3 rounded bg-[var(--steel-950)]">
                      <span className="font-bold text-[var(--bronze)]">{o.label}:</span>{' '}
                      <span className="text-sm">{o.description}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reward */}
              <div className="card border-l-4 border-l-[var(--difficulty-easy)]">
                <h3 className="text-lg mb-2">Reward</h3>
                <p className="text-sm">{result.reward}</p>
              </div>
            </>
          )}
        </section>
      )}

      {!result && (
        <div className="empty-state print:hidden">
          <p className="micro-label">Scene preview</p>
          <h2 className="mt-2 text-xl">Give the party something worth solving</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--text-3)]">
            Choose a scene type for an instant themed result, or leave the kind open and let the seeded generator surprise you.
          </p>
        </div>
      )}

      {/* History (persists across visits) */}
      {history.length > 0 && !(history.length === 1 && result?.id === history[0].id) && (
        <div className="mt-6 print:hidden">
          <h2 className="text-lg mb-3">Recent Puzzles &amp; Challenges</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {history.map(h => (
              <button key={h.id} type="button" onClick={() => handleLoadHistory(h)}
                aria-pressed={result?.id === h.id}
                className={`card-interactive p-4 text-left text-sm ${result?.id === h.id ? 'border-[var(--bronze)]' : ''}`}>
                <div className="font-bold text-[var(--text-1)]">{h.name}</div>
                <div className="text-xs text-[var(--text-2)]">
                  {kinds.find(k => k.value === h.kind)?.label} · {h.difficulty} · {THEME_OPTIONS.find(o => o.value === h.theme)?.label ?? h.theme} · {TIME_OPTIONS.find(o => o.value === h.timeBudget)?.label ?? h.timeBudget}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HintReveal({ index, hint }: { index: number; hint: string }) {
  const [revealed, setRevealed] = useState(false);
  const hintId = `noncombat-hint-${index}`;
  return (
    <div>
      <button
        type="button"
        onClick={() => setRevealed(value => !value)}
        aria-expanded={revealed}
        aria-controls={hintId}
        className="inline-flex min-h-11 items-center text-sm text-[var(--text-2)] transition-colors hover:text-[var(--bronze)]"
      >
        {revealed ? `Hide Hint ${index}` : `Reveal Hint ${index}`}
      </button>
      {revealed && (
        <p id={hintId} className="text-sm text-[var(--text-2)] animate-fade-in">
          <span className="text-[var(--bronze)] font-bold">Hint {index}:</span> {hint}
        </p>
      )}
    </div>
  );
}
