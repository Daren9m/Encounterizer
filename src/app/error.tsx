'use client';

import { useEffect } from 'react';
import Link from 'next/link';

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
      <div className="text-6xl mb-4" aria-hidden="true">💥</div>
      <h1 className="text-4xl font-bold text-[var(--dragon-red-light)] mb-3">
        A wild error appeared!
      </h1>
      <p className="text-[var(--parchment-dark)] mb-8">
        Something went wrong rendering this page. It used its surprise round —
        now it&apos;s your turn.
      </p>
      <div className="flex justify-center gap-3">
        <button type="button" onClick={reset} className="btn-gold">
          Try Again
        </button>
        <Link href="/" className="btn-secondary inline-block">
          Back to Safety
        </Link>
      </div>
    </div>
  );
}
