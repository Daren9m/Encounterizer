import { describe, it, expect } from 'vitest';
import { handoutToText } from '../noncombat/handout-text';

describe('handoutToText', () => {
  it('renders text handouts with optional title', () => {
    expect(handoutToText({ kind: 'text', body: 'Hello' })).toBe('Hello');
    expect(handoutToText({ kind: 'text', title: 'Sign', body: 'Hello' })).toBe('Sign\n\nHello');
  });
  it('renders a logic grid with numbered clues', () => {
    const t = handoutToText({
      kind: 'logic-grid',
      categories: ['Guardian', 'Sigil'],
      items: [['Ox', 'Ram'], ['Sun', 'Moon']],
      clues: ['The Ox bears the Sun.'],
    });
    expect(t).toContain('Guardian: Ox, Ram');
    expect(t).toContain('1. The Ox bears the Sun.');
  });
  it('renders a symbol sequence with blanks and options', () => {
    const t = handoutToText({ kind: 'symbol-sequence', symbols: ['Sun', 'Moon', 'Sun', 'Moon', 'Sun'], blanks: [4], options: ['Sun', 'Star'] });
    expect(t).toContain('Sun → Moon → Sun → Moon → ___');
    expect(t).toContain('Options: Sun, Star');
  });
  it('renders a grid diagram row by row with legend', () => {
    const t = handoutToText({
      kind: 'grid-diagram', rows: 2, cols: 2,
      cells: [{ state: 'on' }, { state: 'off' }, { state: 'masked' }, { label: '7' }],
      legend: ['* lit', '. dark'],
    });
    expect(t).toContain('[*] [.]');
    expect(t).toContain('[ ] [7]');
    expect(t).toContain('Legend: * lit · . dark');
  });
  it('renders an attempts ledger', () => {
    const t = handoutToText({
      kind: 'attempts-ledger',
      attempts: [{ guess: ['ᚠ', 'ᚢ', 'ᚦ'], feedback: '1 bright, 1 faint' }],
      runeSet: ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ'],
    });
    expect(t).toContain('1. ᚠ ᚢ ᚦ — 1 bright, 1 faint');
    expect(t).toContain('Runes available: ᚠ ᚢ ᚦ ᚨ');
  });
  it('renders cipher text with partial key, and clue cards', () => {
    expect(handoutToText({ kind: 'cipher-text', body: 'IFMMP', scriptName: 'Tomb-script', partialKey: { I: 'H' } }))
      .toContain('Partial key: I=H');
    expect(handoutToText({ kind: 'clue-cards', cards: [{ title: 'Ash', body: 'Burned twice.', vector: 'scene' }] }))
      .toContain('[scene] Ash: Burned twice.');
  });
});
