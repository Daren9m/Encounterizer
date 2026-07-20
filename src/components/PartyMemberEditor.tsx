'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { ChevronDown, Save, SlidersHorizontal, TriangleAlert } from 'lucide-react';
import {
  PartyClassTemplateSelect,
  PartyCombatProfileFields,
  PartyCombatStatPreview,
  partyCombatFieldId,
} from '@/components/PartyCombatProfileFields';
import type { PartyMemberConfig } from '@/lib/battle-sim-types';
import {
  partyMemberToFormValues,
  validatePartyMemberForm,
  type PartyMemberFormErrors,
  type PartyMemberFormField,
  type PartyMemberFormValues,
} from '@/lib/party-member-form';
import type { PartyMemberDraft } from '@/lib/party';
import { validateBoundedIntegerInput } from '@/lib/number-input';

export type PartyMemberEditorSaveResult =
  | void
  | boolean
  | { ok: true }
  | { ok: false; error: string };

export interface PartyMemberEditorProps {
  member: PartyMemberDraft;
  mode?: 'add' | 'edit' | 'import';
  onSave: (
    member: PartyMemberDraft,
  ) => PartyMemberEditorSaveResult | Promise<PartyMemberEditorSaveResult>;
  onCancel: () => void;
  /** The control that opened this in-flow editor. Focus returns here on cancel. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  importWarnings?: readonly string[];
  /** Compatibility alias used by the Party Manager's import-review state. */
  warnings?: readonly string[];
  /** Repository-level save state, shared with the rest of the Party Manager. */
  saving?: boolean;
  title?: string;
  onDirtyChange?: (dirty: boolean) => void;
}

const FIELD_ORDER: PartyMemberFormField[] = [
  'name',
  'playerName',
  'templateId',
  'level',
  'classLabel',
  'initiativeBonus',
  'passivePerception',
  'notes',
  'ac',
  'maxHp',
  'attackBonus',
  'attacksPerRound',
  'avgDamagePerHit',
  'healingPerRound',
  'dexSave',
  'conSave',
  'wisSave',
  'spellDc',
  'avgSpellDamagePerRound',
];

function describedBy(
  hintId: string | undefined,
  errorId: string,
  error: string | undefined,
): string | undefined {
  return [hintId, error ? errorId : undefined].filter(Boolean).join(' ') || undefined;
}

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? <p id={id} className="field-error" role="alert">{error}</p> : null;
}

