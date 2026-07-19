// Tests for the flavor prompt spec ("flavor bible") — issue #87 Task A.
// Written FIRST (TDD): these must fail with a module-resolution error
// until scripts/flavor/prompt-spec.ts exists.

import { describe, expect, it } from 'vitest';
import {
  BANNED_PROPER_NOUNS,
  DICE_NOTATION_RE,
  FLAVOR_BIBLE,
  KIND_INSTRUCTIONS,
  POOL_KINDS,
  PROMPT_VERSION,
  buildSystemPrompt,
} from './prompt-spec';

describe('PROMPT_VERSION', () => {
  it('is a positive integer', () => {
    expect(Number.isInteger(PROMPT_VERSION)).toBe(true);
    expect(PROMPT_VERSION).toBeGreaterThan(0);
  });
});

describe('POOL_KINDS', () => {
  it('contains exactly the seven pool kinds with no duplicates', () => {
    expect(POOL_KINDS).toHaveLength(7);
    expect(new Set(POOL_KINDS).size).toBe(POOL_KINDS.length);
    expect([...POOL_KINDS].sort()).toEqual(
      [
        'name-prefix',
        'persona',
        'scenario-beat',
        'scenario-hook',
        'tactics-type',
        'theme-entry',
        'treasure',
      ].sort(),
    );
  });
});

describe('KIND_INSTRUCTIONS', () => {
  it('covers every pool kind with non-empty text', () => {
    for (const kind of POOL_KINDS) {
      expect(KIND_INSTRUCTIONS[kind], `missing instructions for ${kind}`).toBeTypeOf('string');
      expect(KIND_INSTRUCTIONS[kind].trim().length, `empty instructions for ${kind}`).toBeGreaterThan(0);
    }
  });

  it('scenario-hook instructions mention both slot tokens literally', () => {
    expect(KIND_INSTRUCTIONS['scenario-hook']).toContain('{monsters}');
    expect(KIND_INSTRUCTIONS['scenario-hook']).toContain('{environment}');
  });
});

describe('buildSystemPrompt', () => {
  it('is deterministic — same kind produces the identical string', () => {
    for (const kind of POOL_KINDS) {
      expect(buildSystemPrompt(kind)).toBe(buildSystemPrompt(kind));
    }
  });

  it('contains the bible first, then the kind block, then the version stamp', () => {
    for (const kind of POOL_KINDS) {
      const prompt = buildSystemPrompt(kind);
      const bibleAt = prompt.indexOf(FLAVOR_BIBLE);
      const kindAt = prompt.indexOf(KIND_INSTRUCTIONS[kind]);
      expect(bibleAt, `bible not first for ${kind}`).toBe(0);
      expect(kindAt, `kind block missing or before bible for ${kind}`).toBeGreaterThan(bibleAt);

      // Version stamp: last line of the prompt carries PROMPT_VERSION.
      const lines = prompt.trimEnd().split('\n');
      const lastLine = lines[lines.length - 1]!;
      expect(lastLine, `version stamp missing for ${kind}`).toContain(String(PROMPT_VERSION));
      expect(prompt.lastIndexOf(lastLine), `version stamp not after kind block for ${kind}`)
        .toBeGreaterThan(kindAt);
    }
  });
});

describe('DICE_NOTATION_RE', () => {
  it.each(['2d6', '1d20+5', 'DC 15', 'dc15'])('matches mechanics text %s', (s) => {
    expect(DICE_NOTATION_RE.test(s)).toBe(true);
  });

  it('matches mechanics embedded in prose', () => {
    expect(DICE_NOTATION_RE.test('deals 2d6 fire damage')).toBe(true);
    expect(DICE_NOTATION_RE.test('make a DC 15 Wisdom save')).toBe(true);
  });

  it.each(['a scarred veteran', 'second door'])('does not match plain prose %s', (s) => {
    expect(DICE_NOTATION_RE.test(s)).toBe(false);
  });

  it('is not global-flagged (stateless .test calls)', () => {
    expect(DICE_NOTATION_RE.global).toBe(false);
  });
});

describe('spec practices what it preaches', () => {
  it('FLAVOR_BIBLE contains no dice notation', () => {
    expect(DICE_NOTATION_RE.test(FLAVOR_BIBLE)).toBe(false);
  });

  it('no KIND_INSTRUCTIONS value contains dice notation', () => {
    for (const kind of POOL_KINDS) {
      expect(DICE_NOTATION_RE.test(KIND_INSTRUCTIONS[kind]), `dice notation leaked into ${kind}`).toBe(false);
    }
  });
});

describe('BANNED_PROPER_NOUNS', () => {
  it('is non-empty', () => {
    expect(BANNED_PROPER_NOUNS.length).toBeGreaterThan(0);
  });

  it('every entry is lowercase-normalized, trimmed, and non-empty', () => {
    for (const noun of BANNED_PROPER_NOUNS) {
      expect(noun.length, 'empty banned noun').toBeGreaterThan(0);
      expect(noun, `not lowercase: ${noun}`).toBe(noun.toLowerCase());
      expect(noun, `not trimmed: ${noun}`).toBe(noun.trim());
    }
  });

  it('has no duplicate entries', () => {
    expect(new Set(BANNED_PROPER_NOUNS).size).toBe(BANNED_PROPER_NOUNS.length);
  });
});
