# Player Handout Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix player-facing spoiler leaks under the in-world artifact rule and add a player-safe display/export pipeline: projection layer, `/noncombat/player` route, DM toolbar (open / copy markdown / download JSON), and a CI spoiler lint.

**Architecture:** Content fixes in 4 generators preserve the exact RNG draw sequence (the frozen golden pins in `noncombat-generate.test.ts` must pass **unchanged** — they pin structural fields only, and an altered draw count would change them). A new pure projection module `src/lib/noncombat/player-view.ts` is the single choke point defining what players see; the route and toolbar only ever render its output.

**Tech Stack:** Next.js 14 App Router (static export — client pages use Suspense + `useSearchParams`), TypeScript strict, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-19-player-handout-overhaul-design.md`

## Global Constraints

- **RNG discipline:** never add, remove, or reorder an `rng` draw. The golden-pin tests (`src/lib/__tests__/noncombat-generate.test.ts:61-83`) must pass **without modification** — if a pin changes, the change is wrong.
- **In-world artifact rule (spec §3):** player surfaces (title + readAloud + handout) contain only what characters could perceive or read in-world. Never: skill/ability names, DCs, dice, numeric bonuses, "Escape:", future-phase enumeration. Lint false positives are fixed by rewording content, never by weakening the lint.
- **Prose conventions:** data-pool strings are lowercase fragments with no trailing period; `cap()` only for a sentence's first token; compose tags label-style, never "They ${tag}".
- **Data authoring rule** (`src/data/noncombat-scenarios.ts` header): no dice expressions or DC numbers in data strings; D&D fantasy register; no anachronisms.
- Conventional commits; **push after every commit**; no AI attribution anywhere.
- Full gate per task: `npm test` (all suites), `npm run typecheck`. Never run `npm run build` while the dev server is running.
- Worktree quirk: if `npm run lint` fails oddly in this checkout, use `npx eslint src --ext .ts,.tsx --no-eslintrc -c .eslintrc.json` or defer lint verdict to CI.

---

### Task 1: Spoiler fixes — gauntlets omen rewrite + social voice/tell relocation

**Files:**
- Modify: `src/data/noncombat-scenarios.ts:13` (interface) and `:44-57` (12 hazard entries)
- Modify: `src/lib/puzzle-engines/gauntlets.ts:49-54`
- Modify: `src/lib/challenge-frameworks/social.ts:64-69`
- Test: `src/lib/__tests__/puzzle-engines.test.ts` (gauntlets describe block, ~line 330)
- Test: `src/lib/__tests__/challenge-frameworks.test.ts` (social describe block)

**Interfaces:**
- Consumes: existing `GauntletHazard`, `EngineOutput`, `FrameworkOutput`.
- Produces: `GauntletHazard` gains required `omen: string` (perceivable escape gesture, lowercase fragment, no trailing period). Gauntlet handout becomes `{ kind: 'text', title: 'Scratched into the Wall', body }` covering the **first hazard only**. Social `situation` gains a `Voice: … Tell: …` line.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('contests & gauntlets', …)` in `src/lib/__tests__/puzzle-engines.test.ts`:

```ts
  it('player surfaces tease, never solve (in-world artifact rule)', () => {
    for (const seed of [4, 11, 209580]) {
      const out = gauntlets.generate({ levers: mkLevers('Hard', seed, { timeBudget: 'set-piece' }), rng: seededRandom(seed) });
      const player = `${out.readAloud}\n${out.handout?.kind === 'text' ? `${out.handout.title}\n${out.handout.body}` : ''}`;
      // No mechanics or instructions on player surfaces:
      expect(player).not.toMatch(/Escape:/);
      expect(player).not.toMatch(/Phase [2-9]/);
      expect(player).not.toMatch(/\b(Athletics|Acrobatics|Investigation|Perception|Survival|Sleight of Hand|Constitution)\b/);
      expect(player).not.toMatch(/DC ?\d/);
      // The handout is a first-hazard-only diegetic warning. NOTE:
      // filter() returns data order — sort by dmBrief position to
      // recover the SELECTION order before naming "first" and "later".
      const hazards = GAUNTLET_HAZARDS.filter(h => out.dmBrief.includes(h.name))
        .sort((a, b) => out.dmBrief.indexOf(a.name) - out.dmBrief.indexOf(b.name));
      expect(hazards.length).toBe(3);
      const later = hazards.slice(1);
      for (const h of later) expect(out.handout && 'body' in out.handout ? out.handout.body : '').not.toContain(h.name);
      // The omen gestures at the way out. slice(1) skips the first
      // character — readAloud embeds cap(omen), so char 0 differs.
      expect(out.readAloud).toContain(hazards[0].omen.slice(1));
      // DM brief keeps the full mechanics:
      expect(out.dmBrief).toMatch(/Escape:/);
    }
  });
  it('every hazard has an omen that is a clean lowercase fragment', () => {
    for (const h of GAUNTLET_HAZARDS) {
      expect(h.omen, h.name).toBeTruthy();
      expect(h.omen, h.name).not.toMatch(/\bDC\b|\d+d\d+/);
      expect(h.omen[0], h.name).toBe(h.omen[0].toLowerCase());
      expect(h.omen.endsWith('.'), h.name).toBe(false);
      expect(h.omen, h.name).not.toMatch(/\b(Athletics|Acrobatics|Investigation|Perception|Survival|Constitution)\b/);
    }
  });
```

