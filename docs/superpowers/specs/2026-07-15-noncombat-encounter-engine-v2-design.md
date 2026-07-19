# Non-Combat Encounter Engine v2 — Design

- **Date:** 2026-07-15
- **Status:** Approved design, pre-implementation (rev 2 after adversarial self-review)
- **Branch:** `claude/puzzles-challenges-enrichment-552363`
- **Pages affected:** `/puzzles`, `/challenges`

## 1. Summary

Rebuild the puzzle and challenge generators around a shared engine core so that
every lever visibly reshapes output, every **constructive** puzzle is
machine-verified solvable (most with provably unique solutions), and the
content corpus is large enough that repeats feel rare. Both pages stay
separate tools; they share levers, theming, seeded generation, and handout
rendering underneath.

User-approved decisions this design implements:

1. **Two pages, shared engine** — `/puzzles` and `/challenges` remain distinct.
2. **Five levers** — theme, tone, time budget, shareable seeds, and a
   **party size** selector that genuinely changes output.
3. **Corpus + constructive engines** — curated riddle/scenario content plus
   real algorithmic generators with verified solutions.
4. **Rich rendered handouts** — logic grids, cipher text, symbol sequences
   rendered on screen and print-ready.

## 2. Goals

- Every output is table-ready without editing: read-aloud, DM brief, hints,
  solution, failure consequence, reward — complete and internally consistent.
- Levers transform **structure**, not just numbers (bigger puzzles, more
  phases, different registers — not merely different DCs).
- Constructive puzzle engines verify their own solutions before returning.
- Same seed + same levers ⇒ byte-identical output, forever (replayable links).
- Content is strictly SRD-safe: public-domain/traditional riddles or original
  compositions only. Remove existing copyrighted text (see §7.3).

## 3. Non-goals

- No player-facing screen mode (fast-follow candidate, tracked as backlog).
- No AI/LLM-generated content at runtime; everything is deterministic.
- No images or canvas rendering; handouts are styled HTML (one small webfont
  asset is permitted, see §9).
- No changes to the combat encounter builder, the map generator, or the LCG
  in `src/lib/random.ts` (load-bearing for shared links).
- No server code (static export constraint).

## 4. Current state and problems

| | Puzzles | Challenges |
|---|---|---|
| Engine | 6 fixed templates | 4 types × 6–8 scenario stubs |
| Pools | 12 riddles, 5 ciphers, 6 sequences, 6 contests, 5 hazards | 8 NPCs, 6 obstacles, 6 objectives, 6 traps |
| Levers | category, difficulty, party level | type, difficulty, party level |
| Lever effect | filter templates; scale DC/gold | scale DC, success count, damage dice |

Problems fixed by this design:

- **P1** Levers select content instead of shaping it; category+difficulty pairs
  often map to exactly one template.
