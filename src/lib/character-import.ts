import type { SimPlayer } from './battle-sim-types';
import type { PartyMemberDraft } from './party';

export type CharacterImportResult =
  | { ok: true; member: PartyMemberDraft; warnings: string[] }
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

function classInfo(source: Record<string, unknown>): {
  name: string;
  level: number;
  classNames: string[];
} {
  const classes = Array.isArray(source.classes) ? source.classes.map(record).filter(Boolean) : [];
  const level = finite(source.level)
    ?? classes.reduce((sum, entry) => sum + (finite(entry?.level) ?? 0), 0)
    ?? 1;
  const classNames = classes
    .map((entry) => text(record(entry?.definition)?.name))
    .filter((name): name is string => Boolean(name));
  const name = text(source.className) ?? classNames[0] ?? 'Fighter';
  return {
    name,
    level: Math.max(1, Math.min(20, Math.round(level || 1))),
    classNames,
  };
}

function templateFor(className: string): { templateId: string; mapped: boolean } {
  const normalized = className.toLowerCase();
  const templateId = Object.entries(TEMPLATE_BY_CLASS)
    .find(([name]) => normalized.includes(name))?.[1];
  return templateId
    ? { templateId, mapped: true }
    : { templateId: 'fighter-champion', mapped: false };
}

function normalizeBounded(
  value: number,
  label: string,
  min: number,
  max: number,
  warnings: string[],
  integer = false,
): number {
  const normalized = Math.max(min, Math.min(max, integer ? Math.round(value) : value));
  if (normalized !== value) {
    warnings.push(`${label} was adjusted to ${normalized} to fit Encounterizer's supported range.`);
  }
  return normalized;
}

function boundedImportedText(
  value: unknown,
  label: string,
  maxLength: number,
  warnings: string[],
): string | undefined {
  const imported = text(value);
  if (!imported) return undefined;
  if (imported.length <= maxLength) return imported;
  warnings.push(`${label} was shortened to ${maxLength} characters.`);
  return imported.slice(0, maxLength).trimEnd();
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

  const warnings: string[] = [];
  const name = boundedImportedText(source.name, 'Character name', 120, warnings);
  if (!name) return { ok: false, error: 'The character is missing a name.' };

  const { name: className, level, classNames } = classInfo(source);
  const template = templateFor(className);
  if (classNames.length > 1) {
    warnings.push(`This is a multiclass character (${classNames.join(' / ')}); the ${className} template is only a starting point.`);
  }
  if (!template.mapped) {
    warnings.push(`The class “${className}” is not mapped yet, so the Champion Fighter template was used as a starting point.`);
  }
  const scores = ddbAbilityScores(source);
  const proficiency = 2 + Math.floor((level - 1) / 4);
  const primary = Math.max(abilityMod(scores.str), abilityMod(scores.dex), abilityMod(scores.int), abilityMod(scores.wis), abilityMod(scores.cha));
  const saveBonuses = Object.fromEntries(['dex', 'con', 'wis'].map((ability) => {
    const key = ability as 'dex' | 'con' | 'wis';
    const explicit = finite(record(source.saveBonuses)?.[key]);
    const value = normalizeBounded(
      explicit ?? abilityMod(scores[key]) + (hasSaveProficiency(source, key) ? proficiency : 0),
      `${ability.toUpperCase()} save bonus`,
      -50,
      100,
      warnings,
      true,
    );
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

  if (finite(source.ac) === undefined && finite(source.armorClass) === undefined) {
    warnings.push('Armor Class was derived from equipped armor and Dexterity; verify it before saving.');
  }
  if (finite(source.avgDamagePerHit) === undefined) {
    warnings.push('Average damage was estimated because the export did not include a combat-profile value.');
  }

  const initiativeSource = finite(source.initiativeBonus) ?? finite(source.initiativeModifier);
  const passivePerceptionSource = finite(source.passivePerception)
    ?? finite(source.passiveWisdomPerception);
  const initiativeBonus = initiativeSource === undefined
    ? undefined
    : normalizeBounded(initiativeSource, 'Initiative bonus', -30, 30, warnings, true);
  const passivePerception = passivePerceptionSource === undefined
    ? undefined
    : normalizeBounded(passivePerceptionSource, 'Passive Perception', 0, 100, warnings, true);
  const playerName = boundedImportedText(source.playerName, 'Player name', 120, warnings);
  const classLabel = boundedImportedText(source.classLabel, 'Class label', 120, warnings)
    ?? boundedImportedText(className, 'Class label', 120, warnings);
  const notes = boundedImportedText(source.notes, 'Notes', 2_000, warnings);

  const member: PartyMemberDraft = {
    name,
    templateId: template.templateId,
    level,
    ...(playerName ? { playerName } : {}),
    ...(classLabel ? { classLabel } : {}),
    ...(initiativeBonus !== undefined ? { initiativeBonus } : {}),
    ...(passivePerception !== undefined ? { passivePerception } : {}),
    ...(notes ? { notes } : {}),
    overrides: {
      ac: normalizeBounded(
        ddbArmorClass(source, abilityMod(scores.dex)),
        'Armor Class',
        1,
        100,
        warnings,
        true,
      ),
      maxHp: normalizeBounded(maxHp, 'Maximum HP', 1, 1_000_000, warnings, true),
      attackBonus: normalizeBounded(
        finite(source.attackBonus) ?? proficiency + primary,
        'Attack bonus',
        -50,
        100,
        warnings,
        true,
      ),
      attacksPerRound: normalizeBounded(
        attacksPerRound,
        'Attacks per round',
        1,
        100,
        warnings,
        true,
      ),
      avgDamagePerHit: normalizeBounded(
        finite(source.avgDamagePerHit) ?? 4.5 + primary,
        'Average damage per hit',
        0,
        1_000_000,
        warnings,
      ),
      saveBonuses,
      ...(finite(source.healingPerRound) !== undefined ? {
        healingPerRound: normalizeBounded(
          finite(source.healingPerRound)!,
          'Healing per round',
          0,
          1_000_000,
          warnings,
        ),
      } : {}),
      ...(finite(source.spellDc) !== undefined ? {
        spellDc: normalizeBounded(
          finite(source.spellDc)!,
          'Spell save DC',
          1,
          100,
          warnings,
          true,
        ),
      } : {}),
      ...(finite(source.avgSpellDamagePerRound) !== undefined
        ? {
            avgSpellDamagePerRound: normalizeBounded(
              finite(source.avgSpellDamagePerRound)!,
              'Average spell damage per round',
              0,
              1_000_000,
              warnings,
            ),
          }
        : {}),
    },
  };

  return { ok: true, member, warnings };
}
