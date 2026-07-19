'use client';

import { RotateCcw } from 'lucide-react';

export default function ResetGeneratorButton({
  onReset,
  label = 'Reset',
}: {
  onReset: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onReset}
      className="btn-ghost inline-flex items-center gap-2"
    >
      <RotateCcw size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
