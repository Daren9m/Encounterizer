'use client';

import { EncounterAssessment } from '@/lib/types';

const CLASSES: Record<EncounterAssessment, string> = {
  Trivial: 'badge-trivial',
  Low: 'badge-low',
  Moderate: 'badge-moderate',
  High: 'badge-high',
  Extreme: 'badge-extreme',
};

const TOOLTIPS: Partial<Record<EncounterAssessment, string>> = {
  Trivial: 'Encounterizer target: 50% of the official 2024 DMG Low budget.',
  Extreme: 'Encounterizer target: up to 130% of the official 2024 DMG High budget. Here be TPKs.',
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
