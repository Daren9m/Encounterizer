import { describe, expect, it } from 'vitest';
import { isDmScreenWorkspaceMode } from '@/lib/dm-screen-workspace';

describe('DM Screen workspace', () => {
  it.each(['run', 'arrange'] as const)('accepts the %s mode', (mode) => {
    expect(isDmScreenWorkspaceMode(mode)).toBe(true);
  });

  it.each([
    undefined,
    null,
    '',
    'focus',
    'Run',
    1,
    { mode: 'run' },
  ])('rejects an invalid persisted mode: %j', (value) => {
    expect(isDmScreenWorkspaceMode(value)).toBe(false);
  });
});
