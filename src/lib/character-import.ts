import type { PartyMemberConfig, SimPlayer } from './battle-sim-types';

export type CharacterImportResult =
  | { ok: true; member: PartyMemberConfig; warnings: string[] }
  | { ok: false; error: string };

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
type Ability = (typeof ABILITIES)[number];

const TEMPLATE_BY_CLASS: Record<string, string> = {
  artificer: 'artificer-armorer',
  barbarian: 'barbarian-berserker',
  bard: 'bard-lore',
  cleric: 'cleric-life',
  druid: 'druid-moon',
  fighter: 'fighter-champion',
  monk: 'monk-open-hand',
  paladin: 'paladin-devotion',
  ranger: 'ranger-hunter',
  rogue: 'rogue-thief',
  sorcerer: 'sorcerer-draconic',
  warlock: 'warlock-fiend',
  wizard: 'wizard-evoker',
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function ddbAbilityScores(source: Record<string, unknown>): Record<Ability, number> {
  const stats = Array.isArray(source.stats) ? source.stats : [];
  const bonuses = Array.isArray(source.bonusStats) ? source.bonusStats : [];
  const overrides = Array.isArray(source.overrideStats) ? source.overrideStats : [];
  const valueAt = (items: unknown[], id: number): number | undefined => {
    const found = items.map(record).find((item) => item?.id === id);
    return finite(found?.value);
  };
  return Object.fromEntries(ABILITIES.map((ability, index) => {
    const id = index + 1;
    const base = valueAt(stats, id) ?? 10;
    const bonus = valueAt(bonuses, id) ?? 0;
    const override = valueAt(overrides, id);
    return [ability, override ?? base + bonus];
  })) as Record<Ability, number>;
}

function classInfo(source: Record<string, unknown>): { name: string; level: number } {
  const classes = Array.isArray(source.classes) ? source.classes.map(record).filter(Boolean) : [];
  const level = finite(source.level)
    ?? classes.reduce((sum, entry) => sum + (finite(entry?.level) ?? 0), 0)
    ?? 1;
  const firstDefinition = record(classes[0]?.definition);
  const name = text(source.className) ?? text(firstDefinition?.name) ?? 'Fighter';
  return { name, level: Math.max(1, Math.min(20, Math.round(level || 1))) };
}

function templateFor(className: string): string {
  const normalized = className.toLowerCase();
  return Object.entries(TEMPLATE_BY_CLASS).find(([name]) => normalized.includes(name))?.[1]
    ?? 'fighter-champion';
}

function ddbArmorClass(source: Record<string, unknown>, dexMod: number): number {
  const direct = finite(source.ac) ?? finite(source.armorClass);
  if (direct !== undefined) return direct;

  const inventory = Array.isArray(source.inventory) ? source.inventory.map(record).filter(Boolean) : [];
  let ac = 10 + dexMod;
  let shield = 0;
  for (const item of inventory) {
    if (item?.equipped !== true) continue;
    const definition = record(item?.definition);
    const armorClass = finite(definition?.armorClass);
    const armorType = text(definition?.armorType)?.toLowerCase();
    const name = text(definition?.name)?.toLowerCase() ?? '';
    if (name.includes('shield') || armorType === 'shield') {
      shield = Math.max(shield, armorClass ?? 2);
      continue;
    }
    if (armorClass === undefined) continue;
    const dexterity = armorType === 'heavy' ? 0 : armorType === 'medium' ? Math.min(2, dexMod) : dexMod;
    ac = Math.max(ac, armorClass + dexterity);
  }
  return ac + shield;
}

function hasSaveProficiency(source: Record<string, unknown>, ability: Ability): boolean {
  const modifiers = record(source.modifiers);
  if (!modifiers) return false;
  return Object.values(modifiers)
    .flatMap((group) => Array.isArray(group) ? group : [])
    .map(record)
    .some((modifier) => modifier?.type === 'proficiency'
      && text(modifier?.subType)?.toLowerCase() === `${ability}-saving-throws`);
}

/**
 * Parse either an Encounterizer combat-profile JSON object or a D&D Beyond
 * character export. The result deliberately feeds the existing editable
 * Party Setup form; imported values are never used without DM review.
 */
export function importCharacterJson(json: string): CharacterImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  const root = record(parsed);
  const source = record(root?.data) ?? record(root?.character) ?? root;
  if (!source) return { ok: false, error: 'The JSON file does not contain a character object.' };

  const name = text(source.name);
  if (!name) return { ok: false, error: 'The character is missing a name.' };

  const { name: className, level } = classInfo(source);
  const scores = ddbAbilityScores(source);
  const proficiency = 2 + Math.floor((level - 1) / 4);
  const primary = Math.max(abilityMod(scores.str), abilityMod(scores.dex), abilityMod(scores.int), abilityMod(scores.wis), abilityMod(scores.cha));
  const saveBonuses = Object.fromEntries(['dex', 'con', 'wis'].map((ability) => {
    const key = ability as 'dex' | 'con' | 'wis';
    const explicit = finite(record(source.saveBonuses)?.[key]);
    const value = explicit ?? abilityMod(scores[key]) + (hasSaveProficiency(source, key) ? proficiency : 0);
    return [key, value];
  })) as SimPlayer['saveBonuses'];

  const maxHp = finite(source.maxHp)
    ?? finite(source.maximumHitPoints)
    ?? finite(source.overrideHitPoints)
    ?? ((finite(source.baseHitPoints) ?? Math.max(1, level * 5))
      + level * abilityMod(scores.con)
      + (finite(source.bonusHitPoints) ?? 0));
  const martialExtraAttack = /fighter|barbarian|monk|paladin|ranger/i.test(className) && level >= 5;
  const attacksPerRound = finite(source.attacksPerRound)
    ?? (className.toLowerCase().includes('fighter') && level >= 11 ? 3 : martialExtraAttack ? 2 : 1);

  const warnings: string[] = [];
  if (finite(source.ac) === undefined && finite(source.armorClass) === undefined) {
    warnings.push('Armor Class was derived from equipped armor and Dexterity; verify it before saving.');
  }
  if (finite(source.avgDamagePerHit) === undefined) {
    warnings.push('Average damage was estimated because the export did not include a combat-profile value.');
  }

  const member: PartyMemberConfig = {
    name,
    templateId: templateFor(className),
    level,
    overrides: {
      ac: Math.max(1, Math.round(ddbArmorClass(source, abilityMod(scores.dex)))),
      maxHp: Math.max(1, Math.round(maxHp)),
      attackBonus: Math.round(finite(source.attackBonus) ?? proficiency + primary),
      attacksPerRound: Math.max(1, Math.round(attacksPerRound)),
      avgDamagePerHit: Math.max(1, finite(source.avgDamagePerHit) ?? 4.5 + primary),
      saveBonuses,
      ...(finite(source.healingPerRound) !== undefined ? { healingPerRound: finite(source.healingPerRound) } : {}),
      ...(finite(source.spellDc) !== undefined ? { spellDc: finite(source.spellDc) } : {}),
      ...(finite(source.avgSpellDamagePerRound) !== undefined
        ? { avgSpellDamagePerRound: finite(source.avgSpellDamagePerRound) }
        : {}),
    },
  };

  return { ok: true, member, warnings };
}
