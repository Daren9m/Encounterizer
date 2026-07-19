# Player Handout Overhaul — Design

**Date:** 2026-07-19 · **Closes:** #50 (player-screen mode) + spoiler-leak fixes
**Status:** Approved (design Q&A 2026-07-19)

## 1. Problem

Player-facing surfaces of the noncombat generator leak DM information. The
flagrant case is the gauntlet handout, which lists every phase upfront with
each escape method and its skill list — the player card is the solution
sheet. The social read-aloud announces the persona's tell ("Their tell:
[quirk]") — the detail players are supposed to earn with an Insight check —
and formats DM-note labels into boxed text. Separately, there is no
player-only surface at all: the handout renders only inside the DM view,
markdown export buries it mid-document under solutions, printing prints the
whole DM page, and there is no JSON export.

## 2. Decisions (user-approved)

1. **Delivery:** dedicated player route (`/noncombat/player?seed=…`) plus a
   toolbar on the DM page (Open player view · Copy player markdown ·
   Download JSON). Print lives on the player page.
2. **Content rule:** the **in-world artifact rule** (§3), enforced by a CI
   lint across all 18 generators.
3. **Coverage:** add handouts only where an in-world artifact is natural —
   contests (wager board) and exploration (rough map). Social, chase, and
   skill challenge stay read-aloud-only; trap deliberately never gets one.

## 3. The in-world artifact rule

Player surfaces (`readAloud`, `handout`, and everything the player view
renders) contain **only what characters could perceive or read in-world**.

