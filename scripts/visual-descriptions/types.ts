import type { MonsterVisualRecord } from '../../src/lib/monster-visuals';

export type AuthoredVisual = Pick<
  MonsterVisualRecord,
  | 'appearance'
  | 'silhouette'
  | 'materials'
  | 'pose'
  | 'palette'
  | 'mustInclude'
  | 'mustAvoid'
  | 'environment'
  | 'altText'
>;
