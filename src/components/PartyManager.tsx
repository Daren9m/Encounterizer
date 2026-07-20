'use client';

import Link from 'next/link';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BookOpen,
  ChevronDown,
  Copy,
  Download,
  FileUp,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  Swords,
  Trash2,
  Upload,
  UserPlus,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { usePartyLibrary } from '@/app/hooks/usePartyLibrary';
import { getTemplateById } from '@/data/class-templates';
import { importCharacterJson } from '@/lib/character-import';
import { validateBoundedIntegerInput } from '@/lib/number-input';
import {
  mergePartyLibraries,
  parsePartyLibraryBackup,
  previewPartyLibraryImport,
  replacePartyLibrary,
  serializePartyLibrary,
  type PartyBackupParseResult,
} from '@/lib/party-backup';
import {
  archiveParty,
  createParty,
  deleteArchivedParty,
  duplicateParty,
  renameParty,
  reorderPartyMember,
  replacePartyMembers,
  restoreParty,
  setActiveParty,
  setAllPartyMemberLevels,
} from '@/lib/party-manager';
import {
  createPartyId,
  getActiveParty,
  type NewPartyMemberInput,
  type PartyLibrary,
  type PartyMemberDraft,
  type PartyMemberProfile,
  type PartyProfile,
} from '@/lib/party';
import PartyMemberEditor from '@/components/PartyMemberEditor';
import PartyPersistenceStatus from '@/components/PartyPersistenceStatus';

type StarterKind = 'balanced' | 'empty';
type EditorMode = 'add' | 'edit' | 'import';

interface EditorState {
  key: string;
  partyId: string;
  mode: EditorMode;
  memberId?: string;
  member: PartyMemberDraft;
  warnings: string[];
  returnFocusId: string;
  dirty: boolean;
}

interface BackupCandidate {
  fileName: string;
  parsed: Extract<PartyBackupParseResult, { ok: true }>;
}

function balancedStarter(level: number): NewPartyMemberInput[] {
  return [
    { name: 'Player 1', templateId: 'fighter-champion', level },
    { name: 'Player 2', templateId: 'cleric-life', level },
    { name: 'Player 3', templateId: 'rogue-thief', level },
    { name: 'Player 4', templateId: 'wizard-evoker', level },
  ];
}

function cloneMemberDraft(member: PartyMemberDraft): PartyMemberDraft {
  return {
    ...member,
    ...(member.overrides ? {
      overrides: {
        ...member.overrides,
        ...(member.overrides.saveBonuses
          ? { saveBonuses: { ...member.overrides.saveBonuses } }
          : {}),
      },
    } : {}),
  };
}

function partyLevelLabel(party: PartyProfile): string {
  if (party.members.length === 0) return 'No heroes yet';
  const levels = party.members.map((member) => member.level);
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  return min === max ? `Level ${min}` : `Levels ${min}–${max}`;
}

function focusById(id: string): void {
  window.requestAnimationFrame(() => document.getElementById(id)?.focus());
}