- **Never:** skill names, DCs, save DCs, dice notation, numeric bonuses,
  success thresholds, round budgets phrased as mechanics, future-phase
  enumeration, or imperative solution instructions ("Escape: clear the
  sluice grate").
- **Allowed:** sensory description, in-world text (riddles, rules posted on
  a wager board, a ferry keeper's tariff), and **gestures** toward the
  solution — perceivable details that point without instructing ("a sluice
  grate glints beneath the sand").
- In-world quantities characters would genuinely know are fine: the ferry's
  capacity, "best of five falls" posted on a contest board. The test is
  *could a character read or perceive this*, not *is it a number*.
- No allowlist. When the lint flags legitimate prose, the prose gets
  reworded, not the lint weakened.

## 4. Content fixes (four generators)

Every fix preserves the exact count and order of RNG draws, so a given seed
selects the same hazards, personas, contests, and obstacles as before —
only prose changes. Structural golden-pin fields must remain byte-identical.

### 4.1 Gauntlets (the flagrant leak)

- `GauntletHazard` gains **`omen: string`** — the perceivable detail that
  gestures at the escape (Sand Cascade → "beneath the pouring sand,
  something metal rattles — a grate, half-buried"). One omen per hazard,
  data-authored, no RNG draw.
- **Read-aloud:** sensory + chamber + first hazard + first omen. The
  sentence "The only way out: [escape]" is deleted.
- **Handout** becomes a diegetic artifact: a previous victim's scratched
  warning (title stays in-world, e.g. "Scratched into the Wall"), covering
  the **first hazard only** — its danger and its omen, in-world voice. No
  phase list, no skills, no "Escape:".
- DM brief, stages, hints, solution: unchanged (they already carry the full
  mechanics).

### 4.2 Social

- **Read-aloud** rewritten as prose with **zero draws** (unchanged): the
  tell is removed entirely; the speech style is woven in as perceivable
  description rather than a "Their speech:" label.
- The tell stays in the DM-side Insight check and gains an explicit
  `Tell: [quirk]` line in `situation`, so the DM sees it at a glance.

### 4.3 Contests (new handout)

`{ kind: 'text' }` wager-board card — the posted house rules a character
reads in the venue: contest name, "best of N" format (in-world posted
rules, allowed per §3), stakes flavor. No skill names, no challenger bonus,
no DCs. Derived from already-drawn values; zero new draws.

### 4.4 Exploration (new handout)

`{ kind: 'text' }` "A Rough Map" card — a route sketch teasing the
obstacles ahead by their in-world names (waypoint style: "The Sagging Rope
Bridge — then the map goes vague") plus the weather line. No `creative`
routes, no skills, no DCs. Derived from already-drawn obstacles; zero new
draws.

## 5. Projection layer — `src/lib/noncombat/player-view.ts`

The single choke point defining "what players see". Pure functions, no
side effects.

```ts
interface PlayerView {
  title: string;        // per-kind policy below
  readAloud: string;
  handout?: HandoutSpec;
}
toPlayerView(result: NoncombatResult): PlayerView
playerViewToMarkdown(view: PlayerView): string
playerViewToJson(view: PlayerView, meta: PlayerViewMeta): string
```

- **Title policy:** `result.name` for every kind except **trap**, which
  gets the fixed neutral title "The Way Ahead" — trap frames' names
  describe the mechanism and would spoil it. (Gauntlet names are safe: they
  name the perceivable hazard.)
- The player view carries **no kind label, no difficulty, no metadata** —
  a "Trap / Hazard" caption would itself be a spoiler.
- **Markdown shape:** `# title` → blockquoted read-aloud → `## [handout
  title]` + `handoutToText` when a handout exists.
- **JSON shape** (`PlayerViewMeta` supplies seed/params):

```json
{
  "format": "encounterizer-player-handout",
  "version": 1,
  "seed": 123456789,
  "playerUrl": "https://…/noncombat/player?seed=…",
  "title": "…", "readAloud": "…",
  "handout": { …HandoutSpec… }
}
```

`playerUrl` points at the **player** route, never the DM route. Note: the
seed is inherently visible in any shared URL; a determined player can
reconstruct the DM view. That is accepted — this is a trust-based table
tool with no server and no secrets, the same threat model as handing
players a module PDF. No obfuscation (it would be theater).

## 6. Player route — `/noncombat/player`

- **URL contract:** identical params to the DM share URL
  (`?seed=&kind=&diff=&lvl=&size=&theme=&tone=&time=`); replays the seed
  through `generateNoncombat` exactly like share-link hydration, then
  projects through `toPlayerView`. Missing/invalid params fall back the
  same way the DM page does.
- **Rendering:** title, read-aloud panel, rendered handout
  (`PuzzleHandout`), Print button. Nothing else — no levers, no history,
  no DM sections.
- **Chrome:** the site nav suppresses itself on this path (mechanism
  decided in the plan — NavBar pathname check). Footer stays (attribution
  link; harmless).
- **Static export:** client page with Suspense + `useSearchParams`, same
  pattern as `/noncombat`.
- **Discoverability:** NOT added to `site.ts` routes → never in nav,
  sitemap, or homepage. Route `layout.tsx` sets title and
  `robots: noindex`.

## 7. DM-page toolbar

The DM page's handout section becomes a **Player View** section, present
for every result (not only when a handout exists):

- **Open player view** — new tab, current result's full param set.
- **Copy player markdown** — `playerViewToMarkdown` to clipboard.
- **Download JSON** — Blob download, filename `player-handout-<seed>.json`.
- Rendered handout preview (as today) when present.

The DM's existing full markdown export and full-page print are unchanged
(they may keep the handout section inline).

## 8. Tests

1. **Spoiler lint** (new, CI-blocking): for all 18 generators × spread
   seeds (`(i+1)*104729` spacing) × lever variations, assert player
   surfaces (readAloud + handoutToText + playerViewToMarkdown) match none
   of: `/DC ?\d/`, any of the 18 capitalized skill names as whole words,
   `/\+\d/`, dice notation `/\bd(4|6|8|10|12|20)\b/`, `/Escape:/`,
   `/Phase [2-9]/`, `/\b(group check|opposed check|saving throw)\b/i`.
   False positives are fixed by rewording content, never by allowlisting.
2. **Projection units:** trap → "The Way Ahead"; non-trap → `result.name`;
   markdown/JSON shapes; JSON `playerUrl` targets the player route.
3. **Content units:** gauntlet handout references only the first hazard
   and contains its omen; social read-aloud lacks the quirk while the
   Insight check and situation retain it; contests/exploration handouts
   exist and are lint-clean.
4. **Pins:** golden pins re-pinned only where prose changed
   (gauntlets, social); structural fields (generator key, selected
   hazard/persona/contest identities) must be byte-identical before/after,
   proving draw-sequence preservation.

## 9. Seed-contract impact

No RNG draws are added, removed, or reordered anywhere. The frozen draw
order (difficulty → theme → generator → construction) and the LCG are
untouched. Existing share links replay to the same structural encounter;
their prose improves. `omen` is a data field, not a draw.

## 10. Non-goals

- No handouts for trap (would spoil), chase, social, skill challenge
  (forced artifacts).
- No seed obfuscation.
- No player-route entry in nav/sitemap.
- No changes to DM-side export/print formats.
- No new HandoutSpec kinds — contests and exploration use `text`.

## 11. Process

Branch `feature/player-handouts` off `main` (post-#84). GitHub: new issue
for the spoiler leaks; this work closes it and #50 under an "Engine v2
Polish" milestone. Standard gate: typecheck, lint, full test suite, static
build, live browser pass of both routes.
