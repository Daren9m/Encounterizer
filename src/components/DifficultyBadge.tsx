'use client';

import { EncounterAssessment } from '@/lib/types';

const CLASSES: Record<EncounterAssessment, string> = {
  Low: 'badge-low',
  Moderate: 'badge-moderate',
  High: 'badge-high',
  Extreme: 'badge-extreme',
};

const TOOLTIPS: Partial<Record<EncounterAssessment, string>> = {
  Extreme: 'Beyond the 2024 DMG High budget — the rules define nothing past High. Here be TPKs.',
};

export default function DifficultyBadge({ difficulty }: { difficulty: EncounterAssessment }) {
  return (
    <span
      className={`${CLASSES[difficulty]} px-3 py-1 rounded-full text-xs`}
      title={TOOLTIPS[difficulty]}
    >
      {difficulty}
    </span>
  );
}
