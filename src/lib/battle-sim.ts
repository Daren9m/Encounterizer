// ─── Battle Forecast Engine ──────────────────────────────────────
// Monte Carlo combat simulation. Deliberately rough: it answers "does
// this encounter play like its XP label says?", not "what exactly
// happens on round 3". One seeded RNG drives every roll, so a report is
// fully reproducible from its seed.

import { seededRandom, type Rng } from './random';
import type {
  BattleReport,
  LegendaryAttack,
  RechargeAction,
  SimMonster,
  SimPlayer,
} from './battle-sim-types';

export interface SimulateOptions {
  iterations?: number;
  seed: number;
  maxRounds?: number;
}

interface PlayerState {
  kind: 'player';
  ref: SimPlayer;
  hp: number;
  down: boolean;
  initiative: number;
  sneakUsedThisRound: boolean;
}

interface MonsterState {
  kind: 'monster';
  ref: SimMonster;
  hp: number;
  down: boolean;
  initiative: number;
  rechargeReady: boolean;
  legendaryLeft: number;
}

function d20(rng: Rng): number {
  return 1 + Math.floor(rng() * 20);
}

function d6(rng: Rng): number {
  return 1 + Math.floor(rng() * 6);
}

function rollDice(spec: { n: number; d: number; mod: number }, rng: Rng): number {
  let total = spec.mod;
  for (let i = 0; i < spec.n; i++) total += 1 + Math.floor(rng() * spec.d);
  return Math.max(0, total);
}

/** Lowest-HP living target — the classic focus-fire heuristic. */
function lowestHpAlive<T extends { hp: number; down: boolean }>(side: T[]): T | undefined {
  let best: T | undefined;
  for (const unit of side) {
    if (unit.down) continue;
    if (!best || unit.hp < best.hp) best = unit;
  }
  return best;
}

/**
 * Monster target selection: mostly focus-fire the weakest, sometimes swing
 * at whoever's in reach. Pure focus-fire makes the squishiest PC drop in
 * 100% of runs, which reads as broken — real monsters spread damage.
 */
function monsterPickTarget(players: PlayerState[], rng: Rng): PlayerState | undefined {
  const alive = players.filter((p) => !p.down);
  if (alive.length === 0) return undefined;
  if (alive.length === 1 || rng() < 0.7) return lowestHpAlive(alive);
  return alive[Math.floor(rng() * alive.length)];
}

function highestThreatAlive(monsters: MonsterState[]): MonsterState | undefined {
  let best: MonsterState | undefined;
  for (const m of monsters) {
    if (m.down) continue;
    if (!best || m.ref.threat > best.ref.threat
      || (m.ref.threat === best.ref.threat && m.hp < best.hp)) {
      best = m;
    }
  }
  return best;
}

function applyDamageToPlayer(target: PlayerState, amount: number, isWeaponAttack: boolean): number {
  let dealt = amount;
  if (isWeaponAttack && target.ref.special?.rage) {
    dealt = Math.floor(dealt / 2);
  }
  target.hp -= dealt;
  if (target.hp <= 0) {
    target.hp = 0;
    target.down = true; // KO is final in v1 — no death saves, no yo-yo
  }
  return dealt;
}

/** Saving-throw damage with Evasion semantics on DEX saves. */
function saveDamage(
  target: PlayerState,
  dc: number,
  ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha',
  fullDamage: number,
  rng: Rng,
): number {
  const bonusKey = ability === 'dex' || ability === 'con' || ability === 'wis' ? ability : 'wis';
  const saved = d20(rng) + target.ref.saveBonuses[bonusKey] >= dc;
  const evades = ability === 'dex' && target.ref.special?.evasion;
  let amount: number;
  if (saved) {
    amount = evades ? 0 : Math.floor(fullDamage / 2);
  } else {
    amount = evades ? Math.floor(fullDamage / 2) : fullDamage;
  }
  return applyDamageToPlayer(target, amount, false);
}