Append inside the social describe block in `src/lib/__tests__/challenge-frameworks.test.ts` (match its existing local helpers — it has its own `mkLevers`/`seededRandom` imports):

```ts
  it('the tell and voice are DM-side only — read-aloud stays in-world', () => {
    for (const seed of [7, 31, 104729]) {
      const out = social.generate({ levers: mkLevers('Medium', seed), rng: seededRandom(seed) });
      const persona = PERSONAS.find(p => out.readAloud.includes(cap(p.archetype).slice(0, 12)));
      expect(persona).toBeTruthy();
      expect(out.readAloud).not.toContain(persona!.quirk);
      expect(out.readAloud).not.toContain(persona!.speech);
      expect(out.readAloud).not.toMatch(/Their (speech|tell):/);
      expect(out.situation).toContain(`Voice: ${persona!.speech}`);
      expect(out.situation).toContain(`Tell: ${persona!.quirk}`);
      // The Insight check still pays the tell off:
      expect(out.skillChecks.some(s => s.skill === 'Insight' && s.onSuccess.includes(persona!.quirk))).toBe(true);
    }
  });
```

(If `PERSONAS` or `cap` are not yet imported in that file, add `import { PERSONAS } from '../../data/noncombat-cast';` and `import { cap } from '../noncombat/theming';`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts src/lib/__tests__/challenge-frameworks.test.ts`
Expected: FAIL — `omen` is undefined; readAloud contains "Their tell:"; handout contains "Escape:".

- [ ] **Step 3: Add `omen` to the data**

In `src/data/noncombat-scenarios.ts` change line 13 to:

```ts
export interface GauntletHazard { name: string; hazard: string; escape: string; omen: string; skills: string[] }
```

Add an `omen` to each of the 12 entries (insert after `escape`), exactly these values:

```ts
  { name: 'The Flooding Chamber',  …escape…, omen: 'beneath the churn, water gurgles somewhere low — something down there is swallowing it', … },
  { name: 'The Shrinking Walls',   …escape…, omen: 'the grinding is not smooth — somewhere in the wall, gears catch and complain', … },
  { name: 'The Gas Vault',         …escape…, omen: 'the vapor pours thickest from a single hissing vent near the floor', … },
  { name: 'The Freezing Vault',    …escape…, omen: 'along one wall, a chain of cold braziers stands waiting, wicks still tarred', … },
  { name: 'The Gravity Well',      …escape…, omen: 'one block of the floor never shifts — a single stone the pull cannot touch', … },
  { name: 'The Sand Cascade',      …escape…, omen: 'beneath the pouring sand, something metal rattles — a grate, half-buried', … },
  { name: 'The Pendulum Hall',     …escape…, omen: 'past the swinging blades, at the far end, a lever juts from the wall', … },
  { name: 'The Swarm Nest',        …escape…, omen: 'the swarms boil out of one cracked seam above the inner door', … },
  { name: 'The Collapsing Floor',  …escape…, omen: 'the flagstones nearest the central pillar have not cracked — not one', … },
  { name: 'The Rising Current',    …escape…, omen: 'an iron ring is set into the wall above the waterline, rope-worn smooth', … },
  { name: 'The Furnace Room',      …escape…, omen: 'heat breathes up through a grate in the floor, in rhythm, like a bellows', … },
  { name: 'The Spike Floor',       …escape…, omen: 'on a raised plinth across the hall, something clicks in time with the spikes', … },
```

(`…escape…`/`…` mean: keep every existing field exactly as it is; only insert `omen`.)

- [ ] **Step 4: Rewrite the gauntlet player surfaces**

In `src/lib/puzzle-engines/gauntlets.ts` replace lines 49–54 (`readAloud:` and the `handout:` block) with:

```ts
      readAloud: `${cap(pick(pack.sensory, rng))}. You have found ${first.name} — ${withArticle(pick(pack.materials, rng))} chamber where ${first.hazard}. ${cap(first.omen)}.`,
      handout: {
        kind: 'text',
        title: 'Scratched into the Wall',
        body: `"${cap(first.hazard)} — and it does not stop. ${cap(first.omen)}. Hurry."\n— an earlier hand, in haste`,
      },
```

Draw parity: the old readAloud consumed exactly two picks (`pack.sensory`, `pack.materials`); the new one consumes the same two. The handout consumes none, before and after.

- [ ] **Step 5: Relocate social voice/tell**

In `src/lib/challenge-frameworks/social.ts` replace lines 64–69 (`readAloud:` and the `situation:` array) with:

```ts
      readAloud: `${cap(persona.archetype)} seeks you out — ${pack.sensory[0]}.`,
      situation: [
        `${cap(persona.archetype)} wants: ${want}. Their manner: starts ${track.start}.`,
        `Voice: ${persona.speech}. Tell: ${persona.quirk}.`,
        `Leverage (${leverage.kind}): ${leverage.approach}. Backfires: ${leverage.counter}.`,
        ...sides,
      ].join('\n'),
```

Draw parity: neither field consumed a draw before, nor after.

- [ ] **Step 6: Run the two suites, then the full gate**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts src/lib/__tests__/challenge-frameworks.test.ts`
Expected: PASS.
Run: `npm test` and `npm run typecheck`
Expected: **all** suites pass — especially `noncombat-generate.test.ts` golden pins, byte-identical, proving draw parity. If a pin fails, a draw was added/removed: fix the implementation, never the pin.

- [ ] **Step 7: Commit**

```bash
git add src/data/noncombat-scenarios.ts src/lib/puzzle-engines/gauntlets.ts src/lib/challenge-frameworks/social.ts src/lib/__tests__/puzzle-engines.test.ts src/lib/__tests__/challenge-frameworks.test.ts
git commit -m "fix(noncombat): gauntlet and social player surfaces tease instead of solve (#134)"
git push
```

---

### Task 2: New diegetic handouts — contests wager board + exploration rough map

**Files:**
- Modify: `src/lib/puzzle-engines/contests.ts:44-45` (insert `handout` between `readAloud` and `hints`)
- Modify: `src/lib/challenge-frameworks/exploration.ts:53-56` (insert `handout` after `situation`… any position in the returned object literal is fine; property order does not affect draws)
- Test: `src/lib/__tests__/puzzle-engines.test.ts` (contests describe block)
- Test: `src/lib/__tests__/challenge-frameworks.test.ts` (exploration describe block)

**Interfaces:**
- Consumes: existing locals — contests: `contest`, `rounds`, `winThreshold`; exploration: `chain`, `weather`.
- Produces: both kinds now populate `handout?: HandoutSpec` (`kind: 'text'`). Titles: `'The House Rules'` (contests), `'A Rough Map'` (exploration). Downstream (Task 3's lint) relies on these being spoiler-clean.

- [ ] **Step 1: Write the failing tests**

In the contests describe block of `puzzle-engines.test.ts`:

```ts
  it('wager board handout: posted rules, no mechanics', () => {
    for (const seed of [3, 17, 314159]) {
      const out = contests.generate({ levers: mkLevers('Medium', seed, { partySize: 5 }), rng: seededRandom(seed) });
      expect(out.handout?.kind).toBe('text');
      if (out.handout?.kind !== 'text') continue;
      expect(out.handout.title).toBe('The House Rules');
      expect(out.handout.body).toContain('Best of');
      expect(out.handout.body).not.toMatch(/DC ?\d|\+\d/);
      expect(out.handout.body).not.toMatch(/\b(Athletics|Acrobatics|Sleight of Hand|Deception|Performance|Constitution|History|Intimidation|Insight)\b/);
    }
  });
```

In the exploration describe block of `challenge-frameworks.test.ts`:

```ts
  it('rough map handout: waypoints and weather, no solutions', () => {
    for (const seed of [3, 17, 314159]) {
      const out = exploration.generate({ levers: mkLevers('Medium', seed, { timeBudget: 'set-piece' }), rng: seededRandom(seed) });
      expect(out.handout?.kind).toBe('text');
      if (out.handout?.kind !== 'text') continue;
      expect(out.handout.title).toBe('A Rough Map');
      const names = OBSTACLES.filter(o => out.situation.includes(o.name.toLowerCase()) || (out.stages ?? []).some(s => s.title === o.name)).map(o => o.name);
      expect(names.length).toBeGreaterThanOrEqual(1);
      for (const n of names) expect(out.handout.body).toContain(n);
      for (const o of OBSTACLES) expect(out.handout.body).not.toContain(o.creative);
      expect(out.handout.body).not.toMatch(/DC ?\d/);
      expect(out.handout.body).not.toMatch(/\b(Athletics|Acrobatics|Survival|Perception|Investigation)\b/);
    }
  });
```

(Add `import { OBSTACLES } from '../../data/noncombat-scenarios';` to `challenge-frameworks.test.ts` if missing.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts src/lib/__tests__/challenge-frameworks.test.ts`
Expected: FAIL — `out.handout` is `undefined` for both kinds.

- [ ] **Step 3: Implement the contests wager board**

In `src/lib/puzzle-engines/contests.ts`, insert between `readAloud:` (line 44) and `hints:` (line 45):

```ts
      handout: {
        kind: 'text',
        title: 'The House Rules',
        body: `${contest.name}. Best of ${rounds} — take ${winThreshold} and the wager is yours.\nTonight's challenger: ${contest.flavor}.\nAll wagers posted before the first round. The house arbitrates; the house is final.`,
      },
```

Zero draws — every value is already computed.

- [ ] **Step 4: Implement the exploration rough map**

In `src/lib/challenge-frameworks/exploration.ts`, insert after `situation:` (line 54):

```ts
      handout: {
        kind: 'text',
        title: 'A Rough Map',
        body: [
          ...chain.map((o, i) => `${i + 1}. ${o.name}`),
          `Beyond that, the mapmaker's hand gives out.`,
          `Skies on the route: ${weather}.`,
        ].join('\n'),
      },
```

Zero draws — `chain` and `weather` are already drawn.

- [ ] **Step 5: Run the two suites, then the full gate**

Run: `npx vitest run src/lib/__tests__/puzzle-engines.test.ts src/lib/__tests__/challenge-frameworks.test.ts` → PASS
Run: `npm test` and `npm run typecheck` → all pass, golden pins byte-identical.

- [ ] **Step 6: Commit**

```bash
git add src/lib/puzzle-engines/contests.ts src/lib/challenge-frameworks/exploration.ts src/lib/__tests__/puzzle-engines.test.ts src/lib/__tests__/challenge-frameworks.test.ts
git commit -m "feat(noncombat): diegetic wager-board and rough-map player handouts"
git push
```

---

### Task 3: Projection layer + spoiler lint

**Files:**
- Create: `src/lib/noncombat/player-view.ts`
- Test: `src/lib/__tests__/player-view.test.ts`

**Interfaces:**
- Consumes: `NoncombatResult` from `src/lib/noncombat/generate`, `HandoutSpec` from `src/lib/noncombat/types`, `handoutToText` from `src/lib/noncombat/handout-text`.
- Produces (Tasks 4 & 5 import these exact names from `@/lib/noncombat/player-view`):

```ts
export interface PlayerView { title: string; readAloud: string; handout?: HandoutSpec }
export interface PlayerViewMeta { seed: number; playerUrl: string }
export function toPlayerView(result: NoncombatResult): PlayerView
export function playerViewToMarkdown(view: PlayerView): string
export function playerViewToJson(view: PlayerView, meta: PlayerViewMeta): string
```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/player-view.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateNoncombat, getNoncombatKinds } from '../noncombat/generate';
import { toPlayerView, playerViewToMarkdown, playerViewToJson } from '../noncombat/player-view';

// ─── The in-world artifact rule, mechanically enforced (spec §3/§8) ──
// Player surfaces may never show mechanics. No allowlist: a false
// positive is fixed by rewording the content, never by weakening this.
const SKILLS = [
  'Athletics', 'Acrobatics', 'Sleight of Hand', 'Stealth', 'Arcana', 'History',
  'Investigation', 'Nature', 'Religion', 'Animal Handling', 'Insight', 'Medicine',
  'Perception', 'Survival', 'Deception', 'Intimidation', 'Performance', 'Persuasion',
];
const ABILITIES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
const SPOILER_PATTERNS: RegExp[] = [
  /DC ?\d/,
  /\+\d/,
  /\bd(4|6|8|10|12|20)\b/,
  /Escape:/,
  /Phase [2-9]/,
  /\b(group check|opposed check|saving throw)\b/i,
  new RegExp(`\\b(${[...SKILLS, ...ABILITIES].join('|')})\\b`),
];

describe('spoiler lint — every kind, every player surface', () => {
  const kinds = getNoncombatKinds().map(k => k.value);
  const seeds = Array.from({ length: 12 }, (_, i) => (i + 1) * 104729);
  it('player markdown never contains mechanics', () => {
    for (const kind of kinds) {
      for (const seed of seeds) {
        for (const timeBudget of ['quick', 'standard', 'set-piece'] as const) {
          for (const difficulty of ['Easy', 'Hard'] as const) {
            const r = generateNoncombat({ kind, seed, timeBudget, difficulty, partyLevel: 9, partySize: 5 });
            const text = playerViewToMarkdown(toPlayerView(r));
            for (const re of SPOILER_PATTERNS) {
              expect(text, `${kind} seed=${seed} ${timeBudget} ${difficulty} tripped ${re}`).not.toMatch(re);
            }
          }
        }
      }
    }
  });
});

describe('projection', () => {
  it('trap gets the neutral title; other kinds keep their name', () => {
    const t = generateNoncombat({ kind: 'trap', seed: 42 });
    expect(toPlayerView(t).title).toBe('The Way Ahead');
    expect(toPlayerView(t).title).not.toBe(t.name);
    const g = generateNoncombat({ kind: 'environmental', seed: 42 });
    expect(toPlayerView(g).title).toBe(g.name);
  });
  it('carries readAloud and handout, and nothing DM-side', () => {
    const r = generateNoncombat({ kind: 'logic', seed: 7 });
    const v = toPlayerView(r);
    expect(v.readAloud).toBe(r.readAloud);
    expect(v.handout).toBe(r.resultKind === 'puzzle' ? r.handout : undefined);
    expect(Object.keys(v).sort()).toEqual(['handout', 'readAloud', 'title']);
  });
  it('markdown: title heading, blockquoted read-aloud, handout section without duplicated title', () => {
    const r = generateNoncombat({ kind: 'environmental', seed: 424242 });
    const md = playerViewToMarkdown(toPlayerView(r));
    expect(md).toMatch(/^# /);
    expect(md).toContain('> ');
    expect(md).toContain('## Scratched into the Wall');
    expect(md.match(/Scratched into the Wall/g)).toHaveLength(1);
  });
  it('markdown works with no handout', () => {
    const r = generateNoncombat({ kind: 'chase', seed: 7 });
    const md = playerViewToMarkdown(toPlayerView(r));
    expect(md).toMatch(/^# /);
    expect(md).not.toContain('##');
  });
  it('json: format envelope, player url, null-safe handout', () => {
    const r = generateNoncombat({ kind: 'chase', seed: 7 });
    const parsed = JSON.parse(playerViewToJson(toPlayerView(r), { seed: 7, playerUrl: 'https://x.test/noncombat/player?seed=7' }));
    expect(parsed.format).toBe('encounterizer-player-handout');
    expect(parsed.version).toBe(1);
    expect(parsed.seed).toBe(7);
    expect(parsed.playerUrl).toContain('/noncombat/player?');
    expect(parsed.handout).toBeNull();
    const g = generateNoncombat({ kind: 'environmental', seed: 424242 });
    const parsedG = JSON.parse(playerViewToJson(toPlayerView(g), { seed: 424242, playerUrl: 'https://x.test/noncombat/player?seed=424242' }));
    expect(parsedG.handout.kind).toBe('text');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/__tests__/player-view.test.ts`
Expected: FAIL — module `../noncombat/player-view` does not exist.

- [ ] **Step 3: Implement the projection module**

Create `src/lib/noncombat/player-view.ts`:

```ts
// ─── Player-View Projection ──────────────────────────────────────
// The single choke point defining what players see. Everything the
// player route and DM toolbar render or export passes through here —
// the spoiler lint (player-view.test.ts) targets this output, so no
// generator can leak mechanics by forgetting which field is
// player-facing. Spec: 2026-07-19-player-handout-overhaul-design.md.

import { handoutToText } from './handout-text';
import type { HandoutSpec } from './types';
import type { NoncombatResult } from './generate';

export interface PlayerView {
  title: string;
  readAloud: string;
  handout?: HandoutSpec;
}

export interface PlayerViewMeta {
  seed: number;
  /** Absolute URL of the PLAYER route (never the DM route). */
  playerUrl: string;
}

// Trap frame names describe the mechanism — a neutral title instead.
const TRAP_TITLE = 'The Way Ahead';

export function toPlayerView(result: NoncombatResult): PlayerView {
  return {
    title: result.kind === 'trap' ? TRAP_TITLE : result.name,
    readAloud: result.readAloud,
    handout: result.handout,
  };
}

export function playerViewToMarkdown(view: PlayerView): string {
  const lines = [`# ${view.title}`, '', ...view.readAloud.split('\n').map(l => `> ${l}`)];
  if (view.handout) {
    const heading = view.handout.kind === 'text' && view.handout.title ? view.handout.title : 'Handout';
    // Text handouts embed their title in handoutToText — use the body
    // directly so the heading is not duplicated.
    const body = view.handout.kind === 'text' ? view.handout.body : handoutToText(view.handout);
    lines.push('', `## ${heading}`, '', body);
  }
  return lines.join('\n');
}

export function playerViewToJson(view: PlayerView, meta: PlayerViewMeta): string {
  return JSON.stringify(
    {
      format: 'encounterizer-player-handout',
      version: 1,
      seed: meta.seed,
      playerUrl: meta.playerUrl,
      title: view.title,
      readAloud: view.readAloud,
      handout: view.handout ?? null,
    },
    null,
    2,
  );
}
```

- [ ] **Step 4: Run the suite; fix lint hits by REWORDING content**

Run: `npx vitest run src/lib/__tests__/player-view.test.ts`
Expected: projection tests PASS. The lint sweep may flag pre-existing content (10,584 generations across every kind — e.g. a theme-pack sensory line starting with a capitalized ability word, or a riddle line). For each hit: reword the flagged string **in its data/source file** (keeping the register and the fragment conventions), rerun, repeat until clean. Prose-only rewording cannot move a pin; confirm with the full gate.

- [ ] **Step 5: Full gate**

Run: `npm test` and `npm run typecheck`
Expected: all pass; golden pins byte-identical.

- [ ] **Step 6: Commit**

```bash
git add src/lib/noncombat/player-view.ts src/lib/__tests__/player-view.test.ts
git commit -m "feat(noncombat): player-view projection layer with CI spoiler lint (#134, #50)"
git push
```

(Include any content files reworded in Step 4 in the `git add`.)

---

### Task 4: `/noncombat/player` route + nav suppression

**Files:**
- Create: `src/app/noncombat/player/layout.tsx`
- Create: `src/app/noncombat/player/page.tsx`
- Modify: `src/components/NavBar.tsx:84` (early return after all hooks)
- Test: manual + Task 6's build check (route pages have no unit suite in this repo; logic they render is covered by Task 3)

**Interfaces:**
- Consumes: `toPlayerView`, `PlayerView` from `@/lib/noncombat/player-view`; `generateNoncombat`, `getNoncombatKinds` from `@/lib/noncombat/generate`; `THEME_OPTIONS`, `TONE_OPTIONS`, `TIME_OPTIONS` from `@/lib/noncombat/theming`; `PuzzleHandout` (prop `spec: HandoutSpec`), `PrintButton` (prop `label: string`).
- Produces: the route `/noncombat/player` reading the exact DM share-URL params. **Do NOT add it to `src/lib/site.ts`** — staying out of `TOOL_ROUTES` is what keeps it out of nav and sitemap.

- [ ] **Step 1: Create the route layout**

Create `src/app/noncombat/player/layout.tsx`:

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Player Handout',
  description: 'A player-safe view of one generated scene — read-aloud text and handout only.',
  robots: { index: false },
};

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
```

- [ ] **Step 2: Create the player page**

Create `src/app/noncombat/player/page.tsx`:

```tsx
'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { generateNoncombat, getNoncombatKinds } from '@/lib/noncombat/generate';
import type { NoncombatKind } from '@/lib/noncombat/generate';
import { toPlayerView } from '@/lib/noncombat/player-view';
import type { PlayerView } from '@/lib/noncombat/player-view';
import { THEME_OPTIONS, TONE_OPTIONS, TIME_OPTIONS } from '@/lib/noncombat/theming';
import type { ThemeChoice, Tone, TimeBudget, Difficulty } from '@/lib/noncombat/types';
import PuzzleHandout from '@/components/PuzzleHandout';
import PrintButton from '@/components/PrintButton';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];

export default function PlayerPage() {
  // useSearchParams requires a Suspense boundary under static prerendering.
  return (
    <Suspense
      fallback={(
        <div className="empty-state" role="status" aria-live="polite">
          Preparing the handout…
        </div>
      )}
    >
      <PlayerScreen />
    </Suspense>
  );
}

function PlayerScreen() {
  const searchParams = useSearchParams();
  const [view, setView] = useState<PlayerView | null>(null);
  const [missing, setMissing] = useState(false);

  // One-shot hydration — the same param contract as the DM share URL.
  useEffect(() => {
    const clampInt = (raw: string | null, lo: number, hi: number): number | null => {
      if (raw === null) return null;
      const n = Number(raw);
      return Number.isInteger(n) ? Math.max(lo, Math.min(hi, n)) : null;
    };
    const seed = clampInt(searchParams.get('seed'), 0, 0x7fffffff);
    if (seed === null) {
      setMissing(true);
      return;
    }
    const KINDS = getNoncombatKinds().map(k => k.value);
    const kindP = searchParams.get('kind');
    const kind = KINDS.includes(kindP as NoncombatKind) ? (kindP as NoncombatKind) : undefined;
    const diffP = searchParams.get('diff');
    const difficulty = DIFFICULTIES.includes(diffP as Difficulty) ? (diffP as Difficulty) : undefined;
    const themeP = searchParams.get('theme');
    const theme = THEME_OPTIONS.some(o => o.value === themeP) ? (themeP as ThemeChoice) : 'any';
    const toneP = searchParams.get('tone');
    const tone = TONE_OPTIONS.some(o => o.value === toneP) ? (toneP as Tone) : 'standard';
    const timeP = searchParams.get('time');
    const timeBudget = TIME_OPTIONS.some(o => o.value === timeP) ? (timeP as TimeBudget) : 'standard';
    const r = generateNoncombat({
      kind, difficulty, theme, tone, timeBudget,
      partyLevel: clampInt(searchParams.get('lvl'), 1, 20) ?? 5,
      partySize: clampInt(searchParams.get('size'), 1, 8) ?? 4,
      seed,
    });
    setView(toPlayerView(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (missing) {
    return (
      <div className="empty-state">
        <p className="micro-label">Player handout</p>
        <h1 className="mt-2 text-xl">This link is missing its scene</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--text-3)]">
          Ask your DM for a fresh player link — it carries everything this page needs.
        </p>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="empty-state" role="status" aria-live="polite">
        Preparing the handout…
      </div>
    );
  }
  return (
    <div className="animate-fade-in mx-auto max-w-3xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-3xl">{view.title}</h1>
        <div className="print:hidden">
          <PrintButton label="Print Handout" />
        </div>
      </div>
      <div className="card border-l-4 border-l-[var(--bronze)]">
        <p className="text-base italic whitespace-pre-line">{view.readAloud}</p>
      </div>
      {view.handout && <PuzzleHandout spec={view.handout} />}
    </div>
  );
}
```

- [ ] **Step 3: Suppress the nav on the player route**

In `src/components/NavBar.tsx`, insert immediately after the `isActive` definition (line 84–85), **after** every hook call so the rules of hooks hold:

```ts
  // The player screen is a handout, not a tool page — no site chrome.
  if (pathname === '/noncombat/player') return null;
```

- [ ] **Step 4: Verify in the browser**

Start the dev server (preview tools, config name from `.claude/launch.json`; create the standard `npm run dev` entry if absent). Visit:
- `/noncombat/player?seed=424242` → gauntlet player view: title, read-aloud with omen, "Scratched into the Wall" handout, **no nav bar**, no DM sections.
- `/noncombat/player` (no params) → the "missing its scene" empty state.
- `/noncombat` → nav bar still present on the DM page.
Check the browser console for errors.

- [ ] **Step 5: Full gate**

Run: `npm test` and `npm run typecheck`
Expected: all pass. (Skip `npm run build` if the dev server is still running — Task 6 builds.)

- [ ] **Step 6: Commit**

```bash
git add src/app/noncombat/player/layout.tsx src/app/noncombat/player/page.tsx src/components/NavBar.tsx
git commit -m "feat(noncombat): player-screen route at /noncombat/player (#50)"
git push
```

---

### Task 5: DM-page Player View toolbar

**Files:**
- Modify: `src/app/noncombat/page.tsx` — extract shared params from `buildShareUrl` (lines 28–39), add `buildPlayerUrl`, add toolbar handlers, render the toolbar card after the shared header card (after line 521)

**Interfaces:**
- Consumes: `toPlayerView`, `playerViewToMarkdown`, `playerViewToJson` from `@/lib/noncombat/player-view`.
- Produces: UI only — no new exports.

- [ ] **Step 1: Extract the shared param builder and add the player URL**

In `src/app/noncombat/page.tsx` replace `buildShareUrl` (lines 28–39) with:

```ts
function buildResultParams(r: NoncombatResult): URLSearchParams {
  const params = new URLSearchParams();
  params.set('seed', String(r.seed));
  if (r.requested.kind) params.set('kind', r.requested.kind);
  if (r.requested.difficulty) params.set('diff', r.requested.difficulty);
  params.set('lvl', String(r.partyLevel));
  params.set('size', String(r.partySize));
  params.set('theme', r.requested.theme);
  params.set('tone', r.tone);
  params.set('time', r.timeBudget);
  return params;
}

function buildShareUrl(r: NoncombatResult): string {
  return `${window.location.origin}/noncombat?${buildResultParams(r).toString()}`;
}

/** The player-safe screen — same param contract, spoiler-free render. */
function buildPlayerUrl(r: NoncombatResult): string {
  return `${window.location.origin}/noncombat/player?${buildResultParams(r).toString()}`;
}
```

Keep the existing contract comment above the functions.

- [ ] **Step 2: Add the toolbar handlers**

Add to the imports: `import { toPlayerView, playerViewToMarkdown, playerViewToJson } from '@/lib/noncombat/player-view';`

Inside `NoncombatBuilder`, next to `handleCopyLink` (after line 240), add:

```ts
  function handleOpenPlayerView() {
    if (!result) return;
    window.open(buildPlayerUrl(result), '_blank', 'noopener');
  }

  function handleCopyPlayerMarkdown() {
    if (!result) return;
    navigator.clipboard.writeText(playerViewToMarkdown(toPlayerView(result))).then(() => {
      setStatusMessage('Player handout markdown copied to the clipboard.');
    }).catch(() => {
      setStatusMessage('The player markdown could not be copied. Please try again.');
    });
  }

  function handleDownloadPlayerJson() {
    if (!result) return;
    const json = playerViewToJson(toPlayerView(result), {
      seed: result.seed,
      playerUrl: buildPlayerUrl(result),
    });
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `player-handout-${result.seed}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
```

- [ ] **Step 3: Render the toolbar card**

Immediately after the shared header card's closing `</div>` (line 521), inside the result `<section>`, add:

```tsx
          {/* Player view — spoiler-safe surface for the table */}
          <div className="card print:hidden">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg mr-auto">Player View</h3>
              <button type="button" onClick={handleOpenPlayerView} className="btn-secondary">Open Player View</button>
              <button type="button" onClick={handleCopyPlayerMarkdown} className="btn-secondary">Copy Player Markdown</button>
              <button type="button" onClick={handleDownloadPlayerJson} className="btn-secondary">Download JSON</button>
            </div>
            <p className="mt-2 text-xs text-[var(--text-2)]">
              Read-aloud and handout only — open it on a shared screen or send the link to your players. Print lives on the player view.
            </p>
          </div>
```

The existing `PuzzleHandout` previews inside both result branches stay exactly where they are.

- [ ] **Step 4: Verify in the browser**

On `/noncombat`: generate a scene of any kind (including a handout-less one like chase — the toolbar must still appear). Open Player View → new tab with the player screen for the same seed. Copy Player Markdown → paste somewhere and check: title, blockquote, no DC/skill text. Download JSON → open the file, check the envelope (`format`, `version`, `seed`, `playerUrl` targeting `/noncombat/player`). Generate a **trap** and confirm both the player tab title and the markdown `#` heading read "The Way Ahead", not the trap name.

- [ ] **Step 5: Full gate**

Run: `npm test` and `npm run typecheck` → all pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/noncombat/page.tsx
git commit -m "feat(noncombat): DM toolbar — open player view, copy player markdown, download JSON"
git push
```

---

### Task 6: Final gate, static-export verification, PR

**Files:** none new — verification + PR.

- [ ] **Step 1: Full gate on a quiet tree**

Stop the dev server first (build and dev share `.next/`). Run:
- `npm run typecheck` → 0 errors
- `npm test` → all suites green
- `npm run lint` → clean (worktree fallback per Global Constraints if it misbehaves)
- `npm run build` → static export succeeds

- [ ] **Step 2: Verify the export artifacts**

- `out/noncombat/player/index.html` exists.
- `Select-String -Path out/sitemap.xml -Pattern 'noncombat/player'` (pwsh) → **no matches** (route stays out of the sitemap).
- The player HTML contains `noindex` robots meta.

- [ ] **Step 3: Browser pass on the static build or dev server**

The full loop once more: generate → Open Player View → reroll → open again (params update) → print preview on the player page (no nav, clean sheet).

- [ ] **Step 4: PR**

```bash
git push
gh pr create --title "Player handout overhaul: spoiler-safe surfaces, player screen, exports" --body "<summary per repo convention — closes #50, closes #134; spec + plan paths; verification results>" --base main
```

Then run the whole-branch review per the repo's established process before asking the user to merge.
