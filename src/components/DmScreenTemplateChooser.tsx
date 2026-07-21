'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import {
  Compass,
  FileText,
  LayoutTemplate,
  Plus,
  RotateCcw,
  Sparkles,
  Swords,
} from 'lucide-react';
import {
  DM_SCREEN_TEMPLATES,
  getDmScreenTemplate,
  type DmScreenTemplateDefinition,
} from '@/lib/dm-screen-templates';

export type DmScreenTemplateChooserMode = 'first-use' | 'existing';
export type DmScreenTemplateAction = 'add' | 'replace';

export interface DmScreenTemplateApplyResult {
  ok: boolean;
  error?: string;
}

const TEMPLATE_ICONS: Record<string, ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>> = {
  'quick-start': Sparkles,
  'combat-night': Swords,
  'story-exploration': Compass,
  blank: FileText,
};

export default function DmScreenTemplateChooser({
  mode,
  busy,
  ready,
  currentTitle,
  currentSectionCount,
  currentPanelCount,
  onApply,
  onCancel,
}: {
  mode: DmScreenTemplateChooserMode;
  busy: boolean;
  ready: boolean;
  currentTitle: string;
  currentSectionCount: number;
  currentPanelCount: number;
  onApply: (
    template: DmScreenTemplateDefinition,
    action: DmScreenTemplateAction,
  ) => Promise<DmScreenTemplateApplyResult>;
  onCancel: () => void;
}) {
  const [selectedId, setSelectedId] = useState('quick-start');
  const [applying, setApplying] = useState(false);
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [error, setError] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null);
  const replaceTriggerRef = useRef<HTMLButtonElement>(null);
  const restoreReplaceFocusRef = useRef(false);
  const selected = getDmScreenTemplate(selectedId) ?? DM_SCREEN_TEMPLATES[0];
  const controlsLocked = applying;
  const actionLocked = busy || applying || !ready;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (confirmingReplace) {
      confirmationHeadingRef.current?.focus();
      return;
    }

    if (restoreReplaceFocusRef.current) {
      restoreReplaceFocusRef.current = false;
      replaceTriggerRef.current?.focus();
    }
  }, [confirmingReplace]);

  function choose(templateId: string): void {
    if (controlsLocked) return;
    setSelectedId(templateId);
    setConfirmingReplace(false);
    setError('');
  }

  async function apply(action: DmScreenTemplateAction): Promise<void> {
    if (actionLocked) return;
    setApplying(true);
    setError('');
    try {
      const result = await onApply(selected, action);
      if (!result.ok) setError(result.error ?? 'That template could not be applied.');
    } finally {
      setApplying(false);
    }
  }

  function returnFromReplaceConfirmation(): void {
    restoreReplaceFocusRef.current = true;
    setConfirmingReplace(false);
  }

  return (
    <section id="dm-screen-template-chooser" className="card panel-accent mb-5 print:hidden" aria-labelledby="dm-screen-template-heading">
      <div>
        <div className="max-w-3xl">
          <p className="micro-label">{mode === 'first-use' ? 'Start here' : 'Screen templates'}</p>
          <h2 id="dm-screen-template-heading" ref={headingRef} tabIndex={-1} className="mt-1 w-fit rounded text-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bronze)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--surface-raised)]">
            {mode === 'first-use' ? 'Choose a starting screen' : 'Add a useful layout in seconds'}
          </h2>
          <p className="mt-2 text-sm text-[var(--text-2)]">
            {mode === 'first-use'
              ? 'Pick the closest fit for tonight. Every panel can be renamed, stashed, or removed later.'
              : 'Preview a layout first, then add its sections or deliberately replace this screen.'}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(17rem,0.75fr)]">
        <div className="grid gap-3 sm:grid-cols-2" aria-label="Available DM Screen templates">
          {DM_SCREEN_TEMPLATES.map((template) => {
            const Icon = TEMPLATE_ICONS[template.id] ?? LayoutTemplate;
            const active = template.id === selected.id;
            return (
              <button
                key={template.id}
                type="button"
                className={`selection-card min-h-32 text-left ${active ? 'border-[var(--bronze)] bg-[var(--bronze-wash)]' : ''}`}
                aria-pressed={active}
                disabled={controlsLocked}
                onClick={() => choose(template.id)}
              >
                <span className="flex items-start gap-3">
                  <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-[var(--bronze)] text-[var(--ink)]' : 'bg-[var(--steel-800)] text-[var(--bronze)]'}`}>
                    <Icon size={19} aria-hidden={true} />
                  </span>
                  <span>
                    <span className="flex flex-wrap items-center gap-2 font-semibold text-[var(--text-1)]">
                      {template.name}
                      {template.id === 'quick-start' && <span className="rounded-full bg-[var(--bronze-wash)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--bronze)]">Recommended</span>}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-[var(--text-2)]">{template.description}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <aside className="surface-inset p-4" aria-label={`${selected.name} preview`}>
          <p className="micro-label">Preview</p>
          <div className="mt-2 flex items-start gap-3">
            <LayoutTemplate size={21} className="mt-0.5 shrink-0 text-[var(--bronze)]" aria-hidden="true" />
            <div>
              <h3 className="text-xl">{selected.name}</h3>
              <p className="mt-1 text-sm text-[var(--text-2)]">{selected.description}</p>
            </div>
          </div>
          {selected.contents.length > 0 ? (
            <ol className="mt-4 space-y-2 text-sm">
              {selected.contents.map((content, index) => (
                <li key={content} className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--steel-800)] text-[11px] font-semibold text-[var(--bronze)]">{index + 1}</span>
                  <span>{content}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 rounded-lg border border-dashed border-[var(--steel-700)] p-3 text-sm text-[var(--text-3)]">
              No sections or panels. Build this screen entirely yourself.
            </p>
          )}
          {selected.id !== 'blank' && (
            <p className="mt-4 text-xs text-[var(--text-3)]">
              {mode === 'first-use'
                ? 'Pinned references from your libraries are included and stay synchronized.'
                : 'Add keeps your current pin settings; Replace uses this template’s synchronized pins.'}
            </p>
          )}
        </aside>
      </div>

      {error && <p role="alert" className="field-error mt-4 rounded-lg border border-[var(--status-danger)] bg-[var(--status-danger-wash)] p-3">{error}</p>}
      {(!ready || (busy && !applying)) && (
        <p role="status" className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--text-2)]">
          <RotateCcw size={16} className="animate-spin" aria-hidden="true" />
          {!ready ? 'Loading party and pinned references…' : 'Finishing the current screen save…'}
        </p>
      )}

      {confirmingReplace ? (
        <div className="mt-4 rounded-xl border border-[var(--status-warning)] bg-[var(--status-warning-wash)] p-4">
          <h3 ref={confirmationHeadingRef} tabIndex={-1} className="w-fit rounded text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bronze)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--status-warning-wash)]">Replace “{currentTitle}”?</h3>
          <p className="mt-1 text-sm text-[var(--text-2)]">
            This removes {currentSectionCount} section{currentSectionCount === 1 ? '' : 's'} and {currentPanelCount} panel{currentPanelCount === 1 ? '' : 's'}, then loads {selected.name}. You can undo until the next saved screen edit.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button type="button" className="btn-primary w-full sm:w-auto" disabled={actionLocked} onClick={() => void apply('replace')}>
              <RotateCcw size={17} aria-hidden="true" /> {applying ? 'Replacing…' : `Replace with ${selected.name}`}
            </button>
            <button type="button" className="btn-ghost w-full sm:w-auto" disabled={controlsLocked} onClick={returnFromReplaceConfirmation}>Go back</button>
          </div>
        </div>
      ) : mode === 'first-use' ? (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" className="btn-primary w-full sm:w-auto" disabled={actionLocked} onClick={() => void apply('replace')}>
            <Sparkles size={17} aria-hidden="true" /> {applying ? 'Building screen…' : `Use ${selected.name}`}
          </button>
          <button type="button" className="btn-ghost w-full sm:w-auto" disabled={controlsLocked} onClick={onCancel}>Decide later</button>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" className="btn-primary w-full sm:w-auto" disabled={actionLocked || selected.contents.length === 0} onClick={() => void apply('add')}>
            <Plus size={17} aria-hidden="true" /> {applying ? 'Adding…' : selected.contents.length === 0 ? 'Nothing to add' : `Add ${selected.name}`}
          </button>
          <button ref={replaceTriggerRef} type="button" className="btn-secondary w-full text-[var(--accent-danger)] sm:w-auto" disabled={controlsLocked} onClick={() => setConfirmingReplace(true)}>
            <RotateCcw size={17} aria-hidden="true" /> Replace screen…
          </button>
          <button type="button" className="btn-ghost w-full sm:w-auto" disabled={controlsLocked} onClick={onCancel}>Cancel</button>
        </div>
      )}
    </section>
  );
}
