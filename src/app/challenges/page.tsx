'use client';

import { useState } from 'react';
import { generateNoncombatEncounter, getChallengeTypes } from '@/lib/noncombat-generator';
import { usePersistentState } from '@/lib/use-persistent-state';
import type { NoncombatEncounter, ChallengeType } from '@/lib/noncombat-generator';
import PrintButton from '@/components/PrintButton';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;

export default function ChallengesPage() {
  const [type, setType] = usePersistentState<ChallengeType | ''>('challengeType', '');
  const [difficulty, setDifficulty] = usePersistentState<'Easy' | 'Medium' | 'Hard'>('challengeDifficulty', 'Medium');
  const [partyLevel, setPartyLevel] = usePersistentState<number>('challengePartyLevel', 5);
  const [encounter, setEncounter] = useState<NoncombatEncounter | null>(null);
  const [history, setHistory] = usePersistentState<NoncombatEncounter[]>(
    'challengeHistory', [], (v): v is NoncombatEncounter[] => Array.isArray(v),
  );

  const types = getChallengeTypes();

  function handleGenerate() {
    const e = generateNoncombatEncounter({
      type: type || undefined, difficulty, partyLevel, seed: Date.now(),
    });
    setEncounter(e);
    setHistory(prev => [e, ...prev.slice(0, 9)]);
  }

  function handleExport() {
    if (!encounter) return;
    const lines = [
      `# ${encounter.name}`, `Type: ${encounter.type} | Difficulty: ${encounter.difficulty}`, '',
      '## Read Aloud', encounter.readAloud, '',
      '## Situation', encounter.situation, '',
      '## Stakes', encounter.stakes, '',
      '## Skill Checks', ...encounter.skillChecks.map(s => `- **${s.skill} (DC ${s.dc})**: Success — ${s.onSuccess} | Failure — ${s.onFailure}`), '',
      '## Complication', encounter.complication, '',
      '## Outcomes', ...encounter.outcomes.map(o => `- **${o.label}**: ${o.description}`), '',
      '## Reward', encounter.reward,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${encounter.name.toLowerCase().replace(/\s+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold text-[var(--gold)] mb-2">Non-Combat Encounters</h1>
      <p className="text-[var(--parchment-dark)] mb-6">
        Social encounters, exploration challenges, skill challenges, and traps — ready to run.
      </p>

      {/* Controls */}
      <div className="card mb-6 print:hidden">
        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label htmlFor="challenge-type" className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">Type</label>
            <select id="challenge-type" value={type} onChange={e => setType(e.target.value as ChallengeType | '')} className="w-full">
              <option value="">Any</option>
              {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="challenge-difficulty" className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">Difficulty</label>
            <select id="challenge-difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value as typeof difficulty)} className="w-full">
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="challenge-party-level" className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">Party Level</label>
            <input id="challenge-party-level" type="number" min={1} max={20} value={partyLevel} onChange={e => setPartyLevel(Math.max(1, Math.min(20, Number(e.target.value))))} className="w-full" />
          </div>
        </div>
        {/* Type descriptions */}
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {types.map(t => (
            <button key={t.value} type="button" onClick={() => { setType(t.value); handleGenerate(); }}
              className="card text-left text-xs hover:border-[var(--gold)] transition-colors">
              <div className="font-bold text-[var(--parchment)]">{t.label}</div>
              <div className="text-[var(--parchment-dark)]">{t.description}</div>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={handleGenerate} className="btn-gold text-lg">Generate</button>
          {encounter && (
            <>
              <button type="button" onClick={handleGenerate} className="btn-secondary">Regenerate</button>
              <button type="button" onClick={handleExport} className="btn-secondary">Export Markdown</button>
              <PrintButton label="Print Challenge" />
            </>
          )}
        </div>
      </div>

      {/* Encounter Display */}
      {encounter && (
        <div className="space-y-4 animate-fade-in">
          <div className="card">
            <div className="flex items-start justify-between mb-2">
              <h2 className="text-2xl font-bold text-[var(--gold)]">{encounter.name}</h2>
              <div className="flex gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                  encounter.difficulty === 'Easy' ? 'badge-easy' : encounter.difficulty === 'Medium' ? 'badge-medium' : 'badge-hard'
                }`}>{encounter.difficulty}</span>
                <span className="px-3 py-1 rounded-full text-sm bg-[var(--dungeon-accent)] text-[var(--parchment-dark)]">
                  {types.find(t => t.value === encounter.type)?.label}
                </span>
              </div>
            </div>
          </div>

          {/* Read Aloud */}
          <div className="card border-l-4 border-l-[var(--gold)]">
            <h3 className="text-lg font-bold text-[var(--gold)] mb-2">Read Aloud</h3>
            <p className="text-sm italic">{encounter.readAloud}</p>
          </div>

          {/* Situation & Stakes */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="text-lg font-bold text-[var(--gold)] mb-2">Situation</h3>
              <p className="text-sm">{encounter.situation}</p>
            </div>
            <div className="card">
              <h3 className="text-lg font-bold text-[var(--dragon-red)] mb-2">Stakes</h3>
              <p className="text-sm">{encounter.stakes}</p>
            </div>
          </div>

          {/* Skill Checks */}
          <div className="card">
            <h3 className="text-lg font-bold text-[var(--gold)] mb-3">Skill Checks</h3>
            <div className="space-y-3">
              {encounter.skillChecks.map((sc, i) => (
                <div key={i} className="p-3 rounded bg-[var(--dungeon-dark)]">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-[var(--parchment)]">{sc.skill}</span>
                    <span className="text-sm font-bold text-[var(--gold)]">DC {sc.dc}</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 text-xs">
                    <div><span className="text-green-400 font-bold">Success:</span> {sc.onSuccess}</div>
                    <div><span className="text-red-400 font-bold">Failure:</span> {sc.onFailure}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Complication */}
          <div className="card border-l-4 border-l-[var(--dragon-red)]">
            <h3 className="text-lg font-bold text-[var(--dragon-red)] mb-2">Complication</h3>
            <p className="text-sm">{encounter.complication}</p>
          </div>

          {/* Outcomes */}
          <div className="card">
            <h3 className="text-lg font-bold text-[var(--gold)] mb-3">Possible Outcomes</h3>
            <div className="space-y-2">
              {encounter.outcomes.map((o, i) => (
                <div key={i} className="p-3 rounded bg-[var(--dungeon-dark)]">
                  <span className="font-bold text-[var(--gold)]">{o.label}:</span>{' '}
                  <span className="text-sm">{o.description}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reward */}
          <div className="card border-l-4 border-l-green-600">
            <h3 className="text-lg font-bold text-green-500 mb-2">Reward</h3>
            <p className="text-sm">{encounter.reward}</p>
          </div>
        </div>
      )}

      {/* History (persists across visits) */}
      {history.length > 0 && !(history.length === 1 && encounter?.id === history[0].id) && (
        <div className="mt-6 print:hidden">
          <h2 className="text-lg font-bold text-[var(--gold)] mb-3">Recent Encounters</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {history.map(h => (
              <button key={h.id} type="button" onClick={() => setEncounter(h)}
                className={`card text-left text-sm ${encounter?.id === h.id ? 'border-[var(--gold)]' : ''}`}>
                <div className="font-bold text-[var(--parchment)]">{h.name}</div>
                <div className="text-xs text-[var(--parchment-dark)]">
                  {types.find(t => t.value === h.type)?.label} · {h.difficulty}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
