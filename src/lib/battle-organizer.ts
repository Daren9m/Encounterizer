import type { Condition, Encounter, EncounterRecipeBeat, EncounterRecipePlan } from './types';
import type { PartyMemberConfig } from './battle-sim-types';
import { buildSimPlayer } from '../data/class-templates';
import {
  cloneEncounterPartyContext,
  isEncounterPartyContext,
  type EncounterPartyContext,
} from './encounter-party';

export type CombatantKind = 'player' | 'ally' | 'enemy';
export type BattlePhase = 'setup' | 'active' | 'complete';

export interface BattleCombatant {
  id: string;
  /** Durable identity this fresh battle snapshot was seeded from. */
  sourcePartyMemberId?: string;
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
  /** Optional only so battles saved before phases were introduced still load. */
  phase?: BattlePhase;
  name: string;
  round: number;
  currentId?: string;
  started: boolean;
  combatants: BattleCombatant[];
  log: BattleLogEntry[];
  /** Frozen encounter input; optional for battles created before Party Library. */
  partyContext?: EncounterPartyContext;
  /** Frozen recipe instructions and table progress; optional for legacy and
   *  manually-created battles. */
  recipePlan?: EncounterRecipePlan;
  recipeProgress?: {
    resolvedBeatIds: string[];
    outcome: 'active' | 'success' | 'failure';
  };
}

export const EMPTY_BATTLE: BattleState = {
  version: 1,
  phase: 'setup',
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
  partyContext?: EncounterPartyContext,
): BattleState {
  const players: BattleCombatant[] = partyMembers.map((member, index) => {
    const simulated = buildSimPlayer(member, index);
    return {
      id: member.id ? `party-${member.id}` : `encounter-player-${index + 1}`,
      ...(member.id ? { sourcePartyMemberId: member.id } : {}),
      name: simulated.name,
      kind: 'player',
      initiative: 0,
      // The forecast config has an optional initiative bonus, not an ability
      // score. Use a neutral tie-breaker until the DM enters Dexterity.
      dexterity: 10,
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

  const enemies: BattleCombatant[] = encounter.monsters.flatMap(({ monster, count, recipeRole }) =>
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
      notes: `CR ${monster.challengeRating} · ${encounter.environment}${recipeRole ? ` · ${recipeRole}` : ''}`,
    })),
  );

  const recipeAlly: BattleCombatant[] = encounter.recipePlan?.specialParticipant
    ? [{
        id: `recipe-${encounter.recipePlan.recipeId}-objective`,
        name: encounter.recipePlan.specialParticipant.name,
        kind: encounter.recipePlan.specialParticipant.kind,
        initiative: 0,
        dexterity: 10,
        armorClass: encounter.recipePlan.specialParticipant.armorClass,
        maxHp: encounter.recipePlan.specialParticipant.maxHp,
        currentHp: encounter.recipePlan.specialParticipant.maxHp,
        tempHp: 0,
        conditions: [],
        concentration: false,
        reactionUsed: false,
        legendaryActionsMax: 0,
        legendaryActionsUsed: 0,
        notes: encounter.recipePlan.specialParticipant.notes,
      }]
    : [];

  return {
    version: 1,
    phase: 'setup',
    name: encounter.name,
    round: 1,
    started: false,
    combatants: [...players, ...recipeAlly, ...enemies],
    log: [],
    ...(encounter.recipePlan
      ? {
          recipePlan: JSON.parse(JSON.stringify(encounter.recipePlan)) as EncounterRecipePlan,
          recipeProgress: { resolvedBeatIds: [], outcome: 'active' as const },
        }
      : {}),
    ...(partyContext
      ? { partyContext: cloneEncounterPartyContext(partyContext) }
      : {}),
  };
}

export type RecipeBeatState = 'due' | 'watch' | 'upcoming' | 'resolved';

