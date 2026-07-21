'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FileJson,
  FileText,
  Share2,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react';
import { generateNoncombat, getNoncombatKinds } from '@/lib/noncombat/generate';
import type { NoncombatKind, NoncombatResult } from '@/lib/noncombat/generate';
import { THEME_OPTIONS, TONE_OPTIONS, TIME_OPTIONS } from '@/lib/noncombat/theming';
import type { ThemeChoice, Tone, TimeBudget, Difficulty } from '@/lib/noncombat/types';
import { handoutToText } from '@/lib/noncombat/handout-text';
import { toPlayerView, playerViewToMarkdown, playerViewToJson } from '@/lib/noncombat/player-view';
import { randomSeed } from '@/lib/random';
import { validateBoundedIntegerInput } from '@/lib/number-input';
import { usePersistentState } from '@/lib/use-persistent-state';
import { usePartyLibrary } from '@/app/hooks/usePartyLibrary';
import { useToolPartySetup } from '@/app/hooks/useToolPartySetup';
import { getActiveParty } from '@/lib/party';
import {
  MAX_CUSTOM_PARTY_MEMBERS,
  MAX_SCENE_PARTY_MEMBERS,
  createActiveToolPartySetup,
  createCustomToolPartySetup,
  resolveToolPartySetup,
} from '@/lib/tool-party';
import PuzzleHandout from '@/components/PuzzleHandout';
import PartyAttendanceList from '@/components/PartyAttendanceList';
import PrintButton from '@/components/PrintButton';
import ResetGeneratorButton from '@/components/ResetGeneratorButton';
import ToolPageHeader from '@/components/ToolPageHeader';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const PUZZLE_KINDS = new Set<NoncombatKind>(['logic', 'word', 'physical', 'minigame', 'environmental']);

function difficultyStatusClass(difficulty: Difficulty): string {
  if (difficulty === 'Easy') return 'status-readout-success';
  if (difficulty === 'Medium') return 'status-readout-warning';
  return 'status-readout-danger';
}

// ─── Share link ───────────────────────────────────────────────────
// Serializes exactly the levers a shared link needs to reproduce the
// result: `result.requested` (what the caller asked for) plus the
// concrete values the generator resolved (lvl/size/tone/time) and the
// seed. This URL contract is permanent — kind and difficulty are both
// omitted when the caller left them as "Any" (a seeded draw).

function buildResultParams(r: NoncombatResult): URLSearchParams {
  const params = new URLSearchParams();
  params.set('seed', String(r.seed));
  if (r.requested.kind) params.set('kind', r.requested.kind);
  if (r.requested.difficulty) params.set('diff', r.requested.difficulty);
  params.set('lvl', String(r.partyLevel));
  params.set('size', String(r.partySize));
  params.set('theme', r.requested.theme);
  params.set('tone', r.tone);
  params.set('time', r.timeBudget);
  return params;
}

function buildShareUrl(r: NoncombatResult): string {
  return `${window.location.origin}/noncombat?${buildResultParams(r).toString()}`;
}

/** The player-safe screen — same param contract, spoiler-free render. */
function buildPlayerUrl(r: NoncombatResult): string {
  return `${window.location.origin}/noncombat/player?${buildResultParams(r).toString()}`;
}

export default function NoncombatPage() {
  return <NoncombatBuilder />;
}