export default function PartyManager() {
  const {
    library,
    hydrated,
    status,
    updateLibrary,
  } = usePartyLibrary();
  const activeParty = library ? getActiveParty(library) : null;
  const availableParties = useMemo(
    () => library?.parties.filter((party) => party.archivedAt === undefined) ?? [],
    [library],
  );
  const archivedParties = useMemo(
    () => library?.parties.filter((party) => party.archivedAt !== undefined) ?? [],
    [library],
  );
  const [showCreate, setShowCreate] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [characterImportError, setCharacterImportError] = useState('');
  const characterFileRef = useRef<HTMLInputElement>(null);
  const partyActionMenuRef = useRef<HTMLDetailsElement>(null);
  const activePartyIdRef = useRef<string | null>(activeParty?.id ?? null);

  useEffect(() => {
    activePartyIdRef.current = activeParty?.id ?? null;
  }, [activeParty?.id]);

  const saving = status === 'saving';

  const handleEditorDirtyChange = useCallback((dirty: boolean): void => {
    setEditor((current) => current && current.dirty !== dirty
      ? { ...current, dirty }
      : current);
  }, []);

  function confirmDiscardOpenEditor(nextLabel: string): boolean {
    if (!editor || (!editor.dirty && editor.mode !== 'import')) return true;
    const name = editor.member.name.trim() || 'this character';
    return window.confirm(`Discard unsaved changes to ${name} and ${nextLabel}?`);
  }

  function discardOpenEditor(nextLabel: string): boolean {
    if (!confirmDiscardOpenEditor(nextLabel)) return false;
    setEditor(null);
    return true;
  }

  function closePartyMenu(): void {
    if (partyActionMenuRef.current) partyActionMenuRef.current.open = false;
  }

  async function commit(
    transform: (current: PartyLibrary) => PartyLibrary,
  ): Promise<boolean> {
    const result = await updateLibrary(transform);
    return result.ok;
  }

  async function handlePartyChange(partyId: string): Promise<boolean> {
    if (!library || partyId === library.activePartyId) return true;
    if (!confirmDiscardOpenEditor('switch parties')) return false;
    const saved = await commit((current) => setActiveParty(current, partyId));
    if (saved) {
      setEditor(null);
      setShowRename(false);
      setShowCreate(false);
    }
    return saved;
  }

  async function handleDuplicate(): Promise<void> {
    if (!activeParty || !confirmDiscardOpenEditor('duplicate the party')) return;
    closePartyMenu();
    setShowRename(false);
    const saved = await commit((current) => duplicateParty(current, activeParty.id));
    if (saved) {
      setEditor(null);
      setShowCreate(false);
      focusById('party-roster-heading');
    }
  }

  async function handleArchive(): Promise<void> {
    if (!activeParty || !confirmDiscardOpenEditor('archive the party')) return;
    closePartyMenu();
    setShowRename(false);
    const saved = await commit((current) => archiveParty(current, activeParty.id));
    if (saved) {
      setEditor(null);
      setShowCreate(false);
      focusById(availableParties.length > 1 ? 'party-active' : 'new-party-name');
    }
  }

  async function handleRename(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!activeParty) return;
    const normalized = renameValue.trim();
    if (!normalized || normalized.length > 120) {
      setRenameError('Party name must contain between 1 and 120 characters.');
      document.getElementById('party-rename')?.focus();
      return;
    }
    const saved = await commit((current) => renameParty(current, activeParty.id, normalized));
    if (saved) {
      setShowRename(false);
      setRenameError('');
      focusById('party-actions-trigger');
    }
  }

  function openAddCharacter(): void {
    if (!activeParty || !discardOpenEditor('add another character')) return;
    const returnFocusId = 'party-add-character';
    setCharacterImportError('');
    setEditor({
      key: createPartyId('member'),
      partyId: activeParty.id,
      mode: 'add',
      member: {
        name: '',
        templateId: 'fighter-champion',
        level: activeParty.members[0]?.level ?? 3,
      },
      warnings: [],
      returnFocusId,
      dirty: false,
    });
  }

  function openEditCharacter(member: PartyMemberProfile): void {
    if (!activeParty) return;
    if (editor?.mode === 'edit' && editor.partyId === activeParty.id && editor.memberId === member.id) {
      focusById(`party-member-editor-${member.id}-heading`);
      return;
    }
    if (!discardOpenEditor(`edit ${member.name || 'this character'}`)) return;
    setCharacterImportError('');
    setEditor({
      key: createPartyId('member'),
      partyId: activeParty.id,
      mode: 'edit',
      memberId: member.id,
      member: cloneMemberDraft(member),
      warnings: [],
      returnFocusId: `party-edit-${member.id}`,
      dirty: false,
    });
  }

  function closeEditor(): void {
    const returnFocusId = editor?.returnFocusId;
    setEditor(null);
    if (returnFocusId) focusById(returnFocusId);
  }

  async function saveEditor(
    member: PartyMemberDraft,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!editor) return { ok: false, error: 'This character editor is no longer open.' };
    const editorContext = editor;
    const result = await updateLibrary((current) => {
      const currentParty = current.parties.find((party) => party.id === editorContext.partyId);
      if (!currentParty || currentParty.archivedAt !== undefined) {
        throw new Error('This party is no longer available. Your unsaved character is still open.');
      }
      if (
        editorContext.mode === 'edit'
        && editorContext.memberId
        && !currentParty.members.some((candidate) => candidate.id === editorContext.memberId)
      ) {
        throw new Error('This character was removed elsewhere. Copy any notes you need, then cancel this editor.');
      }
      const nextDrafts: PartyMemberDraft[] = editorContext.mode === 'edit' && editorContext.memberId
        ? currentParty.members.map((currentMember) => currentMember.id === editorContext.memberId
          ? { ...member, id: editorContext.memberId }
          : currentMember)
        : [...currentParty.members, { ...member, id: undefined }];
      return replacePartyMembers(current, editorContext.partyId, nextDrafts);
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.error?.message ?? 'The character could not be saved. Your changes are still open.',
      };
    }
    setEditor((current) => current?.key === editorContext.key ? null : current);
    focusById(editorContext.partyId === activePartyIdRef.current
      ? editorContext.returnFocusId
      : 'party-active');
    return { ok: true };
  }

  async function handleRemoveMember(member: PartyMemberProfile): Promise<void> {
    if (!activeParty) return;
    if (!window.confirm(`Remove ${member.name || 'this character'} from ${activeParty.name}?`)) return;
    const activeId = activeParty.id;
    const memberIndex = activeParty.members.findIndex((candidate) => candidate.id === member.id);
    const nextMember = activeParty.members[memberIndex + 1] ?? activeParty.members[memberIndex - 1];
    const saved = await commit((current) => {
      const currentParty = current.parties.find((party) => party.id === activeId);
      if (!currentParty) throw new Error('This party is no longer available.');
      return replacePartyMembers(
        current,
        activeId,
        currentParty.members.filter((candidate) => candidate.id !== member.id),
      );
    });
    if (saved) {
      if (editor?.partyId === activeId && editor.memberId === member.id) setEditor(null);
      focusById(nextMember ? `party-edit-${nextMember.id}` : 'party-add-character');
    }
  }

  async function handleMoveMember(memberId: string, destinationIndex: number): Promise<void> {
    if (!activeParty) return;
    await commit((current) => reorderPartyMember(
      current,
      activeParty.id,
      memberId,
      destinationIndex,
    ));
  }

  async function handleCharacterFile(file: File | undefined): Promise<void> {
    if (!file || !activeParty) return;
    const partyId = activeParty.id;
    setCharacterImportError('');
    try {
      const result = importCharacterJson(await file.text());
      if (!result.ok) {
        setCharacterImportError(result.error);
        return;
      }
      if (activePartyIdRef.current !== partyId) {
        setCharacterImportError('The active party changed while that file was opening. Choose the character file again.');
        return;
      }
      if (!discardOpenEditor('import a character')) return;
      setEditor({
        key: createPartyId('member'),
        partyId,
        mode: 'import',
        member: cloneMemberDraft(result.member),
        warnings: result.warnings,
        returnFocusId: 'party-import-character',
        dirty: false,
      });
    } catch {
      setCharacterImportError('That character file could not be read. Try exporting it again.');
    }
  }

  if (!hydrated) {
    return (
      <section className="workflow-shell" aria-live="polite" aria-busy="true">
        <header className="workflow-header">
          <div className="workflow-title">
            <span className="workflow-step" aria-hidden="true">1</span>
            <div>
              <p className="micro-label">Choose the party</p>
              <h2 className="mt-1 text-2xl">Opening your Party Library…</h2>
            </div>
          </div>
        </header>
      </section>
    );
  }

  if (!library) {
    return (
      <>
        <PartyPersistenceStatus />
        <section className="workflow-shell">
          <h2 className="text-2xl">Your Party Library could not be opened</h2>
          <p className="mt-2 text-sm text-[var(--text-2)]">
            Nothing was overwritten. Retry browser storage above before creating or editing a party.
          </p>
        </section>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PartyPersistenceStatus errorsOnly />

      <section className="workflow-shell" aria-labelledby="party-choose-heading">
        <header className="workflow-header">
          <div className="workflow-title">
            <span className="workflow-step" aria-hidden="true">1</span>
            <div>
              <p className="micro-label">Choose the party</p>
              <h2 id="party-choose-heading" className="mt-1 text-2xl">Who is at the table?</h2>
              <p className="mt-1 text-sm text-[var(--text-2)]">
                  Keep more than one group, then choose the active party for planning.
              </p>
            </div>
          </div>
          <div className="workflow-context" role="status">
            <span className="micro-label">Active party</span>
            <strong>{activeParty?.name ?? 'None selected'}</strong>
          </div>
        </header>

        {availableParties.length > 0 && activeParty ? (
          <div className="setup-grid">
            <div className="setup-group">
              <div className="setup-group-heading">
                <span className="next-step-icon" aria-hidden="true"><Users size={20} /></span>
                <div>
                  <h3>Active party</h3>
                  <p>This selection follows you into supported planning tools.</p>
                </div>
              </div>
              <label htmlFor="party-active" className="field-label">Party</label>
              <select
                id="party-active"
                value={activeParty.id}
                disabled={saving}
                onChange={(event) => {
                  const control = event.currentTarget;
                  void handlePartyChange(control.value).then((switched) => {
                    if (!switched) control.value = activeParty.id;
                  });
                }}
                className="w-full"
              >
                {availableParties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name} · {party.members.length} hero{party.members.length === 1 ? '' : 'es'}
                  </option>
                ))}
              </select>
              <p className="field-hint">{partyLevelLabel(activeParty)}</p>
            </div>

            <div className="setup-group">
              <div className="setup-group-heading">
                <span className="next-step-icon" aria-hidden="true"><ShieldCheck size={20} /></span>
                <div>
                  <h3>Manage this party</h3>
                  <p>Frequent roster edits stay in step 2. Library actions live here.</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  id="party-new-trigger"
                  type="button"
                  className="btn-secondary w-full sm:w-auto"
                  disabled={saving}
                  onClick={() => {
                    if (!discardOpenEditor('create another party')) return;
                    setShowRename(false);
                    setShowCreate(true);
                  }}
                >
                  <Plus size={16} aria-hidden="true" />
                  New party
                </button>
                <details ref={partyActionMenuRef} className="action-menu action-menu-flow sm:w-auto">
                  <summary
                    id="party-actions-trigger"
                    className="btn-secondary"
                    role="button"
                    aria-disabled={saving}
                    onClick={(event) => {
                      if (saving) event.preventDefault();
                    }}
                  >
                    <MoreHorizontal size={16} aria-hidden="true" />
                    Party actions
                    <ChevronDown size={14} aria-hidden="true" />
                  </summary>
                  <div className="action-menu-panel">
                    <button
                      type="button"
                      className="menu-action"
                      disabled={saving}
                      onClick={() => {
                        closePartyMenu();
                        setShowCreate(false);
                        setRenameValue(activeParty.name);
                        setRenameError('');
                        setShowRename(true);
                        focusById('party-rename');
                      }}
                    >
                      <Pencil size={17} aria-hidden="true" />
                      <span><strong>Rename party</strong><small>Change the name shown across the toolkit.</small></span>
                    </button>
                    <button type="button" className="menu-action" disabled={saving} onClick={() => void handleDuplicate()}>
                      <Copy size={17} aria-hidden="true" />
                      <span><strong>Duplicate party</strong><small>Make an independent copy with fresh IDs.</small></span>
                    </button>
                    <button type="button" className="menu-action" disabled={saving} onClick={() => void handleArchive()}>
                      <Archive size={17} aria-hidden="true" />
                      <span><strong>Archive party</strong><small>Hide it from tools while keeping it recoverable.</small></span>
                    </button>
                  </div>
                </details>
              </div>
            </div>
          </div>
        ) : (
          <div className="content-panel mx-4 mt-4 sm:mx-5">
            <h3 className="text-xl">Create your first reusable party</h3>
            <p className="mt-1 text-sm text-[var(--text-2)]">
              Start with a balanced four-hero roster, then personalize only what matters at your table.
            </p>
          </div>
        )}

        {showRename && activeParty && (
          <form className="content-panel mx-4 mt-4 sm:mx-5" onSubmit={(event) => void handleRename(event)}>
            <div className="content-panel-heading">
              <div>
                <h3>Rename {activeParty.name}</h3>
                <p>This changes the shared party name without touching its roster.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
              <div>
                <label htmlFor="party-rename" className="field-label">Party name</label>
                <input
                  id="party-rename"
                  value={renameValue}
                  maxLength={120}
                  aria-invalid={renameError ? true : undefined}
                  aria-describedby={renameError ? 'party-rename-error' : undefined}
                  onChange={(event) => {
                    setRenameValue(event.target.value);
                    setRenameError('');
                  }}
                />
                {renameError && <p id="party-rename-error" className="field-error" role="alert">{renameError}</p>}
              </div>
              <button type="submit" className="btn-primary" disabled={saving}>Save name</button>
              <button
                type="button"
                className="btn-ghost"
                disabled={saving}
                onClick={() => {
                  setShowRename(false);
                  focusById('party-actions-trigger');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {(showCreate || availableParties.length === 0) && (
          <CreatePartyPanel
            canCancel={availableParties.length > 0}
            saving={saving}
            onCancel={() => {
              setShowCreate(false);
              focusById('party-new-trigger');
            }}
            onCreate={async (name, level, starter) => {
              const saved = await commit((current) => createParty(current, {
                name,
                members: starter === 'balanced' ? balancedStarter(level) : [],
              }));
              if (saved) {
                setShowCreate(false);
                focusById('party-roster-heading');
              }
              return saved;
            }}
          />
        )}

        {archivedParties.length > 0 && (
          <ArchivedParties
            parties={archivedParties}
            saving={saving}
            onRestore={async (partyId) => {
              const saved = await commit((current) => restoreParty(current, partyId));
              if (saved) focusById('party-active');
              return saved;
            }}
            onDelete={async (party) => {
              if (!window.confirm(
                `Permanently delete ${party.name} and its ${party.members.length} hero${party.members.length === 1 ? '' : 'es'}? This cannot be undone.`,
              )) return false;
              const saved = await commit((current) => deleteArchivedParty(current, party.id));
              if (saved) focusById(archivedParties.length > 1 ? 'party-archived-summary' : 'party-backup-summary');
              return saved;
            }}
          />
        )}

        <PartyBackupPanel
          library={library}
          saving={saving}
          onBeforeApply={() => confirmDiscardOpenEditor('import a Party Library backup')}
          onImport={async (candidate, mode) => {
            const saved = await commit((current) => mode === 'merge'
              ? mergePartyLibraries(current, candidate.parsed.library, { createId: createPartyId }).library
              : replacePartyLibrary(current, candidate.parsed.library));
            if (saved) {
              setEditor(null);
              setShowRename(false);
              setShowCreate(false);
            }
            return saved;
          }}
        />
      </section>

      {activeParty && (
        <section className="workflow-shell" aria-labelledby="party-roster-heading">
          <header className="workflow-header">
            <div className="workflow-title">
              <span className="workflow-step" aria-hidden="true">2</span>
              <div>
                <p className="micro-label">Build the roster</p>
                <h2 id="party-roster-heading" tabIndex={-1} className="mt-1 text-2xl">Add the heroes</h2>
                <p className="mt-1 text-sm text-[var(--text-2)]">
                  Keep the essentials visible. Open one hero when you need table notes or forecast tuning.
                </p>
              </div>
            </div>
            <div className="workflow-context">
              <span className="micro-label">{activeParty.name}</span>
              <strong>{activeParty.members.length} hero{activeParty.members.length === 1 ? '' : 'es'} · {partyLevelLabel(activeParty)}</strong>
              <PartyPersistenceStatus hideErrors />
            </div>
          </header>

          <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] lg:items-start">
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <button
                  id="party-add-character"
                  type="button"
                  className={activeParty.members.length === 0 ? 'btn-primary w-full sm:w-auto' : 'btn-secondary w-full sm:w-auto'}
                  disabled={saving}
                  onClick={openAddCharacter}
                >
                  <UserPlus size={17} aria-hidden="true" />
                  Add character
                </button>
                <button
                  id="party-import-character"
                  type="button"
                  className="btn-secondary w-full sm:w-auto"
                  disabled={saving}
                  onClick={() => characterFileRef.current?.click()}
                >
                  <FileUp size={17} aria-hidden="true" />
                  Import character JSON
                </button>
                <input
                  ref={characterFileRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(event) => {
                    void handleCharacterFile(event.target.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                />
              </div>
              {characterImportError && (
                <p role="alert" className="field-error rounded-lg border border-[var(--status-danger)] bg-[var(--status-danger-wash)] p-3">
                  {characterImportError}
                </p>
              )}

              {activeParty.members.length === 0 ? (
                <div className="content-panel">
                  <h3 className="text-lg">This party is ready for its first hero</h3>
                  <p className="mt-1 text-sm text-[var(--text-3)]">
                    Add one manually or review a supported character export before saving it.
                  </p>
                </div>
              ) : (
                <ol className="space-y-2" aria-label={`${activeParty.name} roster`}>
                  {activeParty.members.map((member, index) => (
                    <li key={member.id}>
                      <PartyMemberSummary
                        member={member}
                        index={index}
                        count={activeParty.members.length}
                        editing={editor?.memberId === member.id}
                        disabled={saving}
                        onEdit={() => openEditCharacter(member)}
                        onMove={(destination) => void handleMoveMember(member.id, destination)}
                        onRemove={() => void handleRemoveMember(member)}
                      />
                    </li>
                  ))}
                </ol>
              )}

              <BatchLevelControl
                key={activeParty.id}
                party={activeParty}
                saving={saving}
                onApply={async (level) => commit((current) => setAllPartyMemberLevels(
                  current,
                  activeParty.id,
                  level,
                ))}
              />
            </div>

            <div>
              {editor ? (
                <div className="space-y-3">
                  {editor.partyId !== activeParty.id && (
                    <div className="rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-wash)] p-3 text-sm" role="status">
                      This editor belongs to another party. Save or cancel it before editing the current roster.
                    </div>
                  )}
                  <PartyMemberEditor
                    key={editor.key}
                    member={editor.member}
                    mode={editor.mode}
                    warnings={editor.warnings}
                    saving={saving}
                    onSave={saveEditor}
                    onCancel={closeEditor}
                    onDirtyChange={handleEditorDirtyChange}
                  />
                </div>
              ) : (
                <div className="content-panel">
                  <div className="content-panel-heading">
                    <div>
                      <h3>Choose a hero to edit</h3>
                      <p>Names, levels, and class templates stay simple. Table details and combat math open only when needed.</p>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm text-[var(--text-2)]">
                    <li>• Reorder the roster with the arrow controls.</li>
                    <li>• Imported estimates are reviewed here before anything is saved.</li>
                    <li>• Current HP and conditions stay with the live battle, not the durable party.</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeParty && activeParty.members.length > 0 && (
        <PartyReadyPanel party={activeParty} />
      )}
    </div>
  );
}

function CreatePartyPanel({
  canCancel,
  saving,
  onCancel,
  onCreate,
}: {
  canCancel: boolean;
  saving: boolean;
  onCancel: () => void;
  onCreate: (name: string, level: number, starter: StarterKind) => Promise<boolean>;
}) {
  const [name, setName] = useState('Adventuring Party');
  const [level, setLevel] = useState('3');
  const [starter, setStarter] = useState<StarterKind>('balanced');
  const [nameError, setNameError] = useState('');
  const [levelError, setLevelError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalized = name.trim();
    const levelValidation = validateBoundedIntegerInput(level, 'Starting level', 1, 20);
    const nextNameError = normalized && normalized.length <= 120
      ? ''
      : 'Party name must contain between 1 and 120 characters.';
    setNameError(nextNameError);
    setLevelError(levelValidation.error ?? '');
    if (nextNameError) {
      document.getElementById('new-party-name')?.focus();
      return;
    }
    if (levelValidation.value === null) {
      document.getElementById('new-party-level')?.focus();
      return;
    }
    await onCreate(normalized, levelValidation.value, starter);
  }

  return (
    <form className="content-panel mx-4 mt-4 sm:mx-5" onSubmit={(event) => void submit(event)}>
      <div className="content-panel-heading">
        <div>
          <p className="micro-label">New party</p>
          <h3 className="mt-1 text-xl">Start useful, then personalize</h3>
          <p>A balanced starter takes one click. An empty party leaves every roster choice to you.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="new-party-name" className="field-label">Party name</label>
          <input
            id="new-party-name"
            value={name}
            maxLength={120}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? 'new-party-name-error' : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setNameError('');
            }}
          />
          {nameError && <p id="new-party-name-error" className="field-error" role="alert">{nameError}</p>}
        </div>
        <div>
          <label htmlFor="new-party-level" className="field-label">Starting level</label>
          <input
            id="new-party-level"
            type="number"
            inputMode="numeric"
            min={1}
            max={20}
            value={level}
            aria-invalid={levelError ? true : undefined}
            aria-describedby={levelError ? 'new-party-level-error' : 'new-party-level-hint'}
            onChange={(event) => {
              setLevel(event.target.value);
              setLevelError('');
            }}
          />
          {levelError
            ? <p id="new-party-level-error" className="field-error" role="alert">{levelError}</p>
            : <p id="new-party-level-hint" className="field-hint">You can keep mixed levels later.</p>}
        </div>
      </div>
      <fieldset className="mt-4">
        <legend className="field-label">Starting roster</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className={`selection-card min-h-24 ${starter === 'balanced' ? 'border-[var(--bronze)] bg-[var(--bronze-wash)]' : ''}`}
            aria-pressed={starter === 'balanced'}
            onClick={() => setStarter('balanced')}
          >
            <strong className="block text-sm text-[var(--text-1)]">Balanced four-hero party</strong>
            <span className="mt-1 block text-xs leading-relaxed text-[var(--text-3)]">Fighter, cleric, rogue, and wizard. Recommended.</span>
          </button>
          <button
            type="button"
            className={`selection-card min-h-24 ${starter === 'empty' ? 'border-[var(--bronze)] bg-[var(--bronze-wash)]' : ''}`}
            aria-pressed={starter === 'empty'}
            onClick={() => setStarter('empty')}
          >
            <strong className="block text-sm text-[var(--text-1)]">Empty party</strong>
            <span className="mt-1 block text-xs leading-relaxed text-[var(--text-3)]">Begin with a name and add each hero yourself.</span>
          </button>
        </div>
      </fieldset>
      <footer className="workflow-action-bar -mx-4 -mb-4">
        <div className="workflow-primary-action">
          <button type="submit" className="btn-primary w-full sm:w-auto" disabled={saving}>
            <Users size={17} aria-hidden="true" />
            Create party
          </button>
          <p>{starter === 'balanced' ? 'Creates four editable heroes.' : 'Creates an empty reusable party.'}</p>
        </div>
        {canCancel && <button type="button" className="btn-ghost" disabled={saving} onClick={onCancel}>Cancel</button>}
      </footer>
    </form>
  );
}

function ArchivedParties({
  parties,
  saving,
  onRestore,
  onDelete,
}: {
  parties: PartyProfile[];
  saving: boolean;
  onRestore: (partyId: string) => Promise<boolean>;
  onDelete: (party: PartyProfile) => Promise<boolean>;
}) {
  return (
    <details className="disclosure-panel mt-4">
      <summary id="party-archived-summary">
        <span className="disclosure-summary-copy">
          <Archive size={18} aria-hidden="true" />
          <span>
            <strong>Archived parties</strong>
            <small>{parties.length} recoverable part{parties.length === 1 ? 'y' : 'ies'}</small>
          </span>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="optional-panel space-y-2 p-3">
        {parties.map((party) => (
          <article key={party.id} className="content-panel flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-base">{party.name}</h3>
              <p className="mt-1 text-xs text-[var(--text-3)]">{party.members.length} hero{party.members.length === 1 ? '' : 'es'} · {partyLevelLabel(party)}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" className="btn-secondary" disabled={saving} onClick={() => void onRestore(party.id)}>
                <RotateCcw size={16} aria-hidden="true" /> Restore
              </button>
              <button type="button" className="btn-ghost text-[var(--accent-danger)]" disabled={saving} onClick={() => void onDelete(party)}>
                <Trash2 size={16} aria-hidden="true" /> Delete permanently
              </button>
            </div>
          </article>
        ))}
      </div>
    </details>
  );
}

function PartyBackupPanel({
  library,
  saving,
  onBeforeApply,
  onImport,
}: {
  library: PartyLibrary;
  saving: boolean;
  onBeforeApply: () => boolean;
  onImport: (candidate: BackupCandidate, mode: 'merge' | 'replace') => Promise<boolean>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  const [candidate, setCandidate] = useState<BackupCandidate | null>(null);
  const [error, setError] = useState('');
  const [resultMessage, setResultMessage] = useState('');
  const preview = candidate
    ? previewPartyLibraryImport(library, candidate.parsed.library)
    : null;

  function exportLibrary(): void {
    setError('');
    try {
      const blob = new Blob([serializePartyLibrary(library)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'encounterizer-party-library.json';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('The Party Library could not be validated for export. Nothing was downloaded.');
    }
  }

  async function readBackup(file: File | undefined): Promise<void> {
    if (!file) return;
    setCandidate(null);
    setError('');
    setResultMessage('');
    try {
      const parsed = parsePartyLibraryBackup(await file.text());
      if (!parsed.ok) {
        setError(parsed.error);
        return;
      }
      setCandidate({
        fileName: file.name,
        parsed,
      });
      window.requestAnimationFrame(() => previewHeadingRef.current?.focus());
    } catch {
      setError('That backup file could not be read. Nothing was changed.');
    }
  }

  async function apply(mode: 'merge' | 'replace'): Promise<void> {
    if (!candidate || !preview || !onBeforeApply()) return;
    if (mode === 'replace' && !window.confirm(
      `Replace this browser's Party Library with ${candidate.fileName}? Parties not in the backup will be removed.`,
    )) return;
    const saved = await onImport(candidate, mode);
    if (!saved) return;
    const remaps = preview.collisions.partyIds.length
      + preview.collisions.memberIds.length;
    setResultMessage(mode === 'merge'
      ? `Merged ${preview.parties} part${preview.parties === 1 ? 'y' : 'ies'}${remaps ? ` and reassigned ${remaps} colliding ID${remaps === 1 ? '' : 's'}` : ''}.`
      : `Replaced the Party Library with ${preview.parties} part${preview.parties === 1 ? 'y' : 'ies'}.`);
    setCandidate(null);
  }

  return (
    <details className="disclosure-panel mt-4">
      <summary id="party-backup-summary">
        <span className="disclosure-summary-copy">
          <Download size={18} aria-hidden="true" />
          <span>
            <strong>Backup and restore</strong>
            <small>Validated JSON stays on your device until you choose a file.</small>
          </span>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="optional-panel space-y-3 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" className="btn-secondary" disabled={saving} onClick={exportLibrary}>
            <Download size={16} aria-hidden="true" /> Export Party Library
          </button>
          <button id="party-backup-import" type="button" className="btn-secondary" disabled={saving} onClick={() => fileRef.current?.click()}>
            <Upload size={16} aria-hidden="true" /> Import backup
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
        {error && <p role="alert" className="field-error rounded-lg border border-[var(--status-danger)] bg-[var(--status-danger-wash)] p-3">{error}</p>}
        {resultMessage && <p className="text-sm text-[var(--text-2)]" role="status">{resultMessage}</p>}
        {candidate && preview && (
          <section className="content-panel" aria-labelledby="party-backup-preview-heading">
            <div className="content-panel-heading">
              <div>
                <p className="micro-label">Import preview</p>
                <h3 id="party-backup-preview-heading" ref={previewHeadingRef} tabIndex={-1} className="mt-1 text-xl">
                  Review {candidate.fileName}
                </h3>
                <p>No party data has changed yet.</p>
              </div>
            </div>
            <dl className="metric-grid">
              <div className="metric-item"><dt>Parties</dt><dd>{preview.parties}</dd></div>
              <div className="metric-item"><dt>Heroes</dt><dd>{preview.members}</dd></div>
              <div className="metric-item"><dt>Archived</dt><dd>{preview.archivedParties}</dd></div>
              <div className="metric-item"><dt>ID collisions</dt><dd>{preview.collisions.partyIds.length + preview.collisions.memberIds.length}</dd></div>
            </dl>
            {[...candidate.parsed.warnings, ...preview.warnings].length > 0 && (
              <div className="mt-3 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-wash)] p-3">
                <strong className="text-sm text-[var(--text-1)]">Check before importing</strong>
                <ul className="mt-1 space-y-1 text-xs text-[var(--text-2)]">
                  {[...candidate.parsed.warnings, ...preview.warnings].map((warning) => <li key={warning}>• {warning}</li>)}
                </ul>
              </div>
            )}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button type="button" className="btn-primary" disabled={saving} onClick={() => void apply('merge')}>
                Merge into my library
              </button>
              <button type="button" className="btn-ghost text-[var(--accent-danger)]" disabled={saving} onClick={() => void apply('replace')}>
                Replace my Party Library
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={saving}
                onClick={() => {
                  setCandidate(null);
                  focusById('party-backup-import');
                }}
              >
                Cancel
              </button>
            </div>
          </section>
        )}
      </div>
    </details>
  );
}

function PartyMemberSummary({
  member,
  index,
  count,
  editing,
  disabled,
  onEdit,
  onMove,
  onRemove,
}: {
  member: PartyMemberProfile;
  index: number;
  count: number;
  editing: boolean;
  disabled: boolean;
  onEdit: () => void;
  onMove: (destination: number) => void;
  onRemove: () => void;
}) {
  const template = getTemplateById(member.templateId);
  return (
    <article className={`content-panel ${editing ? 'border-[var(--bronze)] bg-[var(--bronze-wash)]' : ''}`}>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="micro-label">Hero {index + 1}</p>
          <h3 className="mt-1 truncate text-lg">{member.name || `Player ${index + 1}`}</h3>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-3)]">
            {member.playerName ? `${member.playerName} · ` : ''}{member.classLabel || template?.name || member.templateId} · Level {member.level}
            {member.initiativeBonus !== undefined ? ` · Initiative ${member.initiativeBonus >= 0 ? '+' : ''}${member.initiativeBonus}` : ''}
            {member.passivePerception !== undefined ? ` · Passive ${member.passivePerception}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" className="icon-button" disabled={disabled || index === 0} aria-label={`Move ${member.name || `hero ${index + 1}`} up`} onClick={() => onMove(index - 1)}>
            <ArrowUp size={17} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" disabled={disabled || index === count - 1} aria-label={`Move ${member.name || `hero ${index + 1}`} down`} onClick={() => onMove(index + 1)}>
            <ArrowDown size={17} aria-hidden="true" />
          </button>
          <button
            id={`party-edit-${member.id}`}
            type="button"
            className="btn-secondary"
            disabled={disabled}
            aria-expanded={editing}
            aria-controls={`party-member-editor-${member.id}`}
            onClick={onEdit}
          >
            <Pencil size={16} aria-hidden="true" /> Edit
          </button>
          <button type="button" className="icon-button icon-button-danger" disabled={disabled} aria-label={`Remove ${member.name || `hero ${index + 1}`}`} onClick={onRemove}>
            <Trash2 size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}

function BatchLevelControl({
  party,
  saving,
  onApply,
}: {
  party: PartyProfile;
  saving: boolean;
  onApply: (level: number) => Promise<boolean>;
}) {
  const [raw, setRaw] = useState(String(party.members[0]?.level ?? 3));
  const [error, setError] = useState('');

  async function apply(): Promise<void> {
    const validation = validateBoundedIntegerInput(raw, 'Party level', 1, 20);
    setError(validation.error ?? '');
    if (validation.value === null) {
      document.getElementById(`party-set-level-${party.id}`)?.focus();
      return;
    }
    await onApply(validation.value);
  }

  return (
    <details className="disclosure-panel disclosure-panel-flush">
      <summary>
        <span className="disclosure-summary-copy">
          <BookOpen size={18} aria-hidden="true" />
          <span>
            <strong>Set every hero&apos;s level</strong>
            <small>Only levels change. Custom combat values stay intact.</small>
          </span>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <div className="optional-panel grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label htmlFor={`party-set-level-${party.id}`} className="field-label">New level</label>
          <input
            id={`party-set-level-${party.id}`}
            type="number"
            min={1}
            max={20}
            value={raw}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `party-set-level-error-${party.id}` : undefined}
            onChange={(event) => {
              setRaw(event.target.value);
              setError('');
            }}
          />
          {error && <p id={`party-set-level-error-${party.id}`} className="field-error" role="alert">{error}</p>}
        </div>
        <button type="button" className="btn-secondary" disabled={saving || party.members.length === 0} onClick={() => void apply()}>
          Set all levels
        </button>
      </div>
    </details>
  );
}

function PartyReadyPanel({ party }: { party: PartyProfile }) {
  const averageLevel = Math.round(
    party.members.reduce((total, member) => total + member.level, 0) / party.members.length,
  );
  const tunedMembers = party.members.filter((member) => member.overrides).length;
  const notedMembers = party.members.filter((member) => member.notes?.trim()).length;
  return (
    <section className="next-step-shell" aria-labelledby="party-ready-heading">
      <header className="workflow-title">
        <span className="workflow-step" aria-hidden="true">3</span>
        <div>
          <p className="micro-label">Ready for what&apos;s next</p>
          <h2 id="party-ready-heading" className="mt-1 text-2xl">Use this party</h2>
          <p className="mt-1 text-sm text-[var(--text-2)]">{party.name} is active and ready for planning or play.</p>
        </div>
      </header>
      <div className="workflow-review-overview">
        <div className="status-readout status-readout-success self-stretch">
          <span className="status-readout-dot" aria-hidden="true" />
          <span><small>Party status</small><strong>Active</strong></span>
        </div>
        <dl className="metric-grid">
          <div className="metric-item"><dt>Heroes</dt><dd>{party.members.length}</dd></div>
          <div className="metric-item"><dt>Average level</dt><dd>{averageLevel}</dd></div>
          <div className="metric-item"><dt>Custom profiles</dt><dd>{tunedMembers}</dd></div>
          <div className="metric-item"><dt>Table notes</dt><dd>{notedMembers}</dd></div>
        </dl>
      </div>
      <div className="next-step-grid">
        <article className="next-step-card">
          <span className="next-step-icon" aria-hidden="true"><Swords size={20} /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg">Prepare the next scene</h3>
            <p>Use the active party for encounter budgets and forecasts, with other prep tools one click away.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Link href="/encounters" className="btn-primary">Build an encounter</Link>
              <Link href="/noncombat" className="btn-secondary">Build a puzzle</Link>
            </div>
          </div>
        </article>
        <article className="next-step-card">
          <span className="next-step-icon" aria-hidden="true"><ShieldCheck size={20} /></span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg">Run the game</h3>
            <p>Keep this roster nearby while you open the DM screen or prepare a live initiative tracker.</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Link href="/dm-screen" className="btn-primary">Open DM screen</Link>
              <Link href="/battle" className="btn-secondary">Open battle organizer</Link>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
