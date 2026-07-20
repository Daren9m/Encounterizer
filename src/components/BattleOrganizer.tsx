'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Clock,
  FileJson,
  FileText,
  Flag,
  Heart,
  ListPlus,
  Play,
  Plus,
  RotateCcw,
  Shield,
  Skull,
  Trash2,
  Trophy,
  Users,
} from 'lucide-react';
import { useMonsters } from '@/app/hooks/useMonsters';
import {
  EMPTY_BATTLE,
  advanceTurn,
  applyDamage,
  applyHealing,
  battleToMarkdown,
  finishBattle,
  getBattlePhase,
  getTurnCallouts,
  isBattleState,
  removeBattleCombatant,
  resumeBattle,
  setCurrentTurn,
  sortCombatants,
  startBattle,
  type BattleCombatant,
  type BattlePhase,
  type BattleState,
  type CombatantKind,
} from '@/lib/battle-organizer';
import type { Condition, Monster } from '@/lib/types';
import { usePersistentState } from '@/lib/use-persistent-state';
import PrintButton from '@/components/PrintButton';

const CONDITIONS: Condition[] = [
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled',
  'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone',
  'Restrained', 'Stunned', 'Unconscious',
];

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function download(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function kindLabel(kind: CombatantKind): string {
  if (kind === 'enemy') return 'Enemy';
  if (kind === 'ally') return 'Ally';
  return 'Player';
}

function fromMonster(monster: Monster): BattleCombatant {
  return {
    id: id(monster.id),
    name: monster.name,
    kind: 'enemy',
    initiative: 0,
    dexterity: monster.abilities.dex,
    armorClass: monster.armor.ac,
    maxHp: monster.hitPoints,
    currentHp: monster.hitPoints,
    tempHp: 0,
    conditions: [],
    concentration: false,
    reactionUsed: false,
    legendaryActionsMax: monster.legendary?.actionsPerRound ?? 0,
    legendaryActionsUsed: 0,
    notes: monster.isLegendary ? `CR ${monster.challengeRating} · legendary` : `CR ${monster.challengeRating}`,
  };
}

export default function BattleOrganizer({ mode = 'full' }: { mode?: 'full' | 'initiative' }) {
  const [battle, setBattle, hydrated] = usePersistentState<BattleState>('battleOrganizer', EMPTY_BATTLE, isBattleState);
  const initiativeOnly = mode === 'initiative';
  const phase = getBattlePhase(battle);
  const ordered = sortCombatants(battle.combatants);
  const callouts = getTurnCallouts(battle);
  const [notice, setNotice] = useState('');
  const previousPhase = useRef<BattlePhase | undefined>(undefined);
  const setupHeadingRef = useRef<HTMLHeadingElement>(null);
  const activeHeadingRef = useRef<HTMLHeadingElement>(null);
  const completeHeadingRef = useRef<HTMLHeadingElement>(null);
  const participantPanelId = useId();
  const logPanelId = useId();

  const players = battle.combatants.filter((combatant) => combatant.kind === 'player').length;
  const allies = battle.combatants.filter((combatant) => combatant.kind === 'ally').length;
  const enemies = battle.combatants.filter((combatant) => combatant.kind === 'enemy').length;

  useEffect(() => {
    if (!hydrated || battle.phase !== undefined) return;
    setBattle((state) => ({ ...state, phase: getBattlePhase(state) }));
  }, [battle.phase, hydrated, setBattle]);

  useEffect(() => {
    if (!hydrated) return;
    const previous = previousPhase.current;
    previousPhase.current = phase;
    if (!previous || previous === phase || initiativeOnly) return;
    const target = phase === 'setup'
      ? setupHeadingRef.current
      : phase === 'active'
        ? activeHeadingRef.current
        : completeHeadingRef.current;
    target?.focus();
  }, [hydrated, initiativeOnly, phase]);

  function updateCombatant(combatantId: string, update: Partial<BattleCombatant>) {
    setBattle((state) => ({
      ...state,
      combatants: state.combatants.map((combatant) => combatant.id === combatantId
        ? { ...combatant, ...update }
        : combatant),
    }));
  }

  function addManualCombatant(combatantName: string, kind: CombatantKind) {
    const combatant: BattleCombatant = {
      id: id('combatant'), name: combatantName, kind, initiative: 0, dexterity: 10,
      maxHp: 1, currentHp: 1, tempHp: 0, conditions: [], concentration: false,
      reactionUsed: false, legendaryActionsMax: 0, legendaryActionsUsed: 0, notes: '',
    };
    setBattle((state) => ({ ...state, combatants: [...state.combatants, combatant] }));
    setNotice(`${combatantName} added to the roster.`);
  }

  function addMonster(monster: Monster) {
    setBattle((state) => ({ ...state, combatants: [...state.combatants, fromMonster(monster)] }));
    setNotice(`${monster.name} added to the roster.`);
  }

  function removeCombatant(combatantId: string) {
    const target = battle.combatants.find((combatant) => combatant.id === combatantId);
    if (!target || !window.confirm(`Remove ${target.name} from this battle?`)) return;
    setBattle((state) => removeBattleCombatant(state, combatantId));
    setNotice(`${target.name} removed from the roster.`);
  }

  function startCombat() {
    if (battle.combatants.length === 0) return;
    setBattle((state) => startBattle(state));
  }

  function completeCombat() {
    if (!window.confirm('Finish this battle and open its summary? You can resume it later.')) return;
    setBattle((state) => finishBattle(state));
  }

  function resetBattle(prompt: string) {
    if (!window.confirm(prompt)) return;
    setBattle({ ...EMPTY_BATTLE });
    setNotice('');
  }

  if (!hydrated) {
    return (
      <section aria-label={initiativeOnly ? 'Initiative tracker' : 'Battle organizer'}>
        <div className="empty-state" role="status">Loading saved battle…</div>
      </section>
    );
  }

  if (initiativeOnly) {
    return (
      <CompactBattleOrganizer
        battle={battle}
        phase={phase}
        ordered={ordered}
        callouts={callouts}
        onStart={startCombat}
        onAdvance={() => setBattle((state) => advanceTurn(state))}
        onFinish={completeCombat}
        onResume={() => setBattle((state) => resumeBattle(state))}
        onUpdate={updateCombatant}
        onDamage={(combatantId, amount) => setBattle((state) => applyDamage(state, combatantId, amount))}
        onHeal={(combatantId, amount) => setBattle((state) => applyHealing(state, combatantId, amount))}
        onTakeTurn={(combatantId) => setBattle((state) => setCurrentTurn(state, combatantId))}
      />
    );
  }

  return (
    <section className="animate-fade-in" aria-label="Battle organizer">
      {notice && <p className="mb-3 text-sm text-[var(--status-success)]" role="status">{notice}</p>}

      {phase === 'setup' && (
        <div className="workflow-shell mb-5 print:hidden">
          <header className="workflow-header">
            <div className="workflow-title">
              <span className="workflow-step" aria-hidden="true">1</span>
              <div>
                <p className="micro-label">Prepare</p>
                <h2 ref={setupHeadingRef} tabIndex={-1} className="text-2xl">Set initiative</h2>
                <p className="mt-1 text-sm text-[var(--text-2)]">Name the battle, confirm the roster, and enter initiative before combat begins.</p>
              </div>
            </div>
            <div className="workflow-context">
              <span>Roster</span>
              <strong>{battle.combatants.length} combatant{battle.combatants.length === 1 ? '' : 's'}</strong>
            </div>
          </header>

          <div className="setup-grid">
            <section className="setup-group" aria-labelledby="battle-details-heading">
              <div className="setup-group-heading">
                <span className="setup-group-icon"><Flag size={17} aria-hidden="true" /></span>
                <div><h3 id="battle-details-heading">Battle details</h3><p>Use a name you will recognize in exports and the DM screen.</p></div>
              </div>
              <label htmlFor="battle-name" className="field-label">Battle name</label>
              <input
                id="battle-name"
                className="w-full text-lg"
                value={battle.name}
                onChange={(event) => setBattle((state) => ({ ...state, name: event.target.value }))}
              />
            </section>

            <section className="setup-group" aria-labelledby="roster-summary-heading">
              <div className="setup-group-heading">
                <span className="setup-group-icon"><Users size={17} aria-hidden="true" /></span>
                <div><h3 id="roster-summary-heading">Roster summary</h3><p>Imported encounters arrive here ready for initiative.</p></div>
              </div>
              <dl className="metric-grid">
                <div className="metric-item"><dt>Players</dt><dd>{players}</dd></div>
                <div className="metric-item"><dt>Allies</dt><dd>{allies}</dd></div>
                <div className="metric-item"><dt>Enemies</dt><dd>{enemies}</dd></div>
                <div className="metric-item"><dt>Total</dt><dd>{battle.combatants.length}</dd></div>
              </dl>
            </section>
          </div>

          <div className="px-5 pb-5">
            <section className="content-panel" aria-labelledby="initiative-roster-heading">
              <div className="content-panel-heading">
                <div><h3 id="initiative-roster-heading">Initiative roster</h3><p>Highest initiative acts first; Dexterity breaks ties.</p></div>
              </div>
              {ordered.length > 0 ? (
                <div className="space-y-2">
                  {ordered.map((combatant) => (
                    <SetupCombatantRow
                      key={combatant.id}
                      combatant={combatant}
                      onUpdate={(update) => updateCombatant(combatant.id, update)}
                      onRemove={() => removeCombatant(combatant.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state !py-8">
                  <Shield className="mx-auto mb-3 text-[var(--bronze)]" size={32} aria-hidden="true" />
                  <p className="font-semibold">No combatants yet</p>
                  <p className="mt-1 text-sm">Add party members, allies, or enemies below.</p>
                </div>
              )}
            </section>

            <details className="disclosure-panel disclosure-panel-flush mt-3">
              <summary aria-controls={participantPanelId}>
                <span className="disclosure-summary-copy">
                  <ListPlus size={18} aria-hidden="true" />
                  <span><strong>Add participants</strong><small>Create someone quickly or search the bestiary.</small></span>
                </span>
                <ChevronDown className="disclosure-chevron" size={18} aria-hidden="true" />
              </summary>
              <div id={participantPanelId} className="border-t border-[var(--border-subtle)] p-4">
                <ParticipantAdders onAddManual={addManualCombatant} onAddMonster={addMonster} />
              </div>
            </details>
          </div>

          <footer className="workflow-action-bar">
            <div className="workflow-primary-action">
              <button type="button" className="btn-primary" disabled={ordered.length === 0} onClick={startCombat}>
                <Play size={18} aria-hidden="true" /> Start combat
              </button>
              <p>{ordered.length > 0 ? `${ordered[0].name} will act first.` : 'Add at least one combatant to begin.'}</p>
            </div>
            {ordered.length > 0 && (
              <button type="button" className="btn-ghost text-[var(--accent-danger)]" onClick={() => resetBattle('Clear this battle draft and its roster?')}>
                <Trash2 size={17} aria-hidden="true" /> Clear draft
              </button>
            )}
          </footer>
        </div>
      )}

      {phase === 'active' && (
        <>
          <section className="card workflow-review-card panel-accent mb-4 lg:sticky lg:top-[4.75rem] lg:z-30" aria-labelledby="live-battle-heading">
            <header className="workflow-review-header">
              <div className="workflow-title">
                <span className="workflow-step" aria-hidden="true">2</span>
                <div>
                  <p className="micro-label">Run combat</p>
                  <h2 ref={activeHeadingRef} tabIndex={-1} id="live-battle-heading" className="text-2xl">{battle.name}</h2>
                </div>
              </div>
              <div>
                <span className="meta-label">Battle status</span>
                <span className="status-readout status-readout-success mt-2"><span className="status-readout-dot" aria-hidden="true" />In progress</span>
              </div>
            </header>

            <div className="workflow-review-overview">
              <div>
                <span className="meta-label">Current round</span>
                <p className="mt-2 text-3xl font-bold text-[var(--text-1)]">Round {battle.round}</p>
                <p className="mt-1 text-xs text-[var(--text-3)]">Turn order advances automatically.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Callout className="col-span-2 sm:col-span-1" label="Acting" combatant={callouts.current} active />
                <Callout label="Next up" combatant={callouts.next} />
                <Callout label="On deck" combatant={callouts.onDeck} />
              </div>
            </div>

            <div className="workflow-review-actions">
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={completeCombat}>
                <Flag size={17} aria-hidden="true" /> Finish battle
              </button>
              <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => setBattle((state) => advanceTurn(state))}>
                <Clock size={18} aria-hidden="true" /> End {callouts.current?.name ?? 'current'} turn
              </button>
            </div>
            <p className="sr-only" aria-live="polite">Round {battle.round}. {callouts.current?.name ?? 'No combatant'} is acting.</p>
          </section>

          <section className="content-panel" aria-labelledby="turn-order-heading">
            <div className="content-panel-heading">
              <div><h2 id="turn-order-heading" className="text-xl">Turn order</h2><p>The active combatant is labeled. Open details for conditions, notes, or an out-of-order turn.</p></div>
              <span className="text-sm text-[var(--text-3)]">{ordered.length} combatants</span>
            </div>
            <div className="space-y-2">
              {ordered.map((combatant) => (
                <LiveCombatantRow
                  key={combatant.id}
                  combatant={combatant}
                  active={battle.currentId === combatant.id}
                  onUpdate={(update) => updateCombatant(combatant.id, update)}
                  onDamage={(amount) => setBattle((state) => applyDamage(state, combatant.id, amount))}
                  onHeal={(amount) => setBattle((state) => applyHealing(state, combatant.id, amount))}
                  onTakeTurn={() => setBattle((state) => setCurrentTurn(state, combatant.id))}
                  onRemove={() => removeCombatant(combatant.id)}
                />
              ))}
            </div>
          </section>

          <details className="disclosure-panel disclosure-panel-flush mt-4 print:hidden">
            <summary aria-controls={participantPanelId}>
              <span className="disclosure-summary-copy">
                <ListPlus size={18} aria-hidden="true" />
                <span><strong>Adjust roster</strong><small>Add a late arrival without stopping the current turn.</small></span>
              </span>
              <ChevronDown className="disclosure-chevron" size={18} aria-hidden="true" />
            </summary>
            <div id={participantPanelId} className="border-t border-[var(--border-subtle)] p-4">
              <ParticipantAdders onAddManual={addManualCombatant} onAddMonster={addMonster} />
            </div>
          </details>

          <BattleLog key="active-battle-log" battle={battle} panelId={logPanelId} />
        </>
      )}

      {phase === 'complete' && (
        <>
          <section className="card workflow-review-card panel-accent mb-4" aria-labelledby="battle-summary-heading">
            <header className="workflow-review-header">
              <div className="workflow-title">
                <span className="workflow-step" aria-hidden="true">3</span>
                <div>
                  <p className="micro-label">Finish</p>
                  <h2 ref={completeHeadingRef} tabIndex={-1} id="battle-summary-heading" className="text-2xl">{battle.name}</h2>
                  <p className="mt-1 text-sm text-[var(--text-2)]">The final roster and battle log are preserved below.</p>
                </div>
              </div>
              <div>
                <span className="meta-label">Battle status</span>
                <span className="status-readout status-readout-success mt-2"><span className="status-readout-dot" aria-hidden="true" />Complete</span>
              </div>
            </header>

            <div className="workflow-review-overview">
              <div>
                <span className="meta-label">Combat record</span>
                <p className="mt-2 text-3xl font-bold text-[var(--text-1)]">{battle.round} round{battle.round === 1 ? '' : 's'}</p>
                <p className="mt-1 text-xs text-[var(--text-3)]">Resume if the table needs one more turn.</p>
              </div>
              <dl className="metric-grid">
                <div className="metric-item"><dt>Combatants</dt><dd>{battle.combatants.length}</dd></div>
                <div className="metric-item"><dt>Standing</dt><dd>{battle.combatants.filter((combatant) => combatant.currentHp > 0).length}</dd></div>
                <div className="metric-item"><dt>At 0 HP</dt><dd>{battle.combatants.filter((combatant) => combatant.currentHp === 0).length}</dd></div>
                <div className="metric-item"><dt>Log events</dt><dd>{battle.log.length}</dd></div>
              </dl>
            </div>

            <div className="workflow-review-actions print:hidden">
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => setBattle((state) => resumeBattle(state))}>
                <RotateCcw size={17} aria-hidden="true" /> Resume combat
              </button>
              <div className="flex w-full flex-col gap-2 sm:w-[22rem]">
                <BattleActionsMenu battle={battle} onDelete={() => resetBattle('Delete this completed battle and its log?')} />
                <button type="button" className="btn-primary" onClick={() => resetBattle('Start another battle? This completed battle will be replaced.')}>
                  <Plus size={18} aria-hidden="true" /> Start another battle
                </button>
              </div>
            </div>
          </section>

          <section className="content-panel" aria-labelledby="final-roster-heading">
            <div className="content-panel-heading">
              <div><h2 id="final-roster-heading" className="text-xl">Final roster</h2><p>Hit points and conditions reflect the end of combat.</p></div>
            </div>
            <div className="space-y-2">
              {ordered.map((combatant) => <CompletedCombatantRow key={combatant.id} combatant={combatant} />)}
            </div>
          </section>
          <BattleLog key="complete-battle-log" battle={battle} panelId={logPanelId} defaultOpen />
        </>
      )}
    </section>
  );
}

function ParticipantAdders({ onAddManual, onAddMonster }: {
  onAddManual: (name: string, kind: CombatantKind) => void;
  onAddMonster: (monster: Monster) => void;
}) {
  const { all: monsters } = useMonsters();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CombatantKind>('player');
  const [monsterQuery, setMonsterQuery] = useState('');
  const searchId = useId();
  const monsterResults = useMemo(() => {
    const query = monsterQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    return monsters.filter((monster) => monster.name.toLowerCase().includes(query)).slice(0, 8);
  }, [monsterQuery, monsters]);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <form
        className="surface-inset p-4"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmedName = name.trim();
          if (!trimmedName) return;
          onAddManual(trimmedName, kind);
          setName('');
        }}
      >
        <h3 className="mb-3">Create participant</h3>
        <div className="grid gap-3">
          <label>
            <span className="field-label">Name</span>
            <input className="w-full" value={name} onChange={(event) => setName(event.target.value)} placeholder="Character or creature name" required />
          </label>
          <label>
            <span className="field-label">Side</span>
            <select className="w-full" value={kind} onChange={(event) => setKind(event.target.value as CombatantKind)}>
              <option value="player">Player</option>
              <option value="ally">Ally</option>
              <option value="enemy">Enemy</option>
            </select>
          </label>
          <button className="btn-secondary" type="submit"><Plus size={17} aria-hidden="true" /> Add participant</button>
        </div>
      </form>

      <div className="surface-inset p-4">
        <h3 className="mb-3">Search bestiary</h3>
        <label htmlFor={searchId} className="field-label">Monster name</label>
        <input
          id={searchId}
          className="w-full"
          value={monsterQuery}
          onChange={(event) => setMonsterQuery(event.target.value)}
          placeholder="Type at least 2 letters…"
        />
        <p className="field-hint" role="status">
          {monsterQuery.trim().length < 2
            ? 'Enter at least two letters to search.'
            : `${monsterResults.length} result${monsterResults.length === 1 ? '' : 's'} shown.`}
        </p>
        {monsterResults.length > 0 && (
          <div className="mt-3 grid gap-2">
            {monsterResults.map((monster) => (
              <button
                key={monster.id}
                type="button"
                className="selection-card min-h-11"
                onClick={() => { onAddMonster(monster); setMonsterQuery(''); }}
              >
                <span className="font-semibold">{monster.name}</span>
                <span className="ml-2 text-xs text-[var(--text-3)]">CR {monster.challengeRating} · {monster.hitPoints} HP</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SetupCombatantRow({ combatant, onUpdate, onRemove }: {
  combatant: BattleCombatant;
  onUpdate: (update: Partial<BattleCombatant>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();

  return (
    <article className="surface-inset p-3">
      <div className="grid items-end gap-3 sm:grid-cols-[6rem_minmax(0,1fr)_8rem_auto_auto]">
        <label>
          <span className="field-label">Initiative</span>
          <input type="number" className="w-full text-center text-lg font-bold" value={combatant.initiative} onChange={(event) => onUpdate({ initiative: Number(event.target.value) || 0 })} />
        </label>
        <label>
          <span className="field-label">Name</span>
          <input className="w-full" value={combatant.name} onChange={(event) => onUpdate({ name: event.target.value })} />
        </label>
        <label>
          <span className="field-label">Side</span>
          <select className="w-full" value={combatant.kind} onChange={(event) => onUpdate({ kind: event.target.value as CombatantKind })}>
            <option value="player">Player</option><option value="ally">Ally</option><option value="enemy">Enemy</option>
          </select>
        </label>
        <button
          type="button"
          className="icon-button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`${expanded ? 'Hide' : 'Show'} combat stats for ${combatant.name}`}
        >
          {expanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
        </button>
        <button type="button" className="icon-button icon-button-danger" onClick={onRemove} aria-label={`Remove ${combatant.name}`}><Trash2 size={17} aria-hidden="true" /></button>
      </div>
      <p className="mt-2 text-xs text-[var(--text-3)]">{combatant.maxHp} HP{combatant.armorClass ? ` · AC ${combatant.armorClass}` : ''}{combatant.notes ? ` · ${combatant.notes}` : ''}</p>
      <div
        id={detailsId}
        className={`${expanded ? 'grid' : 'hidden'} mt-3 gap-3 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-2 lg:grid-cols-5`}
      >
        <NumberField
          label="Max HP"
          value={combatant.maxHp}
          onChange={(maxHp) => {
            const safeMaxHp = Math.max(1, maxHp);
            const currentHp = combatant.currentHp === combatant.maxHp
              ? safeMaxHp
              : Math.min(combatant.currentHp, safeMaxHp);
            onUpdate({ maxHp: safeMaxHp, currentHp });
          }}
        />
        <NumberField
          label="Current HP"
          value={combatant.currentHp}
          onChange={(currentHp) => onUpdate({ currentHp: Math.min(currentHp, combatant.maxHp) })}
        />
        <NumberField label="Temp HP" value={combatant.tempHp} onChange={(tempHp) => onUpdate({ tempHp })} />
        <NumberField label="Armor class" value={combatant.armorClass ?? 0} onChange={(armorClass) => onUpdate({ armorClass })} />
        <NumberField label="Dexterity" value={combatant.dexterity} onChange={(dexterity) => onUpdate({ dexterity })} />
        <label className="sm:col-span-2 lg:col-span-5">
          <span className="field-label">Notes</span>
          <textarea
            className="w-full"
            rows={2}
            value={combatant.notes}
            onChange={(event) => onUpdate({ notes: event.target.value })}
            placeholder="Readied action, ongoing effect, save reminder…"
          />
        </label>
      </div>
    </article>
  );
}

function Callout({ label, combatant, active = false, className = '' }: {
  label: string;
  combatant?: BattleCombatant;
  active?: boolean;
  className?: string;
}) {
  return (
    <div aria-current={active ? 'step' : undefined} className={`${className} min-w-0 rounded-lg border px-3 py-3 ${active ? 'border-[var(--bronze)] bg-[var(--bronze-wash)]' : 'border-[var(--border-subtle)] bg-[var(--surface-inset)]'}`}>
      <p className="meta-label">{label}</p>
      <p className="mt-1 truncate font-semibold">{combatant?.name ?? '—'}</p>
    </div>
  );
}

function LiveCombatantRow({ combatant, active, compact = false, onUpdate, onDamage, onHeal, onTakeTurn, onRemove }: {
  combatant: BattleCombatant;
  active: boolean;
  compact?: boolean;
  onUpdate: (update: Partial<BattleCombatant>) => void;
  onDamage: (amount: number) => void;
  onHeal: (amount: number) => void;
  onTakeTurn: () => void;
  onRemove?: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const amountId = useId();
  const numericAmount = Math.max(0, Number(amount) || 0);
  const hpPercent = combatant.maxHp > 0 ? Math.max(0, Math.min(100, (combatant.currentHp / combatant.maxHp) * 100)) : 0;

  return (
    <article className={`surface-inset p-3 ${active ? 'ring-2 ring-[var(--bronze)]' : ''}`} aria-label={`${combatant.name}${active ? ', acting now' : ''}`}>
      <div className={compact ? 'grid gap-3' : 'grid items-center gap-3 lg:grid-cols-[4.5rem_minmax(10rem,1.2fr)_minmax(13rem,1fr)_auto]'}>
        <div>
          <span className="meta-label">Initiative</span>
          <p className="mt-1 text-xl font-bold">{combatant.initiative}</p>
        </div>
        <div className="min-w-0">
          {active && <p className="mb-1 text-xs font-semibold text-[var(--bronze-light)]">Acting now</p>}
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{combatant.name}</h3>
            {combatant.currentHp === 0 && <span className="inline-flex items-center gap-1 text-xs text-[var(--accent-danger)]"><Skull size={16} aria-hidden="true" />0 HP</span>}
          </div>
          <p className="mt-1 text-xs text-[var(--text-3)]">{kindLabel(combatant.kind)}{combatant.armorClass ? ` · AC ${combatant.armorClass}` : ''}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {combatant.conditions.map((condition) => <span key={condition} className="rounded-full bg-[var(--steel-800)] px-2 py-0.5 text-[10px]">{condition}</span>)}
            {combatant.concentration && <span className="rounded-full bg-[var(--bronze-wash)] px-2 py-0.5 text-[10px] text-[var(--bronze)]">Concentrating</span>}
          </div>
        </div>
        <fieldset>
          <legend className="field-label"><Heart size={13} className="mr-1 inline text-[var(--accent-danger)]" aria-hidden="true" />Hit points · {combatant.currentHp}/{combatant.maxHp}{combatant.tempHp ? ` +${combatant.tempHp} temp` : ''}</legend>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--steel-800)]" role="progressbar" aria-label={`${combatant.name} hit points`} aria-valuemin={0} aria-valuemax={combatant.maxHp} aria-valuenow={combatant.currentHp}>
            <div className="h-full bg-[var(--accent-danger)] transition-[width]" style={{ width: `${hpPercent}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1 print:hidden">
            <label htmlFor={amountId} className="sr-only">Hit point change for {combatant.name}</label>
            <input id={amountId} type="number" min="0" className="min-h-11 w-24 !px-2" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" />
            <button type="button" className="min-h-11 rounded-lg bg-[rgba(239,133,131,0.14)] px-3 text-xs font-semibold text-[var(--accent-danger)]" onClick={() => { onDamage(numericAmount); setAmount(''); }} aria-label={`Apply damage to ${combatant.name}`}>Damage</button>
            <button type="button" className="min-h-11 rounded-lg bg-[rgba(122,203,154,0.14)] px-3 text-xs font-semibold text-[var(--difficulty-easy)]" onClick={() => { onHeal(numericAmount); setAmount(''); }} aria-label={`Apply healing to ${combatant.name}`}>Heal</button>
          </div>
        </fieldset>
        <button type="button" className="icon-button print:hidden" onClick={() => setExpanded((open) => !open)} aria-expanded={expanded} aria-controls={detailsId} aria-label={`${expanded ? 'Hide' : 'Show'} details for ${combatant.name}`}>
          {expanded ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
        </button>
      </div>

      <div id={detailsId} className={`${expanded ? 'grid' : 'hidden'} mt-3 gap-3 border-t border-[var(--border-subtle)] pt-3 sm:grid-cols-2 lg:grid-cols-4 print:grid`}>
        <label><span className="field-label">Name</span><input className="w-full" value={combatant.name} onChange={(event) => onUpdate({ name: event.target.value })} /></label>
        <label><span className="field-label">Initiative</span><input type="number" className="w-full" value={combatant.initiative} onChange={(event) => onUpdate({ initiative: Number(event.target.value) || 0 })} /></label>
        <label><span className="field-label">Side</span><select className="w-full" value={combatant.kind} onChange={(event) => onUpdate({ kind: event.target.value as CombatantKind })}><option value="player">Player</option><option value="ally">Ally</option><option value="enemy">Enemy</option></select></label>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="Max HP" value={combatant.maxHp} onChange={(maxHp) => onUpdate({ maxHp, currentHp: Math.min(combatant.currentHp, maxHp) })} />
          <NumberField label="Temp HP" value={combatant.tempHp} onChange={(tempHp) => onUpdate({ tempHp })} />
          <NumberField label="AC" value={combatant.armorClass ?? 0} onChange={(armorClass) => onUpdate({ armorClass })} />
        </div>
        <div>
          <label className="field-label" htmlFor={`${detailsId}-condition`}>Conditions</label>
          <select id={`${detailsId}-condition`} className="w-full" value="" onChange={(event) => {
            const condition = event.target.value as Condition;
            if (condition && !combatant.conditions.includes(condition)) onUpdate({ conditions: [...combatant.conditions, condition] });
          }}><option value="">Add condition…</option>{CONDITIONS.filter((condition) => !combatant.conditions.includes(condition)).map((condition) => <option key={condition}>{condition}</option>)}</select>
          {combatant.conditions.length > 0 && <button type="button" className="btn-ghost mt-1 text-xs text-[var(--accent-danger)]" onClick={() => onUpdate({ conditions: [] })}>Clear conditions</button>}
        </div>
        <div className="space-y-3 text-sm">
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={combatant.concentration} onChange={(event) => onUpdate({ concentration: event.target.checked })} /> Concentrating</label>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={combatant.reactionUsed} onChange={(event) => onUpdate({ reactionUsed: event.target.checked })} /> Reaction used</label>
          {combatant.legendaryActionsMax > 0 && <label className="flex min-h-11 items-center gap-2">Legendary used <input type="number" min="0" max={combatant.legendaryActionsMax} className="w-20 !p-2" value={combatant.legendaryActionsUsed} onChange={(event) => onUpdate({ legendaryActionsUsed: Math.max(0, Math.min(combatant.legendaryActionsMax, Number(event.target.value) || 0)) })} /> / {combatant.legendaryActionsMax}</label>}
        </div>
        <label className="sm:col-span-2 lg:col-span-4"><span className="field-label">Notes</span><textarea className="w-full" rows={2} value={combatant.notes} onChange={(event) => onUpdate({ notes: event.target.value })} placeholder="Readied action, ongoing effect, save reminder…" /></label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4 print:hidden">
          {!active && <button type="button" className="btn-secondary text-sm" onClick={onTakeTurn}>Jump to {combatant.name}&apos;s turn</button>}
          {onRemove && <button type="button" className="btn-ghost text-sm text-[var(--accent-danger)]" onClick={onRemove}><Trash2 size={16} aria-hidden="true" /> Remove from battle</button>}
        </div>
      </div>
    </article>
  );
}

function CompletedCombatantRow({ combatant }: { combatant: BattleCombatant }) {
  return (
    <article className="surface-inset grid gap-3 p-3 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto] sm:items-center">
      <div><span className="meta-label">Initiative</span><p className="mt-1 text-lg font-bold">{combatant.initiative}</p></div>
      <div className="min-w-0">
        <h3 className="font-semibold">{combatant.name}</h3>
        <p className="mt-1 text-xs text-[var(--text-3)]">{kindLabel(combatant.kind)}{combatant.armorClass ? ` · AC ${combatant.armorClass}` : ''}{combatant.conditions.length ? ` · ${combatant.conditions.join(', ')}` : ''}</p>
      </div>
      <div className={combatant.currentHp === 0 ? 'text-[var(--accent-danger)]' : 'text-[var(--text-2)]'}><strong>{combatant.currentHp}/{combatant.maxHp} HP</strong></div>
    </article>
  );
}

function BattleLog({ battle, panelId, defaultOpen = false }: { battle: BattleState; panelId: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="battle-log-panel disclosure-panel disclosure-panel-flush mt-4"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary aria-controls={panelId}>
        <span className="disclosure-summary-copy">
          <BookOpen size={18} aria-hidden="true" />
          <span><strong>Battle log</strong><small>{battle.log.length} recorded event{battle.log.length === 1 ? '' : 's'}.</small></span>
        </span>
        <ChevronDown className="disclosure-chevron" size={18} aria-hidden="true" />
      </summary>
      <div id={panelId} className="border-t border-[var(--border-subtle)] p-4">
        <ol className="max-h-72 space-y-2 overflow-y-auto text-sm">
          {battle.log.map((entry) => <li key={entry.id}><span className="mr-2 text-xs font-semibold text-[var(--bronze)]">R{entry.round}</span>{entry.message}</li>)}
          {battle.log.length === 0 && <li className="text-[var(--text-3)]">Actions will be recorded here.</li>}
        </ol>
      </div>
    </details>
  );
}

function BattleActionsMenu({ battle, onDelete }: { battle: BattleState; onDelete: () => void }) {
  return (
    <details className="action-menu action-menu-flow">
      <summary className="btn-secondary">Export &amp; print <ChevronDown className="action-menu-chevron" size={17} aria-hidden="true" /></summary>
      <div className="action-menu-panel">
        <button type="button" className="menu-action" onClick={() => download('battle-organizer.md', battleToMarkdown(battle), 'text/markdown')}>
          <FileText size={18} aria-hidden="true" /><span><strong>Markdown</strong><small>Readable battle record and initiative table.</small></span>
        </button>
        <button type="button" className="menu-action" onClick={() => download('battle-organizer.json', JSON.stringify(battle, null, 2), 'application/json')}>
          <FileJson size={18} aria-hidden="true" /><span><strong>JSON data</strong><small>Structured backup for later use.</small></span>
        </button>
        <PrintButton variant="menu" label="Print battle record" menuDescription="Summary, final roster, and battle log." />
        <button type="button" className="menu-action text-[var(--accent-danger)]" onClick={onDelete}>
          <Trash2 size={18} aria-hidden="true" /><span><strong>Delete battle</strong><small>Remove the completed battle and its log.</small></span>
        </button>
      </div>
    </details>
  );
}

function CompactBattleOrganizer({ battle, phase, ordered, callouts, onStart, onAdvance, onFinish, onResume, onUpdate, onDamage, onHeal, onTakeTurn }: {
  battle: BattleState;
  phase: BattlePhase;
  ordered: BattleCombatant[];
  callouts: ReturnType<typeof getTurnCallouts>;
  onStart: () => void;
  onAdvance: () => void;
  onFinish: () => void;
  onResume: () => void;
  onUpdate: (combatantId: string, update: Partial<BattleCombatant>) => void;
  onDamage: (combatantId: string, amount: number) => void;
  onHeal: (combatantId: string, amount: number) => void;
  onTakeTurn: (combatantId: string) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousPhase = useRef<BattlePhase | undefined>(undefined);
  const phaseLabel = phase === 'setup' ? 'Setup' : phase === 'active' ? 'Combat in progress' : 'Battle complete';

  useEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = phase;
    if (previous && previous !== phase) headingRef.current?.focus();
  }, [phase]);

  return (
    <section className="initiative-tracker" aria-label="Initiative tracker">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">Initiative tracker phase: {phaseLabel}.</p>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div><p className="micro-label">Initiative tracker</p><h3 ref={headingRef} tabIndex={-1} className="text-lg">{battle.name}</h3></div>
        <Link href="/battle" className="btn-secondary text-sm">Open full organizer <span aria-hidden="true">→</span></Link>
      </div>

      {ordered.length === 0 ? (
        <div className="empty-state"><Shield className="mx-auto mb-3 text-[var(--bronze)]" size={36} aria-hidden="true" /><p className="font-semibold">No initiative prepared</p><p className="mt-1 text-sm">Open the full organizer to add combatants.</p></div>
      ) : phase === 'setup' ? (
        <div className="content-panel">
          <div className="content-panel-heading"><div><h3>Prepare initiative</h3><p>Enter initiative, then start combat.</p></div><span className="status-readout status-readout-warning text-sm"><span className="status-readout-dot" aria-hidden="true" />Setup</span></div>
          <div className="space-y-2">
            {ordered.map((combatant) => (
              <label key={combatant.id} className="surface-inset grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_5rem] sm:items-center">
                <span><span className="font-semibold">{combatant.name}</span><span className="block text-xs text-[var(--text-3)]">{kindLabel(combatant.kind)}</span></span>
                <span><span className="field-label">Initiative</span><input type="number" className="w-full text-center" value={combatant.initiative} onChange={(event) => onUpdate(combatant.id, { initiative: Number(event.target.value) || 0 })} /></span>
              </label>
            ))}
          </div>
          <button type="button" className="btn-primary mt-3 w-full" onClick={onStart}><Play size={17} aria-hidden="true" /> Start combat</button>
        </div>
      ) : phase === 'active' ? (
        <>
          <div className="content-panel panel-accent mb-3">
            <div className="flex items-start justify-between gap-3"><div><span className="meta-label">Current round</span><p className="mt-1 text-xl font-bold">Round {battle.round}</p></div><span className="status-readout status-readout-success text-sm"><span className="status-readout-dot" aria-hidden="true" />Live</span></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Callout className="col-span-2" label="Acting" combatant={callouts.current} active />
              <Callout label="Next up" combatant={callouts.next} />
              <Callout label="On deck" combatant={callouts.onDeck} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button type="button" className="btn-primary" onClick={onAdvance}><Clock size={17} aria-hidden="true" /> End {callouts.current?.name ?? 'current'} turn</button>
              <button type="button" className="btn-secondary" onClick={onFinish}><Flag size={17} aria-hidden="true" /> Finish battle</button>
            </div>
            <p className="sr-only" aria-live="polite">Round {battle.round}. {callouts.current?.name ?? 'No combatant'} is acting.</p>
          </div>
          <div className="space-y-2">
            {ordered.map((combatant) => (
              <LiveCombatantRow
                key={combatant.id}
                combatant={combatant}
                active={battle.currentId === combatant.id}
                compact
                onUpdate={(update) => onUpdate(combatant.id, update)}
                onDamage={(amount) => onDamage(combatant.id, amount)}
                onHeal={(amount) => onHeal(combatant.id, amount)}
                onTakeTurn={() => onTakeTurn(combatant.id)}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="content-panel">
          <div className="flex items-start justify-between gap-3"><div><p className="micro-label">Battle complete</p><p className="mt-1 font-semibold">Finished after round {battle.round}</p></div><Trophy size={24} className="text-[var(--bronze)]" aria-hidden="true" /></div>
          <p className="mt-2 text-sm text-[var(--text-2)]">{battle.combatants.filter((combatant) => combatant.currentHp === 0).length} at 0 HP · {battle.log.length} log events</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 print:hidden"><button type="button" className="btn-secondary" onClick={onResume}><RotateCcw size={17} aria-hidden="true" /> Resume combat</button><Link href="/battle" className="btn-primary">Open battle summary</Link></div>
        </div>
      )}
    </section>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label><span className="field-label">{label}</span><input type="number" min="0" className="w-full !px-2" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} /></label>;
}
