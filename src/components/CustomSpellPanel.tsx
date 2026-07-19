'use client';

import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { parseCustomSpellJson, type CustomImportEntryError } from '@/lib/custom-spell-import';
import { levelLabel, type Spell } from '@/data/spells';
import { useCustomSpells } from '@/app/hooks/useCustomSpells';

interface ImportFeedback {
  imported: number;
  skipped: number;
  format: string;
  errors: CustomImportEntryError[];
  storageError?: string;
}

export default function CustomSpellPanel({ allSpells }: { allSpells: Spell[] }) {
  const { customSpells, addSpells, removeSpell, clearAll, exportJson } = useCustomSpells();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState<ImportFeedback | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const existingIds = new Set(allSpells.map((s) => s.id));
      const result = parseCustomSpellJson(text, existingIds);
      const { error } = result.imported.length > 0
        ? addSpells(result.imported)
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
    a.download = 'encounterizer-custom-spells.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="card mb-4 print:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="custom-spell-panel"
        className="flex items-center justify-between w-full text-left"
      >
        <span className="font-display">
          Custom Spells{customSpells.length > 0 ? ` (${customSpells.length})` : ''}
        </span>
        <span aria-hidden="true" className="text-[var(--text-2)]">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>

      {open && (
        <div id="custom-spell-panel" className="mt-4 space-y-4 animate-fade-in">
          <p className="text-sm text-[var(--text-2)]">
            Load your own spells from a <strong>5etools spell JSON</strong>{' '}
            (<code className="text-xs">{'{"spell": [...]}'}</code>) or an{' '}
            <strong>Encounterizer export</strong>. They join the spell reference —
            stored only in this browser, never uploaded.
          </p>

          <div className="flex flex-wrap gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              aria-label="Import spells from a JSON file"
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
            {customSpells.length > 0 && (
              <>
                <button type="button" className="btn-secondary text-sm" onClick={handleExport}>
                  Export JSON
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => {
                    if (window.confirm(`Remove all ${customSpells.length} custom spells?`)) {
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

          {customSpells.length > 0 && (
            <ul className="divide-y divide-[var(--steel-800)] max-h-56 overflow-y-auto">
              {customSpells.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-1.5 text-sm">
                  <span>
                    <span className="font-bold">{s.name}</span>
                    <span className="text-[var(--text-2)] ml-2">
                      {levelLabel(s.level)} · {s.school}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSpell(s.id)}
                    aria-label={`Remove ${s.name}`}
                    className="text-[var(--accent-danger)] hover:opacity-80 px-2 inline-flex items-center"
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
