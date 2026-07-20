import { buildSimPlayer } from '@/data/class-templates';
import { validateBoundedIntegerInput } from './number-input';
import type {
  PartyCombatOverrides,
  PartyMemberDraft,
  PartySaveBonuses,
} from './party';

export interface PartyMemberFormValues {
  id?: string;
  name: string;
  playerName: string;
  level: string;
  templateId: string;
  classLabel: string;
  initiativeBonus: string;
  passivePerception: string;
  notes: string;
  overrides?: PartyCombatOverrides;
}

export type PartyCombatFieldName =
  | 'ac'
  | 'maxHp'
  | 'attackBonus'
  | 'attacksPerRound'
  | 'avgDamagePerHit'
  | 'healingPerRound'
  | 'dexSave'
  | 'conSave'
  | 'wisSave'
  | 'spellDc'
  | 'avgSpellDamagePerRound';

export type PartyMemberFormField =
  | 'name'
  | 'playerName'
  | 'level'
  | 'templateId'
  | 'classLabel'
  | 'initiativeBonus'
  | 'passivePerception'
  | 'notes'
  | PartyCombatFieldName;

export type PartyMemberFormErrors = Partial<Record<PartyMemberFormField, string>>;

export type PartyMemberFormValidation =
  | { ok: true; member: PartyMemberDraft; errors: PartyMemberFormErrors }
  | { ok: false; errors: PartyMemberFormErrors };

/**
 * Convert a combat override input without discarding transient editing states.
 * A non-empty state such as `-` or `.` deliberately becomes NaN so form
 * validation can block a save while the text input continues to show exactly
 * what the DM typed.
 */
export function parseCombatOverrideInput(raw: string): number | undefined {
  if (!raw.trim()) return undefined;
  return Number(raw);
}

function optionalText(value: string, maxLength: number, label: string): {
  value?: string;
  error?: string;
} {
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (value.length > maxLength) {
    return { error: `${label} must be ${maxLength} characters or fewer.` };
  }
  return { value: trimmed };
}

function optionalInteger(
  raw: string,
  label: string,
  min: number,
  max: number,
): { value?: number; error?: string } {
  if (!raw.trim()) return {};
  const validation = validateBoundedIntegerInput(raw, label, min, max);
  if (validation.value === null) return { error: validation.error };
  return { value: validation.value };
}

function validateOverride(
  errors: PartyMemberFormErrors,
  field: PartyCombatFieldName,
  label: string,
  value: number | undefined,
  min: number,
  max: number,
  integer = false,
): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || (integer && !Number.isInteger(value))) {
    errors[field] = integer
      ? `${label} must be a whole number from ${min} to ${max}.`
      : `${label} must be a number from ${min} to ${max}.`;
    return;
  }
  if (value < min || value > max) {
    errors[field] = `${label} must be between ${min} and ${max}.`;
  }
}

function validateCombatOverrides(
  overrides: PartyCombatOverrides | undefined,
  errors: PartyMemberFormErrors,
): void {
  if (!overrides) return;
  validateOverride(errors, 'ac', 'Armor Class', overrides.ac, 1, 100, true);
  validateOverride(errors, 'maxHp', 'Maximum HP', overrides.maxHp, 1, 1_000_000, true);
  validateOverride(errors, 'attackBonus', 'Attack bonus', overrides.attackBonus, -50, 100, true);
  validateOverride(errors, 'attacksPerRound', 'Attacks per round', overrides.attacksPerRound, 1, 100, true);
  validateOverride(errors, 'avgDamagePerHit', 'Average damage per hit', overrides.avgDamagePerHit, 0, 1_000_000);
  validateOverride(errors, 'healingPerRound', 'Healing per round', overrides.healingPerRound, 0, 1_000_000);
  validateOverride(errors, 'spellDc', 'Spell save DC', overrides.spellDc, 1, 100, true);
  validateOverride(
    errors,
    'avgSpellDamagePerRound',
    'Average spell damage per round',
    overrides.avgSpellDamagePerRound,
    0,
    1_000_000,
  );
  if (overrides.saveBonuses) {
    const saves: Array<[PartyCombatFieldName, string, keyof PartySaveBonuses]> = [
      ['dexSave', 'Dexterity save', 'dex'],
      ['conSave', 'Constitution save', 'con'],
      ['wisSave', 'Wisdom save', 'wis'],
    ];
    for (const [field, label, ability] of saves) {
      validateOverride(errors, field, label, overrides.saveBonuses[ability], -50, 100, true);
    }
  }
}

