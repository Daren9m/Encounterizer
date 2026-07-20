'use client';

import { CheckCircle2, Database, LoaderCircle, TriangleAlert } from 'lucide-react';
import { usePartyLibrary } from '@/app/hooks/usePartyLibrary';

export default function PartyPersistenceStatus({
  errorsOnly = false,
  hideErrors = false,
}: {
  errorsOnly?: boolean;
  hideErrors?: boolean;
}) {
  const { status, error, retryPartyStorage } = usePartyLibrary();

  if (status === 'error' || status === 'unavailable') {
    if (hideErrors) return null;
    return (
      <div
        className="mt-2 flex flex-col gap-2 rounded-lg border border-[var(--accent-danger)]/50 bg-[var(--accent-danger)]/10 px-3 py-2 text-xs sm:flex-row sm:items-center"
        role="alert"
      >
        <span className="inline-flex items-center gap-2 font-semibold text-[var(--text-1)]">
          <TriangleAlert size={15} aria-hidden="true" />
          Party changes are not being saved
        </span>
        <span className="min-w-0 flex-1 text-[var(--text-2)]">
          {error?.message ?? 'Browser storage is unavailable.'}
        </span>
        <button
          type="button"
          className="btn-ghost min-h-8 px-2 py-1 text-xs"
          onClick={() => void retryPartyStorage()}
        >
          Retry
        </button>
      </div>
    );
  }

  if (errorsOnly) return null;

  const loading = status === 'idle' || status === 'loading';
  const saving = status === 'saving';
  return (
    <p
      className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--text-3)]"
      aria-live="polite"
    >
      {loading || saving ? (
        <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
      ) : status === 'saved' ? (
        <CheckCircle2 size={14} aria-hidden="true" />
      ) : (
        <Database size={14} aria-hidden="true" />
      )}
      {loading ? 'Loading saved party…' : saving ? 'Saving party locally…' : 'Party saved in this browser'}
    </p>
  );
}