interface IterationResult {
  winner: 'party' | 'monsters' | 'stalemate';
  rounds: number;
  playerDowns: boolean[];
  partyHpFraction: number;
  damageBySource: Map<string, number>;
  partyHits: number;
  partyAttempts: number;
  monsterHits: number;
  monsterAttempts: number;
  /** Party / monster HP fraction at the end of each round. */
  curve: Array<[number, number]>;
}

function runIteration(
  players: SimPlayer[],
  monsters: SimMonster[],
  maxRounds: number,
  rng: Rng,
): IterationResult {
  const playerStates: PlayerState[] = players.map((p) => ({
    kind: 'player', ref: p, hp: p.maxHp, down: false,
    initiative: d20(rng) + p.initiativeMod, sneakUsedThisRound: false,
  }));
  const monsterStates: MonsterState[] = monsters.map((m) => ({
    kind: 'monster', ref: m, hp: m.maxHp, down: false,
    initiative: d20(rng) + m.initiativeMod,
    rechargeReady: true, legendaryLeft: m.legendary?.perRound ?? 0,
  }));

  // Players win initiative ties (PC-favorable, matches table convention)
  const order: Array<PlayerState | MonsterState> = [...playerStates, ...monsterStates].sort(
    (a, b) => b.initiative - a.initiative || (a.kind === 'player' ? -1 : 1),
  );

  const partyMaxHp = playerStates.reduce((s, p) => s + p.ref.maxHp, 0);
  const monsterMaxHp = monsterStates.reduce((s, m) => s + m.ref.maxHp, 0);
  const damageBySource = new Map<string, number>();
  let partyHits = 0; let partyAttempts = 0;
  let monsterHits = 0; let monsterAttempts = 0;
  const curve: Array<[number, number]> = [];

  const partyAlive = () => playerStates.some((p) => !p.down);
  const monstersAlive = () => monsterStates.some((m) => !m.down);

  let round = 0;
  let winner: IterationResult['winner'] = 'stalemate';

  outer: for (round = 1; round <= maxRounds; round++) {
    for (const p of playerStates) p.sneakUsedThisRound = false;
    for (const m of monsterStates) m.legendaryLeft = m.ref.legendary?.perRound ?? 0;

    for (const unit of order) {
      if (unit.down) continue;

      if (unit.kind === 'player') {
        const player = unit;

        // Heal the most wounded living ally first
        if (player.ref.healingPerRound) {
          let wounded: PlayerState | undefined;
          for (const ally of playerStates) {
            if (ally.down || ally.hp >= ally.ref.maxHp) continue;
            if (!wounded || ally.hp / ally.ref.maxHp < wounded.hp / wounded.ref.maxHp) wounded = ally;
          }
          if (wounded) {
            wounded.hp = Math.min(wounded.ref.maxHp, wounded.hp + player.ref.healingPerRound);
          }
        }

        // Weapon/cantrip attacks vs the biggest threat
        for (let i = 0; i < player.ref.attacksPerRound; i++) {
          const target = highestThreatAlive(monsterStates);
          if (!target) break;
          partyAttempts++;
          const roll = d20(rng);
          const crit = roll === 20;
          const hit = crit || (roll !== 1 && roll + player.ref.attackBonus >= target.ref.ac);
          if (!hit) continue;
          partyHits++;
          let damage = player.ref.avgDamagePerHit * (crit ? 1.5 : 1);
          if (player.ref.special?.sneakDamage && !player.sneakUsedThisRound) {
            damage += player.ref.special.sneakDamage;
            player.sneakUsedThisRound = true;
          }
          target.hp -= Math.round(damage);
          if (target.hp <= 0) { target.hp = 0; target.down = true; }
        }

        // Leveled-spell surplus, save-gated vs DEX
        if (player.ref.spellDc && player.ref.avgSpellDamagePerRound) {
          const target = highestThreatAlive(monsterStates);
          if (target) {
            const saved = d20(rng) + target.ref.saves.dex >= player.ref.spellDc;
            const damage = saved
              ? Math.floor(player.ref.avgSpellDamagePerRound / 2)
              : player.ref.avgSpellDamagePerRound;
            target.hp -= damage;
            if (target.hp <= 0) { target.hp = 0; target.down = true; }
          }
        }

        if (!monstersAlive()) { winner = 'party'; break outer; }

        // Legendary actions trigger after each player's turn
        const legend = monsterStates.find((m) => !m.down && m.ref.legendary && m.legendaryLeft > 0);
        if (legend?.ref.legendary) {
          const affordable = legend.ref.legendary.actions.find((a) => a.cost <= legend.legendaryLeft);
          if (affordable) {
            legend.legendaryLeft -= affordable.cost;
            const dealt = resolveLegendary(affordable, playerStates, legend, rng, damageBySource);
            monsterAttempts++;
            if (dealt > 0) monsterHits++;
            if (!partyAlive()) { winner = 'monsters'; break outer; }
          }
        }
      } else {
        const monster = unit;

        // Recharge check at the start of the turn
        if (monster.ref.recharge && !monster.rechargeReady) {
          monster.rechargeReady = d6(rng) >= monster.ref.recharge.rechargeMin;
        }

        if (monster.ref.recharge && monster.rechargeReady) {
          const dealt = resolveRecharge(monster.ref.recharge, playerStates, monster, rng, damageBySource);
          monsterAttempts++;
          if (dealt > 0) monsterHits++;
          monster.rechargeReady = false;
        } else {
          for (const attack of monster.ref.attacks) {
            for (let i = 0; i < attack.count; i++) {
              const target = monsterPickTarget(playerStates, rng);
              if (!target) break;
              monsterAttempts++;
              const roll = d20(rng);
              const crit = roll === 20;
              const hit = crit || (roll !== 1 && roll + attack.attackBonus >= target.ref.ac);
              if (!hit) continue;
              monsterHits++;
              let damage = rollDice(attack.damageDice, rng);
              if (crit) damage += rollDice({ ...attack.damageDice, mod: 0 }, rng);
              const dealt = applyDamageToPlayer(target, damage, true);
              damageBySource.set(
                monster.ref.sourceId,
                (damageBySource.get(monster.ref.sourceId) ?? 0) + dealt,
              );
            }
          }
        }

        if (!partyAlive()) { winner = 'monsters'; break outer; }
      }
    }

    curve.push([
      playerStates.reduce((s, p) => s + p.hp, 0) / partyMaxHp,
      monsterStates.reduce((s, m) => s + m.hp, 0) / monsterMaxHp,
    ]);
  }

  return {
    winner,
    rounds: Math.min(round, maxRounds),
    playerDowns: playerStates.map((p) => p.down),
    partyHpFraction: playerStates.reduce((s, p) => s + p.hp, 0) / partyMaxHp,
    damageBySource,
    partyHits, partyAttempts, monsterHits, monsterAttempts,
    curve,
  };
}

