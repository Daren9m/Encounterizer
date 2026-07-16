'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { generateNoncombatEncounter, getChallengeTypes } from '@/lib/noncombat-generator';
import type { NoncombatEncounter, ChallengeType } from '@/lib/noncombat-generator';
import { THEME_OPTIONS, TONE_OPTIONS, TIME_OPTIONS } from '@/lib/noncombat/theming';
import type { ThemeChoice, Tone, TimeBudget, Difficulty } from '@/lib/noncombat/types';
import { handoutToText } from '@/lib/noncombat/handout-text';
import { randomSeed } from '@/lib/random';
import { usePersistentState } from '@/lib/use-persistent-state';
import PuzzleHandout from '@/components/PuzzleHandout';
import PrintButton from '@/components/PrintButton';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];

// ─── Share link ───────────────────────────────────────────────────
// Serializes exactly the levers a shared link needs to reproduce the
// encounter: `encounter.requested` (what the caller asked for) plus the
// concrete values the generator resolved (lvl/size/diff/tone/time) and
// the seed. Spec §6.8 — this URL contract is permanent. Challenges has
// no "Any" difficulty, so `diff` is always the resolved value.

function buildShareUrl(e: NoncombatEncounter): string {
  const params = new URLSearchParams();
  params.set('seed', String(e.seed));
  if (e.requested.type) params.set('type', e.requested.type);
  params.set('diff', e.difficulty);
  params.set('lvl', String(e.partyLevel));
  params.set('size', String(e.partySize));
  params.set('theme', e.requested.theme);
  params.set('tone', e.tone);
  params.set('time', e.timeBudget);
  return `${window.location.origin}/challenges?${params.toString()}`;
}

export default function ChallengesPage() {
  // useSearchParams requires a Suspense boundary under static prerendering.
  return (
    <Suspense fallback={null}>
      <ChallengeBuilder />
    </Suspense>
  );
}

