import type { Condition } from './types';
import type { Encounter } from './types';
import type { PartyMemberConfig } from './battle-sim-types';
import { buildSimPlayer } from '../data/class-templates';

export type CombatantKind = 'player' | 'ally' | 'enemy';

export interface BattleCombatant {
  id: string;
  name: string;
  kind: CombatantKind;
  initiative: number;
  dexterity: number;
  armorClass?: number;
  maxHp: number;
  currentHp: number;
  tempHp: number;
  conditions: Condition[];
  concentration: boolean;
  reactionUsed: boolean;
  legendaryActionsMax: number;
  legendaryActionsUsed: number;
  notes: string;
}

export interface BattleLogEntry {
  id: string;
  round: number;
  message: string;
}

export interface BattleState {
  version: 1;
  name: string;
  round: number;
  currentId?: string;
  started: boolean;
  combatants: BattleCombatant[];
  log: BattleLogEntry[];
}

export const EMPTY_BATTLE: BattleState = {
  version: 1,
  name: 'New battle',
  round: 1,
  started: false,
  combatants: [],
  log: [],
};

/** Build a table-ready tracker from the encounter builder's final roster. */
export function battleFromEncounter(
  encounter: Encounter,
  partyMembers: readonly PartyMemberConfig[],
): BattleState {
  const players: BattleCombatant[] = partyMembers.map((member, index) => {
    const simulated = buildSimPlayer(member, index);
    return {
      id: `encounter-player-${index + 1}`,
      name: simulated.name,
      kind: 'player',
      initiative: 0,
      dexterity: Math.max(1, 10 + simulated.initiativeMod * 2),
      armorClass: simulated.ac,
      maxHp: simulated.maxHp,
      currentHp: simulated.maxHp,
      tempHp: 0,
      conditions: [],
      concentration: false,
      reactionUsed: false,
      legendaryActionsMax: 0,
      legendaryActionsUsed: 0,
      notes: `Level ${member.level} · ${member.templateId}`,
    };
  });

  const enemies: BattleCombatant[] = encounter.monsters.flatMap(({ monster, count }) =>
    Array.from({ length: count }, (_, index) => ({
      id: `encounter-${monster.id}-${index + 1}`,
      name: count > 1 ? `${monster.name} ${index + 1}` : monster.name,
      kind: 'enemy' as const,
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
      notes: `CR ${monster.challengeRating} · ${encounter.environment}`,
    })),
  );

  return {
    version: 1,
    name: encounter.name,
    round: 1,
    started: false,
    combatants: [...players, ...enemies],
    log: [],
  };
}

export function sortCombatants(combatants: readonly BattleCombatant[]): BattleCombatant[] {
  return [...combatants].sort((a, b) =>
    b.initiative - a.initiative
    || b.dexterity - a.dexterity
    || a.name.localeCompare(b.name),
  );
}

export function getTurnCallouts(state: BattleState): {
  current?: BattleCombatant;
  next?: BattleCombatant;
  onDeck?: BattleCombatant;
} {
  const ordered = sortCombatants(state.combatants);
  if (ordered.length === 0) return {};
  const currentIndex = Math.max(0, ordered.findIndex((combatant) => combatant.id === state.currentId));
  return {
    current: ordered[currentIndex],
    next: ordered.length > 1 ? ordered[(currentIndex + 1) % ordered.length] : undefined,
    onDeck: ordered.length > 2 ? ordered[(currentIndex + 2) % ordered.length] : undefined,
  };
}

function log(state: BattleState, message: string): BattleState {
  const entry: BattleLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    round: state.round,
    message,
  };
  return { ...state, log: [entry, ...state.log].slice(0, 100) };
}

export function startBattle(state: BattleState): BattleState {
  const ordered = sortCombatants(state.combatants);
  if (ordered.length === 0) return state;
  return log({ ...state, started: true, round: 1, currentId: ordered[0].id }, `${ordered[0].name} starts the battle.`);
}

