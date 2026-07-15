'use client';

import { useState } from 'react';
import { generatePuzzle, getPuzzleCategories } from '@/lib/puzzle-generator';
import { usePersistentState } from '@/lib/use-persistent-state';
import type { Puzzle, PuzzleCategory, PuzzleDifficulty } from '@/lib/puzzle-generator';

const DIFFICULTIES: PuzzleDifficulty[] = ['Easy', 'Medium', 'Hard'];

export default function PuzzlesPage() {
  const [category, setCategory] = usePersistentState<PuzzleCategory | ''>('puzzleCategory', '');
  const [difficulty, setDifficulty] = usePersistentState<PuzzleDifficulty | ''>('puzzleDifficulty', '');
  const [partyLevel, setPartyLevel] = usePersistentState<number>('puzzlePartyLevel', 5);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [history, setHistory] = usePersistentState<Puzzle[]>(
    'puzzleHistory', [], (v): v is Puzzle[] => Array.isArray(v),
  );

  function handleGenerate() {
    const p = generatePuzzle({
      category: category || undefined,
      difficulty: difficulty || undefined,
      partyLevel,
      seed: Date.now(),
    });
    setPuzzle(p);
    setShowSolution(false);
    setHistory(prev => [p, ...prev.slice(0, 9)]);
  }

  function handleExport() {
    if (!puzzle) return;
    const text = [
      `# ${puzzle.name}`,
      `Category: ${puzzle.category} | Difficulty: ${puzzle.difficulty} | Est. Time: ${puzzle.estimatedMinutes} min`,
      '',
      '## DM Brief',
      puzzle.dmBrief,
      '',
      '## Read Aloud',
      puzzle.readAloud,
      puzzle.playerHandout ? `\n## Player Handout\n${puzzle.playerHandout}` : '',
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
    ].join('\n');
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
      <h1 className="text-3xl font-bold text-[var(--gold)] mb-2">Puzzle Generator</h1>
      <p className="text-[var(--parchment-dark)] mb-6">
        Generate ready-to-run puzzles, riddles, ciphers, and minigames for your sessions.
      </p>

      {/* Controls */}
      <div className="card mb-6">
        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value as PuzzleCategory | '')} className="w-full">
              <option value="">Any</option>
              {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">Difficulty</label>
            <select value={difficulty} onChange={e => setDifficulty(e.target.value as PuzzleDifficulty | '')} className="w-full">
              <option value="">Any</option>
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">Party Level</label>
            <input type="number" min={1} max={20} value={partyLevel} onChange={e => setPartyLevel(Math.max(1, Math.min(20, Number(e.target.value))))} className="w-full" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={handleGenerate} className="btn-gold text-lg">Generate Puzzle</button>
          {puzzle && (
            <>
              <button type="button" onClick={handleGenerate} className="btn-secondary">Regenerate</button>
              <button type="button" onClick={handleExport} className="btn-secondary">Export Markdown</button>
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
              <h2 className="text-2xl font-bold text-[var(--gold)]">{puzzle.name}</h2>
              <div className="flex gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                  puzzle.difficulty === 'Easy' ? 'badge-easy' :
                  puzzle.difficulty === 'Medium' ? 'badge-medium' : 'badge-hard'
                }`}>{puzzle.difficulty}</span>
                <span className="px-3 py-1 rounded-full text-sm bg-[var(--dungeon-accent)] text-[var(--parchment-dark)]">
                  ~{puzzle.estimatedMinutes} min
                </span>
              </div>
            </div>
            <span className="text-xs uppercase tracking-wider text-[var(--parchment-dark)]">
              {categories.find(c => c.value === puzzle.category)?.label}
            </span>
          </div>

          {/* DM Brief */}
          <div className="card border-l-4 border-l-[var(--dragon-red)]">
            <h3 className="text-lg font-bold text-[var(--dragon-red)] mb-2">DM Brief (eyes only)</h3>
            <p className="text-sm">{puzzle.dmBrief}</p>
          </div>

          {/* Read Aloud */}
          <div className="card border-l-4 border-l-[var(--gold)]">
            <h3 className="text-lg font-bold text-[var(--gold)] mb-2">Read Aloud</h3>
            <p className="text-sm italic whitespace-pre-line">{puzzle.readAloud}</p>
          </div>

          {/* Player Handout */}
          {puzzle.playerHandout && (
            <div className="card bg-[var(--parchment)] text-[var(--dungeon-dark)]">
              <h3 className="text-lg font-bold text-[var(--dragon-red)] mb-2">Player Handout</h3>
              <pre className="text-sm whitespace-pre-wrap font-[Georgia]">{puzzle.playerHandout}</pre>
            </div>
          )}

          {/* Hints */}
          <div className="card">
            <h3 className="text-lg font-bold text-[var(--gold)] mb-2">Hints (reveal as needed)</h3>
            <div className="space-y-2">
              {puzzle.hints.map((hint, i) => (
                <HintReveal key={i} index={i + 1} hint={hint} />
              ))}
            </div>
          </div>

          {/* Solution (hidden by default) */}
          <div className="card">
            <button
              type="button"
              onClick={() => setShowSolution(!showSolution)}
              className="flex items-center gap-2 text-lg font-bold text-[var(--gold)]"
            >
              {showSolution ? '▼' : '▶'} Solution
            </button>
            {showSolution && (
              <div className="mt-3 space-y-3 animate-fade-in">
                <div>
                  <h4 className="text-sm font-bold text-[var(--gold)]">Answer</h4>
                  <p className="text-sm">{puzzle.solution}</p>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[var(--dragon-red)]">On Failure</h4>
                  <p className="text-sm">{puzzle.failureConsequence}</p>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-green-500">Reward</h4>
                  <p className="text-sm">{puzzle.reward}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History (persists across visits) */}
      {history.length > 0 && !(history.length === 1 && puzzle?.id === history[0].id) && (
        <div className="mt-6">
          <h2 className="text-lg font-bold text-[var(--gold)] mb-3">Recent Puzzles</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {history.map((p) => (
              <button key={p.id} type="button" onClick={() => { setPuzzle(p); setShowSolution(false); }}
                className={`card text-left text-sm ${puzzle?.id === p.id ? 'border-[var(--gold)]' : ''}`}>
                <div className="font-bold text-[var(--parchment)]">{p.name}</div>
                <div className="text-xs text-[var(--parchment-dark)]">
                  {categories.find(c => c.value === p.category)?.label} · {p.difficulty} · ~{p.estimatedMinutes} min
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
        <p className="text-sm text-[var(--parchment-dark)] animate-fade-in">
          <span className="text-[var(--gold)] font-bold">Hint {index}:</span> {hint}
        </p>
      ) : (
        <button type="button" onClick={() => setRevealed(true)}
          className="text-sm text-[var(--parchment-dark)] hover:text-[var(--gold)] transition-colors">
          Click to reveal Hint {index}
        </button>
      )}
    </div>
  );
}