const SCALAR_OVERRIDE_KEYS = [
  'ac',
  'maxHp',
  'attackBonus',
  'attacksPerRound',
  'avgDamagePerHit',
  'healingPerRound',
  'spellDc',
  'avgSpellDamagePerRound',
] as const satisfies readonly (keyof PartyCombatOverrides)[];

/**
 * Keep only values that actually differ from the selected class template.
 * In particular, storing a complete baseline save-bonus object would freeze
 * those bonuses when the character later changes level.
 */
export function normalizePartyCombatOverrides(
  overrides: PartyCombatOverrides | undefined,
  templateId: string,
  level: number,
): PartyCombatOverrides | undefined {
  if (!overrides) return undefined;

  const baseline = buildSimPlayer({
    name: 'Template baseline',
    templateId,
    level,
  }, 0);
  const normalized: PartyCombatOverrides = {};

  for (const key of SCALAR_OVERRIDE_KEYS) {
    const value = overrides[key];
    if (value === undefined) continue;
    const baselineValue = baseline[key];
    const matchesBaseline = value === baselineValue
      || (value === 0 && baselineValue === undefined
        && (key === 'healingPerRound' || key === 'avgSpellDamagePerRound'));
    if (!matchesBaseline) normalized[key] = value;
  }

  if (overrides.saveBonuses) {
    const { dex, con, wis } = overrides.saveBonuses;
    if (
      dex !== baseline.saveBonuses.dex
      || con !== baseline.saveBonuses.con
      || wis !== baseline.saveBonuses.wis
    ) {
      normalized.saveBonuses = { dex, con, wis };
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function partyMemberToFormValues(member: PartyMemberDraft): PartyMemberFormValues {
  return {
    ...(member.id ? { id: member.id } : {}),
    name: member.name,
    playerName: member.playerName ?? '',
    level: String(member.level),
    templateId: member.templateId,
    classLabel: member.classLabel ?? '',
    initiativeBonus: member.initiativeBonus === undefined ? '' : String(member.initiativeBonus),
    passivePerception: member.passivePerception === undefined ? '' : String(member.passivePerception),
    notes: member.notes ?? '',
    ...(member.overrides ? {
      overrides: {
        ...member.overrides,
        ...(member.overrides.saveBonuses
          ? { saveBonuses: { ...member.overrides.saveBonuses } }
          : {}),
      },
    } : {}),
  };
}

export function validatePartyMemberForm(
  values: PartyMemberFormValues,
): PartyMemberFormValidation {
  const errors: PartyMemberFormErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = 'Character name is required.';
  else if (values.name.length > 120) errors.name = 'Character name must be 120 characters or fewer.';

  const playerName = optionalText(values.playerName, 120, 'Player name');
  if (playerName.error) errors.playerName = playerName.error;

  const level = validateBoundedIntegerInput(values.level, 'Character level', 1, 20);
  if (level.error) errors.level = level.error;

  const templateId = values.templateId.trim();
  if (!templateId) errors.templateId = 'Choose a class template.';
  else if (values.templateId.length > 120) errors.templateId = 'Class template must be 120 characters or fewer.';

  const classLabel = optionalText(values.classLabel, 120, 'Class label');
  if (classLabel.error) errors.classLabel = classLabel.error;

  const initiativeBonus = optionalInteger(values.initiativeBonus, 'Initiative bonus', -30, 30);
  if (initiativeBonus.error) errors.initiativeBonus = initiativeBonus.error;

  const passivePerception = optionalInteger(values.passivePerception, 'Passive Perception', 0, 100);
  if (passivePerception.error) errors.passivePerception = passivePerception.error;

  const notes = optionalText(values.notes, 2_000, 'Notes');
  if (notes.error) errors.notes = notes.error;

  validateCombatOverrides(values.overrides, errors);
  if (Object.keys(errors).length > 0 || level.value === null) return { ok: false, errors };

  const overrides = normalizePartyCombatOverrides(
    values.overrides,
    templateId,
    level.value,
  );

  return {
    ok: true,
    errors,
    member: {
      ...(values.id ? { id: values.id } : {}),
      name,
      level: level.value,
      templateId,
      ...(playerName.value ? { playerName: playerName.value } : {}),
      ...(classLabel.value ? { classLabel: classLabel.value } : {}),
      ...(initiativeBonus.value !== undefined ? { initiativeBonus: initiativeBonus.value } : {}),
      ...(passivePerception.value !== undefined ? { passivePerception: passivePerception.value } : {}),
      ...(notes.value ? { notes: notes.value } : {}),
      ...(overrides ? {
        overrides: {
          ...overrides,
          ...(overrides.saveBonuses
            ? { saveBonuses: { ...overrides.saveBonuses } }
            : {}),
        },
      } : {}),
    },
  };
}
