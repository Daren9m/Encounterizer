'use client';

/** Opens the browser print dialog; hides itself on paper. */
export default function PrintButton({ label = 'Print' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-secondary text-sm print:hidden"
      aria-label="Print this page"
    >
      🖨 {label}
    </button>
  );
}
