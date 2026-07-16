'use client';

import { Printer } from 'lucide-react';

/** Opens the browser print dialog; hides itself on paper. */
export default function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-secondary text-sm print:hidden inline-flex items-center gap-1.5"
      aria-label="Print this page"
    >
      <Printer size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
