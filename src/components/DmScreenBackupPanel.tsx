'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, Upload } from 'lucide-react';
import {
  parseDmScreenImport,
  type DmScreenImportCandidate,
  type DmScreenImportMode,
} from '@/lib/dm-screen-import';

export interface DmScreenImportApplyResult {
  ok: boolean;
  message?: string;
  error?: string;
}

export default function DmScreenBackupPanel({
  saving,
  canExport,
  canMerge,
  onExport,
  onApply,
  getRestoreWarnings,
}: {
  saving: boolean;
  canExport: boolean;
  canMerge: boolean;
  onExport: () => void;
  onApply: (
    candidate: DmScreenImportCandidate,
    mode: DmScreenImportMode,
    includeBattle: boolean,
  ) => Promise<DmScreenImportApplyResult>;
  getRestoreWarnings?: (candidate: DmScreenImportCandidate) => string[];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreButtonRef = useRef<HTMLButtonElement>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const [candidate, setCandidate] = useState<DmScreenImportCandidate | null>(null);
  const [fileName, setFileName] = useState('');
  const [includeBattle, setIncludeBattle] = useState(false);
  const [error, setError] = useState('');
  const [resultMessage, setResultMessage] = useState('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (candidate) previewHeadingRef.current?.focus();
  }, [candidate]);

  useEffect(() => {
    if (resultMessage) resultRef.current?.focus();
  }, [resultMessage]);

  async function readBackup(file: File | undefined): Promise<void> {
    if (!file) return;
    setCandidate(null);
    setFileName('');
    setError('');
    setResultMessage('');
    setIncludeBattle(false);
    try {
      const parsed = parseDmScreenImport(await file.text());
      if (!parsed.ok) {
        setError(parsed.errors.slice(0, 4).join(' '));
        return;
      }
      setCandidate(parsed.candidate);
      setFileName(file.name);
    } catch {
      setError('That DM Screen backup could not be read. Nothing was changed.');
    }
  }

  async function apply(mode: DmScreenImportMode): Promise<void> {
    if (!candidate || applying) return;
    if (mode === 'replace' && !window.confirm(
      `Replace this DM Screen with ${fileName}? The current screen layout and panels will be removed.`,
    )) return;
    setApplying(true);
    setError('');
    setResultMessage('');
    try {
      const result = await onApply(candidate, mode, includeBattle);
      if (!result.ok) {
        setError(result.error ?? 'The backup could not be restored. Nothing on the screen was replaced.');
        return;
      }
      setResultMessage(result.message ?? 'DM Screen backup restored.');
      setCandidate(null);
      setFileName('');
      setIncludeBattle(false);
    } finally {
      setApplying(false);
    }
  }

  const busy = saving || applying;
  const warnings = candidate
    ? [...new Set([...candidate.warnings, ...(getRestoreWarnings?.(candidate) ?? [])])]
    : [];

  return (
    <details className="disclosure-panel mt-4">
      <summary>
        <span className="disclosure-summary-copy">
          <Download size={18} aria-hidden="true" />
          <span>
            <strong>Backup and restore</strong>
            <small>Review validated JSON before anything changes.</small>
          </span>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="optional-panel space-y-3 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" className="btn-secondary" disabled={busy || !canExport} onClick={onExport}>
            <Download size={16} aria-hidden="true" /> Export DM Screen
          </button>
          <button ref={restoreButtonRef} type="button" className="btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload size={16} aria-hidden="true" /> Restore JSON…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              void readBackup(event.target.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
        </div>

        {error && (
          <p role="alert" className="field-error rounded-lg border border-[var(--status-danger)] bg-[var(--status-danger-wash)] p-3">
            {error}
          </p>
        )}
        {resultMessage && <p ref={resultRef} tabIndex={-1} role="status" className="text-sm text-[var(--text-2)]">{resultMessage}</p>}

        {candidate && (
          <section className="content-panel" aria-labelledby="dm-screen-import-preview-heading">
            <div className="content-panel-heading">
              <div>
                <p className="micro-label">Restore preview</p>
                <h3 id="dm-screen-import-preview-heading" ref={previewHeadingRef} tabIndex={-1} className="mt-1 text-xl">
                  Review {fileName}
                </h3>
                <p><strong>{candidate.preview.title}</strong> · Nothing has changed yet.</p>
              </div>
            </div>
            <dl className="metric-grid">
              <div className="metric-item"><dt>Sections</dt><dd>{candidate.preview.sections}</dd></div>
              <div className="metric-item"><dt>Panels</dt><dd>{candidate.preview.items}</dd></div>
              <div className="metric-item"><dt>Resources</dt><dd>{candidate.preview.monsters + candidate.preview.spells}</dd></div>
              <div className="metric-item"><dt>Battle roster</dt><dd>{candidate.preview.battleIncluded ? candidate.preview.battleCombatants : 'None'}</dd></div>
            </dl>

            {candidate.preview.battleIncluded && (
              <label className="surface-inset mt-3 flex items-start gap-3 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={includeBattle}
                  onChange={(event) => setIncludeBattle(event.target.checked)}
                />
                <span>
                  <strong className="block text-[var(--text-1)]">Replace the current Battle Organizer state</strong>
                  <span className="text-xs text-[var(--text-3)]">Optional and destructive. Battles cannot be merged.</span>
                </span>
              </label>
            )}

            {warnings.length > 0 && (
              <div className="mt-3 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-wash)] p-3">
                <strong className="text-sm text-[var(--text-1)]">Check before restoring</strong>
                <ul className="mt-1 space-y-1 text-xs text-[var(--text-2)]">
                  {warnings.map((warning, index) => <li key={`${index}-${warning}`}>• {warning}</li>)}
                </ul>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="button" className="btn-primary" disabled={busy || !canMerge} onClick={() => void apply('merge')}>
                Add imported sections
              </button>
              <button type="button" className="btn-ghost text-[var(--accent-danger)]" disabled={busy} onClick={() => void apply('replace')}>
                Replace this screen
              </button>
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => {
                setCandidate(null);
                setFileName('');
                setIncludeBattle(false);
                restoreButtonRef.current?.focus();
              }}>
                Cancel
              </button>
            </div>
          </section>
        )}
      </div>
    </details>
  );
}
