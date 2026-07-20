import { describe, expect, it } from 'vitest';
import { formatMonsterAlignment } from '@/lib/monster-alignment';
import { monsterToMarkdown } from '@/lib/monster-export';
import { formatMonsterSize } from '@/lib/monster-size';
import { makeMonster } from './test-helpers';

describe('monster stat-block formatting', () => {
  const priest = makeMonster({
    name: 'Priest',
    type: 'Humanoid',
    subtype: 'cleric',
    alignment: 'True Neutral',
    size: 'Medium',
    sizeOptions: ['Medium', 'Small'],
  });

  it('renders every legal size in rules order', () => {
    expect(formatMonsterSize(priest)).toBe('Medium or Small');
  });

  it('uses the SRD label for neutral alignment', () => {
    expect(formatMonsterAlignment(priest.alignment)).toBe('Neutral');
  });

  it('exports the complete SRD classification line', () => {
    expect(monsterToMarkdown(priest)).toContain(
      '*Medium or Small Humanoid (cleric), Neutral*',
    );
  });
});
