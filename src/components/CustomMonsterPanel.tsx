'use client';

import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { parseCustomMonsterJson, type CustomImportEntryError } from '@/lib/custom-monster-import';
import { formatMonsterSize } from '@/lib/monster-size';
import type { Monster } from '@/lib/types';
import { useCustomMonsters } from '@/app/hooks/useCustomMonsters';

function crDisplay(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return cr.toString();
}

interface ImportFeedback {
  imported: number;
  skipped: number;
  format: string;
  errors: CustomImportEntryError[];
  storageError?: string;
}

export default function CustomMonsterPanel({ allMonsters }: { allMonsters: Monster[] }) {
  const { customMonsters, addMonsters, removeMonster, clearAll, exportJson } = useCustomMonsters();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<ImportFeedback | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const existingIds = new Set(allMonsters.map((m) => m.id));
      const result = parseCustomMonsterJson(text, existingIds);
      const { error } = result.imported.length > 0
        ? addMonsters(result.imported)
        : { error: undefined };
      setFeedback({
        imported: error ? 0 : result.imported.length,
        skipped: result.errors.length,
        format: result.format,
        errors: result.errors,
        storageError: error,
      });
    };
    reader.readAsText(file);
  }

  function handleExport() {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'encounterizer-custom-monsters.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card mb-3 !px-3 !py-2.5 print:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="custom-monster-panel"
        className="flex min-h-9 w-full items-center justify-between text-left"
      >
        <span className="font-display">
          Custom Monsters{customMonsters.length > 0 ? ` (${customMonsters.length})` : ''}
        </span>
        <span aria-hidden="true" className="text-[var(--text-2)]">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>

      {open && (
        <div id="custom-monster-panel" className="mt-2.5 space-y-3 border-t border-[var(--steel-800)] pt-3 animate-fade-in">
          <p className="text-sm text-[var(--text-2)]">
            Load your own monsters from a <strong>5etools bestiary JSON</strong>{' '}
            (<code className="text-xs">{'{"monster": [...]}'}</code>) or an{' '}
            <strong>Encounterizer export</strong>. They join the bestiary, encounter
            generation, and the Battle Forecast — stored only in this browser, never uploaded.
          </p>

          <div className="flex flex-wrap gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              aria-label="Import monsters from a JSON file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = ''; // allow re-importing the same file
              }}
            />
            <button
              type="button"
              className="btn-primary text-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Import JSON…
            </button>
            {customMonsters.length > 0 && (
              <>
                <button type="button" className="btn-secondary text-sm" onClick={handleExport}>
                  Export JSON
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => {
                    if (window.confirm(`Remove all ${customMonsters.length} custom monsters?`)) {
                      clearAll();
                      setFeedback(null);
                    }
                  }}
                >
                  Clear All
                </button>
              </>
            )}
          </div>

          {feedback && (
            <div className="text-sm space-y-1" role="status">
              {feedback.storageError ? (
                <p className="text-[var(--accent-danger)]">{feedback.storageError}</p>
              ) : (
                <p>
                  <span className="text-[var(--bronze)] font-bold">{feedback.imported} imported</span>
                  {feedback.skipped > 0 && (
                    <span className="text-[var(--accent-danger)]">, {feedback.skipped} skipped</span>
                  )}{' '}
                  <span className="text-[var(--text-2)]">
                    ({feedback.format === 'unknown' ? 'unrecognized format' : `${feedback.format} format`})
                  </span>
                </p>
              )}
              {feedback.errors.length > 0 && (
                <ul className="text-xs text-[var(--accent-danger)] space-y-0.5 max-h-32 overflow-y-auto">
                  {feedback.errors.slice(0, 10).map((err) => (
                    <li key={err.index}>
                      #{err.index + 1}{err.name ? ` "${err.name}"` : ''}: {err.messages.join('; ')}
                    </li>
                  ))}
                  {feedback.errors.length > 10 && (
                    <li>…and {feedback.errors.length - 10} more</li>
                  )}
                </ul>
              )}
            </div>
          )}

          {customMonsters.length > 0 && (
            <ul className="divide-y divide-[var(--steel-800)] max-h-56 overflow-y-auto">
              {customMonsters.map((m) => (
                <li key={m.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span>
                    <span className="font-bold">{m.name}</span>
                    <span className="text-[var(--text-2)] ml-2">
                      CR {crDisplay(m.challengeRating)} · {formatMonsterSize(m)} {m.type}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeMonster(m.id)}
                    aria-label={`Remove ${m.name}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[var(--accent-danger)] transition-colors hover:bg-[var(--steel-800)] hover:text-[var(--accent-danger-light)]"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