export function getRecipeBeatState(state: BattleState, beat: EncounterRecipeBeat): RecipeBeatState {
  if (state.recipeProgress?.resolvedBeatIds.includes(beat.id)) return 'resolved';
  const trigger = beat.trigger;
  if (trigger.kind === 'manual') return 'watch';
  if (trigger.kind === 'round') return state.round >= trigger.round ? 'due' : 'upcoming';
  if (trigger.kind === 'ally-at-zero') {
    const participantName = state.recipePlan?.specialParticipant?.name;
    return state.combatants.some((combatant) =>
      combatant.kind === 'ally'
      && combatant.currentHp === 0
      && (!participantName || combatant.name === participantName)
    ) ? 'due' : 'upcoming';
  }
  if (trigger.kind === 'enemies-remaining') {
    const remaining = state.combatants.filter((combatant) => combatant.kind === 'enemy' && combatant.currentHp > 0).length;
    return remaining <= trigger.count ? 'due' : 'upcoming';
  }
  const enemies = state.combatants
    .filter((combatant) => combatant.kind === 'enemy' && combatant.maxHp > 0)
    .sort((a, b) => b.maxHp - a.maxHp);
  const leader = enemies.find((combatant) => combatant.notes.includes('· Boss')) ?? enemies[0];
  return leader && leader.currentHp / leader.maxHp <= trigger.percent / 100 ? 'due' : 'upcoming';
}

export function resolveRecipeBeat(state: BattleState, beatId: string): BattleState {
  const beat = state.recipePlan?.beats.find((entry) => entry.id === beatId);
  if (!beat || state.recipeProgress?.resolvedBeatIds.includes(beatId)) return state;
  const progress = state.recipeProgress ?? { resolvedBeatIds: [], outcome: 'active' as const };
  return log({
    ...state,
    recipeProgress: { ...progress, resolvedBeatIds: [...progress.resolvedBeatIds, beatId] },
  }, `Recipe cue resolved: ${beat.title}.`);
}

export function setRecipeOutcome(
  state: BattleState,
  outcome: 'active' | 'success' | 'failure',
): BattleState {
  if (!state.recipePlan || state.recipeProgress?.outcome === outcome) return state;
  const progress = state.recipeProgress ?? { resolvedBeatIds: [], outcome: 'active' as const };
  const next = { ...state, recipeProgress: { ...progress, outcome } };
  if (outcome === 'active') return log(next, 'Recipe objective reopened.');
  return log(next, `Recipe objective marked ${outcome}.`);
}

/** Resolve legacy version-1 records into the explicit workflow phase. */
export function getBattlePhase(state: BattleState): BattlePhase {
  if (state.phase === 'setup' || state.phase === 'active' || state.phase === 'complete') {
    return state.phase;
  }
  return state.started ? 'active' : 'setup';
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
  if (getBattlePhase(state) !== 'active') return {};
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
  return log({ ...state, phase: 'active', started: true, round: 1, currentId: ordered[0].id }, `${ordered[0].name} starts the battle.`);
}

