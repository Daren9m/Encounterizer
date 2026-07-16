'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { generatePuzzle, getPuzzleCategories } from '@/lib/puzzle-generator';
import type { Puzzle, PuzzleCategory, PuzzleDifficulty } from '@/lib/puzzle-generator';
import { THEME_OPTIONS, TONE_OPTIONS, TIME_OPTIONS } from '@/lib/noncombat/theming';
import type { ThemeChoice, Tone, TimeBudget } from '@/lib/noncombat/types';
import { handoutToText } from '@/lib/noncombat/handout-text';
import { randomSeed } from '@/lib/random';
import { usePersistentState } from '@/lib/use-persistent-state';
import PuzzleHandout from '@/components/PuzzleHandout';
import PrintButton from '@/components/PrintButton';

const DIFFICULTIES: PuzzleDifficulty[] = ['Easy', 'Medium', 'Hard'];

// ─── Share link ───────────────────────────────────────────────────
// Serializes exactly the levers a shared link needs to reproduce the
// puzzle: `puzzle.requested` (what the caller asked for) plus the
// concrete values the generator resolved (lvl/size/tone/time) and the
// seed. Spec §6.8 — this URL contract is permanent.

function buildShareUrl(p: Puzzle): string {
  const params = new URLSearchParams();
  params.set('seed', String(p.seed));
  if (p.requested.category) params.set('cat', p.requested.category);
  if (p.requested.difficulty) params.set('diff', p.requested.difficulty);
  params.set('lvl', String(p.partyLevel));
  params.set('size', String(p.partySize));
  params.set('theme', p.requested.theme);
  params.set('tone', p.tone);
  params.set('time', p.timeBudget);
  return `${window.location.origin}/puzzles?${params.toString()}`;
}

export default function PuzzlesPage() {
  // useSearchParams requires a Suspense boundary under static prerendering.
  return (
    <Suspense fallback={null}>
      <PuzzleBuilder />
    </Suspense>
  );
}

