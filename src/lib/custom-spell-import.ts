// ─── Custom Spell JSON Parsing ───────────────────────────────────
// Accepts two formats, detected automatically:
//   1. 5etools spell JSON:     { "spell": [ ...5etools entries ] }
//   2. Encounterizer native:   [ ...Spell ] or { "spells": [ ...Spell ] }
// Valid entries import; invalid ones are reported per-index so a DM can fix
// their file without losing the good rows. Class tags come from each entry's
// own classes.fromClassList when present (5etools files keep class lists in
// a separate sources.json, so plain XPHB imports simply have no class tags).

import type { FiveEToolsSpell } from './types';
import type { Spell } from '../data/spells';
import { convert5eToolsSpell } from './import-5etools-spells';
import { validateSpell } from './validate-spell';

export interface CustomImportEntryError {
  index: number;
  name?: string;
  messages: string[];
}

export interface CustomSpellImportResult {
  imported: Spell[];
  errors: CustomImportEntryError[];
  format: '5etools' | 'native' | 'unknown';
}

const CUSTOM_ID_PREFIX = 'custom-';

function ensurePrefixed(id: string): string {
  return id.startsWith(CUSTOM_ID_PREFIX) ? id : `${CUSTOM_ID_PREFIX}${id}`;
}

/** Suffix -2, -3... until the id is free in `taken`; registers the winner. */
function uniqueId(base: string, taken: Set<string>): string {
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) {
    candidate = `${base}-${n}`;
  }
  taken.add(candidate);
  return candidate;
}

/** Homebrew 5etools spells may embed class lists directly on the entry. */
function embeddedClasses(candidate: unknown): string[] {
  const classes = (candidate as { classes?: { fromClassList?: Array<{ name?: unknown }> } }).classes;
  if (!classes || !Array.isArray(classes.fromClassList)) return [];
  return [...new Set(
    classes.fromClassList
      .map((c) => (typeof c.name === 'string' ? c.name : ''))
      .filter(Boolean),
  )];
}

export function parseCustomSpellJson(
  text: string,
  existingIds: ReadonlySet<string>,
): CustomSpellImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      imported: [],
      errors: [{ index: 0, messages: [`file is not valid JSON: ${(err as Error).message}`] }],
      format: 'unknown',
    };
  }

  // Detect format
  let candidates: unknown[];
  let format: CustomSpellImportResult['format'];
  if (
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    && Array.isArray((parsed as Record<string, unknown>).spell)
  ) {
    candidates = (parsed as { spell: unknown[] }).spell;
    format = '5etools';
  } else if (Array.isArray(parsed)) {
    candidates = parsed;
    format = 'native';
  } else if (
    parsed && typeof parsed === 'object'
    && Array.isArray((parsed as Record<string, unknown>).spells)
  ) {
    candidates = (parsed as { spells: unknown[] }).spells;
    format = 'native';
  } else {
    return {
      imported: [],
      errors: [{
        index: 0,
        messages: ['unrecognized JSON shape — expected a 5etools spell file ({"spell": [...]}) or an Encounterizer export ({"spells": [...]} or a top-level array)'],
      }],
      format: 'unknown',
    };
  }

  const taken = new Set(existingIds);
  const imported: Spell[] = [];
  const errors: CustomImportEntryError[] = [];

  candidates.forEach((candidate, index) => {
    const rawName =
      candidate && typeof candidate === 'object' && typeof (candidate as Record<string, unknown>).name === 'string'
        ? ((candidate as Record<string, unknown>).name as string)
        : undefined;

    let spell: Spell | undefined;
    const messages: string[] = [];

    if (format === '5etools') {
      try {
        const raw = candidate as FiveEToolsSpell;
        const classList = embeddedClasses(candidate);
        const converted = convert5eToolsSpell(raw, {
          source: 'Custom',
          idPrefix: CUSTOM_ID_PREFIX,
          classesByOriginalName: classList.length > 0 ? new Map([[raw.name, classList]]) : undefined,
        });
        // Belt and braces: the converter is lenient, the validator is the gate.
        const checked = validateSpell(converted);
        if (checked.ok) {
          spell = checked.spell;
        } else {
          messages.push(...checked.errors);
        }
      } catch (err) {
        messages.push(`conversion failed: ${(err as Error).message}`);
      }
    } else {
      const checked = validateSpell(candidate);
      if (checked.ok) {
        spell = { ...checked.spell, source: 'Custom', id: ensurePrefixed(checked.spell.id) };
      } else {
        messages.push(...checked.errors);
      }
    }

    if (spell) {
      imported.push({ ...spell, id: uniqueId(spell.id, taken) });
    } else {
      errors.push({ index, name: rawName, messages });
    }
  });

  return { imported, errors, format };
}
