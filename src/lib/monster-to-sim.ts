// ─── Monster → SimMonster Extraction ─────────────────────────────
// Derives simulator stats from full stat blocks. NEVER throws: every
// failed parse degrades to a defensible default and appends a warning
// that surfaces in the report's fine print.

import type { Monster, MonsterAction } from './types';
import type {
  DiceSpec,
  LegendaryAttack,
  RechargeAction,
  SimAbility,
  SimMonster,
} from './battle-sim-types';

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const ABILITY_WORDS: Record<string, SimAbility> = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha',
};

// 2014 DMG "Monster Statistics by Challenge Rating" damage-per-round
// midpoints — used only as a sanity floor for caster-type monsters whose
// damage lives in unparseable spell text (the Lich problem).
const CR_DAMAGE_MIDPOINT: Record<number, number> = {
  0: 1, 0.125: 2.5, 0.25: 4.5, 0.5: 7, 1: 11.5, 2: 17.5, 3: 23.5, 4: 29.5,
  5: 35.5, 6: 41.5, 7: 47.5, 8: 53.5, 9: 59.5, 10: 65.5, 11: 71.5, 12: 77.5,
  13: 83.5, 14: 89.5, 15: 95.5, 16: 101.5, 17: 107.5, 18: 113.5, 19: 119.5,
  20: 131.5, 21: 149.5, 22: 167.5, 23: 185.5, 24: 203.5, 25: 221.5,
  26: 239.5, 27: 257.5, 28: 275.5, 29: 293.5, 30: 311.5,
};

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Parse "2d8+4", "12d8", "2d6 + 6" → DiceSpec. Returns null on garbage. */
export function parseDice(text: string | undefined): DiceSpec | null {
  if (!text) return null;
  const match = text.replace(/\s+/g, '').match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) return null;
  return {
    n: Number.parseInt(match[1], 10),
    d: Number.parseInt(match[2], 10),
    mod: match[3] ? Number.parseInt(match[3], 10) : 0,
  };
}

export function avgDice(spec: DiceSpec): number {
  return spec.n * ((spec.d + 1) / 2) + spec.mod;
}

function isAttackAction(action: MonsterAction): boolean {
  return action.attackBonus !== undefined && parseDice(action.damageDice) !== null;
}

