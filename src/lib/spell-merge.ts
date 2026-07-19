// ─── Spell Pool Merging ──────────────────────────────────────────
// Built-in SRD spells + the user's custom spells, deduped by id. Customs
// win id collisions (they carry a 'custom-' prefix, so collisions only
// happen if someone deliberately overrides a built-in) and are appended
// after the built-ins, sorted by level then name.

import type { Spell } from '../data/spells';

export function mergeSpells(builtIn: Spell[], custom: Spell[]): Spell[] {
  if (custom.length === 0) return builtIn;

  const byId = new Map<string, Spell>();
  for (const s of builtIn) byId.set(s.id, s);

  const additions: Spell[] = [];
  for (const s of custom) {
    if (byId.has(s.id)) {
      byId.set(s.id, s);
    } else {
      additions.push(s);
    }
  }

  additions.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  return [...builtIn.map((s) => byId.get(s.id)!), ...additions];
}