export default function PartyMemberEditor({
  member,
  mode = member.id ? 'edit' : 'add',
  onSave,
  onCancel,
  returnFocusRef,
  importWarnings,
  warnings = [],
  saving: repositorySaving = false,
  title,
  onDirtyChange,
}: PartyMemberEditorProps) {
  const generatedId = useId().replace(/:/g, '');
  const idPrefix = `party-member-editor-${member.id ?? generatedId}`;
  const [initialValues] = useState<PartyMemberFormValues>(() => partyMemberToFormValues(member));
  const [values, setValues] = useState<PartyMemberFormValues>(() => partyMemberToFormValues(member));
  const [errors, setErrors] = useState<PartyMemberFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const saveErrorRef = useRef<HTMLDivElement>(null);
  const combatDetailsRef = useRef<HTMLDetailsElement>(null);
  const busy = repositorySaving || submitting;
  const visibleWarnings = importWarnings ?? warnings;
  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(initialValues),
    [initialValues, values],
  );

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  const levelValidation = validateBoundedIntegerInput(values.level, 'Character level', 1, 20);
  const previewMember = useMemo<PartyMemberConfig>(() => ({
    ...(values.id ? { id: values.id } : {}),
    name: values.name,
    templateId: values.templateId,
    level: levelValidation.value ?? member.level,
    ...(values.initiativeBonus.trim() && Number.isFinite(Number(values.initiativeBonus))
      ? { initiativeBonus: Number(values.initiativeBonus) }
      : {}),
    ...(values.overrides ? { overrides: values.overrides } : {}),
  }), [levelValidation.value, member.level, values]);

  function fieldId(field: PartyMemberFormField): string {
    if (FIELD_ORDER.indexOf(field) >= FIELD_ORDER.indexOf('ac')) {
      return partyCombatFieldId(idPrefix, field as Parameters<typeof partyCombatFieldId>[1]);
    }
    return `${idPrefix}-${field}`;
  }

  function clearError(field: PartyMemberFormField): void {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setSaveError(undefined);
  }

  function updateText<K extends keyof PartyMemberFormValues>(
    key: K,
    value: PartyMemberFormValues[K],
  ): void {
    setValues((current) => ({ ...current, [key]: value }));
    clearError(key as PartyMemberFormField);
  }

  function cancel(): void {
    if (busy) return;
    onCancel();
    window.requestAnimationFrame(() => returnFocusRef?.current?.focus());
  }

  function handleEscape(event: KeyboardEvent<HTMLFormElement>): void {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    event.preventDefault();
    cancel();
  }

  async function handleSubmit(): Promise<void> {
    const validation = validatePartyMemberForm(values);
    if (!validation.ok) {
      setErrors(validation.errors);
      setSaveError(undefined);
      const firstInvalid = FIELD_ORDER.find((field) => validation.errors[field]);
      if (firstInvalid) {
        if (FIELD_ORDER.indexOf(firstInvalid) >= FIELD_ORDER.indexOf('ac') && combatDetailsRef.current) {
          combatDetailsRef.current.open = true;
        }
        window.requestAnimationFrame(() => document.getElementById(fieldId(firstInvalid))?.focus());
      }
      return;
    }

    setSubmitting(true);
    setSaveError(undefined);
    try {
      const result = await onSave(validation.member);
      if (result === false || (typeof result === 'object' && !result.ok)) {
        setSaveError(result === false ? 'The character could not be saved.' : result.error);
        window.requestAnimationFrame(() => saveErrorRef.current?.focus());
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The character could not be saved.');
      window.requestAnimationFrame(() => saveErrorRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  const editorTitle = title ?? (mode === 'import'
    ? `Review ${member.name || 'imported character'}`
    : mode === 'edit'
      ? `Edit ${member.name || 'character'}`
      : 'Add a character');

  return (
    <form
      id={idPrefix}
      className="surface-inset animate-fade-in overflow-hidden print:hidden"
      aria-labelledby={`${idPrefix}-heading`}
      noValidate
      onKeyDown={handleEscape}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <header className="border-b border-[var(--line-subtle)] p-4 sm:p-5">
        <p className="micro-label">Character details</p>
        <h2 id={`${idPrefix}-heading`} tabIndex={-1} className="mt-1 text-xl">{editorTitle}</h2>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-2)]">
          Keep the details you reach for at the table up front. Combat estimates stay optional.
        </p>
      </header>

      {visibleWarnings.length > 0 && (
        <section
          className="m-4 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-wash)] p-3 text-sm sm:mx-5"
          aria-labelledby={`${idPrefix}-import-warning-heading`}
          role="status"
        >
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 shrink-0 text-[var(--status-warning)]" size={18} aria-hidden="true" />
            <div>
              <h3 id={`${idPrefix}-import-warning-heading`} className="font-semibold">Check these imported estimates</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-[var(--text-2)]">
                {visibleWarnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
              </ul>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
        <section className="setup-group" aria-labelledby={`${idPrefix}-identity-heading`}>
          <div className="setup-group-heading">
            <div>
              <h3 id={`${idPrefix}-identity-heading`} className="text-base">Who is playing?</h3>
              <p>Name the character and the player behind them.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={fieldId('name')} className="field-label">Character name</label>
              <input
                autoFocus
                id={fieldId('name')}
                type="text"
                className="w-full"
                value={values.name}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? `${fieldId('name')}-error` : undefined}
                onChange={(event) => updateText('name', event.target.value)}
              />
              <FieldError id={`${fieldId('name')}-error`} error={errors.name} />
            </div>
            <div>
              <label htmlFor={fieldId('playerName')} className="field-label">Player name <span className="font-normal text-[var(--text-3)]">(optional)</span></label>
              <input
                id={fieldId('playerName')}
                type="text"
                className="w-full"
                value={values.playerName}
                aria-invalid={errors.playerName ? true : undefined}
                aria-describedby={errors.playerName ? `${fieldId('playerName')}-error` : undefined}
                onChange={(event) => updateText('playerName', event.target.value)}
              />
              <FieldError id={`${fieldId('playerName')}-error`} error={errors.playerName} />
            </div>
            <div>
              <label htmlFor={fieldId('templateId')} className="field-label">Class template</label>
              <PartyClassTemplateSelect
                id={fieldId('templateId')}
                value={values.templateId}
                invalid={Boolean(errors.templateId)}
                describedBy={errors.templateId ? `${fieldId('templateId')}-error` : undefined}
                onChange={(templateId) => {
                  setValues((current) => ({ ...current, templateId, overrides: undefined }));
                  setErrors((current) => {
                    const next = { ...current };
                    delete next.templateId;
                    for (const field of FIELD_ORDER.slice(FIELD_ORDER.indexOf('ac'))) delete next[field];
                    return next;
                  });
                  setSaveError(undefined);
                }}
              />
              <FieldError id={`${fieldId('templateId')}-error`} error={errors.templateId} />
            </div>
            <div>
              <label htmlFor={fieldId('level')} className="field-label">Level</label>
              <input
                id={fieldId('level')}
                type="number"
                min={1}
                max={20}
                step={1}
                inputMode="numeric"
                className="w-full"
                value={values.level}
                aria-invalid={errors.level ? true : undefined}
                aria-describedby={describedBy(`${fieldId('level')}-hint`, `${fieldId('level')}-error`, errors.level)}
                onChange={(event) => updateText('level', event.target.value)}
              />
              <p id={`${fieldId('level')}-hint`} className="field-hint">Level 1–20</p>
              <FieldError id={`${fieldId('level')}-error`} error={errors.level} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={fieldId('classLabel')} className="field-label">Class label <span className="font-normal text-[var(--text-3)]">(optional)</span></label>
              <input
                id={fieldId('classLabel')}
                type="text"
                className="w-full"
                value={values.classLabel}
                placeholder="For example, Battle Master Fighter"
                aria-invalid={errors.classLabel ? true : undefined}
                aria-describedby={errors.classLabel ? `${fieldId('classLabel')}-error` : undefined}
                onChange={(event) => updateText('classLabel', event.target.value)}
              />
              <FieldError id={`${fieldId('classLabel')}-error`} error={errors.classLabel} />
            </div>
          </div>
        </section>

        <section className="setup-group" aria-labelledby={`${idPrefix}-table-heading`}>
          <div className="setup-group-heading">
            <div>
              <h3 id={`${idPrefix}-table-heading`} className="text-base">At-the-table details</h3>
              <p>Fast references for exploration and initiative.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={fieldId('initiativeBonus')} className="field-label">Initiative bonus <span className="font-normal text-[var(--text-3)]">(optional)</span></label>
              <input
                id={fieldId('initiativeBonus')}
                type="number"
                min={-30}
                max={30}
                step={1}
                inputMode="numeric"
                className="w-full"
                value={values.initiativeBonus}
                placeholder="+0"
                aria-invalid={errors.initiativeBonus ? true : undefined}
                aria-describedby={describedBy(`${fieldId('initiativeBonus')}-hint`, `${fieldId('initiativeBonus')}-error`, errors.initiativeBonus)}
                onChange={(event) => updateText('initiativeBonus', event.target.value)}
              />
              <p id={`${fieldId('initiativeBonus')}-hint`} className="field-hint">Whole number from −30 to 30</p>
              <FieldError id={`${fieldId('initiativeBonus')}-error`} error={errors.initiativeBonus} />
            </div>
            <div>
              <label htmlFor={fieldId('passivePerception')} className="field-label">Passive Perception <span className="font-normal text-[var(--text-3)]">(optional)</span></label>
              <input
                id={fieldId('passivePerception')}
                type="number"
                min={0}
                max={100}
                step={1}
                inputMode="numeric"
                className="w-full"
                value={values.passivePerception}
                aria-invalid={errors.passivePerception ? true : undefined}
                aria-describedby={describedBy(`${fieldId('passivePerception')}-hint`, `${fieldId('passivePerception')}-error`, errors.passivePerception)}
                onChange={(event) => updateText('passivePerception', event.target.value)}
              />
              <p id={`${fieldId('passivePerception')}-hint`} className="field-hint">Whole number from 0 to 100</p>
              <FieldError id={`${fieldId('passivePerception')}-error`} error={errors.passivePerception} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={fieldId('notes')} className="field-label">DM notes <span className="font-normal text-[var(--text-3)]">(optional)</span></label>
              <textarea
                id={fieldId('notes')}
                rows={4}
                className="w-full"
                value={values.notes}
                placeholder="Languages, reminders, important items, or story hooks"
                aria-invalid={errors.notes ? true : undefined}
                aria-describedby={describedBy(`${fieldId('notes')}-hint`, `${fieldId('notes')}-error`, errors.notes)}
                onChange={(event) => updateText('notes', event.target.value)}
              />
              <p id={`${fieldId('notes')}-hint`} className="field-hint">Up to 2,000 characters</p>
              <FieldError id={`${fieldId('notes')}-error`} error={errors.notes} />
            </div>
          </div>
        </section>
      </div>

      <div className="mx-4 mb-4 rounded-lg border border-[var(--line-subtle)] bg-[var(--surface-subtle)] p-3 sm:mx-5">
        <p className="meta-label">Forecast preview</p>
        <div className="mt-1"><PartyCombatStatPreview member={previewMember} /></div>
      </div>

      <details ref={combatDetailsRef} className="disclosure-panel disclosure-panel-flush !mx-4 mb-4 sm:!mx-5">
        <summary>
          <span className="disclosure-summary-copy">
            <SlidersHorizontal size={17} aria-hidden="true" />
            <span>
              <strong>Fine-tune combat profile</strong>
              <small>Override the class template only when the forecast needs closer math</small>
            </span>
          </span>
          <ChevronDown className="disclosure-chevron" size={18} aria-hidden="true" />
        </summary>
        <PartyCombatProfileFields
          member={previewMember}
          idPrefix={idPrefix}
          errors={errors}
          className="grid grid-cols-2 gap-3 border-t border-[var(--line-subtle)] p-4 sm:grid-cols-3 lg:grid-cols-6"
          onChange={(overrides, changedField) => {
            setValues((current) => ({ ...current, overrides }));
            clearError(changedField);
          }}
        />
      </details>

      {saveError && (
        <div
          ref={saveErrorRef}
          tabIndex={-1}
          className="mx-4 mb-4 rounded-lg border border-[var(--accent-danger)] bg-[var(--status-danger-wash)] p-3 text-sm text-[var(--text-1)] sm:mx-5"
          role="alert"
        >
          {saveError}
        </div>
      )}

      <footer className="workflow-action-bar">
        <div className="workflow-primary-action">
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy}>
            <Save size={17} aria-hidden="true" />
            {busy ? 'Saving…' : 'Save character'}
          </button>
          <p>Saves this character to the Party Library in this browser.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost w-full text-sm sm:w-auto" disabled={busy} onClick={cancel}>
            Cancel
          </button>
        </div>
      </footer>
    </form>
  );
}
