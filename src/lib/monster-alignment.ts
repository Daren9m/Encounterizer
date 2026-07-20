import type { Alignment } from './types';

/** Render the rules-facing name used by the 2024 SRD. */
export function formatMonsterAlignment(alignment: Alignment): string {
  return alignment === 'True Neutral' ? 'Neutral' : alignment;
}
