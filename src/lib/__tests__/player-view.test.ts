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
  it('investigation clue cards stay DM-side — the deck is dealt one card at a time', () => {
    const r = generateNoncombat({ kind: 'investigation', seed: 104729 });
    expect(r.handout).toBeTruthy();
    const v = toPlayerView(r);
    expect(v.handout).toBeUndefined();
    expect(playerViewToMarkdown(v)).not.toContain('##');
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
