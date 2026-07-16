// ─── Custom Monster JSON Parsing ─────────────────────────────────
// Accepts two formats, detected automatically:
//   1. 5etools bestiary JSON:   { "monster": [ ...5etools entries ] }
//   2. Encounterizer native:    [ ...Monster ] or { "monsters": [ ...Monster ] }
// Valid entries import; invalid ones are reported per-index so a DM can fix
// their file without losing the good rows.

import type { FiveEToolsMonster, Monster } from './types';
import { convert5eToolsMonster } from './import-5etools';
import { validateMonster } from './validate-monster';

export interface CustomImportEntryError {
  index: number;
  name?: string;
  messages: string[];
}

export interface CustomImportResult {
  imported: Monster[];
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

export function parseCustomMonsterJson(
  text: string,
  existingIds: ReadonlySet<string>,
): CustomImportResult {
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
  let format: CustomImportResult['format'];
  if (
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    && Array.isArray((parsed as Record<string, unknown>).monster)
  ) {
    candidates = (parsed as { monster: unknown[] }).monster;
    format = '5etools';
  } else if (Array.isArray(parsed)) {
    candidates = parsed;
    format = 'native';
  } else if (
    parsed && typeof parsed === 'object'
    && Array.isArray((parsed as Record<string, unknown>).monsters)
  ) {
    candidates = (parsed as { monsters: unknown[] }).monsters;
    format = 'native';
  } else {
    return {
      imported: [],
      errors: [{
        index: 0,
        messages: ['unrecognized JSON shape — expected a 5etools bestiary ({"monster": [...]}) or an Encounterizer export ({"monsters": [...]} or a top-level array)'],
      }],
      format: 'unknown',
    };
  }

  const taken = new Set(existingIds);
  const imported: Monster[] = [];
  const errors: CustomImportEntryError[] = [];

  candidates.forEach((candidate, index) => {
    const rawName =
      candidate && typeof candidate === 'object' && typeof (candidate as Record<string, unknown>).name === 'string'
        ? ((candidate as Record<string, unknown>).name as string)
        : undefined;

    let monster: Monster | undefined;
    const messages: string[] = [];

    if (format === '5etools') {
      try {
        const converted = convert5eToolsMonster(candidate as FiveEToolsMonster, {
          idPrefix: CUSTOM_ID_PREFIX,
          forceSource: 'Custom',
        });
        // Belt and braces: the converter is lenient, the validator is the gate.
        const checked = validateMonster(converted);
        if (checked.ok) {
          monster = checked.monster;
        } else {
          messages.push(...checked.errors);
        }
      } catch (err) {
        messages.push(`conversion failed: ${(err as Error).message}`);
      }
    } else {
      const checked = validateMonster(candidate);
      if (checked.ok) {
        monster = { ...checked.monster, source: 'Custom', id: ensurePrefixed(checked.monster.id) };
      } else {
        messages.push(...checked.errors);
      }
    }

    if (monster) {
      imported.push({ ...monster, id: uniqueId(monster.id, taken) });
    } else {
      errors.push({ index, name: rawName, messages });
    }
  });

  return { imported, errors, format };
}