function isRechargeAction(action: MonsterAction): boolean {
  return /\(Recharge \d/.test(action.name);
}

/**
 * Total attacks per round from a Multiattack description.
 * 2024 phrasing: "The bear makes two Rend attacks.", "makes one Bite attack
 * and uses Antennae twice.", "makes as many Bite attacks as it has heads."
 */
export function parseMultiattackCount(description: string): number | null {
  // Hydra-style: "as many Bite attacks as it has heads" (five heads)
  if (/as many .{0,30}attacks? as it has heads/i.test(description)) return 5;

  const match = description.match(/makes\s+(?:up to\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d+)/i);
  if (!match) return null;
  const word = match[1].toLowerCase();
  return WORD_NUMBERS[word] ?? Number.parseInt(word, 10) ?? null;
}

/**
 * Distribute a Multiattack routine across the monster's attack actions.
 * Tries to honor "one Bite ... two Claw" phrasing; falls back to loading
 * remaining swings onto the highest-damage attack.
 */
function distributeAttacks(
  attackActions: MonsterAction[],
  multiattackText: string | null,
  totalAttacks: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  let assigned = 0;

  if (multiattackText) {
    for (const action of attackActions) {
      // "two Claw attacks", "one Bite attack" — 2024 capitalizes names
      const namePattern = new RegExp(
        `(one|two|three|four|five|six|\\d+)\\s+${action.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
        'i',
      );
      const match = multiattackText.match(namePattern);
      if (match) {
        const n = WORD_NUMBERS[match[1].toLowerCase()] ?? Number.parseInt(match[1], 10);
        if (Number.isFinite(n) && n > 0) {
          counts.set(action.name, n);
          assigned += n;
        }
      }
    }
  }

  if (assigned < totalAttacks && attackActions.length > 0) {
    // Load the remainder onto the highest-average-damage attack.
    const best = [...attackActions].sort(
      (a, b) => actionAvgDamage(b) - actionAvgDamage(a),
    )[0];
    counts.set(best.name, (counts.get(best.name) ?? 0) + (totalAttacks - assigned));
  } else if (assigned > totalAttacks) {
    // Phrase parsing overshot (e.g. option lists) — scale the best down.
    return distributeAttacks(attackActions, null, totalAttacks);
  }

  return counts;
}

function actionAvgDamage(action: MonsterAction): number {
  if (action.damageAvg) return action.damageAvg;
  const dice = parseDice(action.damageDice);
  return dice ? avgDice(dice) : 0;
}

function extractSaveInfo(description: string): { dc: number; ability: SimAbility } | null {
  const match = description.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw:? DC (\d+)/i)
    ?? description.match(/DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i);
  if (!match) return null;
  const [a, b] = [match[1], match[2]];
  const abilityWord = ABILITY_WORDS[a.toLowerCase()] !== undefined ? a : b;
  const dcWord = abilityWord === a ? b : a;
  const ability = ABILITY_WORDS[abilityWord.toLowerCase()];
  const dc = Number.parseInt(dcWord, 10);
  return ability && Number.isFinite(dc) ? { dc, ability } : null;
}

/** Damage from prose like "Failure: 54 (12d8) Acid damage." */
function extractProseDamage(description: string): { avg: number; dice: DiceSpec } | null {
  const match = description.match(/(\d+)\s*\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)/);
  if (!match) return null;
  const dice = parseDice(match[2]);
  if (!dice) return null;
  return { avg: Number.parseInt(match[1], 10), dice };
}

function extractRecharge(action: MonsterAction, warnings: string[]): RechargeAction | null {
  const rechargeMatch = action.name.match(/\(Recharge (\d)/);
  if (!rechargeMatch) return null;
  const rechargeMin = Number.parseInt(rechargeMatch[1], 10);

  const aoe = /each creature/i.test(action.description);
  const damage = isAttackAction(action)
    ? { avg: actionAvgDamage(action), dice: parseDice(action.damageDice)! }
    : extractProseDamage(action.description);

  if (!damage) {
    // Condition-only recharge moves (Blinding Breath) — skip, note it.
    warnings.push(`${action.name}: recharge action has no damage, ignored`);
    return null;
  }

  if (action.attackBonus !== undefined) {
    return {
      name: action.name,
      kind: 'attack',
      rechargeMin,
      avgDamage: damage.avg,
      damageDice: damage.dice,
      attackBonus: action.attackBonus,
      maxTargets: 1,
    };
  }

  const save = extractSaveInfo(action.description);
  if (!save) {
    warnings.push(`${action.name}: no save DC found, assuming DC 15 DEX`);
  }
  return {
    name: action.name,
    kind: 'save',
    rechargeMin,
    avgDamage: damage.avg,
    damageDice: damage.dice,
    saveDc: save?.dc ?? 15,
    saveAbility: save?.ability ?? 'dex',
    maxTargets: aoe ? 2 : 1,
  };
}

function extractLegendary(
  monster: Monster,
  attackActions: MonsterAction[],
  warnings: string[],
): SimMonster['legendary'] {
  if (!monster.legendary || monster.legendary.actions.length === 0) return undefined;

  const actions: LegendaryAttack[] = [];
  for (const la of monster.legendary.actions) {
    const cost = la.name.match(/\(Costs (\d+) Actions?\)/i);
    const costN = cost ? Number.parseInt(cost[1], 10) : 1;

    // Direct attack stats on the legendary action itself
    const ownDice = parseDice(la.damageDice);
    if (la.attackBonus !== undefined && ownDice) {
      actions.push({
        name: la.name, cost: costN, kind: 'attack',
        attackBonus: la.attackBonus, damageDice: ownDice,
        avgDamage: la.damageAvg ?? avgDice(ownDice), maxTargets: 1,
      });
      continue;
    }

    // "The aboleth makes one Tentacle attack." — resolve the reference
    const ref = la.description.match(/makes (?:one|a|two) (\w[\w\s]*?) attack/i);
    if (ref) {
      const referenced = attackActions.find(
        (a) => a.name.toLowerCase().startsWith(ref[1].trim().toLowerCase()),
      );
      if (referenced) {
        const dice = parseDice(referenced.damageDice)!;
        actions.push({
          name: la.name, cost: costN, kind: 'attack',
          attackBonus: referenced.attackBonus!, damageDice: dice,
          avgDamage: actionAvgDamage(referenced), maxTargets: 1,
        });
        continue;
      }
    }

    // Save-or-damage legendary ("Wing Attack", "Weight of Years"-style)
    const save = extractSaveInfo(la.description);
    const damage = extractProseDamage(la.description);
    if (save && damage) {
      actions.push({
        name: la.name, cost: costN, kind: 'save',
        saveDc: save.dc, saveAbility: save.ability,
        damageDice: damage.dice, avgDamage: damage.avg,
        maxTargets: /each creature/i.test(la.description) ? 2 : 1,
      });
      continue;
    }
    // Utility legendary actions (Detect, teleports) don't deal damage — skip.
  }

  if (actions.length === 0) {
    warnings.push('legendary actions carry no parseable damage, ignored');
    return undefined;
  }
  return { perRound: monster.legendary.actionsPerRound, actions };
}

/** Expected damage per round at a nominal 60% hit / 65% fail rate. */
function computeThreat(
  attacks: SimMonster['attacks'],
  recharge: RechargeAction | undefined,
  legendary: SimMonster['legendary'],
): number {
  let threat = attacks.reduce((sum, a) => sum + a.count * a.avgDamage * 0.6, 0);
  if (recharge) {
    // Available roughly every 3 rounds, hits maxTargets at ~65% effect.
    threat += (recharge.avgDamage * recharge.maxTargets * 0.65) / 3;
  }
  if (legendary) {
    const per = legendary.actions[0];
    if (per) {
      threat += Math.floor(legendary.perRound / per.cost) * per.avgDamage * 0.6;
    }
  }
  return threat;
}

export function monsterToSimMonster(monster: Monster, instanceIndex: number, instanceCount: number): SimMonster {
  const warnings: string[] = [];

  const attackActions = monster.actions.filter(
    (a) => isAttackAction(a) && !isRechargeAction(a) && !a.name.startsWith('Multiattack'),
  );

  // Attacks per round
  const multiattack = monster.actions.find((a) => a.name.startsWith('Multiattack'));
  let attacks: SimMonster['attacks'] = [];

  if (attackActions.length > 0) {
    let total = 1;
    if (multiattack) {
      const parsed = parseMultiattackCount(multiattack.description);
      if (parsed) {
        total = parsed;
      } else {
        warnings.push('Multiattack count unparseable, assuming 1 attack');
      }
    }
    const distribution = distributeAttacks(
      attackActions,
      multiattack?.description ?? null,
      total,
    );
    attacks = Array.from(distribution.entries())
      .map(([name, count]) => {
        const action = attackActions.find((a) => a.name === name)!;
        return {
          name,
          attackBonus: action.attackBonus!,
          damageDice: parseDice(action.damageDice)!,
          avgDamage: actionAvgDamage(action),
          count,
        };
      })
      .filter((a) => a.count > 0);
  }

  let synthesizedAttack = false;
  const cr = monster.challengeRating;
  const midpoint = CR_DAMAGE_MIDPOINT[cr] ?? 10;

  if (attacks.length === 0) {
    // No parseable attacks at all (Shrieker Fungus, odd custom imports):
    // synthesize a generic attack from the CR damage table.
    synthesizedAttack = true;
    warnings.push('no attack actions parsed — synthesized a CR-appropriate attack');
    attacks = [{
      name: 'Attack (approximated)',
      attackBonus: 3 + (monster.proficiencyBonus ?? 2),
      damageDice: { n: 1, d: 6, mod: Math.max(0, Math.round(midpoint * 0.7) - 4) },
      avgDamage: Math.max(1, Math.round(midpoint * 0.7)),
      count: 1,
    }];
  }

  const recharge = monster.actions
    .map((a) => (isRechargeAction(a) ? extractRecharge(a, warnings) : null))
    .find((r) => r !== null) ?? undefined;

  const legendary = extractLegendary(monster, attackActions, warnings);

  // Caster-monster floor: if extracted DPR is far below the CR midpoint,
  // the damage probably lives in spell text we can't parse. Top it up.
  let threat = computeThreat(attacks, recharge, legendary);
  const expectedDpr = attacks.reduce((sum, a) => sum + a.count * a.avgDamage, 0)
    + (recharge ? (recharge.avgDamage * recharge.maxTargets) / 3 : 0);
  if (cr >= 1 && expectedDpr < midpoint * 0.4) {
    const supplement = Math.round(midpoint * 0.7 - expectedDpr);
    if (supplement > 0) {
      synthesizedAttack = true;
      warnings.push(
        `${monster.name}'s damage output looked ${Math.round(expectedDpr)}/round vs ~${Math.round(midpoint)} expected at CR ${cr} — spell/ability damage approximated`,
      );
      attacks.push({
        name: 'Spells & abilities (approximated)',
        attackBonus: (monster.spellcasting?.attackBonus ?? monster.proficiencyBonus + 3),
        damageDice: { n: 1, d: 10, mod: Math.max(0, supplement - 5) },
        avgDamage: supplement,
        count: 1,
      });
      threat = computeThreat(attacks, recharge, legendary);
    }
  }

  const saves: Record<SimAbility, number> = {
    str: monster.savingThrows?.str ?? abilityMod(monster.abilities.str),
    dex: monster.savingThrows?.dex ?? abilityMod(monster.abilities.dex),
    con: monster.savingThrows?.con ?? abilityMod(monster.abilities.con),
    int: monster.savingThrows?.int ?? abilityMod(monster.abilities.int),
    wis: monster.savingThrows?.wis ?? abilityMod(monster.abilities.wis),
    cha: monster.savingThrows?.cha ?? abilityMod(monster.abilities.cha),
  };

  return {
    id: `${monster.id}#${instanceIndex}`,
    sourceId: monster.id,
    name: instanceCount > 1 ? `${monster.name} #${instanceIndex + 1}` : monster.name,
    ac: monster.armor.ac,
    maxHp: monster.hitPoints,
    initiativeMod: abilityMod(monster.abilities.dex),
    saves,
    attacks,
    recharge,
    legendary,
    threat,
    synthesizedAttack,
    parseWarnings: warnings,
  };
}
