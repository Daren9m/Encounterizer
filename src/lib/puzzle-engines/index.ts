// ─── Family Registry ─────────────────────────────────────────────
import type { PuzzleCategory } from '../noncombat/types';
import type { PuzzleFamily } from './family';
import { knightsKnaves } from './knights-knaves';
import { logicGrid } from './logic-grid';
import { runeLock } from './rune-lock';
import { riverCrossing } from './river-crossing';
import { sequenceLock } from './sequence';
import { cipherSuite } from './cipher';
import { riddleFrames } from './riddle-frames';
import { plateGrid } from './plate-grid';
import { sumLock } from './sum-lock';
import { tilePath } from './tile-path';
import { contests } from './contests';
import { gauntlets } from './gauntlets';

export const FAMILIES: PuzzleFamily[] = [
  knightsKnaves, logicGrid, runeLock, riverCrossing, sequenceLock,
  cipherSuite, riddleFrames, plateGrid, sumLock, tilePath, contests, gauntlets,
];

export function eligibleFamilies(category?: PuzzleCategory): PuzzleFamily[] {
  return category ? FAMILIES.filter(f => f.categories.includes(category)) : FAMILIES;
}

export type { PuzzleFamily, EngineInput, EngineOutput } from './family';