- **P2** Empty filter combinations silently fall back to the full template pool
  (user's filters ignored without notice).
- **P3** No seed sharing; IDs and seeds derive from `Date.now()`.
- **P4** Two riddles are verbatim from *The Hobbit* (the "roots as nobody
  sees" mountain riddle and the "voiceless it cries" wind riddle,
  `src/lib/puzzle-generator.ts:56-57`) — copyrighted text on a public site.
- **P5** Contest NPC bonus scales as `level + 2` (a +22 at level 20 — absurd).
- **P6** Party size does not exist as an input anywhere.

## 5. Architecture

```
src/lib/noncombat/                 shared engine core (pure functions only)
  types.ts                         lever types, HandoutSpec, shared fields
  levers.ts                        DC math, tiers, damage severity,
                                   party-size math, structural scaling
  theming.ts                       theme-pack lookup + skinning helpers
src/lib/puzzle-engines/            constructive generators, one per family
  knights-knaves.ts  logic-grid.ts  rune-lock.ts   river-crossing.ts
  plate-grid.ts      sum-lock.ts    sequence.ts    cipher.ts
  tile-path.ts       riddle-frames.ts  contests.ts  gauntlets.ts
  index.ts                         registry: family → categories, difficulties
src/lib/puzzle-generator.ts        orchestrator (public API, extended options)
src/lib/noncombat-generator.ts     orchestrator for six challenge types
src/data/
  riddles.ts                       ≥100 tagged riddles (curated corpus)
  noncombat-themes.ts              8 theme packs (incl. per-theme cipher
                                   phrase banks, see §6.5)
  noncombat-cast.ts                NPC persona/want/secret/leverage matrices,
                                   social complication + interruption pools
  noncombat-scenarios.ts           skill-challenge objectives, exploration
                                   obstacles, trap frames, contest types +
                                   side events, gauntlet hazard/escape pools,
                                   chase quarries + waypoint complications,
                                   investigation truth frames
src/components/PuzzleHandout.tsx   renders every HandoutSpec kind
public/fonts/                      subsetted runic webfont (§9)
```

Rules:

- Everything under `src/lib/` stays pure (no DOM, storage, network, Date.now).
- Content lives in `src/data/` (same split as `class-templates.ts`).
- Engines never call `Date.now()`; IDs derive from the seed
  (e.g. `puzzle-${seed}-${familyKey}`).
- Both orchestrators keep their existing exported names and accept a superset
  of the old options objects (all new fields optional with defaults). Result
  types keep **every** existing field (see §11 for how `playerHandout`
  stays alive), so any external caller keeps compiling and rendering.

### 5.1 Generation pipeline

```
levers → orchestrator picks the family: a single seeded uniform draw over
the deduplicated list of eligible families (registry filtered by
category/type + difficulty; category "Any" ⇒ all families eligible).
Never silently falls back — every combination has real coverage by
construction, and the pick order is part of the frozen determinism
contract, like the LCG.
       → family constructs an instance (seeded draws)
       → family verifies the instance (solvable / unique / size-in-band)
       → on verification failure: re-draw from the same rng stream
         (bounded, ≤100 attempts; then fall back to the family's known-good
         canonical construction — never throws)
       → theming layer skins flavor text, symbols, rewards, consequences
       → orchestrator assembles the final Puzzle / NoncombatEncounter
```

Rejection sampling keeps constructions simple because verification is
authoritative. Search spaces are tiny (≤2⁴ truth assignments, ≤4!³ grid
arrangements), so brute-force verification is microseconds.

## 6. Levers

All levers are shared by both pages. Defaults preserve current page behavior.

| Lever | Range / values | Default |
|---|---|---|
| Party level | 1–20 | 5 |
| Party size | 1–8 | 4 |
| Difficulty | Easy / Medium / Hard; `/puzzles` additionally keeps its existing "Any" option (seeded pick) | puzzles: Any · challenges: Medium |
| Theme | 8 packs + Any | Any (seeded pick, §6.5) |
| Tone | Whimsical / Standard / Grim | Standard |
| Time budget | Quick / Standard / Set piece | Standard |
| Seed | 0–0x7FFFFFFF | fresh via `randomSeed()` |

A stored `''` in the retained `puzzleDifficulty` preference key keeps meaning
"Any"; the challenges page keeps its no-Any difficulty select. Category/type
"Any" options survive on both pages.

### 6.1 DC math (centralized in `levers.ts`, formula unchanged)

`base = 10 + floor(level / 2)`; Easy −2, Medium +0, Hard +3. Existing outputs
keep their DC scale. Difficulty labels stay Easy/Medium/Hard (per project
rules these refer to skill-check DCs, distinct from combat's Low/Moderate/High).
When difficulty is "Any", the seeded difficulty pick happens before DC math;
everything downstream sees a concrete difficulty.

### 6.2 Damage severity (new, replaces ad-hoc dice)

Tier bands with Setback / Dangerous / Deadly columns. Values are adapted from
the 2014 DMG "Damage Severity by Level" ladder — the 2024 DMG collapses trap
severity to Nuisance/Deadly, which is too coarse to drive three difficulties.
This table is ours and is test-locked:

| Level band | Setback | Dangerous | Deadly |
|---|---|---|---|
| 1–4 | 1d10 | 2d10 | 4d10 |
| 5–10 | 2d10 | 4d10 | 10d10 |
| 11–16 | 4d10 | 10d10 | 18d10 |
| 17–20 | 10d10 | 18d10 | 24d10 |

Column selection rule, for **all** generators:

- **One-time climactic harm** (trap triggers, exploration obstacle failure,
  skill-challenge final failure) maps difficulty → column:
  Easy→Setback, Medium→Dangerous, Hard→Deadly.
- **Recurring / per-round harm** (puzzle wrong-answer zaps, hazard ticks,
  chase complications, gauntlet rounds) always uses the Setback column —
  repeated punishment stays soft; one-shot punishment lands hard.

### 6.3 Party-size math (new)

- **Skill challenge successes needed** (before 3 failures):

  `successes = clamp(base(timeBudget) + diffOffset, 3, 12)` where
  `base` = Quick: `ceil(partySize × 0.75)` · Standard: `partySize` ·
  Set piece: `partySize + 2`, and `diffOffset` = Easy −1, Medium 0, Hard +1.

  Set pieces split successes across phases: `phases = 2` if
  `successes ≤ 7`, else `3`; successes divide as evenly as possible with the
  larger share in the final phase.
- **Group checks** (2024 rule): group succeeds if at least `ceil(partySize/2)`
  members succeed. Emitted wherever "everyone tries" fits.
- **Simultaneous mechanisms**: instances draw an operator count `k`
  (Easy: 2, Medium: 2–3, Hard: 3–4, seeded) and require
  `min(partySize, k)` simultaneous operators; the text says how many hands
  are needed and what substitutes (weights, rope) if the party is short.
- **Contests**: best-of rounds = 3 (Quick) / 5 (Standard) / 7 (Set piece);
  side events generated so non-competing party members have actions.
  Opponent bonus becomes `2 + floor(level / 2)` (fixes P5; max +12).
- **Social scenes**: 1 principal NPC + `min(partySize − 1, 3)` side NPCs, each
  with a one-line want, so every player has someone to work.

### 6.4 Structural difficulty

Difficulty changes size and composition per family — grid dimensions, number
of speakers, clue directness, red-herring count — per the locked table in
§7.1 and the framework parameters in §8. Difficulty also sets the hint
**register**: Easy hints are gentle and direct; Hard hints are oblique.
Hint **count** belongs to time budget alone (§6.7).

### 6.5 Theme packs (`src/data/noncombat-themes.ts`)

```ts
type ThemeId =
  | 'ancient-tomb' | 'wild-frontier' | 'city-streets' | 'noble-court'
  | 'sacred-temple' | 'arcane-sanctum' | 'sea-and-shore' | 'feywild-revel';

interface ThemePack {
  id: ThemeId;
  label: string;                // "Ancient Tomb", "Wild Frontier", ...
  descriptors: string[];        // room/space adjectives
  materials: string[];          // stone, brass, coral, bone...
  sensory: string[];            // smells, sounds, light quality
  symbolSets: string[][];       // themed symbol vocabularies for puzzles
  glyphStyle: { name: string; flavor: string };  // cipher framing
  phrases: string[];            // cipher plaintext bank fitting the theme
  cast: string[];               // NPC descriptors fitting the theme
  rewards: string[];            // themed reward flavor
  consequences: string[];       // themed setback flavor
  creatures: string[];          // SRD-safe creature references
}
```

The theming layer touches read-aloud vocabulary, puzzle symbols, cipher
script framing and plaintexts, NPC casts, clue/complication descriptions,
rewards, and consequences. It changes **text only** — never structural
choices (e.g. investigation discovery-vector kinds are chosen structurally,
then described in theme voice).

`theme: 'any'`: the share URL always serializes the lever **as the user set
it** (`theme=any`); the concrete pack is derived from the seed in a dedicated
draw at a fixed pipeline position, so an `any` link replays byte-identically.
Output for `theme=any&seed=S` is not required to equal
`theme=<pack>&seed=S`.

### 6.6 Tone registers

Invariant (test-locked): tone never changes DCs, success counts, damage
dice values, or structure sizes — it selects which **consequence template**
is emitted:

- **Whimsical:** failure consequences replace damage with non-damage
  setbacks (embarrassment, comic complications, social cost); rewards
  playful.
- **Standard:** current register; failure emits §6.2 damage.
- **Grim:** failure emits §6.2 damage **plus** a lasting-cost rider drawn
  from a pool (exhaustion, scars, marks, debts); rewards come with strings
  attached.

### 6.7 Time budget

- **Quick (~5–10 min):** single stage, smallest structure sizes, **2 hints**.
- **Standard (~15–20 min):** current scale, **3 hints**.
- **Set piece (~30+ min):** multi-phase (2–3 stages / obstacle chains /
  sub-puzzles), **4 hints**, extra complication.

Time budget owns hint count; difficulty owns hint register (§6.4).

### 6.8 Seeds and share links

Same pattern as the encounter builder: visible seed with reroll; a share
button builds the full-state URL and copies it. Param contracts (permanent):

- `/puzzles?seed=&cat=&diff=&lvl=&size=&theme=&tone=&time=`
- `/challenges?seed=&type=&diff=&lvl=&size=&theme=&tone=&time=`

Hydration is one-shot on load. Validation split: numeric params that parse
but fall out of range are **clamped** into range (`lvl=25` → 20, `size=0` →
1); unparseable values and unknown enum values (`theme=xyzzy`) are
**dropped** and take the default. As on `/encounters`, the page body using
`useSearchParams` sits under a Suspense boundary (static prerender
requirement), and persisted lever state is declared before the one-shot
URL-hydration effect so shared links override stored preferences.

## 7. Puzzles page

### 7.1 Engine families

Twelve families. Each declares eligible categories and supports all three
difficulties via size scaling — so **every category × difficulty combination
has ≥2 eligible families** (fixes P1/P2; the registry test asserts this).

| Family | Categories | Construction | Verification | Handout |
|---|---|---|---|---|
| Knights & Knaves | logic | 2–4 guardians, random truth assignment, statements from a grammar (accusations, self-reference, conjunctions) | brute-force all 2^N assignments; exactly 1 consistent | text |
| Logic grid | logic | 3–4 categories × 3–4 items; solution first, then clue set (positive/negative/relational links) greedily pruned | uniqueness re-check after each prune (brute force) | logic-grid |
| Rune lock (Mastermind) | logic, physical | secret combination (k runes of n); generate "previous attempts" with correct-symbol/correct-place feedback | exactly 1 combination consistent with all attempts | attempts-ledger |
| River crossing | logic, environmental | items + incompatibility constraints (X alone with Y), boat capacity | BFS state graph: solvable, min-moves within difficulty band | text |
| Sequence lock | logic | rule grammar: arithmetic, alternation, interleaved, cyclic-symbolic; distractor options drawn and verified | enumerate all rule-grammar instances matching the visible terms; all must agree on the blank(s), else redraw; distractors verified to fit no matching rule | symbol-sequence |
| Cipher suite | word | Caesar / Atbash / keyword / symbol substitution; plaintext from the theme pack's phrase bank; partial-key handout at Easy | decodable by construction | cipher-text |
| Riddle frames | word, minigame | corpus draw filtered by obscurity + theme; frames: riddle door, sphinx duel, best-of-3 contest | corpus lint (§7.2); not a solvability proof | text |
| Plate grid (Lights-Out) | physical | k **distinct** cell presses backward from the solved state (distinctness keeps the effective solution length k after mod-2 cancellation) | always solvable; the construction is **one valid solution** (press matrices on 4×4/5×5 are singular, so alternates may exist — solution text says "one solution") | grid-diagram |
| Sum lock / magic square | physical | magic-square construction, mask m cells | unique completion (brute force over masked cells) | grid-diagram |
| Tile path | physical | safe path generated on grid + decoy pattern (evolves the existing Deadly Floor) | enumerate all traversable paths consistent with the ceiling clue (DFS); exactly 1 must exist, else redraw decoys | grid-diagram |
| Contests | minigame | contest type × theme × party-size round structure (§6.3) | n/a (structured content) | text |
| Hazard gauntlets | environmental | hazard × escape mechanism × phase count from time budget | n/a (structured content) | text |

**Locked difficulty → size table** (pinned in tests; monotone growth is the
invariant, exact values below are the contract):

| Family | Easy | Medium | Hard |
|---|---|---|---|
| Knights & Knaves | 2 speakers | 3 speakers | 4 speakers |
| Logic grid | 3 cat × 3 items | 3 cat × 4 items | 4 cat × 4 items |
| Rune lock (n symbols, k slots, attempts) | (4, 3, 3) | (5, 3, 4) | (6, 4, 4) |
| River crossing (min moves) | 3–5 | 6–9 | 10–14 |
| Sequence lock | single rule, 4 terms shown | alternation/cycle, 5 terms | interleaved rules, 6 terms |
| Cipher suite | Caesar or Atbash (+ partial key) | keyword | symbol substitution |
| Riddle frames (obscurity) | 1 | ≤2 | 2–3 |
| Plate grid | 3×3, k=3 | 4×4, k=4 | 5×5, k=5 |
| Sum lock (masked cells of 3×3) | 3 | 4 | 5 |
| Tile path (grid, path length) | 4×4, 4 | 5×5, 5 | 6×6, 7 |
| Contests (opponent bonus) | +⌊lvl/2⌋ | +2+⌊lvl/2⌋ | +4+⌊lvl/2⌋ |
| Hazard gauntlets (escape window, rounds) | 6 | 5 | 4 |

Sequence-lock distractor options render in the handout (`options`, §9) and
the read-aloud; the DM solution states the rule and why each distractor
fails.

### 7.2 Riddle corpus (`src/data/riddles.ts`)

```ts
interface RiddleEntry {
  id: string;
  text: string;
  answer: string;
  altAnswers: string[];     // accepted alternates ("a map" / "map")
  obscurity: 1 | 2 | 3;     // 1 = well-known, 3 = obscure
  themes: ThemeId[];        // packs where it fits especially well ([] = all)
  origin: 'traditional' | 'original';
}
```

- **Size:** ≥100 entries at launch.
- **Sourcing policy:** traditional/anonymous folk riddles, paraphrases of
  public-domain sources, and original compositions. Never verbatim text
  from copyrighted works — and paraphrases of old sources (e.g. the Exeter
  Book) must derive from the public-domain original, never from a modern
  translation's wording (translations carry their own copyright).
- Difficulty mapping: Easy → obscurity 1; Medium → ≤2; Hard → 2–3.
- Riddle frames give the DM adjudication notes (accept close synonyms; what
  to do on a clever wrong answer).

### 7.3 Licensing remediation

The two verbatim *Hobbit* riddles in the current pool are removed. A corpus
lint test maintains a denylist of distinctive copyrighted phrases (starting
with the known Tolkien lines) and fails CI if any entry matches. Matching is
**normalized** (lowercase, punctuation and whitespace stripped) so simple
reformatting cannot evade it. This is the same discipline as the SRD-only
bestiary.

## 8. Challenges page — six frameworks

Types: `social | exploration | skill-challenge | trap | chase | investigation`
(chase and investigation are new).

1. **Skill challenge** (centerpiece). Success count and phasing per §6.3,
   complication ladder (escalation fires at the 1st and 2nd failure), skill
   palette spread across ≥4 different ability scores so every PC has a lane,
   one group-check moment, per-skill success/failure narration hooks.
2. **Social encounter.** Principal NPC = persona (archetype × quirk × speech
   note) × want × secret × **leverage** (what actually moves them: coin,
   flattery, threat, logic, favor, secret-for-secret). Three-state attitude
   track (Hostile / Indifferent / Friendly, per the 2024 influence rules)
   with shift conditions and what each state unlocks (§11 shape). Side NPCs
   per §6.3. Complication + third-party interruption pools
   (`noncombat-cast.ts`).
3. **Exploration / journey.** Obstacle chains (1 / 2 / 3 obstacles by time
   budget), terrain × weather × theme, resource costs (time, exhaustion,
   supplies), tier-aware creative-solution menu ("at tier 3+, assume fly /
   teleport — here is how the obstacle stays interesting").
4. **Trap / hazard.** Complex traps: trigger, initial effect + escalation,
   countermeasure steps using different skills (Easy/Medium: 2 steps,
   Hard: 3), detection clues placed before the trigger, reset behavior,
   twist. Damage per §6.2.
5. **Chase** *(new)*. Quarry profile (speed, tricks, desperation move); a
   pool of 6–8 themed waypoint complications, **one drawn per round**;
   rounds = 3 (Quick) / 5 (Standard) / 7 (Set piece); catch/escape
   conditions with concrete check math; party-size lane notes (who's ahead,
   who handles obstacles).
6. **Investigation** *(new)*. Generated truth (culprit/method/motive) +
   clue web honoring the **three-clue rule**: revelation nodes = 2 (Quick) /
   3 (Standard) / 4 (Set piece); ≥3 clues per node, each clue with a
   discovery vector (scene, NPC, document, observation — vector kinds chosen
   structurally, spread across kinds, then described in theme voice);
   exactly one red herring with its disconfirming clue. Difficulty controls
   clue directness and red-herring subtlety. Output: DM clue-web summary +
   clue-cards handout.

## 9. Handout rendering

```ts
interface HandoutCell {
  label?: string;                       // symbol or number shown to players
  state?: 'on' | 'off' | 'masked';      // plate grid: on/off · sum lock: masked = fill me in
}

type HandoutSpec =
  | { kind: 'text'; title?: string; body: string }
  | { kind: 'logic-grid'; categories: string[]; items: string[][]; clues: string[] }
  | { kind: 'symbol-sequence'; symbols: string[]; blanks: number[]; options?: string[] }
  | { kind: 'cipher-text'; body: string; scriptName: string; partialKey?: Record<string, string> }
  | { kind: 'grid-diagram'; rows: number; cols: number; cells: HandoutCell[]; legend?: string[] }
  | { kind: 'attempts-ledger'; attempts: { guess: string[]; feedback: string }[]; runeSet: string[] }
  | { kind: 'clue-cards'; cards: { title: string; body: string; vector: string }[] };
```

`grid-diagram` producers: plate grid uses `state: 'on' | 'off'`; sum lock
uses `label` for given numbers and `state: 'masked'` for blanks; tile path
uses `label` for tile symbols (the safe path is DM-only and never appears in
the handout — it lives in the solution text).

`PuzzleHandout.tsx` renders every kind inside the existing `light-island`
print-friendly card: logic grids as fillable tables, plate grids as bordered
cell diagrams, rune text as Unicode runic glyphs (U+16A0 block). Because
stock Android and some Linux systems ship no runic coverage (identical tofu
boxes would make distinct runes indistinguishable), we ship a subsetted
OFL-licensed webfont (Noto Sans Runic, U+16A0–16F8 — a few KB in
`public/fonts/`) so rendering is deterministic cross-platform.

Letter-mapping legends are **DM-facing only** (they render in the solution /
DM brief, since for substitution ciphers the mapping is the puzzle); player
handouts show glyphs plus `partialKey` exactly where §7.1 grants it (cipher
family at Easy). Print output uses the existing print-mode blocks
(everything expanded).

## 10. Page UI changes

Both pages gain the same control row extensions:

- New selects: Theme, Tone, Time budget; new Party size number input
  (1–8) beside Party level.
- Seed chip: shows current seed, click to reroll; **Share Link** button
  copies the full-state URL (§6.8) with copied-state feedback.
- Existing Generate / Regenerate / Export Markdown / Print buttons stay.
  Export markdown includes the new fields and the plain-text rendering of
  the handout (the same renderer that populates `playerHandout`, §11).
- History cards add theme + time badges. History storage keys bump:
  `puzzleHistory` → `puzzleHistory2`, `challengeHistory` → `challengeHistory2`
  (old-shape items would render with holes; retiring old history is the
  cleanest cut — lever preferences keep their existing keys, and new lever
  keys are additive).
- `src/lib/site.ts` route copy for both pages updated to name the new
  capabilities (nav, sitemap, homepage cards derive from it).

## 11. Result types

`Puzzle` gains: `seed`, `theme`, `tone`, `timeBudget`, `partySize`,
`handout?: HandoutSpec`, `stages?: { title: string; text: string }[]`
(set-piece phases), `dmAdjudication?: string` (riddle frames).
`playerHandout?: string` **stays** and is populated with the plain-text
rendering of `handout` (deprecated in favor of `handout`; the markdown
export uses the same rendering) — so "keep every existing field" holds
literally and current readers keep working.

`NoncombatEncounter` gains the same lever echo fields
(`seed/theme/tone/timeBudget/partySize`), `handout?: HandoutSpec`, plus:

```ts
structure?: {                       // skill challenges
  phases: { title: string; successes: number; primarySkills: string[] }[];
  successesNeeded: number;          // total across phases
  failuresAllowed: number;          // 3
};
attitudeTrack?: {                   // social
  start: 'Hostile' | 'Indifferent' | 'Friendly';
  stages: {
    attitude: 'Hostile' | 'Indifferent' | 'Friendly';
    influenceDc: number;
    unlocks: string;                // what this state makes possible
    shiftUp: string;                // what moves the NPC one step friendlier
    shiftDown: string;              // what sours them one step
  }[];
};
clueWeb?: {                         // investigation
  truth: { culprit: string; method: string; motive: string };
  nodes: {
    revelation: string;
    clues: { text: string; vector: 'scene' | 'npc' | 'document' | 'observation'; pointsTo: string }[];
  }[];
  redHerring: { text: string; disconfirmedBy: string };
};
chase?: {                           // chase
  rounds: number;
  complications: { round: number; text: string; check: string }[];
  catchCondition: string;
  escapeCondition: string;
};
```

All new fields are additions; both types keep every existing field so the
display components extend rather than fork.

## 12. Testing strategy

New test files: `puzzle-engines.test.ts`, `noncombat-generator.test.ts`,
`riddles.test.ts`, `noncombat-levers.test.ts` (Vitest, joins the existing
suite).

- **Property tests per constructive engine** (200+ seeds each): always
  solvable; unique where promised (K&K, logic grid, rune lock, sum lock,
  sequence blanks, tile-path clue-consistent path); river-crossing min-moves
  in band; plate-grid press set distinct (effective length k); size within
  the §7.1 locked table.
- **Determinism:** same seed + levers ⇒ `JSON.stringify`-identical output,
  including the `theme=any` and `difficulty=Any` paths; distinct seeds
  produce distinct outputs (sampled).
- **Lever influence:** difficulty changes structure size (per locked table);
  theme changes vocabulary (symbols drawn from the pack); party size changes
  success math and mechanism counts; time budget changes phase/hint counts;
  tone selects the consequence template (Whimsical: no damage dice in
  failure text; Grim: damage + lasting-cost rider) without changing DCs or
  sizes.
- **Registry coverage:** every category × difficulty has ≥2 eligible
  families; orchestrator never falls back silently.
- **Corpus lint:** ≥100 riddles, unique texts, non-empty answers, valid
  theme tags, normalized denylist scan (§7.3).
- **Severity table lock:** §6.2 values and the column-selection rule pinned.
- **Party-size math lock:** §6.3 formulas pinned (successes, phases, group
  check threshold, contest rounds).

## 13. Delivery

Two PRs under a new milestone **"Non-Combat Encounter Engine v2"**:

1. **PR 1 — Core + Puzzles:** `src/lib/noncombat/`, all puzzle engines,
   riddle corpus, theme packs, handout renderer + runic font asset, puzzles
   page UI, seeds/share links, licensing remediation, tests.
2. **PR 2 — Challenges:** six frameworks, cast/scenario data, challenges
   page UI, tests.

Issues created per PR plus a backlog issue for the player-screen mode
fast-follow. Conventional commits; CI (typecheck, lint, test, build) must
pass; no changes to `random.ts`.

## 14. Risks and mitigations

- **Corpus quality drift** (bland riddles, repeated flavor): mitigate with
  tagged metadata, obscurity ratings, and review during PR.
- **Runic glyph rendering varies by platform:** shipped subsetted webfont
  (§9) makes rendering deterministic; legends are DM-facing and
  authoritative for decoding.
- **Bundle growth:** all content is plain strings plus one ~few-KB font
  (~100–150 KB pre-gzip worst case) — negligible against the 331-monster
  bestiary already shipped.
- **Verification loops failing to converge:** bounded retries with canonical
  fallback constructions guarantee termination (§5.1).
- **Old localStorage shapes:** history keys bumped (§10); lever keys are new
  or unchanged-compatible (`''` difficulty still means Any on puzzles).
