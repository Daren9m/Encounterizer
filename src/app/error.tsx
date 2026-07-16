'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // No telemetry by design — the console is the only place this goes.
    console.error(error);
  }, [error]);

  return (
    <div className="animate-fade-in max-w-2xl mx-auto text-center py-16">
      <div className="mb-4 flex justify-center" aria-hidden="true">
        <TriangleAlert size={48} className="text-[var(--accent-danger)]" />
      </div>
      <h1 className="text-4xl mb-3">
        A wild error appeared!
      </h1>
      <p className="text-[var(--text-2)] mb-8">
        Something went wrong rendering this page. It used its surprise round —
        now it&apos;s your turn.
      </p>
      <div className="flex justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Try Again
        </button>
        <Link href="/" className="btn-secondary inline-block">
          Back to Safety
        </Link>
      </div>
    </div>
  );
}
