// src/lib/puzzle-engines/cipher.ts
// ─── Cipher Suite ────────────────────────────────────────────────
// Caesar/Atbash (Easy, with partial key), keyword (Medium), runic
// symbol substitution (Hard). Decodable by construction (spec §7.1).

import { pickRandom as pick, shuffleArray } from '../random';
import type { Rng } from '../random';
import { dcFor, estimatedMinutes, hintCount } from '../noncombat/levers';
import { failureText, rewardText, RUNE_GLYPHS, cap } from '../noncombat/theming';
import type { EngineInput, EngineOutput, PuzzleFamily } from './family';

const A = 'A'.charCodeAt(0);
const ALPHABET = Array.from({ length: 26 }, (_, i) => String.fromCharCode(A + i)).join('');

function mapLetters(text: string, map: (c: string) => string): string {
  return text.split('').map(ch => (ch >= 'A' && ch <= 'Z' ? map(ch) : ch)).join('');
}

export function encodeCaesar(text: string, shift: number): string {
  return mapLetters(text, c => String.fromCharCode(((c.charCodeAt(0) - A + shift) % 26) + A));
}
export function decodeCaesar(text: string, shift: number): string {
  return encodeCaesar(text, 26 - (shift % 26));
}
export function encodeAtbash(text: string): string {
  return mapLetters(text, c => String.fromCharCode(A + 25 - (c.charCodeAt(0) - A)));
}
export function buildKeywordAlphabet(keyword: string): string {
  const seen = new Set<string>();
  const head = keyword.toUpperCase().split('').filter(c => c >= 'A' && c <= 'Z' && !seen.has(c) && (seen.add(c), true));
  const tail = ALPHABET.split('').filter(c => !seen.has(c));
  return [...head, ...tail].join('');
}
export function encodeKeyword(text: string, keyword: string): string {
  const cipher = buildKeywordAlphabet(keyword);
  return mapLetters(text, c => cipher[c.charCodeAt(0) - A]);
}
export function decodeKeyword(text: string, keyword: string): string {
  const cipher = buildKeywordAlphabet(keyword);
  return mapLetters(text, c => String.fromCharCode(A + cipher.indexOf(c)));
}

function topLetters(text: string, n: number): string[] {
  const freq = new Map<string, number>();
  for (const ch of text) if (ch >= 'A' && ch <= 'Z') freq.set(ch, (freq.get(ch) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(e => e[0]);
}

export const cipherSuite: PuzzleFamily = {
  key: 'cipher-suite',
  label: 'The Encoded Message',
  categories: ['word'],
  generate({ levers, rng }: EngineInput): EngineOutput {
    const pack = levers.theme;
    const plain = pick(pack.phrases, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    let body: string;
    let method: string;
    let solutionNote: string;
    let partialKey: Record<string, string> | undefined;
    if (levers.difficulty === 'Easy') {
      const useAtbash = rng() < 0.5;
      const shift = 1 + Math.floor(rng() * 25);
      body = useAtbash ? encodeAtbash(plain) : encodeCaesar(plain, shift);
      method = useAtbash ? 'an Atbash mirror (A↔Z, B↔Y, …)' : `a Caesar shift of ${shift}`;
      solutionNote = useAtbash ? 'Mirror each letter across the alphabet.' : `Shift each letter back by ${shift}.`;
      partialKey = Object.fromEntries(topLetters(body, 3).map(c => {
        const plainChar = useAtbash ? encodeAtbash(c) : decodeCaesar(c, shift);
        return [c, plainChar];
      }));
    } else if (levers.difficulty === 'Medium') {
      const keyword = pick(pack.symbolSets[0], rng).toUpperCase().replace(/[^A-Z]/g, '');
      body = encodeKeyword(plain, keyword);
      method = `a keyword cipher (keyword: ${keyword})`;
      solutionNote = `The cipher alphabet starts with ${keyword} (duplicates dropped), then the remaining letters in order.`;
    } else {
      // 26 distinct glyphs — RUNE_GLYPHS (24) plus two extras from the same
      // runic block — so no two letters ever share a glyph (decodability).
      const CIPHER_GLYPHS = [...RUNE_GLYPHS, 'ᛠ', 'ᛡ'];
      const glyphMap = shuffleArray(CIPHER_GLYPHS, rng);
      body = mapLetters(plain, c => glyphMap[c.charCodeAt(0) - A]);
      method = 'a full symbol substitution into runic glyphs';
      solutionNote = `Mapping (letter → glyph): ${ALPHABET.split('').map((c, i) => `${c}=${glyphMap[i]}`).join(' ')}`;
    }
    const allHints = [
      `Short words betray the code: one-letter words are A or I; the most common three-letter word is THE.`,
      `DC ${dc} Arcana or History: recognize the encoding style — ${method}.`,
      `The most frequent symbol likely stands for E, T, or A.`,
      `A character who studies ${pack.glyphStyle.name} script gains advantage on any check to decode it.`,
    ];
    return {
      name: 'The Encoded Message',
      estimatedMinutes: estimatedMinutes(levers.timeBudget),
      dmBrief: `A message in ${pack.glyphStyle.name} — ${pack.glyphStyle.flavor} — encoded with ${method}. Plaintext: "${plain}". ${solutionNote}`,
      readAloud: `${cap(pack.sensory[5] ?? pack.sensory[0])}. Across the ${pick(pack.materials, rng)} surface, someone has left a message in ${pack.glyphStyle.name}: recognizable script, unreadable words. It has been encoded.`,
      handout: { kind: 'cipher-text', body, scriptName: pack.glyphStyle.name, partialKey },
      hints: allHints.slice(0, hintCount(levers.timeBudget)),
      solution: `The message reads: "${plain}". ${solutionNote}`,
      failureConsequence: failureText(levers, rng, { kind: 'recurring', context: 'Time bleeds away while the message goes unread.', save: undefined }),
      reward: rewardText(levers, rng),
    };
  },
};
