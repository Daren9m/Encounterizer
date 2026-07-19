// ─── Battle Forecast Types ───────────────────────────────────────
// Kept separate from types.ts so the simulator can evolve without
// touching the core monster type system.

export type SimAbility = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

/** Parsed dice expression, e.g. 2d8+4 → { n: 2, d: 8, mod: 4 } */
export interface DiceSpec {
  n: number;
  d: number;
  mod: number;
}

export interface SimAttack {
  name: string;
  attackBonus: number;
  damageDice: DiceSpec;
  avgDamage: number;
  /** Times per round this attack is made (multiattack expanded). */
  count: number;
  /** Melee reach in cells (spatial mode; 1 = 5 ft). */
  reachCells?: number;
  /** Ranged normal range in cells (spatial mode). */
  rangeCells?: number;
}

/** A recharge-gated big move (breath weapon, rock throw, ...). */
export interface RechargeAction {
  name: string;
  kind: 'save' | 'attack';
  /** d6 result at or above which the action recharges (5 → "5-6"). */
  rechargeMin: number;
  avgDamage: number;
  damageDice: DiceSpec;
  /** save kind */
  saveDc?: number;
  saveAbility?: SimAbility;
  /** How many targets it can catch (AoE breath ≈ 2, single-target = 1). */
  maxTargets: number;
  /** attack kind */
  attackBonus?: number;
}

export interface LegendaryAttack {
  name: string;
  cost: number;
  kind: 'attack' | 'save';
  attackBonus?: number;
  damageDice?: DiceSpec;
  saveDc?: number;
  saveAbility?: SimAbility;
  maxTargets: number;
  avgDamage: number;
}

export interface SimMonster {
  /** Unique per instance: `${sourceId}#${i}` */
  id: string;
  /** The Monster.id this instance came from (report aggregation key). */
  sourceId: string;
  /** Display name with instance number when count > 1. */
  name: string;
  ac: number;
  maxHp: number;
  initiativeMod: number;
  saves: Record<SimAbility, number>;
  attacks: SimAttack[];
  recharge?: RechargeAction;
  legendary?: { perRound: number; actions: LegendaryAttack[] };
  /** Precomputed expected DPR — drives player targeting priority. */
  threat: number;
  /** True when the extractor had to invent damage to hit the CR floor. */
  synthesizedAttack: boolean;
  parseWarnings: string[];
  /** Movement per round in cells (spatial mode; max of walk/fly ÷ 5). */
  speedCells?: number;
}

export interface SimPlayer {
  id: string;
  name: string;
  templateId?: string;
  level: number;
  ac: number;
  maxHp: number;
  attacksPerRound: number;
  attackBonus: number;
  avgDamagePerHit: number;
  saveBonuses: { dex: number; con: number; wis: number };
  /** Casters: amortized leveled-spell damage, save-gated vs spellDc. */
  spellDc?: number;
  avgSpellDamagePerRound?: number;
  /** Healers: average HP restored per round to the most wounded ally. */
  healingPerRound?: number;
  special?: {
    /** Halves incoming weapon (attack-roll) damage. */
    rage?: boolean;
    /** DEX saves: no damage on success, half on failure. */
    evasion?: boolean;
    /** Extra damage once per round on the first hit. */
    sneakDamage?: number;
  };
  initiativeMod: number;
  /** Movement per round in cells (spatial mode; default 6 = 30 ft). */
  speedCells?: number;
  /** Weapon attack range in cells (spatial mode; 1 = melee reach). */
  rangeCells?: number;
}

// ─── Spatial mode ─────────────────────────────────────────────────

/** The battle map digested for the simulator: a cost grid plus the
 *  starting cells token placement chose. */
export interface Battlefield {
  width: number;
  height: number;
  /** Per-cell entry cost: 0 = impassable, 1 = normal, 2 = difficult. */
  cost: Uint8Array;
  /** Spawn cell per player, in party order. */
  playerSpawns: number[];
  /** SimMonster.id → spawn cell (same ids MapToken uses). */
  monsterSpawns: Map<string, number>;
}

export interface BattleReport {
  iterations: number;
  seed: number;
  maxRounds: number;
  partyWinRate: number;
  stalemateRate: number;
  /** Average rounds across decided (non-stalemate) battles. */
  avgRounds: number;
  /** Mean end-of-battle party HP as a fraction of max (TPKs count as 0). */
  avgPartyHpRemainingPct: number;
  partyHitRate: number;
  monsterHitRate: number;
  dropRanking: Array<{ playerId: string; name: string; dropRate: number }>;
  deadliestMonster: {
    sourceId: string;
    name: string;
    avgDamagePerBattle: number;
    share: number;
  } | null;
  /** Expected HP fraction per side at the end of each round (carry-forward). */
  hpCurve: Array<{ round: number; partyPct: number; monsterPct: number }>;
  /** What the simulation says this fight plays like. */
  simLabel: 'Trivial' | 'Low' | 'Moderate' | 'High' | 'Deadly' | 'Lethal';
  approximationNotes: string[];
  /** Present only when the run was simulated on a battle map. */
  spatial?: {
    gridWidth: number;
    gridHeight: number;
    /** Mean round of the first in-range attack attempt. */
    avgRoundsToContact: number;
  };
}

// ─── Party configuration (persisted) ─────────────────────────────

export interface PartyMemberConfig {
  name: string;
  templateId: string;
  level: number;
  overrides?: Partial<
    Pick<
      SimPlayer,
      'ac' | 'maxHp' | 'attackBonus' | 'attacksPerRound' | 'avgDamagePerHit' | 'healingPerRound'
    >
  >;
}

export interface PartyConfig {
  version: 1;
  members: PartyMemberConfig[];
}

export const PARTY_CONFIG_STORAGE_KEY = 'partyConfig';
