// ─── Handout → plain text ────────────────────────────────────────
// One text rendering shared by the deprecated Puzzle.playerHandout
// field and the page markdown export, so both always agree.

import type { HandoutSpec } from './types';

export function handoutToText(spec: HandoutSpec): string {
  switch (spec.kind) {
    case 'text':
      return spec.title ? `${spec.title}\n\n${spec.body}` : spec.body;
    case 'logic-grid':
      return [
        ...spec.categories.map((c, i) => `${c}: ${spec.items[i].join(', ')}`),
        '',
        'Clues:',
        ...spec.clues.map((c, i) => `${i + 1}. ${c}`),
      ].join('\n');
    case 'symbol-sequence': {
      const seq = spec.symbols.map((s, i) => (spec.blanks.includes(i) ? '___' : s)).join(' → ');
      const opts = spec.options?.length ? `\nOptions: ${spec.options.join(', ')}` : '';
      return `Sequence: ${seq}${opts}`;
    }
    case 'cipher-text': {
      const key = spec.partialKey
        ? `\n\nPartial key: ${Object.entries(spec.partialKey).map(([c, p]) => `${c}=${p}`).join(', ')}`
        : '';
      return `${spec.scriptName}:\n\n${spec.body}${key}`;
    }
    case 'grid-diagram': {
      const lines: string[] = [];
      for (let r = 0; r < spec.rows; r++) {
        lines.push(
          spec.cells
            .slice(r * spec.cols, (r + 1) * spec.cols)
            .map(c => c.state === 'on' ? '[*]' : c.state === 'off' ? '[.]' : c.state === 'masked' ? '[ ]' : `[${c.label ?? ' '}]`)
            .join(' '),
        );
      }
      if (spec.legend?.length) lines.push('', `Legend: ${spec.legend.join(' · ')}`);
      return lines.join('\n');
    }
    case 'attempts-ledger':
      return [
        'Previous attempts:',
        ...spec.attempts.map((a, i) => `${i + 1}. ${a.guess.join(' ')} — ${a.feedback}`),
        '',
        `Runes available: ${spec.runeSet.join(' ')}`,
      ].join('\n');
    case 'clue-cards':
      return spec.cards.map(c => `[${c.vector}] ${c.title}: ${c.body}`).join('\n\n');
  }
}