function PuzzleBuilder() {
  const [category, setCategory] = usePersistentState<PuzzleCategory | ''>('puzzleCategory', '');
  const [difficulty, setDifficulty] = usePersistentState<PuzzleDifficulty | ''>('puzzleDifficulty', '');
  const [partyLevel, setPartyLevel] = usePersistentState<number>('puzzlePartyLevel', 5);
  const [partySize, setPartySize] = usePersistentState<number>('puzzlePartySize', 4);
  const [theme, setTheme] = usePersistentState<ThemeChoice>('puzzleTheme', 'any');
  const [tone, setTone] = usePersistentState<Tone>('puzzleTone', 'standard');
  const [timeBudget, setTimeBudget] = usePersistentState<TimeBudget>('puzzleTime', 'standard');
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [history, setHistory] = usePersistentState<Puzzle[]>(
    'puzzleHistory2', [], (v): v is Puzzle[] => Array.isArray(v),
  );

  // One-shot hydration from a shared link (?seed=...). Persisted lever
  // state above is declared first so a shared link's params win over
  // remembered preferences.
  const CATS = getPuzzleCategories().map(c => c.value);
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
    const catP = searchParams.get('cat');
    const cat = CATS.includes(catP as PuzzleCategory) ? (catP as PuzzleCategory) : undefined;
    const diffP = searchParams.get('diff');
    const diff = (['Easy', 'Medium', 'Hard'] as const).includes(diffP as PuzzleDifficulty) ? (diffP as PuzzleDifficulty) : undefined;
    const lvl = clampInt(searchParams.get('lvl'), 1, 20) ?? 5;
    const size = clampInt(searchParams.get('size'), 1, 8) ?? 4;
    const themeP = searchParams.get('theme');
    const themeV = THEME_OPTIONS.some(o => o.value === themeP) ? (themeP as ThemeChoice) : 'any';
    const toneP = searchParams.get('tone');
    const toneV = TONE_OPTIONS.some(o => o.value === toneP) ? (toneP as Tone) : 'standard';
    const timeP = searchParams.get('time');
    const timeV = TIME_OPTIONS.some(o => o.value === timeP) ? (timeP as TimeBudget) : 'standard';
    setCategory(cat ?? ''); setDifficulty(diff ?? ''); setPartyLevel(lvl); setPartySize(size);
    setTheme(themeV); setTone(toneV); setTimeBudget(timeV);
    const p = generatePuzzle({ category: cat, difficulty: diff, partyLevel: lvl, partySize: size, theme: themeV, tone: toneV, timeBudget: timeV, seed: seedParam });
    setPuzzle(p);
    setHistory(prev => [p, ...prev.filter(h => h.id !== p.id).slice(0, 9)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGenerate(seedOverride?: number) {
    const p = generatePuzzle({
      category: category || undefined,
      difficulty: difficulty || undefined,
      partyLevel,
      partySize,
      theme,
      tone,
      timeBudget,
      seed: seedOverride ?? randomSeed(),
    });
    setPuzzle(p);
    setShowSolution(false);
    setLinkCopied(false);
    setHistory(prev => [p, ...prev.filter(h => h.id !== p.id).slice(0, 9)]);
  }

  function handleCopyLink() {
    if (!puzzle) return;
    navigator.clipboard.writeText(buildShareUrl(puzzle)).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  function handleExport() {
    if (!puzzle) return;
    const lines = [
      `# ${puzzle.name}`,
      `Category: ${puzzle.category} | Difficulty: ${puzzle.difficulty} | Est. Time: ${puzzle.estimatedMinutes} min`,
      `Theme: ${puzzle.theme} | Tone: ${puzzle.tone} | Time: ${puzzle.timeBudget} | Party: ${puzzle.partySize} × level ${puzzle.partyLevel} | Seed: ${puzzle.seed}`,
      '',
      '## DM Brief',
      puzzle.dmBrief,
    ];
    if (puzzle.dmAdjudication) {
      lines.push('', '### Adjudication', puzzle.dmAdjudication);
    }
    lines.push('', '## Read Aloud', puzzle.readAloud);
    if (puzzle.stages && puzzle.stages.length > 0) {
      lines.push('', '## Stages');
      for (const stage of puzzle.stages) {
        lines.push(`### ${stage.title}`, stage.text, '');
      }
    }
    if (puzzle.handout) {
      lines.push('## Player Handout', handoutToText(puzzle.handout));
    }
    lines.push(
      '',
      '## Hints',
      ...puzzle.hints.map((h, i) => `${i + 1}. ${h}`),
      '',
      '## Solution',
      puzzle.solution,
      '',
      '## Failure Consequence',
      puzzle.failureConsequence,
      '',
      '## Reward',
      puzzle.reward,
    );
    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${puzzle.name.toLowerCase().replace(/\s+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const categories = getPuzzleCategories();

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl mb-2">Puzzle Generator</h1>
      <p className="text-[var(--text-2)] mb-6">
        Generate ready-to-run puzzles, riddles, ciphers, and minigames for your sessions.
      </p>

      {/* Controls */}
      <div className="card mb-6 print:hidden">
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label htmlFor="puzzle-category" className="micro-label block mb-1">Category</label>
            <select id="puzzle-category" value={category} onChange={e => setCategory(e.target.value as PuzzleCategory | '')} className="w-full">
              <option value="">Any</option>
              {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="puzzle-difficulty" className="micro-label block mb-1">Difficulty</label>
            <select id="puzzle-difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value as PuzzleDifficulty | '')} className="w-full">
              <option value="">Any</option>
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="puzzle-party-level" className="micro-label block mb-1">Party Level</label>
            <input id="puzzle-party-level" type="number" min={1} max={20} value={partyLevel} onChange={e => setPartyLevel(Math.max(1, Math.min(20, Number(e.target.value))))} className="w-full" />
          </div>
          <div>
            <label htmlFor="puzzle-party-size" className="micro-label block mb-1">Party Size</label>
            <input id="puzzle-party-size" type="number" min={1} max={8} value={partySize} onChange={e => setPartySize(Math.max(1, Math.min(8, Number(e.target.value))))} className="w-full" />
          </div>
          <div>
            <label htmlFor="puzzle-theme" className="micro-label block mb-1">Theme</label>
            <select id="puzzle-theme" value={theme} onChange={e => setTheme(e.target.value as ThemeChoice)} className="w-full">
              {THEME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="puzzle-tone" className="micro-label block mb-1">Tone</label>
            <select id="puzzle-tone" value={tone} onChange={e => setTone(e.target.value as Tone)} className="w-full">
              {TONE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="puzzle-time" className="micro-label block mb-1">Time Budget</label>
            <select id="puzzle-time" value={timeBudget} onChange={e => setTimeBudget(e.target.value as TimeBudget)} className="w-full">
              {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => handleGenerate()} className="btn-primary text-lg">Generate Puzzle</button>
          {puzzle && (
            <>
              <button type="button" onClick={() => handleGenerate()} className="btn-secondary">Regenerate</button>
              <button type="button" onClick={handleExport} className="btn-secondary">Export Markdown</button>
              <button type="button" onClick={handleCopyLink} className="btn-secondary">
                {linkCopied ? 'Copied ✓' : 'Share Link'}
              </button>
              <PrintButton label="Print Puzzle" />
            </>
          )}
        </div>
      </div>

      {/* Puzzle Display */}
      {puzzle && (
        <div className="space-y-4 animate-fade-in">
          {/* Header */}
          <div className="card">
            <div className="flex items-start justify-between mb-2">
              <h2 className="text-2xl">{puzzle.name}</h2>
              <div className="flex gap-2">
                <span className={`px-3 py-1 rounded-full text-xs self-center ${
                  puzzle.difficulty === 'Easy' ? 'badge-easy' :
                  puzzle.difficulty === 'Medium' ? 'badge-medium' : 'badge-hard'
                }`}>{puzzle.difficulty}</span>
                <span className="px-3 py-1 rounded-full text-sm bg-[var(--steel-800)] text-[var(--text-2)]">
                  ~{puzzle.estimatedMinutes} min
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="micro-label">
                {categories.find(c => c.value === puzzle.category)?.label}
              </span>
              <span className="text-xs text-[var(--text-2)]">
                · Party {puzzle.partySize} × level {puzzle.partyLevel}
              </span>
              <button
                type="button"
                onClick={() => handleGenerate(randomSeed())}
                className="px-3 py-1 rounded-full text-xs bg-[var(--steel-800)] text-[var(--text-2)] hover:text-[var(--bronze)] transition-colors"
                title="Reroll with a fresh seed, same levers"
              >
                Seed: {puzzle.seed}
              </button>
            </div>
          </div>

          {/* DM Brief */}
          <div className="card border-l-4 border-l-[var(--accent-danger)]">
            <h3 className="text-lg mb-2">DM Brief (eyes only)</h3>
            <p className="text-sm">{puzzle.dmBrief}</p>
            {puzzle.dmAdjudication && (
              <div className="mt-3">
                <h4 className="text-sm font-bold text-[var(--bronze)]">Adjudication</h4>
                <p className="text-sm">{puzzle.dmAdjudication}</p>
              </div>
            )}
          </div>

          {/* Read Aloud */}
          <div className="card border-l-4 border-l-[var(--bronze)]">
            <h3 className="text-lg mb-2">Read Aloud</h3>
            <p className="text-sm italic whitespace-pre-line">{puzzle.readAloud}</p>
          </div>

          {/* Player Handout */}
          {puzzle.handout && <PuzzleHandout spec={puzzle.handout} />}

          {/* Stages */}
          {puzzle.stages && puzzle.stages.length > 0 && (
            <>
              {puzzle.stages.map((stage, i) => (
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
              {puzzle.hints.map((hint, i) => (
                <HintReveal key={i} index={i + 1} hint={hint} />
              ))}
            </div>
          </div>

          {/* Solution (hidden by default) */}
          <div className="card print:hidden">
            <button
              type="button"
              onClick={() => setShowSolution(!showSolution)}
              aria-expanded={showSolution}
              className="flex items-center gap-2 text-lg font-bold text-[var(--bronze)]"
            >
              {showSolution
                ? <ChevronDown size={18} aria-hidden="true" />
                : <ChevronRight size={18} aria-hidden="true" />} Solution
            </button>
            {showSolution && (
              <div className="mt-3 space-y-3 animate-fade-in">
                <div>
                  <h4 className="text-sm">Answer</h4>
                  <p className="text-sm">{puzzle.solution}</p>
                </div>
                <div>
                  <h4 className="text-sm">On Failure</h4>
                  <p className="text-sm">{puzzle.failureConsequence}</p>
                </div>
                <div>
                  <h4 className="text-sm">Reward</h4>
                  <p className="text-sm">{puzzle.reward}</p>
                </div>
              </div>
            )}
          </div>

          {/* Print-only: everything expanded for the DM's paper copy */}
          <div className="hidden print:block space-y-4">
            <div className="card">
              <h3 className="text-lg mb-2">Hints</h3>
              <ol className="text-sm list-decimal list-inside space-y-1">
                {puzzle.hints.map((hint, i) => (
                  <li key={i}>{hint}</li>
                ))}
              </ol>
            </div>
            <div className="card">
              <h3 className="text-lg mb-2">Solution</h3>
              <p className="text-sm">{puzzle.solution}</p>
              <h4 className="text-sm mt-3">On Failure</h4>
              <p className="text-sm">{puzzle.failureConsequence}</p>
              <h4 className="text-sm mt-3">Reward</h4>
              <p className="text-sm">{puzzle.reward}</p>
            </div>
          </div>
        </div>
      )}

      {/* History (persists across visits) */}
      {history.length > 0 && !(history.length === 1 && puzzle?.id === history[0].id) && (
        <div className="mt-6 print:hidden">
          <h2 className="text-lg mb-3">Recent Puzzles</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {history.map((p) => (
              <button key={p.id} type="button" onClick={() => { setPuzzle(p); setShowSolution(false); }}
                className={`card text-left text-sm ${puzzle?.id === p.id ? 'border-[var(--bronze)]' : ''}`}>
                <div className="font-bold text-[var(--text-1)]">{p.name}</div>
                <div className="text-xs text-[var(--text-2)]">
                  {categories.find(c => c.value === p.category)?.label} · {p.difficulty} · ~{p.estimatedMinutes} min
                  · {THEME_OPTIONS.find(o => o.value === p.theme)?.label ?? p.theme}
                  · {TIME_OPTIONS.find(o => o.value === p.timeBudget)?.label ?? p.timeBudget}
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
  return (
    <div>
      {revealed ? (
        <p className="text-sm text-[var(--text-2)] animate-fade-in">
          <span className="text-[var(--bronze)] font-bold">Hint {index}:</span> {hint}
        </p>
      ) : (
        <button type="button" onClick={() => setRevealed(true)}
          className="text-sm text-[var(--text-2)] hover:text-[var(--bronze)] transition-colors">
          Click to reveal Hint {index}
        </button>
      )}
    </div>
  );
}