export function advanceTurn(state: BattleState): BattleState {
  const ordered = sortCombatants(state.combatants);
  if (!state.started || ordered.length === 0) return state;
  const currentIndex = Math.max(0, ordered.findIndex((combatant) => combatant.id === state.currentId));
  const nextIndex = (currentIndex + 1) % ordered.length;
  const wrapped = nextIndex === 0;
  const next = ordered[nextIndex];
  const nextState: BattleState = {
    ...state,
    round: wrapped ? state.round + 1 : state.round,
    currentId: next.id,
    combatants: state.combatants.map((combatant) => ({
      ...combatant,
      reactionUsed: combatant.id === next.id ? false : combatant.reactionUsed,
      legendaryActionsUsed: wrapped ? 0 : combatant.legendaryActionsUsed,
    })),
  };
  return log(nextState, `${next.name} is up${wrapped ? ` — round ${nextState.round}` : ''}.`);
}

export function setCurrentTurn(state: BattleState, combatantId: string): BattleState {
  const combatant = state.combatants.find((entry) => entry.id === combatantId);
  if (!combatant) return state;
  return log({
    ...state,
    started: true,
    currentId: combatantId,
    combatants: state.combatants.map((entry) => entry.id === combatantId
      ? { ...entry, reactionUsed: false }
      : entry),
  }, `${combatant.name} takes the turn.`);
}

export function applyDamage(state: BattleState, combatantId: string, amount: number): BattleState {
  const target = state.combatants.find((combatant) => combatant.id === combatantId);
  const safeAmount = Math.max(0, Math.floor(amount));
  if (!target || safeAmount === 0) return state;
  const absorbed = Math.min(target.tempHp, safeAmount);
  const hpDamage = safeAmount - absorbed;
  const nextHp = Math.max(0, target.currentHp - hpDamage);
  return log({
    ...state,
    combatants: state.combatants.map((combatant) => combatant.id === combatantId
      ? { ...combatant, tempHp: combatant.tempHp - absorbed, currentHp: nextHp }
      : combatant),
  }, `${target.name} takes ${safeAmount} damage${absorbed ? ` (${absorbed} absorbed by temporary HP)` : ''}.`);
}

export function applyHealing(state: BattleState, combatantId: string, amount: number): BattleState {
  const target = state.combatants.find((combatant) => combatant.id === combatantId);
  const safeAmount = Math.max(0, Math.floor(amount));
  if (!target || safeAmount === 0) return state;
  const nextHp = Math.min(target.maxHp, target.currentHp + safeAmount);
  return log({
    ...state,
    combatants: state.combatants.map((combatant) => combatant.id === combatantId
      ? { ...combatant, currentHp: nextHp }
      : combatant),
  }, `${target.name} regains ${nextHp - target.currentHp} HP.`);
}

export function battleToMarkdown(state: BattleState): string {
  const callouts = getTurnCallouts(state);
  const lines = [
    `# ${state.name}`,
    '',
    `- Round: ${state.round}`,
    `- Acting: ${callouts.current?.name ?? 'Not started'}`,
    `- Next up: ${callouts.next?.name ?? '—'}`,
    `- On deck: ${callouts.onDeck?.name ?? '—'}`,
    '',
    '## Initiative',
    '',
    '| Init | Combatant | Side | HP | AC | Conditions | Notes |',
    '| ---: | --- | --- | ---: | ---: | --- | --- |',
    ...sortCombatants(state.combatants).map((combatant) =>
      `| ${combatant.initiative} | ${combatant.name} | ${combatant.kind} | ${combatant.currentHp}/${combatant.maxHp}${combatant.tempHp ? ` (+${combatant.tempHp})` : ''} | ${combatant.armorClass ?? '—'} | ${combatant.conditions.join(', ') || '—'} | ${combatant.notes || '—'} |`,
    ),
  ];
  return lines.join('\n');
}

export function isBattleState(value: unknown): value is BattleState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<BattleState>;
  return state.version === 1
    && typeof state.name === 'string'
    && typeof state.round === 'number'
    && typeof state.started === 'boolean'
    && Array.isArray(state.combatants)
    && Array.isArray(state.log);
}