export function advanceTurn(state: BattleState): BattleState {
  const ordered = sortCombatants(state.combatants);
  if (getBattlePhase(state) !== 'active' || !state.started || ordered.length === 0) return state;
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
  if (getBattlePhase(state) !== 'active') return state;
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

/** Remove a combatant while preserving turn and round bookkeeping. */
export function removeBattleCombatant(state: BattleState, combatantId: string): BattleState {
  const target = state.combatants.find((combatant) => combatant.id === combatantId);
  if (!target) return state;

  const phase = getBattlePhase(state);
  const ordered = sortCombatants(state.combatants);
  const currentIndex = ordered.findIndex((combatant) => combatant.id === combatantId);
  const combatants = state.combatants.filter((combatant) => combatant.id !== combatantId);

  if (combatants.length === 0) {
    return {
      ...state,
      phase: 'setup',
      round: 1,
      currentId: undefined,
      started: false,
      combatants: [],
      log: [],
    };
  }

  if (phase !== 'active') return { ...state, combatants };
  if (state.currentId !== combatantId) {
    return log({ ...state, combatants }, `${target.name} leaves the battle.`);
  }

  const wrapped = currentIndex === ordered.length - 1;
  const next = wrapped ? ordered[0] : ordered[currentIndex + 1];
  const nextRound = wrapped ? state.round + 1 : state.round;
  const nextState: BattleState = {
    ...state,
    phase: 'active',
    started: true,
    round: nextRound,
    currentId: next.id,
    combatants: combatants.map((combatant) => ({
      ...combatant,
      reactionUsed: combatant.id === next.id ? false : combatant.reactionUsed,
      legendaryActionsUsed: wrapped ? 0 : combatant.legendaryActionsUsed,
    })),
  };
  return log(nextState, `${target.name} leaves the battle; ${next.name} is up${wrapped ? ` — round ${nextRound}` : ''}.`);
}

export function finishBattle(state: BattleState): BattleState {
  if (getBattlePhase(state) !== 'active') return state;
  return log(
    { ...state, phase: 'complete', started: false },
    `Battle finished after round ${state.round}.`,
  );
}

export function resumeBattle(state: BattleState): BattleState {
  if (getBattlePhase(state) !== 'complete' || state.combatants.length === 0) return state;
  const ordered = sortCombatants(state.combatants);
  const currentId = state.currentId && state.combatants.some((combatant) => combatant.id === state.currentId)
    ? state.currentId
    : ordered[0].id;
  return log(
    { ...state, phase: 'active', started: true, currentId },
    'Battle resumed.',
  );
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
  const phase = getBattlePhase(state);
  const callouts = getTurnCallouts(state);
  const lines = [
    `# ${state.name}`,
    '',
    `- Status: ${phase === 'setup' ? 'Preparing initiative' : phase === 'active' ? 'In progress' : 'Complete'}`,
    `- Round: ${state.round}`,
    ...(phase === 'active' ? [
      `- Acting: ${callouts.current?.name ?? '—'}`,
      `- Next up: ${callouts.next?.name ?? '—'}`,
      `- On deck: ${callouts.onDeck?.name ?? '—'}`,
    ] : []),
    ...(state.recipePlan ? [
      '',
      '## Recipe objective',
      '',
      `**${state.recipePlan.objective.title}.** ${state.recipePlan.objective.summary}`,
      `- Outcome: ${state.recipeProgress?.outcome ?? 'active'}`,
      `- Success: ${state.recipePlan.objective.success}`,
      `- Failure: ${state.recipePlan.objective.failure}`,
      '',
      '### Battle beats',
      '',
      ...state.recipePlan.beats.map((beat) => `- [${state.recipeProgress?.resolvedBeatIds.includes(beat.id) ? 'x' : ' '}] **${beat.title}:** ${beat.guidance} ${beat.effect}`),
    ] : []),
    '',
    '## Initiative',
    '',
    '| Init | Combatant | Side | HP | AC | Conditions | Notes |',
    '| ---: | --- | --- | ---: | ---: | --- | --- |',
    ...sortCombatants(state.combatants).map((combatant) =>
      `| ${combatant.initiative} | ${combatant.name} | ${combatant.kind} | ${combatant.currentHp}/${combatant.maxHp}${combatant.tempHp ? ` (+${combatant.tempHp})` : ''} | ${combatant.armorClass ?? '—'} | ${combatant.conditions.join(', ') || '—'} | ${combatant.notes || '—'} |`,
    ),
  ];
  if (state.log.length > 0) {
    lines.push(
      '',
      '## Battle log',
      '',
      ...[...state.log].reverse().map((entry) => `- **Round ${entry.round}:** ${entry.message}`),
    );
  }
  return lines.join('\n');
}

export function isBattleState(value: unknown): value is BattleState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<BattleState>;
  return state.version === 1
    && (state.phase === undefined || state.phase === 'setup' || state.phase === 'active' || state.phase === 'complete')
    && typeof state.name === 'string'
    && typeof state.round === 'number'
    && typeof state.started === 'boolean'
    && Array.isArray(state.combatants)
    && Array.isArray(state.log)
    && (state.partyContext === undefined || isEncounterPartyContext(state.partyContext))
    && (state.recipePlan === undefined || isRecipePlan(state.recipePlan))
    && (state.recipeProgress === undefined || (
      Array.isArray(state.recipeProgress.resolvedBeatIds)
      && state.recipeProgress.resolvedBeatIds.every((id) => typeof id === 'string')
      && ['active', 'success', 'failure'].includes(state.recipeProgress.outcome)
    ));
}

function isRecipePlan(value: unknown): value is EncounterRecipePlan {
  if (!value || typeof value !== 'object') return false;
  const plan = value as Partial<EncounterRecipePlan>;
  return plan.version === 1
    && typeof plan.recipeId === 'string'
    && typeof plan.recipeName === 'string'
    && !!plan.objective
    && typeof plan.objective.title === 'string'
    && typeof plan.objective.summary === 'string'
    && typeof plan.objective.success === 'string'
    && typeof plan.objective.failure === 'string'
    && Array.isArray(plan.setup)
    && plan.setup.every((note) => typeof note === 'string')
    && Array.isArray(plan.beats)
    && plan.beats.every((beat) => !!beat && typeof beat.id === 'string' && typeof beat.title === 'string')
    && !!plan.forecast
    && typeof plan.forecast.headline === 'string'
    && Array.isArray(plan.forecast.guidance)
    && typeof plan.forecast.caveat === 'string'
    && typeof plan.terrain === 'string'
    && typeof plan.closing === 'string';
}