function ChallengeBuilder() {
  const [type, setType] = usePersistentState<ChallengeType | ''>('challengeType', '');
  const [difficulty, setDifficulty] = usePersistentState<Difficulty>('challengeDifficulty', 'Medium');
  const [partyLevel, setPartyLevel] = usePersistentState<number>('challengePartyLevel', 5);
  const [partySize, setPartySize] = usePersistentState<number>('challengePartySize', 4);
  const [theme, setTheme] = usePersistentState<ThemeChoice>('challengeTheme', 'any');
  const [tone, setTone] = usePersistentState<Tone>('challengeTone', 'standard');
  const [timeBudget, setTimeBudget] = usePersistentState<TimeBudget>('challengeTime', 'standard');
  const [encounter, setEncounter] = useState<NoncombatEncounter | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [history, setHistory] = usePersistentState<NoncombatEncounter[]>(
    'challengeHistory2', [], (v): v is NoncombatEncounter[] => Array.isArray(v),
  );

  const types = getChallengeTypes();

  // One-shot hydration from a shared link (?seed=...). Persisted lever
  // state above is declared first so a shared link's params win over
  // remembered preferences.
  const TYPES = types.map(t => t.value);
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
    const typeP = searchParams.get('type');
    const typeV = TYPES.includes(typeP as ChallengeType) ? (typeP as ChallengeType) : undefined;
    const diffP = searchParams.get('diff');
    const diffV = DIFFICULTIES.includes(diffP as Difficulty) ? (diffP as Difficulty) : 'Medium';
    const lvl = clampInt(searchParams.get('lvl'), 1, 20) ?? 5;
    const size = clampInt(searchParams.get('size'), 1, 8) ?? 4;
    const themeP = searchParams.get('theme');
    const themeV = THEME_OPTIONS.some(o => o.value === themeP) ? (themeP as ThemeChoice) : 'any';
    const toneP = searchParams.get('tone');
    const toneV = TONE_OPTIONS.some(o => o.value === toneP) ? (toneP as Tone) : 'standard';
    const timeP = searchParams.get('time');
    const timeV = TIME_OPTIONS.some(o => o.value === timeP) ? (timeP as TimeBudget) : 'standard';
    setType(typeV ?? ''); setDifficulty(diffV); setPartyLevel(lvl); setPartySize(size);
    setTheme(themeV); setTone(toneV); setTimeBudget(timeV);
    const e = generateNoncombatEncounter({ type: typeV, difficulty: diffV, partyLevel: lvl, partySize: size, theme: themeV, tone: toneV, timeBudget: timeV, seed: seedParam });
    setEncounter(e);
    setHistory(prev => [e, ...prev.filter(h => h.id !== e.id).slice(0, 9)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleGenerate(seedOverride?: number, typeOverride?: ChallengeType) {
    const e = generateNoncombatEncounter({
      type: typeOverride ?? (type || undefined),
      difficulty,
      partyLevel,
      partySize,
      theme,
      tone,
      timeBudget,
      seed: seedOverride ?? randomSeed(),
    });
    setEncounter(e);
    setLinkCopied(false);
    setHistory(prev => [e, ...prev.filter(h => h.id !== e.id).slice(0, 9)]);
  }

  function handleReroll() {
    if (!encounter) return;
    const e = generateNoncombatEncounter({
      type: encounter.requested.type,
      difficulty: encounter.difficulty,
      partyLevel: encounter.partyLevel,
      partySize: encounter.partySize,
      theme: encounter.requested.theme,
      tone: encounter.tone,
      timeBudget: encounter.timeBudget,
      seed: randomSeed(),
    });
    setEncounter(e);
    setLinkCopied(false);
    setHistory(prev => [e, ...prev.filter(h => h.id !== e.id).slice(0, 9)]);
  }

  function handleCopyLink() {
    if (!encounter) return;
    navigator.clipboard.writeText(buildShareUrl(encounter)).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  function handleExport() {
    if (!encounter) return;
    const typeLabel = types.find(t => t.value === encounter.type)?.label ?? encounter.type;
    const lines = [
      `# ${encounter.name}`,
      `Type: ${typeLabel} | Difficulty: ${encounter.difficulty}`,
      `Theme: ${encounter.theme} | Tone: ${encounter.tone} | Time: ${encounter.timeBudget} | Party: ${encounter.partySize} × level ${encounter.partyLevel} | Seed: ${encounter.seed}`,
      '',
      '## Read Aloud', encounter.readAloud,
      '',
      '## Situation', encounter.situation,
      '',
      '## Stakes', encounter.stakes,
      '',
      '## Skill Checks', ...encounter.skillChecks.map(s => `- **${s.skill} (DC ${s.dc})**: Success — ${s.onSuccess} | Failure — ${s.onFailure}`),
    ];
    if (encounter.structure) {
      lines.push(
        '',
        '## Challenge Structure',
        `${encounter.structure.successesNeeded} successes needed · ${encounter.structure.failuresAllowed} failures allowed`,
        ...encounter.structure.phases.map(p => `- ${p.title}: ${p.successes} successes (${p.primarySkills.join(', ')})`),
      );
    }
    if (encounter.stages && encounter.stages.length > 0) {
      lines.push('', '## Stages');
      for (const stage of encounter.stages) {
        lines.push(`### ${stage.title}`, stage.text, '');
      }
    }
    if (encounter.attitudeTrack) {
      lines.push(
        '',
        '## Attitude Track',
        `Start: ${encounter.attitudeTrack.start}`,
        ...encounter.attitudeTrack.stages.map(s =>
          `- ${s.attitude} (Influence DC ${s.influenceDc}): unlocks ${s.unlocks} | shift up: ${s.shiftUp} | shift down: ${s.shiftDown}`),
      );
    }
    if (encounter.chase) {
      lines.push(
        '',
        '## Chase Plan',
        `${encounter.chase.rounds} rounds`,
        ...encounter.chase.complications.map(c => `- Round ${c.round}: ${c.text} (${c.check})`),
        `Escape: ${encounter.chase.escapeCondition}`,
        `Catch: ${encounter.chase.catchCondition}`,
      );
    }
    if (encounter.clueWeb) {
      lines.push(
        '',
        '## Clue Web',
        `Truth: ${encounter.clueWeb.truth.culprit} — ${encounter.clueWeb.truth.method}, motive: ${encounter.clueWeb.truth.motive}`,
      );
      for (const node of encounter.clueWeb.nodes) {
        lines.push(`### ${node.revelation}`, ...node.clues.map(c => `- [${c.vector}] ${c.text} → ${c.pointsTo}`));
      }
      lines.push(`Red herring: ${encounter.clueWeb.redHerring.text} (disconfirmed by: ${encounter.clueWeb.redHerring.disconfirmedBy})`);
    }
    if (encounter.handout) {
      lines.push('', '## Player Handout', handoutToText(encounter.handout));
    }
    lines.push(
      '', '## Complication', encounter.complication,
      '', '## Outcomes', ...encounter.outcomes.map(o => `- **${o.label}**: ${o.description}`),
      '', '## Reward', encounter.reward,
    );
    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${encounter.name.toLowerCase().replace(/\s+/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl mb-2">Non-Combat Encounters</h1>
      <p className="text-[var(--text-2)] mb-6">
        Social encounters, exploration challenges, skill challenges, chases, investigations, and traps — ready to run.
      </p>

      {/* Controls */}
      <div className="card mb-6 print:hidden">
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label htmlFor="challenge-type" className="micro-label block mb-1">Type</label>
            <select id="challenge-type" value={type} onChange={e => setType(e.target.value as ChallengeType | '')} className="w-full">
              <option value="">Any</option>
              {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="challenge-difficulty" className="micro-label block mb-1">Difficulty</label>
            <select id="challenge-difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)} className="w-full">
              {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="challenge-party-level" className="micro-label block mb-1">Party Level</label>
            <input id="challenge-party-level" type="number" min={1} max={20} value={partyLevel} onChange={e => setPartyLevel(Math.max(1, Math.min(20, Number(e.target.value))))} className="w-full" />
          </div>
          <div>
            <label htmlFor="challenge-party-size" className="micro-label block mb-1">Party Size</label>
            <input id="challenge-party-size" type="number" min={1} max={8} value={partySize} onChange={e => setPartySize(Math.max(1, Math.min(8, Number(e.target.value))))} className="w-full" />
          </div>
          <div>
            <label htmlFor="challenge-theme" className="micro-label block mb-1">Theme</label>
            <select id="challenge-theme" value={theme} onChange={e => setTheme(e.target.value as ThemeChoice)} className="w-full">
              {THEME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="challenge-tone" className="micro-label block mb-1">Tone</label>
            <select id="challenge-tone" value={tone} onChange={e => setTone(e.target.value as Tone)} className="w-full">
              {TONE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="challenge-time" className="micro-label block mb-1">Time Budget</label>
            <select id="challenge-time" value={timeBudget} onChange={e => setTimeBudget(e.target.value as TimeBudget)} className="w-full">
              {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        {/* Type descriptions */}
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 mb-4">
          {types.map(t => (
            <button key={t.value} type="button" onClick={() => { setType(t.value); handleGenerate(undefined, t.value); }}
              className="card text-left text-xs hover:border-[var(--bronze)] transition-colors">
              <div className="font-bold text-[var(--text-1)]">{t.label}</div>
              <div className="text-[var(--text-2)]">{t.description}</div>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => handleGenerate()} className="btn-primary text-lg">Generate</button>
          {encounter && (
            <>
              <button type="button" onClick={() => handleGenerate()} className="btn-secondary">Regenerate</button>
              <button type="button" onClick={handleExport} className="btn-secondary">Export Markdown</button>
              <button type="button" onClick={handleCopyLink} className="btn-secondary">
                {linkCopied ? 'Copied ✓' : 'Share Link'}
              </button>
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
              <h2 className="text-2xl">{encounter.name}</h2>
              <div className="flex gap-2">
                <span className={`px-3 py-1 rounded-full text-xs self-center ${
                  encounter.difficulty === 'Easy' ? 'badge-easy' : encounter.difficulty === 'Medium' ? 'badge-medium' : 'badge-hard'
                }`}>{encounter.difficulty}</span>
                <span className="px-3 py-1 rounded-full text-sm bg-[var(--steel-800)] text-[var(--text-2)]">
                  {types.find(t => t.value === encounter.type)?.label}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="micro-label">
                {THEME_OPTIONS.find(o => o.value === encounter.theme)?.label ?? encounter.theme}
              </span>
              <span className="text-xs text-[var(--text-2)]">
                · Party {encounter.partySize} × level {encounter.partyLevel}
              </span>
              <button
                type="button"
                onClick={() => handleReroll()}
                className="px-3 py-1 rounded-full text-xs bg-[var(--steel-800)] text-[var(--text-2)] hover:text-[var(--bronze)] transition-colors"
                title="Reroll with a fresh seed, same levers"
              >
                Seed: {encounter.seed}
              </button>
            </div>
          </div>

          {/* Read Aloud */}
          <div className="card border-l-4 border-l-[var(--bronze)]">
            <h3 className="text-lg mb-2">Read Aloud</h3>
            <p className="text-sm italic">{encounter.readAloud}</p>
          </div>

          {/* Situation & Stakes */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="text-lg mb-2">Situation</h3>
              <p className="text-sm whitespace-pre-line">{encounter.situation}</p>
            </div>
            <div className="card">
              <h3 className="text-lg mb-2">Stakes</h3>
              <p className="text-sm whitespace-pre-line">{encounter.stakes}</p>
            </div>
          </div>

          {/* Skill Checks */}
          <div className="card">
            <h3 className="text-lg mb-3">Skill Checks</h3>
            <div className="space-y-3">
              {encounter.skillChecks.map((sc, i) => (
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
          {encounter.structure && (
            <div className="card">
              <h3 className="text-lg mb-3">Challenge Structure</h3>
              <p className="text-sm mb-3">
                {encounter.structure.successesNeeded} successes needed · {encounter.structure.failuresAllowed} failures allowed
              </p>
              <div className="space-y-2">
                {encounter.structure.phases.map((phase, i) => (
                  <div key={i} className="p-3 rounded bg-[var(--steel-950)] text-sm">
                    <span className="font-bold text-[var(--text-1)]">{phase.title}</span>
                    {' · '}{phase.successes} success{phase.successes === 1 ? '' : 'es'}{' · '}{phase.primarySkills.join(', ')}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stages */}
          {encounter.stages && encounter.stages.length > 0 && (
            <>
              {encounter.stages.map((stage, i) => (
                <div key={i} className="card border-l-4 border-l-[var(--bronze)]">
                  <h3 className="text-lg mb-2">{stage.title}</h3>
                  <p className="text-sm whitespace-pre-line">{stage.text}</p>
                </div>
              ))}
            </>
          )}

          {/* Attitude Track */}
          {encounter.attitudeTrack && (
            <div className="card">
              <h3 className="text-lg mb-3">Attitude Track</h3>
              <div className="flex items-center gap-2 mb-3">
                <span className="micro-label">Starting attitude</span>
                <span className="px-3 py-1 rounded-full text-xs bg-[var(--steel-800)] text-[var(--text-2)]">{encounter.attitudeTrack.start}</span>
              </div>
              <div className="space-y-2">
                {encounter.attitudeTrack.stages.map((stage, i) => (
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
          {encounter.chase && (
            <div className="card">
              <h3 className="text-lg mb-3">Chase Rounds</h3>
              <p className="text-sm mb-3">{encounter.chase.rounds} rounds</p>
              <div className="space-y-2 mb-3">
                {encounter.chase.complications.map((c, i) => (
                  <div key={i} className="p-3 rounded bg-[var(--steel-950)] text-sm">
                    <span className="font-bold text-[var(--bronze)]">Round {c.round}</span>{' · '}{c.text}{' · '}<span className="text-xs text-[var(--text-2)]">{c.check}</span>
                  </div>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-2 text-xs">
                <div><span className="text-[var(--difficulty-easy)] font-bold">Escape:</span> {encounter.chase.escapeCondition}</div>
                <div><span className="text-[var(--accent-danger)] font-bold">Catch:</span> {encounter.chase.catchCondition}</div>
              </div>
            </div>
          )}

          {/* Clue Web (DM eyes only) */}
          {encounter.clueWeb && (
            <div className="card border-l-4 border-l-[var(--accent-danger)]">
              <h3 className="text-lg mb-2">Clue Web (eyes only)</h3>
              <p className="text-sm mb-3">
                <span className="font-bold text-[var(--bronze)]">Truth:</span> {encounter.clueWeb.truth.culprit} — {encounter.clueWeb.truth.method}, motive: {encounter.clueWeb.truth.motive}
              </p>
              <div className="space-y-2 mb-3">
                {encounter.clueWeb.nodes.map((node, i) => (
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
                <span className="font-bold text-[var(--text-2)]">Red herring:</span> {encounter.clueWeb.redHerring.text}{' '}
                <span className="font-bold text-[var(--text-2)]">Disconfirmed by:</span> {encounter.clueWeb.redHerring.disconfirmedBy}
              </p>
            </div>
          )}

          {/* Player Handout */}
          {encounter.handout && <PuzzleHandout spec={encounter.handout} />}

          {/* Complication */}
          <div className="card border-l-4 border-l-[var(--accent-danger)]">
            <h3 className="text-lg mb-2">Complication</h3>
            <p className="text-sm">{encounter.complication}</p>
          </div>

          {/* Outcomes */}
          <div className="card">
            <h3 className="text-lg mb-3">Possible Outcomes</h3>
            <div className="space-y-2">
              {encounter.outcomes.map((o, i) => (
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
            <p className="text-sm">{encounter.reward}</p>
          </div>
        </div>
      )}

      {/* History (persists across visits) */}
      {history.length > 0 && !(history.length === 1 && encounter?.id === history[0].id) && (
        <div className="mt-6 print:hidden">
          <h2 className="text-lg mb-3">Recent Encounters</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {history.map(h => (
              <button key={h.id} type="button" onClick={() => setEncounter(h)}
                className={`card text-left text-sm ${encounter?.id === h.id ? 'border-[var(--bronze)]' : ''}`}>
                <div className="font-bold text-[var(--text-1)]">{h.name}</div>
                <div className="text-xs text-[var(--text-2)]">
                  {types.find(t => t.value === h.type)?.label} · {h.difficulty} · {THEME_OPTIONS.find(o => o.value === h.theme)?.label ?? h.theme} · {TIME_OPTIONS.find(o => o.value === h.timeBudget)?.label ?? h.timeBudget}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