function resolveRecharge(
  recharge: RechargeAction,
  playerStates: PlayerState[],
  monster: MonsterState,
  rng: Rng,
  damageBySource: Map<string, number>,
): number {
  let dealt = 0;
  if (recharge.kind === 'attack') {
    const target = monsterPickTarget(playerStates, rng);
    if (!target) return 0;
    const roll = d20(rng);
    const hit = roll === 20 || (roll !== 1 && roll + (recharge.attackBonus ?? 0) >= target.ref.ac);
    if (hit) dealt = applyDamageToPlayer(target, rollDice(recharge.damageDice, rng), true);
  } else {
    // Save-based AoE: catch up to maxTargets of the lowest-HP players
    const targets = [...playerStates]
      .filter((p) => !p.down)
      .sort((a, b) => a.hp - b.hp)
      .slice(0, recharge.maxTargets);
    const damage = rollDice(recharge.damageDice, rng);
    for (const target of targets) {
      dealt += saveDamage(target, recharge.saveDc ?? 15, recharge.saveAbility ?? 'dex', damage, rng);
    }
  }
  if (dealt > 0) {
    damageBySource.set(monster.ref.sourceId, (damageBySource.get(monster.ref.sourceId) ?? 0) + dealt);
  }
  return dealt;
}

function resolveLegendary(
  action: LegendaryAttack,
  playerStates: PlayerState[],
  monster: MonsterState,
  rng: Rng,
  damageBySource: Map<string, number>,
): number {
  let dealt = 0;
  if (action.kind === 'attack' && action.attackBonus !== undefined && action.damageDice) {
    const target = monsterPickTarget(playerStates, rng);
    if (!target) return 0;
    const roll = d20(rng);
    const hit = roll === 20 || (roll !== 1 && roll + action.attackBonus >= target.ref.ac);
    if (hit) dealt = applyDamageToPlayer(target, rollDice(action.damageDice, rng), true);
  } else if (action.kind === 'save' && action.saveDc && action.damageDice) {
    const targets = [...playerStates]
      .filter((p) => !p.down)
      .sort((a, b) => a.hp - b.hp)
      .slice(0, action.maxTargets);
    const damage = rollDice(action.damageDice, rng);
    for (const target of targets) {
      dealt += saveDamage(target, action.saveDc, action.saveAbility ?? 'dex', damage, rng);
    }
  }
  if (dealt > 0) {
    damageBySource.set(monster.ref.sourceId, (damageBySource.get(monster.ref.sourceId) ?? 0) + dealt);
  }
  return dealt;
}

