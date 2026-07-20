'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Heart,
  Play,
  Plus,
  RotateCcw,
  Shield,
  Skull,
  Trash2,
} from 'lucide-react';
import { useMonsters } from '@/app/hooks/useMonsters';
import {
  EMPTY_BATTLE,
  advanceTurn,
  applyDamage,
  applyHealing,
  battleToMarkdown,
  getTurnCallouts,
  isBattleState,
  setCurrentTurn,
  sortCombatants,
  startBattle,
  type BattleCombatant,
  type BattleState,
  type CombatantKind,
} from '@/lib/battle-organizer';
import type { Condition, Monster } from '@/lib/types';
import { usePersistentState } from '@/lib/use-persistent-state';

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
  const [battle, setBattle] = usePersistentState<BattleState>('battleOrganizer', EMPTY_BATTLE, isBattleState);
  const initiativeOnly = mode === 'initiative';
  const { all: monsters } = useMonsters();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CombatantKind>('player');
  const [monsterQuery, setMonsterQuery] = useState('');
  const [showLog, setShowLog] = useState(false);
  const callouts = getTurnCallouts(battle);
  const ordered = sortCombatants(battle.combatants);
  const monsterResults = useMemo(() => {
    const query = monsterQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    return monsters.filter((monster) => monster.name.toLowerCase().includes(query)).slice(0, 8);
  }, [monsterQuery, monsters]);

  function updateCombatant(combatantId: string, update: Partial<BattleCombatant>) {
    setBattle((state) => ({
      ...state,
      combatants: state.combatants.map((combatant) => combatant.id === combatantId
        ? { ...combatant, ...update }
        : combatant),
    }));
  }

  function addManualCombatant() {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const combatant: BattleCombatant = {
      id: id('combatant'), name: trimmedName, kind, initiative: 0, dexterity: 10,
      maxHp: 1, currentHp: 1, tempHp: 0, conditions: [], concentration: false,
      reactionUsed: false, legendaryActionsMax: 0, legendaryActionsUsed: 0, notes: '',
    };
    setBattle((state) => ({ ...state, started: false, currentId: undefined, combatants: [...state.combatants, combatant] }));
    setName('');
  }

  function addMonster(monster: Monster) {
    setBattle((state) => ({ ...state, started: false, currentId: undefined, combatants: [...state.combatants, fromMonster(monster)] }));
    setMonsterQuery('');
  }

  return (
    <section className={initiativeOnly ? 'initiative-tracker' : 'animate-fade-in'} aria-label={initiativeOnly ? 'Initiative tracker' : 'Battle organizer'}>
      {initiativeOnly && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>
            <p className="micro-label">Initiative tracker</p>
            <h3 className="text-lg">{battle.name}</h3>
          </div>
          <Link href="/battle" className="btn-secondary text-sm">Open full organizer <span aria-hidden="true">→</span></Link>
        </div>
      )}

      {!initiativeOnly && <div className="card panel-accent mb-4 print:hidden">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <label className="min-w-0 flex-1 text-sm font-semibold">
            Battle name
            <input
              className="mt-1 w-full text-lg"
              value={battle.name}
              onChange={(event) => setBattle((state) => ({ ...state, name: event.target.value }))}
              aria-label="Battle name"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => download('battle-organizer.md', battleToMarkdown(battle), 'text/markdown')}
            >
              <Download size={16} aria-hidden="true" /> Export MD
            </button>
            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={() => download('battle-organizer.json', JSON.stringify(battle, null, 2), 'application/json')}
            >
              <Download size={16} aria-hidden="true" /> Export JSON
            </button>
            <button
              type="button"
              className="btn-ghost text-sm text-[var(--accent-danger)]"
              onClick={() => {
                if (window.confirm('Clear this battle and its log?')) setBattle({ ...EMPTY_BATTLE });
              }}
            >
              <RotateCcw size={16} aria-hidden="true" /> Clear
            </button>
          </div>
        </div>
      </div>}

      {!initiativeOnly && <div className="mb-4 grid gap-3 md:grid-cols-[0.8fr_1.2fr] print:hidden">
        <form
          className="card"
          onSubmit={(event) => { event.preventDefault(); addManualCombatant(); }}
        >
          <h2 className="mb-3 text-lg">Add combatant</h2>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Character or creature name" aria-label="Combatant name" />
            <select value={kind} onChange={(event) => setKind(event.target.value as CombatantKind)} aria-label="Combatant side">
              <option value="player">Player</option>
              <option value="ally">Ally</option>
              <option value="enemy">Enemy</option>
            </select>
            <button className="btn-primary px-4" type="submit"><Plus size={17} aria-hidden="true" /> Add</button>
          </div>
        </form>

        <div className="card relative">
          <h2 className="mb-3 text-lg">Add from bestiary</h2>
          <input
            className="w-full"
            value={monsterQuery}
            onChange={(event) => setMonsterQuery(event.target.value)}
            placeholder="Type at least 2 letters…"
            aria-label="Search bestiary to add a monster"
          />
          {monsterResults.length > 0 && (
            <div className="mt-2 grid gap-1 sm:grid-cols-2">
              {monsterResults.map((monster) => (
                <button key={monster.id} type="button" className="rounded-lg border border-[var(--steel-800)] px-3 py-2 text-left text-sm hover:border-[var(--bronze)]" onClick={() => addMonster(monster)}>
                  <span className="font-semibold">{monster.name}</span>
                  <span className="ml-2 text-xs text-[var(--text-3)]">CR {monster.challengeRating} · {monster.hitPoints} HP</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>}

      {ordered.length > 0 ? (
        <>
          <div className="card panel-accent mb-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--bronze)] text-xl font-black text-[#211206]">{battle.round}</span>
                <div><p className="micro-label">Round</p><p className="font-semibold">{battle.started ? 'Battle in progress' : 'Ready for initiative'}</p></div>
              </div>
              <div className="grid min-w-0 flex-1 grid-cols-3 gap-2 lg:max-w-2xl">
                <Callout label="Acting" combatant={callouts.current} active />
                <Callout label="Next up" combatant={callouts.next} />
                <Callout label="On deck" combatant={callouts.onDeck} />
              </div>
              <button
                type="button"
                className="btn-primary min-w-36 print:hidden"
                onClick={() => setBattle((state) => state.started ? advanceTurn(state) : startBattle(state))}
              >
                {battle.started ? <Clock size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
                {battle.started ? 'End turn' : 'Start battle'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {ordered.map((combatant) => (
              <CombatantRow
                key={combatant.id}
                combatant={combatant}
                active={battle.started && battle.currentId === combatant.id}
                onUpdate={(update) => updateCombatant(combatant.id, update)}
                onDamage={(amount) => setBattle((state) => applyDamage(state, combatant.id, amount))}
                onHeal={(amount) => setBattle((state) => applyHealing(state, combatant.id, amount))}
                onTakeTurn={() => setBattle((state) => setCurrentTurn(state, combatant.id))}
                onRemove={() => setBattle((state) => ({
                  ...state,
                  started: state.currentId === combatant.id ? false : state.started,
                  currentId: state.currentId === combatant.id ? undefined : state.currentId,
                  combatants: state.combatants.filter((entry) => entry.id !== combatant.id),
                }))}
              />
            ))}
          </div>

          <div className="card mt-4 print:hidden">
            <button type="button" className="flex min-h-11 w-full items-center justify-between text-left" onClick={() => setShowLog((open) => !open)} aria-expanded={showLog}>
              <span><span className="font-semibold">Battle log</span> <span className="text-xs text-[var(--text-3)]">({battle.log.length} events)</span></span>
              {showLog ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
            </button>
            {showLog && <ol className="mt-3 max-h-56 space-y-2 overflow-y-auto border-t border-[var(--steel-800)] pt-3 text-sm">
              {battle.log.map((entry) => <li key={entry.id}><span className="mr-2 text-xs font-semibold text-[var(--bronze)]">R{entry.round}</span>{entry.message}</li>)}
              {battle.log.length === 0 && <li className="text-[var(--text-3)]">Actions will be recorded here.</li>}
            </ol>}
          </div>
        </>
      ) : (
        <div className="empty-state"><Shield className="mx-auto mb-3 text-[var(--bronze)]" size={36} aria-hidden="true" /><p className="font-semibold">No initiative has been prepared</p><p className="mt-1 text-sm">Launch an encounter or add combatants in the full organizer.</p>{initiativeOnly && <Link href="/battle" className="btn-primary mt-4 print:hidden">Open Battle Organizer</Link>}</div>
      )}
    </section>
  );
}

function Callout({ label, combatant, active = false }: { label: string; combatant?: BattleCombatant; active?: boolean }) {
  return <div className={`min-w-0 rounded-lg border px-3 py-2 ${active ? 'border-[var(--bronze)] bg-[var(--bronze-wash)]' : 'border-[var(--steel-800)] bg-[var(--steel-950)]'}`}>
    <p className="micro-label">{label}</p>
    <p className="truncate font-semibold">{combatant?.name ?? '—'}</p>
  </div>;
}

function CombatantRow({ combatant, active, onUpdate, onDamage, onHeal, onTakeTurn, onRemove }: {
  combatant: BattleCombatant;
  active: boolean;
  onUpdate: (update: Partial<BattleCombatant>) => void;
  onDamage: (amount: number) => void;
  onHeal: (amount: number) => void;
  onTakeTurn: () => void;
  onRemove: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [expanded, setExpanded] = useState(false);
  const numericAmount = Math.max(0, Number(amount) || 0);
  const hpPercent = combatant.maxHp > 0 ? Math.max(0, Math.min(100, (combatant.currentHp / combatant.maxHp) * 100)) : 0;
  const sideColor = combatant.kind === 'enemy' ? 'var(--accent-danger)' : combatant.kind === 'ally' ? 'var(--difficulty-medium)' : 'var(--difficulty-easy)';

  return <article className={`card !p-3 ${active ? 'ring-2 ring-[var(--bronze)]' : ''}`}>
    <div className="grid items-center gap-3 lg:grid-cols-[4.5rem_minmax(10rem,1.2fr)_minmax(12rem,1fr)_auto]">
      <label className="text-xs font-semibold print:flex print:gap-1">
        <span className="micro-label print:normal-case">Initiative</span>
        <input type="number" className="mt-1 w-full text-center text-lg font-bold print:border-0 print:bg-transparent print:p-0" value={combatant.initiative} onChange={(event) => onUpdate({ initiative: Number(event.target.value) || 0 })} />
      </label>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: sideColor }} aria-hidden="true" />
          <input className="min-w-0 flex-1 !border-0 !bg-transparent !p-0 font-semibold print:min-h-0" value={combatant.name} onChange={(event) => onUpdate({ name: event.target.value })} aria-label="Combatant name" />
          {combatant.currentHp === 0 && <span title="At 0 HP"><Skull size={17} className="text-[var(--accent-danger)]" aria-hidden="true" /></span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {combatant.conditions.map((condition) => <span key={condition} className="rounded-full bg-[var(--steel-800)] px-2 py-0.5 text-[10px]">{condition}</span>)}
          {combatant.concentration && <span className="rounded-full bg-[var(--bronze-wash)] px-2 py-0.5 text-[10px] text-[var(--bronze)]">Concentrating</span>}
        </div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs"><span><Heart size={13} className="mr-1 inline text-[var(--accent-danger)]" aria-hidden="true" />HP</span><strong>{combatant.currentHp}/{combatant.maxHp}{combatant.tempHp ? ` +${combatant.tempHp}` : ''}</strong></div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--steel-800)]"><div className="h-full bg-[var(--accent-danger)] transition-[width]" style={{ width: `${hpPercent}%` }} /></div>
        <div className="mt-2 flex gap-1 print:hidden">
          <input type="number" min="0" className="!min-h-9 w-20 !px-2" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" aria-label={`HP change for ${combatant.name}`} />
          <button type="button" className="min-h-9 rounded-lg bg-[rgba(239,133,131,0.14)] px-2 text-xs font-semibold text-[var(--accent-danger)]" onClick={() => { onDamage(numericAmount); setAmount(''); }}>Damage</button>
          <button type="button" className="min-h-9 rounded-lg bg-[rgba(122,203,154,0.14)] px-2 text-xs font-semibold text-[var(--difficulty-easy)]" onClick={() => { onHeal(numericAmount); setAmount(''); }}>Heal</button>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-1 print:hidden">
        {!active && <button type="button" className="btn-ghost !min-h-10 !px-2 text-xs" onClick={onTakeTurn}>Take turn</button>}
        <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--steel-800)]" onClick={() => setExpanded((open) => !open)} aria-expanded={expanded} aria-label={`${expanded ? 'Hide' : 'Show'} details for ${combatant.name}`}>{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
        <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--accent-danger)] hover:bg-[var(--steel-800)]" onClick={onRemove} aria-label={`Remove ${combatant.name}`}><Trash2 size={17} /></button>
      </div>
    </div>
    <div className={`${expanded ? 'grid' : 'hidden'} mt-3 gap-3 border-t border-[var(--steel-800)] pt-3 sm:grid-cols-2 lg:grid-cols-4 print:grid`}>
      <label className="text-xs">Side<select className="mt-1 w-full" value={combatant.kind} onChange={(event) => onUpdate({ kind: event.target.value as CombatantKind })}><option value="player">Player</option><option value="ally">Ally</option><option value="enemy">Enemy</option></select></label>
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Max HP" value={combatant.maxHp} onChange={(maxHp) => onUpdate({ maxHp, currentHp: Math.min(combatant.currentHp, maxHp) })} />
        <NumberField label="Temp HP" value={combatant.tempHp} onChange={(tempHp) => onUpdate({ tempHp })} />
        <NumberField label="AC" value={combatant.armorClass ?? 0} onChange={(armorClass) => onUpdate({ armorClass })} />
      </div>
      <div>
        <p className="mb-1 text-xs">Conditions</p>
        <select className="w-full" value="" onChange={(event) => {
          const condition = event.target.value as Condition;
          if (condition && !combatant.conditions.includes(condition)) onUpdate({ conditions: [...combatant.conditions, condition] });
        }}><option value="">Add condition…</option>{CONDITIONS.filter((condition) => !combatant.conditions.includes(condition)).map((condition) => <option key={condition}>{condition}</option>)}</select>
        {combatant.conditions.length > 0 && <button type="button" className="mt-1 text-xs text-[var(--accent-danger)]" onClick={() => onUpdate({ conditions: [] })}>Clear conditions</button>}
      </div>
      <div className="space-y-2 text-xs">
        <label className="flex items-center gap-2"><input type="checkbox" checked={combatant.concentration} onChange={(event) => onUpdate({ concentration: event.target.checked })} /> Concentrating</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={combatant.reactionUsed} onChange={(event) => onUpdate({ reactionUsed: event.target.checked })} /> Reaction used</label>
        {combatant.legendaryActionsMax > 0 && <label className="flex items-center gap-2">Legendary used <input type="number" min="0" max={combatant.legendaryActionsMax} className="!min-h-8 w-16 !p-1" value={combatant.legendaryActionsUsed} onChange={(event) => onUpdate({ legendaryActionsUsed: Math.max(0, Math.min(combatant.legendaryActionsMax, Number(event.target.value) || 0)) })} /> / {combatant.legendaryActionsMax}</label>}
      </div>
      <label className="text-xs sm:col-span-2 lg:col-span-4">Notes<textarea className="mt-1 w-full" rows={2} value={combatant.notes} onChange={(event) => onUpdate({ notes: event.target.value })} placeholder="Readied action, ongoing effect, save reminder…" /></label>
    </div>
  </article>;
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-xs">{label}<input type="number" min="0" className="mt-1 w-full !px-2" value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} /></label>;
}
