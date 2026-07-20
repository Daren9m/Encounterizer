'use client';

import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { PartyMemberConfig } from '@/lib/battle-sim-types';
import {
  PartyClassTemplateSelect,
  PartyCombatProfileFields,
  PartyCombatStatPreview,
} from '@/components/PartyCombatProfileFields';
import { importCharacterJson } from '@/lib/character-import';

export default function PartySetupPanel({
  members,
  onSave,
  onCancel,
}: {
  members: PartyMemberConfig[];
  onSave: (members: PartyMemberConfig[]) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<PartyMemberConfig[]>(members);
  const [customizing, setCustomizing] = useState<number | null>(null);
  const [importMessage, setImportMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  function updateMember(index: number, patch: Partial<PartyMemberConfig>) {
    setDraft((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  async function handleCharacterFile(file: File | undefined) {
    if (!file) return;
    let contents: string;
    try {
      contents = await file.text();
    } catch {
      setImportMessage({ kind: 'error', text: 'That character file could not be read.' });
      return;
    }
    const result = importCharacterJson(contents);
    if (!result.ok) {
      setImportMessage({ kind: 'error', text: result.error });
      return;
    }
    setDraft((prev) => [...prev, result.member]);
    setCustomizing(draft.length);
    setImportMessage({
      kind: 'info',
      text: result.warnings.length > 0
        ? `${result.member.name} imported. ${result.warnings.join(' ')}`
        : `${result.member.name} imported. Review the values below before saving.`,
    });
  }

  return (
    <section className="card mb-6 animate-fade-in space-y-5 print:hidden" aria-labelledby="forecast-party-heading">
      <header>
        <p className="micro-label">Battle forecast</p>
        <h2 id="forecast-party-heading" className="mt-1 text-xl">Configure the adventuring party</h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--text-2)]">
          Pick a class template and level per player — or open Customize to tweak the numbers.
          The forecast only needs the combat math, not the whole character sheet.
        </p>
      </header>

      <div className="space-y-3">
        {draft.map((member, index) => (
          <div key={index} className="surface-inset space-y-3 p-4">
            <div className="grid sm:grid-cols-[1fr_1.4fr_5rem_auto] gap-2 items-end">
              <div>
                <label htmlFor={`member-name-${index}`} className="field-label">
                  Name
                </label>
                <input
                  id={`member-name-${index}`}
                  type="text"
                  className="w-full text-sm"
                  value={member.name}
                  onChange={(e) => updateMember(index, { name: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor={`member-template-${index}`} className="field-label">
                  Class template
                </label>
                <PartyClassTemplateSelect
                  id={`member-template-${index}`}
                  value={member.templateId}
                  onChange={(templateId) => updateMember(index, { templateId, overrides: undefined })}
                />
              </div>
              <div>
                <label htmlFor={`member-level-${index}`} className="field-label">
                  Level
                </label>
                <input
                  id={`member-level-${index}`}
                  type="number"
                  min={1}
                  max={20}
                  className="w-full text-sm"
                  value={member.level}
                  onChange={(e) => updateMember(index, { level: Math.max(1, Math.min(20, Number(e.target.value))) })}
                />
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="btn-secondary text-xs"
                  aria-expanded={customizing === index}
                  aria-controls={`party-member-customization-${index}`}
                  onClick={() => setCustomizing(customizing === index ? null : index)}
                >
                  Customize
                </button>
                <button
                  type="button"
                  className="icon-button icon-button-danger"
                  aria-label={`Remove ${member.name || `player ${index + 1}`}`}
                  onClick={() => setDraft((prev) => prev.filter((_, i) => i !== index))}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            <PartyCombatStatPreview member={member} index={index} />

            {customizing === index && (
              <PartyCombatProfileFields
                member={member}
                index={index}
                idPrefix={`party-member-customization-${index}`}
                containerId={`party-member-customization-${index}`}
                className="grid grid-cols-2 gap-3 border-t border-[var(--line-subtle)] pt-3 animate-fade-in sm:grid-cols-3 lg:grid-cols-6"
                onChange={(overrides) => updateMember(index, { overrides })}
              />
            )}
          </div>
        ))}
      </div>

      <footer className="flex flex-col gap-3 border-t border-[var(--line-subtle)] pt-4 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          className="btn-secondary text-sm inline-flex items-center gap-1.5"
          onClick={() =>
            setDraft((prev) => [
              ...prev,
              { name: `Player ${prev.length + 1}`, templateId: 'fighter-champion', level: prev[0]?.level ?? 3 },
            ])
          }
        >
          <Plus size={16} aria-hidden="true" />
          Add player
        </button>
        <button
          type="button"
          className="btn-secondary inline-flex min-h-11 items-center text-sm"
          onClick={() => importInputRef.current?.click()}
        >
          Import character JSON
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            void handleCharacterFile(event.target.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
        <div className="flex-1" />
        <button type="button" className="btn-ghost text-sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={draft.length === 0}
          onClick={() => onSave(draft)}
        >
          Save &amp; run forecast
        </button>
      </footer>
      {importMessage && (
        <p
          className={`text-sm ${importMessage.kind === 'error' ? 'text-[var(--accent-danger)]' : 'text-[var(--text-2)]'}`}
          role={importMessage.kind === 'error' ? 'alert' : 'status'}
        >
          {importMessage.text}
        </p>
      )}
    </section>
  );
}
