// ─── Monster Pool Merging ────────────────────────────────────────
// Built-in bestiary + the user's custom monsters, deduped by id. Customs
// win id collisions (they carry a 'custom-' prefix, so collisions only
// happen if someone deliberately overrides a built-in) and are appended
// after the built-ins, sorted by CR then name.

import type { Monster } from './types';

export function mergeMonsters(builtIn: Monster[], custom: Monster[]): Monster[] {
  if (custom.length === 0) return builtIn;

  const byId = new Map<string, Monster>();
  for (const m of builtIn) byId.set(m.id, m);

  const overrides: Monster[] = [];
  const additions: Monster[] = [];
  for (const m of custom) {
    if (byId.has(m.id)) {
      byId.set(m.id, m);
      overrides.push(m);
    } else {
      additions.push(m);
    }
  }

  additions.sort(
    (a, b) => a.challengeRating - b.challengeRating || a.name.localeCompare(b.name),
  );

  return [...builtIn.map((m) => byId.get(m.id)!), ...additions];
}
