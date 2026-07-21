'use client';

import { useId } from 'react';
import { getTemplateById } from '@/data/class-templates';
import type { PartyProfile } from '@/lib/party';
import { MAX_SCENE_PARTY_MEMBERS } from '@/lib/tool-party';

export interface PartyAttendanceListProps {
  party: PartyProfile;
  selectedMemberIds: readonly string[];
  onChange: (selectedMemberIds: string[]) => void;
  id?: string;
  legend?: string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  maxSelected?: number;
}

/** Shared roster-order attendance control for scene and live-play tools. */
export default function PartyAttendanceList({
  party,
  selectedMemberIds,
  onChange,
  id,
  legend = 'Who is here?',
  hint = 'Attendance only applies to this setup. It does not change the saved party.',
  error,
  disabled = false,
  maxSelected = MAX_SCENE_PARTY_MEMBERS,
}: PartyAttendanceListProps) {
  const generatedId = useId();
  const rootId = id ?? `party-attendance-${generatedId.replace(/:/g, '')}`;
  const hintId = `${rootId}-hint`;
  const errorId = `${rootId}-error`;
  const cappedMaximum = Number.isFinite(maxSelected)
    ? Math.max(0, Math.min(MAX_SCENE_PARTY_MEMBERS, Math.floor(maxSelected)))
    : MAX_SCENE_PARTY_MEMBERS;
  const usableRoster = party.members.slice(0, MAX_SCENE_PARTY_MEMBERS);
  const rosterIds = new Set(usableRoster.map((member) => member.id));
  const requested = new Set(selectedMemberIds.filter((memberId) => rosterIds.has(memberId)));
  const selected = new Set(usableRoster
    .filter((member) => requested.has(member.id))
    .slice(0, cappedMaximum)
    .map((member) => member.id));

  function emit(nextSelected: ReadonlySet<string>) {
    onChange(
      usableRoster
        .filter((member) => nextSelected.has(member.id))
        .slice(0, cappedMaximum)
        .map((member) => member.id),
    );
  }

  return (
    <fieldset
      id={rootId}
      className="space-y-3"
      aria-describedby={[hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
      aria-invalid={error ? true : undefined}
      disabled={disabled}
      tabIndex={-1}
    >
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="field-label mb-0" aria-hidden="true">{legend}</p>
          <p className="mt-1 text-xs text-[var(--text-3)]" aria-live="polite">
            {selected.size} of {usableRoster.length} attending
          </p>
        </div>
        {usableRoster.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              className="btn-ghost min-h-9 px-3 text-xs"
              disabled={disabled || selected.size === Math.min(usableRoster.length, cappedMaximum)}
              onClick={() => emit(new Set(
                usableRoster.slice(0, cappedMaximum).map((member) => member.id),
              ))}
            >
              Everyone
            </button>
            <button
              type="button"
              className="btn-ghost min-h-9 px-3 text-xs"
              disabled={disabled || selected.size === 0}
              onClick={() => emit(new Set())}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {usableRoster.length === 0 ? (
        <div className="surface-inset p-4 text-sm text-[var(--text-2)]">
          This party has no characters yet.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label={`${party.name} attendance`}>
          {usableRoster.map((member, index) => {
            const attending = selected.has(member.id);
            const atLimit = !attending && selected.size >= cappedMaximum;
            const memberName = member.name.trim() || `Party Member ${index + 1}`;
            const className = member.classLabel
              || getTemplateById(member.templateId)?.name
              || 'Adventurer';
            const inputId = `${rootId}-member-${index}`;
            return (
              <label
                key={member.id}
                htmlFor={inputId}
                className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${atLimit ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${attending
                  ? 'border-[var(--border-interactive)] bg-[var(--bronze-wash)]'
                  : 'border-[var(--border-subtle)] bg-[var(--surface-inset)] hover:border-[var(--line-strong)]'
                }`}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  checked={attending}
                  disabled={disabled || atLimit}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.target.checked) next.add(member.id);
                    else next.delete(member.id);
                    emit(next);
                  }}
                />
                <span className="min-w-0">
                  <strong className="block truncate text-sm text-[var(--text-1)]">
                    {memberName}
                  </strong>
                  <span className="block truncate text-xs text-[var(--text-3)]">
                    Level {member.level} · {className}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      {hint && <p id={hintId} className="field-hint">{hint}</p>}
      {error && <p id={errorId} className="field-error" role="alert">{error}</p>}
      {party.members.length > MAX_SCENE_PARTY_MEMBERS && (
        <p className="field-hint">
          This scene can include the first {MAX_SCENE_PARTY_MEMBERS} characters in roster order.
        </p>
      )}
    </fieldset>
  );
}
