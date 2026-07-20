'use client';

import { Printer } from 'lucide-react';

/** Opens the browser print dialog; hides itself on paper. */
export default function PrintButton({
  label = 'Print',
  variant = 'button',
}: {
  label?: string;
  variant?: 'button' | 'menu';
}) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={variant === 'menu'
        ? 'menu-action print:hidden'
        : 'btn-secondary text-sm print:hidden inline-flex items-center gap-1.5'}
      aria-label={label}
    >
      <Printer size={variant === 'menu' ? 18 : 16} aria-hidden="true" />
      {variant === 'menu' ? (
        <span>
          <strong>{label}</strong>
          <small>Full DM encounter sheet</small>
        </span>
      ) : label}
    </button>
  );
}
