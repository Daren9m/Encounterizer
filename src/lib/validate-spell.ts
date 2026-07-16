// ─── Spell Validation ────────────────────────────────────────────
// Structural gate for spells entering the app from user JSON. Mirrors
// validate-monster: returns the typed value on success or a list of
// human-readable problems a DM can act on.

import type { Spell, SpellSchool } from '../data/spells';

const SCHOOLS: ReadonlySet<string> = new Set<SpellSchool>([
  'Abjuration', 'Conjuration', 'Divination', 'Enchantment',
  'Evocation', 'Illusion', 'Necromancy', 'Transmutation',
]);

export type SpellValidation =
  | { ok: true; spell: Spell }
  | { ok: false; errors: string[] };

export function validateSpell(value: unknown): SpellValidation {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['entry is not an object'] };
  }
  const v = value as Record<string, unknown>;

  const requireString = (field: string) => {
    if (typeof v[field] !== 'string' || (v[field] as string).length === 0) {
      errors.push(`${field} must be a non-empty string`);
    }
  };
  const optionalString = (field: string) => {
    if (v[field] !== undefined && typeof v[field] !== 'string') {
      errors.push(`${field} must be a string when present`);
    }
  };
  const requireBoolean = (field: string) => {
    if (typeof v[field] !== 'boolean') errors.push(`${field} must be a boolean`);
  };

  for (const field of ['id', 'name', 'castingTime', 'range', 'components', 'duration', 'effectSummary', 'description', 'source']) {
    requireString(field);
  }
  for (const field of ['area', 'saveType', 'damageType', 'upcast']) {
    optionalString(field);
  }
  requireBoolean('concentration');
  requireBoolean('ritual');

  if (typeof v.level !== 'number' || !Number.isInteger(v.level) || v.level < 0 || v.level > 9) {
    errors.push('level must be an integer from 0 to 9');
  }
  if (typeof v.school !== 'string' || !SCHOOLS.has(v.school)) {
    errors.push(`school must be one of: ${[...SCHOOLS].join(', ')}`);
  }
  if (v.attackType !== undefined && v.attackType !== 'melee' && v.attackType !== 'ranged') {
    errors.push("attackType must be 'melee' or 'ranged' when present");
  }
  if (!Array.isArray(v.classes) || !(v.classes as unknown[]).every((c) => typeof c === 'string')) {
    errors.push('classes must be an array of strings');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, spell: value as Spell };
}
