'use client';

import { Difficulty } from '@/lib/types';

const CLASSES: Record<Difficulty, string> = {
  Easy: 'badge-easy',
  Medium: 'badge-medium',
  Hard: 'badge-hard',
  Deadly: 'badge-deadly',
};

export default function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return (
    <span className={`${CLASSES[difficulty]} px-3 py-1 rounded-full text-sm font-bold`}>
      {difficulty}
    </span>
  );
}