export function simulateBattle(
  players: SimPlayer[],
  monsters: SimMonster[],
  options: SimulateOptions,
): BattleReport {
  const maxRounds = options.maxRounds ?? 20;
  // Very large fights: halve iterations to keep the UI snappy.
  const iterations = options.iterations
    ?? (monsters.length > 40 ? 500 : 1000);
  const rng = seededRandom(options.seed);

  let wins = 0;
  let stalemates = 0;
  let decidedRounds = 0;
  let hpFractionSum = 0;
  let partyHits = 0; let partyAttempts = 0;
  let monsterHits = 0; let monsterAttempts = 0;
  const downCounts = players.map(() => 0);
  const damageTotals = new Map<string, number>();
  const curveSums: Array<[number, number]> = Array.from({ length: maxRounds }, () => [0, 0]);

  for (let i = 0; i < iterations; i++) {
    const result = runIteration(players, monsters, maxRounds, rng);
    if (result.winner === 'party') wins++;
    else if (result.winner === 'stalemate') stalemates++;
    if (result.winner !== 'stalemate') decidedRounds += result.rounds;
    hpFractionSum += result.winner === 'monsters' ? 0 : result.partyHpFraction;
    partyHits += result.partyHits; partyAttempts += result.partyAttempts;
    monsterHits += result.monsterHits; monsterAttempts += result.monsterAttempts;
    result.playerDowns.forEach((down, idx) => { if (down) downCounts[idx]++; });
    for (const [sourceId, damage] of result.damageBySource) {
      damageTotals.set(sourceId, (damageTotals.get(sourceId) ?? 0) + damage);
    }
    // Carry the final state forward so ended battles keep contributing.
    let last: [number, number] = [1, 1];
    for (let r = 0; r < maxRounds; r++) {
      const point = result.curve[r] ?? last;
      last = point;
      curveSums[r][0] += point[0];
      curveSums[r][1] += point[1];
    }
  }

  const decided = iterations - stalemates;
  const partyWinRate = wins / iterations;
  const avgHpPct = hpFractionSum / iterations;

  // Truncate the display curve once both sides have flatlined.
  const hpCurve = curveSums.map(([p, m], i) => ({
    round: i + 1,
    partyPct: p / iterations,
    monsterPct: m / iterations,
  }));
  let lastInteresting = hpCurve.length - 1;
  for (let i = hpCurve.length - 1; i > 2; i--) {
    const a = hpCurve[i];
    const b = hpCurve[i - 1];
    if (Math.abs(a.partyPct - b.partyPct) > 0.002 || Math.abs(a.monsterPct - b.monsterPct) > 0.002) {
      lastInteresting = i;
      break;
    }
  }

  const totalMonsterDamage = Array.from(damageTotals.values()).reduce((s, v) => s + v, 0);
  let deadliest: BattleReport['deadliestMonster'] = null;
  for (const [sourceId, total] of damageTotals) {
    if (!deadliest || total > deadliest.avgDamagePerBattle * iterations) {
      const name = monsters.find((m) => m.sourceId === sourceId)?.name.replace(/ #\d+$/, '') ?? sourceId;
      deadliest = {
        sourceId,
        name,
        avgDamagePerBattle: total / iterations,
        share: totalMonsterDamage > 0 ? total / totalMonsterDamage : 0,
      };
    }
  }

  const simLabel: BattleReport['simLabel'] =
    partyWinRate >= 0.97 && avgHpPct >= 0.75 ? 'Trivial'
    : partyWinRate >= 0.9 ? 'Low'
    : partyWinRate >= 0.65 ? 'Moderate'
    : partyWinRate >= 0.35 ? 'High'
    : partyWinRate >= 0.1 ? 'Deadly'
    : 'Lethal';

  const approximationNotes = Array.from(
    new Set(monsters.flatMap((m) => m.parseWarnings)),
  );

  return {
    iterations,
    seed: options.seed,
    maxRounds,
    partyWinRate,
    stalemateRate: stalemates / iterations,
    avgRounds: decided > 0 ? decidedRounds / decided : maxRounds,
    avgPartyHpRemainingPct: avgHpPct,
    partyHitRate: partyAttempts > 0 ? partyHits / partyAttempts : 0,
    monsterHitRate: monsterAttempts > 0 ? monsterHits / monsterAttempts : 0,
    dropRanking: players
      .map((p, i) => ({ playerId: p.id, name: p.name, dropRate: downCounts[i] / iterations }))
      .sort((a, b) => b.dropRate - a.dropRate),
    deadliestMonster: deadliest,
    hpCurve: hpCurve.slice(0, lastInteresting + 1),
    simLabel,
    approximationNotes,
  };
}

/**
 * The "XP says X, forecast says Y" sentence.
 * xpLabel is the 2024 assessment (Low/Moderate/High/Extreme).
 */
export function buildAssessment(report: BattleReport, xpLabel: string): string {
  const labelsAgree = report.simLabel.toLowerCase() === xpLabel.toLowerCase()
    || (report.simLabel === 'Deadly' && xpLabel === 'Extreme')
    || (report.simLabel === 'Lethal' && xpLabel === 'Extreme');

  if (labelsAgree) {
    return `The XP budget and the forecast agree: this plays like a ${xpLabel} encounter.`;
  }

  let reason: string;
  const topDrop = report.dropRanking[0];
  if (report.monsterHitRate < 0.35) {
    reason = "the monsters struggle to hit through the party's AC";
  } else if (topDrop && topDrop.dropRate > 0.5) {
    reason = `${topDrop.name} goes down in ${Math.round(topDrop.dropRate * 100)}% of battles`;
  } else if (report.deadliestMonster && report.deadliestMonster.share > 0.5) {
    reason = `the ${report.deadliestMonster.name} deals ${Math.round(report.deadliestMonster.share * 100)}% of all monster damage`;
  } else if (report.stalemateRate > 0.2) {
    reason = `many runs grind past ${report.maxRounds} rounds without resolution`;
  } else {
    reason = `the action economy favors the ${report.partyWinRate >= 0.5 ? 'party' : 'monsters'}`;
  }

  return `The XP budget says ${xpLabel}, but the forecast plays more like ${report.simLabel} — ${reason}.`;
}