function NoncombatBuilder() {
  const {
    library: partyLibrary,
    hydrated: partyLibraryHydrated,
    status: partyLibraryStatus,
  } = usePartyLibrary();
  const durableParty = partyLibrary ? getActiveParty(partyLibrary) : null;
  const partyLibraryUnavailable = partyLibraryStatus === 'unavailable'
    || partyLibraryStatus === 'error';
  const {
    setup: partySetup,
    setSetup: setPartySetup,
    hydrated: partySetupHydrated,
  } = useToolPartySetup({
    key: 'noncombatPartySetup1',
    activeParty: durableParty,
    partyHydrated: partyLibraryHydrated,
    defaultCustomSize: 4,
    defaultCustomLevel: 5,
    minCustomSize: 1,
    legacySizeKey: 'noncombatPartySize',
    legacyLevelKey: 'noncombatPartyLevel',
  });
  const resolvedParty = resolveToolPartySetup(partySetup, durableParty);
  const partySize = resolvedParty.partySize;
  const partyLevel = resolvedParty.partyLevel ?? 1;
  const [kind, setKind] = usePersistentState<NoncombatKind | ''>('noncombatKind', '');
  const [difficulty, setDifficulty] = usePersistentState<Difficulty | ''>('noncombatDifficulty', '');
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
    partySizeInput, 'Party size', 1, MAX_CUSTOM_PARTY_MEMBERS,
  );
  const partyInputsValid = partySetupHydrated && (partySetup.mode === 'active'
    ? durableParty !== null && partySize > 0
    : partyLevelValidation.error === null && partySizeValidation.error === null);
  const partyInputsHydratedRef = useRef(false);

  useEffect(() => {
    if (!partySetupHydrated || partyInputsHydratedRef.current) return;
    partyInputsHydratedRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      if (partySetup.mode === 'custom') {
        setPartyLevelInput(String(partySetup.level));
        setPartySizeInput(String(partySetup.size));
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [partySetup, partySetupHydrated]);

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
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    // Read params from the location directly: effects only run client-side,
    // and unlike useSearchParams this never suspends hydration (which under
    // `next dev` left hard-loaded share links permanently dehydrated).
    const searchParams = new URLSearchParams(window.location.search);
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
    const size = clampInt(searchParams.get('size'), 1, MAX_SCENE_PARTY_MEMBERS) ?? 4;
    const themeP = searchParams.get('theme');
    const themeV = THEME_OPTIONS.some(o => o.value === themeP) ? (themeP as ThemeChoice) : 'any';
    const toneP = searchParams.get('tone');
    const toneV = TONE_OPTIONS.some(o => o.value === toneP) ? (toneP as Tone) : 'standard';
    const timeP = searchParams.get('time');
    const timeV = TIME_OPTIONS.some(o => o.value === timeP) ? (timeP as TimeBudget) : 'standard';
    setKind(kindV ?? ''); setDifficulty(diffV ?? '');
    setTheme(themeV); setTone(toneV); setTimeBudget(timeV);
    const r = generateNoncombat({ kind: kindV, difficulty: diffV, partyLevel: lvl, partySize: size, theme: themeV, tone: toneV, timeBudget: timeV, seed: seedParam });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot share-link hydration must render the exact seeded scene.
    setResult(r);
    setStatusMessage(`${r.name} loaded from the shared link.`);
    pushHistory(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGenerate(seedOverride?: number, kindOverride?: NoncombatKind) {
    if (!partyInputsValid) {
      const invalidId = partySetup.mode === 'active'
        ? 'noncombat-party-attendance'
        : partyLevelValidation.error
          ? 'noncombat-party-level'
          : 'noncombat-party-size';
      setStatusMessage(partySetup.mode === 'active'
        ? 'Select at least one attending character before generating a scene.'
        : 'Fix the temporary party level and size before generating a scene.');
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
    if (durableParty) {
      setPartySetup(createActiveToolPartySetup(durableParty));
    } else {
      setPartySetup(createCustomToolPartySetup(4, 5));
      setPartyLevelInput('5');
      setPartySizeInput('4');
    }
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
    if (validation.value !== null && partySetup.mode === 'custom') {
      setPartySetup({ ...partySetup, level: validation.value });
    }
  }

  function handlePartySizeInputChange(raw: string) {
    setPartySizeInput(raw);
    const validation = validateBoundedIntegerInput(
      raw,
      'Party size',
      1,
      MAX_CUSTOM_PARTY_MEMBERS,
    );
    if (validation.value !== null && partySetup.mode === 'custom') {
      setPartySetup({ ...partySetup, size: validation.value });
    }
  }

  function chooseActiveParty() {
    if (!durableParty) return;
    setPartySetup(createActiveToolPartySetup(durableParty));
    setStatusMessage(`${durableParty.name} will be used for the next scene.`);
  }

  function chooseCustomParty() {
    const next = createCustomToolPartySetup(
      durableParty
        ? Math.max(1, Math.min(MAX_CUSTOM_PARTY_MEMBERS, partySize || 4))
        : partySizeValidation.value ?? 4,
      durableParty ? partyLevel : partyLevelValidation.value ?? 5,
    );
    setPartySetup(next);
    setPartySizeInput(String(next.size));
    setPartyLevelInput(String(next.level));
    setStatusMessage('Temporary scene values selected. The saved party will not change.');
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

  function handleOpenPlayerView() {
    if (!result) return;
    window.open(buildPlayerUrl(result), '_blank', 'noopener');
  }

  /** History entries persist prose from older builds — regenerate from
      the stored levers so player exports always match the player route. */
  function freshPlayerView(r: NoncombatResult) {
    return toPlayerView(generateNoncombat({
      kind: r.requested.kind,
      difficulty: r.requested.difficulty,
      partyLevel: r.partyLevel,
      partySize: r.partySize,
      theme: r.requested.theme,
      tone: r.tone,
      timeBudget: r.timeBudget,
      seed: r.seed,
    }));
  }

  function handleCopyPlayerMarkdown() {
    if (!result) return;
    navigator.clipboard.writeText(playerViewToMarkdown(freshPlayerView(result))).then(() => {
      setStatusMessage('Player handout markdown copied to the clipboard.');
    }).catch(() => {
      setStatusMessage('The player markdown could not be copied. Please try again.');
    });
  }

  function handleDownloadPlayerJson() {
    if (!result) return;
    const json = playerViewToJson(freshPlayerView(result), {
      seed: result.seed,
      playerUrl: buildPlayerUrl(result),
    });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `player-handout-${result.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

  const selectedKindLabel = kinds.find(option => option.value === kind)?.label ?? 'Any puzzle or challenge';
  const activeLevelSummary = resolvedParty.exactLevels.length === 0
    ? 'No attending heroes'
    : Math.min(...resolvedParty.exactLevels) === Math.max(...resolvedParty.exactLevels)
      ? `Level ${partyLevel}`
      : `Levels ${Math.min(...resolvedParty.exactLevels)}–${Math.max(...resolvedParty.exactLevels)} · rounded average ${partyLevel}`;

  return (
    <div className="animate-fade-in">
      <ToolPageHeader
        path="/noncombat"
        description="Build the moments around initiative—verified puzzles, social scenes, hazards, chases, and investigations with table-ready stakes, outcomes, and handouts."
      />
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {statusMessage}
      </p>

      {/* Step 1: establish the scene brief. */}
      <form
        className="workflow-shell mb-6 print:hidden"
        aria-labelledby="noncombat-setup-heading"
        onSubmit={(event) => {
          event.preventDefault();
          handleGenerate();
        }}
      >
        <header className="workflow-header">
          <div className="workflow-title">
            <span className="workflow-step" aria-hidden="true">1</span>
            <div>
              <p className="micro-label">Build the scene</p>
              <h2 id="noncombat-setup-heading" className="mt-1 text-2xl">Shape the challenge</h2>
              <p className="mt-1 max-w-2xl text-sm text-[var(--text-2)]">
                Set the party, pressure, and table time. Choose a specific format or leave it open for a seeded surprise.
              </p>
            </div>
          </div>
          <div className="workflow-context" role="status">
            <span className="micro-label">Current brief</span>
            <strong>
              {partyInputsValid
                ? `${selectedKindLabel} · ${difficulty || 'Any difficulty'} · ${partySize} ${partySize === 1 ? 'hero' : 'heroes'} · ${partySetup.mode === 'active' ? activeLevelSummary : `level ${partyLevel}`}`
                : 'Party details need attention'}
            </strong>
          </div>
        </header>

        <div className="setup-grid">
          <section className="setup-group" aria-labelledby="noncombat-party-heading">
            <div className="setup-group-heading">
              <span className="setup-group-icon" aria-hidden="true"><Users size={18} /></span>
              <div>
                <h3 id="noncombat-party-heading" className="text-base">Party</h3>
                <p>Who will face this scene?</p>
              </div>
            </div>
            <fieldset>
              <legend className="sr-only">Party source</legend>
              <div className="option-card-grid mb-3">
                <label className={`option-card option-card-toggle ${partySetup.mode === 'active' ? 'is-active' : ''}`}>
                  <Users size={18} aria-hidden="true" />
                  <span className="option-card-copy">
                    <strong>Use active party</strong>
                    <small>{durableParty?.name ?? 'No saved party yet'}</small>
                  </span>
                  <input
                    type="radio"
                    name="noncombat-party-source"
                    checked={partySetup.mode === 'active'}
                    disabled={!durableParty || !partySetupHydrated}
                    onChange={chooseActiveParty}
                  />
                </label>
                <label className={`option-card option-card-toggle ${partySetup.mode === 'custom' ? 'is-active' : ''}`}>
                  <SlidersHorizontal size={18} aria-hidden="true" />
                  <span className="option-card-copy">
                    <strong>Temporary values</strong>
                    <small>Only for this scene</small>
                  </span>
                  <input
                    type="radio"
                    name="noncombat-party-source"
                    checked={partySetup.mode === 'custom'}
                    disabled={!partySetupHydrated}
                    onChange={chooseCustomParty}
                  />
                </label>
              </div>
            </fieldset>

            {!partySetupHydrated ? (
              <div className="surface-inset p-4 text-sm text-[var(--text-2)]" role="status">
                Loading party setup…
              </div>
            ) : partySetup.mode === 'active' && durableParty ? (
              <div className="surface-inset space-y-3 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[var(--text-1)]">{durableParty.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-3)]">
                      {partySize} of {durableParty.members.length} attending · {activeLevelSummary}
                    </p>
                  </div>
                  <Link href="/party/" className="btn-ghost text-xs">Manage parties</Link>
                </div>
                <PartyAttendanceList
                  id="noncombat-party-attendance"
                  party={durableParty}
                  selectedMemberIds={resolvedParty.selectedMemberIds}
                  onChange={(selectedMemberIds) => {
                    if (partySetup.mode !== 'active') return;
                    setPartySetup({ ...partySetup, selectedMemberIds });
                  }}
                  legend="Attendance"
                  error={partySize === 0 ? 'Select at least one attending character.' : null}
                />
                <p className="text-xs leading-relaxed text-[var(--text-3)]">
                  Mixed levels use a rounded average because puzzle and challenge engines take one scene level.
                </p>
              </div>
            ) : partySetup.mode === 'active' ? (
              <div className="surface-inset p-4 text-sm text-[var(--text-2)]">
                <p className="font-semibold text-[var(--text-1)]">
                  {partyLibraryUnavailable ? 'Party Library unavailable' : 'No active party'}
                </p>
                <p className="mt-1 text-xs text-[var(--text-3)]">
                  Create or activate a saved party, or continue with temporary values.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/party/" className="btn-secondary text-xs">Manage parties</Link>
                  <button type="button" className="btn-ghost text-xs" onClick={chooseCustomParty}>Use temporary values</button>
                </div>
              </div>
            ) : (
              <div className="surface-inset p-3">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[var(--text-1)]">Temporary scene party</p>
                    <p className="mt-0.5 text-xs text-[var(--text-3)]">Regeneration keeps these values; the Party Library never changes.</p>
                  </div>
                  {!durableParty && <Link href="/party/" className="btn-ghost text-xs">Create a saved party</Link>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="noncombat-party-size" className="field-label">Heroes</label>
                    <input
                      id="noncombat-party-size"
                      type="number"
                      min={1}
                      max={MAX_CUSTOM_PARTY_MEMBERS}
                      step={1}
                      inputMode="numeric"
                      value={partySizeInput}
                      onChange={e => handlePartySizeInputChange(e.target.value)}
                      aria-invalid={partySizeValidation.error ? true : undefined}
                      aria-describedby={partySizeValidation.error ? 'noncombat-party-size-error' : 'noncombat-party-size-hint'}
                      className="w-full"
                    />
                    <p id="noncombat-party-size-hint" className="field-hint">1–{MAX_CUSTOM_PARTY_MEMBERS} characters</p>
                    {partySizeValidation.error && <p id="noncombat-party-size-error" className="field-error" role="alert">{partySizeValidation.error}</p>}
                  </div>
                  <div>
                    <label htmlFor="noncombat-party-level" className="field-label">Average level</label>
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
                      aria-describedby={partyLevelValidation.error ? 'noncombat-party-level-error' : 'noncombat-party-level-hint'}
                      className="w-full"
                    />
                    <p id="noncombat-party-level-hint" className="field-hint">Level 1–20</p>
                    {partyLevelValidation.error && <p id="noncombat-party-level-error" className="field-error" role="alert">{partyLevelValidation.error}</p>}
                  </div>
                </div>
                {partyLibraryUnavailable && (
                  <p className="mt-3 text-xs text-[var(--text-3)]">Saved parties are unavailable, but temporary scene values still work.</p>
                )}
              </div>
            )}
          </section>

          <section className="setup-group" aria-labelledby="noncombat-brief-heading">
            <div className="setup-group-heading">
              <span className="setup-group-icon" aria-hidden="true"><SlidersHorizontal size={18} /></span>
              <div>
                <h3 id="noncombat-brief-heading" className="text-base">Scene brief</h3>
                <p>What should happen at the table?</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="noncombat-kind" className="field-label">Scene format</label>
                <select id="noncombat-kind" value={kind} onChange={e => setKind(e.target.value as NoncombatKind | '')} className="w-full">
                  <option value="">Any puzzle or challenge</option>
                  <optgroup label="Puzzles">
                    {kinds.filter(option => PUZZLE_KINDS.has(option.value)).map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Challenges">
                    {kinds.filter(option => !PUZZLE_KINDS.has(option.value)).map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                </select>
                <p className="field-hint">Leave open to draw from every verified format.</p>
              </div>
              <div>
                <label htmlFor="noncombat-difficulty" className="field-label">Target difficulty</label>
                <select id="noncombat-difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty | '')} className="w-full">
                  <option value="">Any difficulty</option>
                  {DIFFICULTIES.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
                <p className="field-hint">Sets check DCs, complexity, and consequences.</p>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="noncombat-time" className="field-label">Table time</label>
                <select id="noncombat-time" value={timeBudget} onChange={e => setTimeBudget(e.target.value as TimeBudget)} className="w-full">
                  {TIME_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <p className="field-hint">Controls the number of stages and expected running time.</p>
              </div>
            </div>
          </section>
        </div>

        <div className="optional-controls">
          <div className="optional-controls-heading">
            <div>
              <p className="micro-label">Optional tools</p>
              <p className="mt-1 text-sm text-[var(--text-2)]">Browse the formats or add a stronger narrative direction.</p>
            </div>
          </div>

          <details className="disclosure-panel disclosure-panel-flush">
            <summary>
              <span className="disclosure-summary-copy">
                <BookOpen size={17} aria-hidden="true" />
                <span>
                  <strong>Browse scene formats</strong>
                  <small>{kind ? `${selectedKindLabel} selected` : 'Compare puzzle and challenge structures'}</small>
                </span>
              </span>
              <ChevronDown className="disclosure-chevron" size={18} aria-hidden="true" />
            </summary>
            <div className="grid gap-5 border-t border-[var(--line-subtle)] p-4 lg:grid-cols-2">
              {([
                { label: 'Puzzle formats', puzzle: true },
                { label: 'Challenge formats', puzzle: false },
              ] as const).map(group => (
                <section key={group.label} aria-labelledby={`noncombat-${group.puzzle ? 'puzzle' : 'challenge'}-formats-heading`}>
                  <h3 id={`noncombat-${group.puzzle ? 'puzzle' : 'challenge'}-formats-heading`} className="mb-2 text-sm font-semibold text-[var(--text-2)]">
                    {group.label}
                  </h3>
                  <div className="space-y-2">
                    {kinds.filter(option => PUZZLE_KINDS.has(option.value) === group.puzzle).map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setKind(option.value)}
                        aria-pressed={kind === option.value}
                        className={`selection-card ${kind === option.value ? 'border-[var(--bronze)] bg-[var(--bronze-wash)]' : ''}`}
                      >
                        <span className="block font-semibold text-[var(--text-1)]">{option.label}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-[var(--text-2)]">{option.description}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </details>

          <details className="disclosure-panel disclosure-panel-flush mt-3">
            <summary>
              <span className="disclosure-summary-copy">
                <Sparkles size={17} aria-hidden="true" />
                <span>
                  <strong>Theme &amp; tone</strong>
                  <small>Flavor the scene without changing its basic structure</small>
                </span>
              </span>
              <ChevronDown className="disclosure-chevron" size={18} aria-hidden="true" />
            </summary>
            <div className="grid gap-3 border-t border-[var(--line-subtle)] p-4 sm:grid-cols-2">
              <div>
                <label htmlFor="noncombat-theme" className="field-label">Theme</label>
                <select id="noncombat-theme" value={theme} onChange={e => setTheme(e.target.value as ThemeChoice)} className="w-full">
                  {THEME_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <p className="field-hint">Sets the setting, imagery, and names.</p>
              </div>
              <div>
                <label htmlFor="noncombat-tone" className="field-label">Tone</label>
                <select id="noncombat-tone" value={tone} onChange={e => setTone(e.target.value as Tone)} className="w-full">
                  {TONE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <p className="field-hint">Adjusts how the generated prose feels.</p>
              </div>
            </div>
          </details>
        </div>

        <footer className="workflow-action-bar">
          <div className="workflow-primary-action">
            <button type="submit" className="btn-primary text-base">
              <Sparkles size={18} aria-hidden="true" />
              {result ? 'Generate a new scene' : 'Generate scene'}
            </button>
            <p>Creates a complete, seeded scene from this brief.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ResetGeneratorButton onReset={handleReset} label="Reset" />
          </div>
        </footer>
      </form>

      {/* Recent scenes stay available without becoming another page-level card wall. */}
      {history.length > 0 && !(history.length === 1 && result?.id === history[0].id) && (
        <details className="disclosure-panel mb-6 print:hidden">
          <summary>
            <span className="disclosure-summary-copy">
              <BookOpen size={17} aria-hidden="true" />
              <span>
                <strong>Recent puzzles &amp; challenges</strong>
                <small>Return to one of the last {history.length} generated scenes</small>
              </span>
            </span>
            <ChevronDown className="disclosure-chevron" size={18} aria-hidden="true" />
          </summary>
          <div className="grid gap-2 border-t border-[var(--line-subtle)] p-4 sm:grid-cols-2 lg:grid-cols-3">
            {history.map(historyResult => (
              <button
                key={historyResult.id}
                type="button"
                onClick={() => handleLoadHistory(historyResult)}
                aria-current={result?.id === historyResult.id ? 'true' : undefined}
                className={`selection-card ${result?.id === historyResult.id ? 'border-[var(--bronze)] bg-[var(--bronze-wash)]' : ''}`}
              >
                <span className="block font-semibold text-[var(--text-1)]">{historyResult.name}</span>
                <span className="mt-1 block text-xs text-[var(--text-2)]">
                  {kinds.find(option => option.value === historyResult.kind)?.label} · {historyResult.difficulty} · {THEME_OPTIONS.find(option => option.value === historyResult.theme)?.label ?? historyResult.theme} · {TIME_OPTIONS.find(option => option.value === historyResult.timeBudget)?.label ?? historyResult.timeBudget}
                </span>
              </button>
            ))}
          </div>
        </details>
      )}

      {!result && (
        <div className="empty-state print:hidden">
          <p className="micro-label">Scene workspace</p>
          <h2 className="mt-2 text-xl">Give the party something worth solving</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--text-3)]">
            Generate a specific format above, or leave it open and let the seeded generator surprise you.
          </p>
        </div>
      )}

      {result && (
        <div className="space-y-6 animate-fade-in">
          {/* Step 2: review the scene before presenting it. */}
          <section className="card workflow-review-card" aria-labelledby="noncombat-result-title">
            <header className="workflow-review-header">
              <div className="workflow-title min-w-0">
                <span className="workflow-step" aria-hidden="true">2</span>
                <div className="min-w-0">
                  <p className="micro-label">Review the scene</p>
                  <h2
                    id="noncombat-result-title"
                    ref={resultRef}
                    tabIndex={-1}
                    className="mt-1 scroll-mt-24 text-2xl sm:text-3xl"
                  >
                    {result.name}
                  </h2>
                </div>
              </div>
              <div className="workflow-review-actions print:hidden">
                <button type="button" onClick={handleReroll} className="btn-secondary text-sm">
                  <Sparkles size={16} aria-hidden="true" />
                  Regenerate with a new seed
                </button>
              </div>
            </header>

            <div className="workflow-review-overview">
              <div className="difficulty-readout">
                <span className="meta-label">Difficulty</span>
                <span className={`status-readout mt-2 ${difficultyStatusClass(result.difficulty)}`}>
                  <span className="status-readout-dot" aria-hidden="true" />
                  {result.difficulty}
                </span>
                <p>The generated checks, complexity, and consequences use this difficulty.</p>
              </div>
              <dl className="metric-grid">
                <div className="metric-item">
                  <dt>Scene format</dt>
                  <dd>{kinds.find(option => option.value === result.kind)?.label ?? result.kind}</dd>
                </div>
                <div className="metric-item">
                  <dt>Party</dt>
                  <dd>{result.partySize} × level {result.partyLevel}</dd>
                </div>
                <div className="metric-item">
                  <dt>Table time</dt>
                  <dd>{result.resultKind === 'puzzle' ? `~${result.estimatedMinutes} min` : (TIME_OPTIONS.find(option => option.value === result.timeBudget)?.label ?? result.timeBudget)}</dd>
                </div>
                <div className="metric-item">
                  <dt>Theme</dt>
                  <dd>{THEME_OPTIONS.find(option => option.value === result.theme)?.label ?? result.theme}</dd>
                </div>
                <div className="metric-item">
                  <dt>Tone</dt>
                  <dd>{TONE_OPTIONS.find(option => option.value === result.tone)?.label ?? result.tone}</dd>
                </div>
                <div className="metric-item">
                  <dt>Seed</dt>
                  <dd>{result.seed}</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="content-panel" aria-labelledby="noncombat-preparation-heading">
            <header className="content-panel-heading">
              <div>
                <p className="micro-label">DM preparation</p>
                <h2 id="noncombat-preparation-heading" className="mt-1 text-xl">Understand the scene</h2>
              </div>
              <p>Review the premise and player-facing material before bringing it to the table.</p>
            </header>

            {result.resultKind === 'puzzle' ? (
              <div className="divide-y divide-[var(--line-subtle)]">
                <div className="grid gap-5 p-4 lg:grid-cols-2">
                  <section aria-labelledby="noncombat-dm-brief-heading">
                    <h3 id="noncombat-dm-brief-heading" className="text-lg">DM brief <span className="text-sm text-[var(--accent-danger-light)]">(eyes only)</span></h3>
                    <p className="mt-2 text-sm whitespace-pre-line">{result.dmBrief}</p>
                    {result.dmAdjudication && (
                      <div className="surface-inset mt-4 p-3">
                        <h4 className="text-sm font-bold text-[var(--bronze)]">Adjudication</h4>
                        <p className="mt-1 text-sm">{result.dmAdjudication}</p>
                      </div>
                    )}
                  </section>
                  <section aria-labelledby="noncombat-read-aloud-heading">
                    <h3 id="noncombat-read-aloud-heading" className="text-lg">Read aloud</h3>
                    <p className="mt-2 text-sm italic whitespace-pre-line">{result.readAloud}</p>
                  </section>
                </div>
                {result.handout && (
                  <div className="p-4">
                    <PuzzleHandout spec={result.handout} embedded />
                  </div>
                )}
              </div>
            ) : (
              <div className="divide-y divide-[var(--line-subtle)]">
                <section className="p-4" aria-labelledby="noncombat-read-aloud-heading">
                  <h3 id="noncombat-read-aloud-heading" className="text-lg">Read aloud</h3>
                  <p className="mt-2 text-sm italic whitespace-pre-line">{result.readAloud}</p>
                </section>
                <div className="grid gap-5 p-4 md:grid-cols-2">
                  <section aria-labelledby="noncombat-situation-heading">
                    <h3 id="noncombat-situation-heading" className="text-lg">Situation</h3>
                    <p className="mt-2 text-sm whitespace-pre-line">{result.situation}</p>
                  </section>
                  <section aria-labelledby="noncombat-stakes-heading">
                    <h3 id="noncombat-stakes-heading" className="text-lg">Stakes</h3>
                    <p className="mt-2 text-sm whitespace-pre-line">{result.stakes}</p>
                  </section>
                </div>
                {result.handout && (
                  <div className="p-4">
                    <PuzzleHandout spec={result.handout} embedded />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Step 3: present the scene or run it from this screen. */}
          <section className="next-step-shell" aria-labelledby="noncombat-next-step-heading">
            <header className="workflow-title print:hidden">
              <span className="workflow-step" aria-hidden="true">3</span>
              <div>
                <p className="micro-label">Take it to the table</p>
                <h2 id="noncombat-next-step-heading" className="mt-1 text-2xl">Present it or run it here</h2>
              </div>
            </header>

            <div className="next-step-grid print:hidden">
              <article className="next-step-card">
                <span className="next-step-icon" aria-hidden="true"><UserRound size={20} /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg">Present to players</h3>
                  <p>Open a spoiler-safe view containing only the read-aloud text and player handout. It opens in a new tab.</p>
                  <div className="mt-4 grid gap-2">
                    <button type="button" onClick={handleOpenPlayerView} className="btn-primary w-full text-sm sm:w-auto">
                      <UserRound size={16} aria-hidden="true" />
                      Open player view
                    </button>
                    <details className="action-menu action-menu-flow">
                      <summary className="btn-secondary text-sm">
                        <FileText size={16} aria-hidden="true" />
                        Share, export &amp; print
                        <ChevronDown size={16} aria-hidden="true" className="action-menu-chevron" />
                      </summary>
                      <div className="action-menu-panel">
                        <p className="micro-label px-3 pb-2">Scene utilities</p>
                        <div className="grid">
                          <button type="button" onClick={handleCopyPlayerMarkdown} className="menu-action">
                            <FileText size={18} aria-hidden="true" />
                            <span><strong>Player Markdown</strong><small>Copy spoiler-safe handout text</small></span>
                          </button>
                          <button type="button" onClick={handleDownloadPlayerJson} className="menu-action">
                            <FileJson size={18} aria-hidden="true" />
                            <span><strong>Player JSON</strong><small>Download structured player data</small></span>
                          </button>
                          <button type="button" onClick={handleExport} className="menu-action">
                            <FileText size={18} aria-hidden="true" />
                            <span><strong>DM Markdown</strong><small>Download the complete scene</small></span>
                          </button>
                          <button type="button" onClick={handleCopyLink} className="menu-action">
                            {linkCopied ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />}
                            <span><strong>{linkCopied ? 'Link copied' : 'Copy share link'}</strong><small>Recreate this seeded scene</small></span>
                          </button>
                          <PrintButton
                            label={result.resultKind === 'puzzle' ? 'Print puzzle / save PDF' : 'Print challenge / save PDF'}
                            variant="menu"
                            menuDescription="Full DM scene with solutions and outcomes"
                          />
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
              </article>

              <article className="next-step-card">
                <span className="next-step-icon" aria-hidden="true"><BookOpen size={20} /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg">Run from this screen</h3>
                  <p>
                    {result.resultKind === 'puzzle'
                      ? 'Move through stages, reveal hints only when needed, then resolve the answer and consequences.'
                      : 'Follow the checks and scene structure in play order, then apply the complication and outcomes.'}
                  </p>
                  <a href="#noncombat-table-runner" className="btn-primary mt-4 w-full text-sm sm:w-auto">
                    <BookOpen size={16} aria-hidden="true" />
                    Open table runner
                  </a>
                </div>
              </article>
            </div>

            <section id="noncombat-table-runner" className="content-panel mt-5 scroll-mt-24" aria-labelledby="noncombat-runner-heading">
              <header className="content-panel-heading">
                <div>
                  <p className="micro-label">Table runner</p>
                  <h2 id="noncombat-runner-heading" className="mt-1 text-xl">
                    {result.resultKind === 'puzzle' ? 'Run the puzzle' : 'Run the challenge'}
                  </h2>
                </div>
                <p>{result.resultKind === 'puzzle' ? 'Reveal information in order and keep the solution concealed.' : 'Use the checks, tracks, and outcomes in play order.'}</p>
              </header>

              {result.resultKind === 'puzzle' ? (
                <div className="divide-y divide-[var(--line-subtle)]">
                  {result.stages && result.stages.length > 0 && (
                    <section className="p-4" aria-labelledby="noncombat-stages-heading">
                      <h3 id="noncombat-stages-heading" className="text-lg">Scene stages</h3>
                      <div className="mt-3 space-y-2">
                        {result.stages.map((stage, index) => (
                          <article key={index} className="surface-inset p-3">
                            <h4 className="text-sm font-bold text-[var(--text-1)]">{stage.title}</h4>
                            <p className="mt-1 text-sm whitespace-pre-line">{stage.text}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="p-4 print:hidden" aria-labelledby="noncombat-hints-heading">
                    <h3 id="noncombat-hints-heading" className="text-lg">Hints</h3>
                    <p className="mt-1 text-xs text-[var(--text-3)]">Reveal one at a time when the party stalls.</p>
                    <div className="mt-2 space-y-2">
                      {result.hints.map((hint, index) => (
                        <HintReveal key={`${result.id}-${index}`} index={index + 1} hint={hint} />
                      ))}
                    </div>
                  </section>

                  <section className="p-4 print:hidden" aria-labelledby="noncombat-resolution-heading">
                    <h3 id="noncombat-resolution-heading" className="sr-only">Puzzle resolution</h3>
                    <button
                      type="button"
                      onClick={() => setShowSolution(!showSolution)}
                      aria-expanded={showSolution}
                      aria-controls="noncombat-solution"
                      className="flex min-h-11 items-center gap-2 text-lg font-bold text-[var(--bronze)]"
                    >
                      {showSolution
                        ? <ChevronDown size={18} aria-hidden="true" />
                        : <ChevronRight size={18} aria-hidden="true" />}
                      {showSolution ? 'Hide solution & resolution' : 'Reveal solution & resolution'}
                    </button>
                    {showSolution && (
                      <div id="noncombat-solution" className="mt-3 grid gap-3 animate-fade-in md:grid-cols-3">
                        <div className="surface-inset p-3">
                          <h4 className="text-sm font-bold text-[var(--text-1)]">Answer</h4>
                          <p className="mt-1 text-sm">{result.solution}</p>
                        </div>
                        <div className="surface-inset p-3">
                          <h4 className="text-sm font-bold text-[var(--accent-danger-light)]">On failure</h4>
                          <p className="mt-1 text-sm">{result.failureConsequence}</p>
                        </div>
                        <div className="surface-inset p-3">
                          <h4 className="text-sm font-bold text-[var(--difficulty-easy)]">Reward</h4>
                          <p className="mt-1 text-sm">{result.reward}</p>
                        </div>
                      </div>
                    )}
                  </section>

                  <div className="hidden p-4 print:block">
                    <h3 className="text-lg">Hints</h3>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                      {result.hints.map((hint, index) => <li key={index}>{hint}</li>)}
                    </ol>
                    <h3 className="mt-5 text-lg">Solution</h3>
                    <p className="mt-1 text-sm">{result.solution}</p>
                    <h4 className="mt-3 text-sm">On failure</h4>
                    <p className="text-sm">{result.failureConsequence}</p>
                    <h4 className="mt-3 text-sm">Reward</h4>
                    <p className="text-sm">{result.reward}</p>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-[var(--line-subtle)]">
                  <section className="p-4" aria-labelledby="noncombat-skill-checks-heading">
                    <h3 id="noncombat-skill-checks-heading" className="text-lg">1. Call for checks</h3>
                    <div className="mt-3 space-y-2">
                      {result.skillChecks.map((skillCheck, index) => (
                        <article key={index} className="surface-inset p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-bold text-[var(--text-1)]">{skillCheck.skill}</h4>
                            <span className="text-sm font-bold text-[var(--bronze)]">DC {skillCheck.dc}</span>
                          </div>
                          <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                            <p><span className="font-bold text-[var(--difficulty-easy)]">Success:</span> {skillCheck.onSuccess}</p>
                            <p><span className="font-bold text-[var(--accent-danger)]">Failure:</span> {skillCheck.onFailure}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  {result.structure && (
                    <section className="p-4" aria-labelledby="noncombat-structure-heading">
                      <h3 id="noncombat-structure-heading" className="text-lg">Challenge structure</h3>
                      <p className="mt-1 text-sm">
                        {result.structure.successesNeeded} successes needed · {result.structure.failuresAllowed} failures allowed
                      </p>
                      <div className="mt-3 space-y-2">
                        {result.structure.phases.map((phase, index) => (
                          <div key={index} className="surface-inset p-3 text-sm">
                            <span className="font-bold text-[var(--text-1)]">{phase.title}</span>
                            {' · '}{phase.successes} success{phase.successes === 1 ? '' : 'es'}{' · '}{phase.primarySkills.join(', ')}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {result.stages && result.stages.length > 0 && (
                    <section className="p-4" aria-labelledby="noncombat-challenge-stages-heading">
                      <h3 id="noncombat-challenge-stages-heading" className="text-lg">Scene stages</h3>
                      <div className="mt-3 space-y-2">
                        {result.stages.map((stage, index) => (
                          <article key={index} className="surface-inset p-3">
                            <h4 className="text-sm font-bold text-[var(--text-1)]">{stage.title}</h4>
                            <p className="mt-1 text-sm whitespace-pre-line">{stage.text}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

                  {result.attitudeTrack && (
                    <section className="p-4" aria-labelledby="noncombat-attitude-heading">
                      <h3 id="noncombat-attitude-heading" className="text-lg">Attitude track</h3>
                      <p className="mt-1 text-sm"><span className="font-bold text-[var(--text-2)]">Starting attitude:</span> {result.attitudeTrack.start}</p>
                      <div className="mt-3 space-y-2">
                        {result.attitudeTrack.stages.map((stage, index) => (
                          <article key={index} className="surface-inset p-3 text-sm">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-bold text-[var(--text-1)]">{stage.attitude}</h4>
                              <span className="text-xs font-bold text-[var(--bronze)]">Influence DC {stage.influenceDc}</span>
                            </div>
                            <p className="mt-1 text-xs"><span className="font-bold text-[var(--text-2)]">Unlocks:</span> {stage.unlocks}</p>
                            <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                              <p><span className="font-bold text-[var(--difficulty-easy)]">Shift up:</span> {stage.shiftUp}</p>
                              <p><span className="font-bold text-[var(--accent-danger)]">Shift down:</span> {stage.shiftDown}</p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

                  {result.chase && (
                    <section className="p-4" aria-labelledby="noncombat-chase-heading">
                      <h3 id="noncombat-chase-heading" className="text-lg">Chase plan</h3>
                      <p className="mt-1 text-sm">Run for {result.chase.rounds} rounds.</p>
                      <div className="mt-3 space-y-2">
                        {result.chase.complications.map((complication, index) => (
                          <article key={index} className="surface-inset p-3 text-sm">
                            <span className="font-bold text-[var(--bronze)]">Round {complication.round}</span>{' · '}{complication.text}{' · '}
                            <span className="text-xs text-[var(--text-2)]">{complication.check}</span>
                          </article>
                        ))}
                      </div>
                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        <p><span className="font-bold text-[var(--difficulty-easy)]">Escape:</span> {result.chase.escapeCondition}</p>
                        <p><span className="font-bold text-[var(--accent-danger)]">Catch:</span> {result.chase.catchCondition}</p>
                      </div>
                    </section>
                  )}

                  {result.clueWeb && (
                    <section className="p-4" aria-labelledby="noncombat-clue-web-heading">
                      <h3 id="noncombat-clue-web-heading" className="text-lg">Clue web <span className="text-sm text-[var(--accent-danger-light)]">(eyes only)</span></h3>
                      <p className="mt-2 text-sm">
                        <span className="font-bold text-[var(--bronze)]">Truth:</span> {result.clueWeb.truth.culprit} — {result.clueWeb.truth.method}, motive: {result.clueWeb.truth.motive}
                      </p>
                      <div className="mt-3 space-y-2">
                        {result.clueWeb.nodes.map((node, index) => (
                          <article key={index} className="surface-inset p-3 text-sm">
                            <h4 className="font-bold text-[var(--text-1)]">{node.revelation}</h4>
                            <ul className="mt-1 space-y-1 text-xs">
                              {node.clues.map((clue, clueIndex) => (
                                <li key={clueIndex}><span className="uppercase tracking-wide text-[var(--text-2)]">[{clue.vector}]</span> {clue.text} <span className="text-[var(--text-2)]">→ {clue.pointsTo}</span></li>
                              ))}
                            </ul>
                          </article>
                        ))}
                      </div>
                      <p className="mt-3 text-xs">
                        <span className="font-bold text-[var(--text-2)]">Red herring:</span> {result.clueWeb.redHerring.text}{' '}
                        <span className="font-bold text-[var(--text-2)]">Disconfirmed by:</span> {result.clueWeb.redHerring.disconfirmedBy}
                      </p>
                    </section>
                  )}

                  <section className="p-4" aria-labelledby="noncombat-resolution-heading">
                    <h3 id="noncombat-resolution-heading" className="text-lg">2. Resolve the scene</h3>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div className="surface-inset p-3">
                        <h4 className="text-sm font-bold text-[var(--accent-danger-light)]">Complication</h4>
                        <p className="mt-1 text-sm">{result.complication}</p>
                      </div>
                      <div className="surface-inset p-3">
                        <h4 className="text-sm font-bold text-[var(--difficulty-easy)]">Reward</h4>
                        <p className="mt-1 text-sm">{result.reward}</p>
                      </div>
                    </div>
                    <h4 className="mt-4 text-sm font-bold text-[var(--text-1)]">Possible outcomes</h4>
                    <div className="mt-2 space-y-2">
                      {result.outcomes.map((outcome, index) => (
                        <div key={index} className="surface-inset p-3">
                          <span className="font-bold text-[var(--bronze)]">{outcome.label}:</span>{' '}
                          <span className="text-sm">{outcome.description}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </section>
          </section>
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
