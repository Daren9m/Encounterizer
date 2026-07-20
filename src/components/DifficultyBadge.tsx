'use client';

import { EncounterAssessment } from '@/lib/types';

const CLASSES: Record<EncounterAssessment, string> = {
  Trivial: 'difficulty-status-trivial',
  Low: 'difficulty-status-low',
  Moderate: 'difficulty-status-moderate',
  High: 'difficulty-status-high',
  Extreme: 'difficulty-status-extreme',
};

const TOOLTIPS: Partial<Record<EncounterAssessment, string>> = {
  Trivial: 'Encounterizer target: 50% of the official 2024 DMG Low budget.',
  Extreme: 'Encounterizer target: up to 130% of the official 2024 DMG High budget. Here be TPKs.',
};

export default function DifficultyBadge({ difficulty }: { difficulty: EncounterAssessment }) {
  const explanation = TOOLTIPS[difficulty];

  return (
    <span
      className={`difficulty-status ${CLASSES[difficulty]}`}
      title={explanation}
      aria-label={explanation ? `${difficulty}. ${explanation}` : difficulty}
    >
      <span className="difficulty-status-dot" aria-hidden="true" />
      {difficulty}
    </span>
  );
}
