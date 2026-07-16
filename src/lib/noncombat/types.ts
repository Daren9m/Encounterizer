// ─── Shared Non-Combat Types ─────────────────────────────────────
// Lever vocabulary and handout shapes shared by the puzzle and
// challenge generators. Pure types only — no logic, no imports
// besides Rng-free primitives.

export type ThemeId =
  | 'ancient-tomb' | 'wild-frontier' | 'city-streets' | 'noble-court'
  | 'sacred-temple' | 'arcane-sanctum' | 'sea-and-shore' | 'feywild-revel';
export type ThemeChoice = ThemeId | 'any';
export type Tone = 'whimsical' | 'standard' | 'grim';
export type TimeBudget = 'quick' | 'standard' | 'set-piece';
export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export type PuzzleCategory = 'logic' | 'word' | 'physical' | 'minigame' | 'environmental';

export interface ThemePack {
  id: ThemeId;
  label: string;
  descriptors: string[];
  materials: string[];
  sensory: string[];
  symbolSets: string[][];
  glyphStyle: { name: string; flavor: string };
  phrases: string[];            // cipher plaintexts, A–Z + spaces only
  cast: string[];
  rewards: string[];
  consequences: string[];
  creatures: string[];
}

export interface HandoutCell {
  label?: string;                     // symbol/number shown to players
  state?: 'on' | 'off' | 'masked';    // plate grid on/off · sum lock masked
}

export type HandoutSpec =
  | { kind: 'text'; title?: string; body: string }
  | { kind: 'logic-grid'; categories: string[]; items: string[][]; clues: string[] }
  | { kind: 'symbol-sequence'; symbols: string[]; blanks: number[]; options?: string[] }
  | { kind: 'cipher-text'; body: string; scriptName: string; partialKey?: Record<string, string> }
  | { kind: 'grid-diagram'; rows: number; cols: number; cells: HandoutCell[]; legend?: string[] }
  | { kind: 'attempts-ledger'; attempts: { guess: string[]; feedback: string }[]; runeSet: string[] }
  | { kind: 'clue-cards'; cards: { title: string; body: string; vector: string }[] };

/** Every lever resolved to a concrete value (no 'any', no ''). */
export interface ResolvedLevers {
  partyLevel: number;
  partySize: number;
  difficulty: Difficulty;
  theme: ThemePack;
  tone: Tone;
  timeBudget: TimeBudget;
  seed: number;
}
