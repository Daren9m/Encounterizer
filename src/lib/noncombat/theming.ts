// ─── Theming & Tone ──────────────────────────────────────────────
// Theme resolution and the tone consequence templates. Tone never
// changes DCs, dice values, or structure sizes — it selects which
// consequence template is emitted (spec §6.6).

import { THEME_PACKS } from '../../data/noncombat-themes';
import { pickRandom as pick } from '../random';
import type { Rng } from '../random';
import type { ResolvedLevers, ThemeChoice, ThemePack, TimeBudget, Tone } from './types';
import { damageDice, dcFor } from './levers';

export function resolveTheme(choice: ThemeChoice, rng: Rng): ThemePack {
  if (choice !== 'any') return THEME_PACKS.find(p => p.id === choice) ?? THEME_PACKS[0];
  return pick(THEME_PACKS, rng);
}

const WHIMSY_SETBACKS = [
  'the mechanism douses the offender in harmless but vivid dye that lasts a tenday',
  'a chorus of tiny enchanted voices loudly mocks the attempt',
  "the offender's boots are magically swapped to the wrong feet until the ordeal is overcome",
  'a puff of glitter marks the culprit — locals will recognize it and grin',
  'the room applauds sarcastically; morale, not hit points, takes the hit',
  'the offender must speak in rhyme until the next dawn (or until the party sets things right)',
];

const GRIM_RIDERS = [
  'and the victim gains 1 level of exhaustion',
  'and the wound refuses magical healing until the next dawn',
  "and a black mark appears on the victim's hand — something now knows their name",
  "and the victim's next long rest grants no benefit unless the wrong is set right",
  'and something in the dark marks the sound, and begins to move closer',
  'and the victim owes the place a debt it will collect at the worst moment',
];

export function failureText(
  levers: ResolvedLevers,
  rng: Rng,
  opts: { kind: 'climactic' | 'recurring'; context: string; save?: string },
): string {
  const themed = pick(levers.theme.consequences, rng);
  if (levers.tone === 'whimsical') {
    return `${opts.context} ${cap(pick(WHIMSY_SETBACKS, rng))}. Also: ${themed}.`;
  }
  const dice = damageDice(levers.partyLevel, levers.difficulty, opts.kind);
  const save = opts.save
    ? ` (DC ${dcFor(levers.partyLevel, levers.difficulty)} ${opts.save} save for half)`
    : '';
  const core = `${opts.context} ${dice} damage${save}, ${themed}`;
  if (levers.tone === 'grim') return `${core} — ${pick(GRIM_RIDERS, rng)}.`;
  return `${core}.`;
}

export function rewardText(levers: ResolvedLevers, rng: Rng): string {
  const themed = pick(levers.theme.rewards, rng);
  if (levers.tone === 'grim') return `${themed} — though taking it feels like signing something.`;
  if (levers.tone === 'whimsical') return `${themed}, presented with entirely unnecessary ceremony.`;
  return themed;
}

/** Capitalize the first letter of a prose fragment. */
export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Prefix a noun phrase with the agreeing indefinite article. */
export function withArticle(phrase: string): string {
  return `${/^[aeiou]/i.test(phrase) ? 'an' : 'a'} ${phrase}`;
}

export const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: 'any', label: 'Any Theme' },
  ...THEME_PACKS.map(p => ({ value: p.id as ThemeChoice, label: p.label })),
];

export const TONE_OPTIONS: { value: Tone; label: string }[] = [
  { value: 'whimsical', label: 'Whimsical' },
  { value: 'standard', label: 'Standard' },
  { value: 'grim', label: 'Grim' },
];

export const TIME_OPTIONS: { value: TimeBudget; label: string }[] = [
  { value: 'quick', label: 'Quick (~5–10 min)' },
  { value: 'standard', label: 'Standard (~15–20 min)' },
  { value: 'set-piece', label: 'Set piece (~30+ min)' },
];

/** Elder Futhark, U+16A0–U+16B8 range subset — 24 glyphs. */
export const RUNE_GLYPHS: string[] = [
  'ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ',
  'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛜ', 'ᛞ', 'ᛟ',
];
