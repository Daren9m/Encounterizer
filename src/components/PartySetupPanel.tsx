'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { PartyMemberConfig } from '@/lib/battle-sim-types';
import {
  buildSimPlayer,
  CLASS_TEMPLATES,
  type ClassTemplate,
} from '@/data/class-templates';
import { importCharacterJson } from '@/lib/character-import';

const ROLES: ClassTemplate['role'][] = ['Martial', 'Caster', 'Hybrid'];

function StatPreview({ member, index }: { member: PartyMemberConfig; index: number }) {
  const player = buildSimPlayer(member, index);
  const parts = [
    `AC ${player.ac}`,
    `HP ${player.maxHp}`,
    `${player.attacksPerRound} atk${player.attacksPerRound > 1 ? 's' : ''} +${player.attackBonus}, ~${player.avgDamagePerHit} dmg`,
  ];
  if (player.avgSpellDamagePerRound) parts.push(`~${player.avgSpellDamagePerRound} spell dmg/rd`);
  if (player.healingPerRound) parts.push(`heals ${player.healingPerRound}/rd`);
  if (player.special?.sneakDamage) parts.push(`sneak +${player.special.sneakDamage}`);
  if (player.special?.rage) parts.push('rage');
  if (player.special?.evasion) parts.push('evasion');
  return (
    <p className="text-xs text-[var(--text-2)]">{parts.join(' · ')}</p>
  );
}

interface OverrideFieldProps {
  idSuffix: string;
  label: string;
  value: number | undefined;
  placeholder: number;
  onChange: (value: number | undefined) => void;
}

function OverrideField({ idSuffix, label, value, placeholder, onChange }: OverrideFieldProps) {
  const id = `override-${idSuffix}-${label.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <div>
      <label htmlFor={id} className="micro-label block">
        {label}
      </label>
      <input
        id={id}
        type="number"
        className="w-full text-sm"
        value={value ?? ''}
        placeholder={String(placeholder)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === '' ? undefined : Number(raw));
        }}
      />
    </div>
  );
}

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

  function updateMember(index: number, patch: Partial<PartyMemberConfig>) {
    setDraft((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function updateOverride<K extends keyof NonNullable<PartyMemberConfig['overrides']>>(
    index: number,
    key: K,
    value: NonNullable<PartyMemberConfig['overrides']>[K] | undefined,
  ) {
    setDraft((prev) =>
      prev.map((m, i) => {
        if (i !== index) return m;
        const overrides = { ...m.overrides };
        if (value === undefined) delete overrides[key];
        else overrides[key] = value;
        return { ...m, overrides: Object.keys(overrides).length > 0 ? overrides : undefined };
      }),
    );
  }

  async function handleCharacterFile(file: File | undefined) {
    if (!file) return;
    const result = importCharacterJson(await file.text());
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
    <div className="card mb-6 animate-fade-in space-y-4 print:hidden">
      <div>
        <h3 className="text-lg">Party Setup</h3>
        <p className="text-sm text-[var(--text-2)]">
          Pick a class template and level per player — or open Customize to tweak the numbers.
          The forecast only needs the combat math, not the whole character sheet.
        </p>
      </div>

      <div className="space-y-3">
        {draft.map((member, index) => (
          <div key={index} className="p-3 rounded bg-[var(--steel-950)] space-y-2">
            <div className="grid sm:grid-cols-[1fr_1.4fr_5rem_auto] gap-2 items-end">
              <div>
                <label htmlFor={`member-name-${index}`} className="micro-label block">
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
                <label htmlFor={`member-template-${index}`} className="micro-label block">
                  Class Template
                </label>
                <select
                  id={`member-template-${index}`}
                  className="w-full text-sm"
                  value={member.templateId}
                  onChange={(e) => updateMember(index, { templateId: e.target.value, overrides: undefined })}
                >
                  {ROLES.map((role) => (
                    <optgroup key={role} label={role}>
                      {CLASS_TEMPLATES.filter((t) => t.role === role).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`member-level-${index}`} className="micro-label block">
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
                  onClick={() => setCustomizing(customizing === index ? null : index)}
                >
                  Customize
                </button>
                <button
                  type="button"
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-sm text-[var(--accent-danger)] transition-colors hover:bg-[var(--steel-800)] hover:text-[var(--accent-danger-light)]"
                  aria-label={`Remove ${member.name || `player ${index + 1}`}`}
                  onClick={() => setDraft((prev) => prev.filter((_, i) => i !== index))}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            <StatPreview member={member} index={index} />

            {customizing === index && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2 border-t border-[var(--steel-800)] animate-fade-in">
                <OverrideField idSuffix={`${index}-ac`} label="AC" value={member.overrides?.ac} placeholder={buildSimPlayer({ ...member, overrides: undefined }, index).ac} onChange={(v) => updateOverride(index, 'ac', v)} />
                <OverrideField idSuffix={`${index}-hp`} label="Max HP" value={member.overrides?.maxHp} placeholder={buildSimPlayer({ ...member, overrides: undefined }, index).maxHp} onChange={(v) => updateOverride(index, 'maxHp', v)} />
                <OverrideField idSuffix={`${index}-attack`} label="Atk Bonus" value={member.overrides?.attackBonus} placeholder={buildSimPlayer({ ...member, overrides: undefined }, index).attackBonus} onChange={(v) => updateOverride(index, 'attackBonus', v)} />
                <OverrideField idSuffix={`${index}-attacks`} label="Attacks" value={member.overrides?.attacksPerRound} placeholder={buildSimPlayer({ ...member, overrides: undefined }, index).attacksPerRound} onChange={(v) => updateOverride(index, 'attacksPerRound', v)} />
                <OverrideField idSuffix={`${index}-damage`} label="Dmg/Hit" value={member.overrides?.avgDamagePerHit} placeholder={buildSimPlayer({ ...member, overrides: undefined }, index).avgDamagePerHit} onChange={(v) => updateOverride(index, 'avgDamagePerHit', v)} />
                <OverrideField idSuffix={`${index}-healing`} label="Heal/Rd" value={member.overrides?.healingPerRound} placeholder={buildSimPlayer({ ...member, overrides: undefined }, index).healingPerRound ?? 0} onChange={(v) => updateOverride(index, 'healingPerRound', v)} />
                <OverrideField idSuffix={`${index}-dex-save`} label="DEX Save" value={member.overrides?.saveBonuses?.dex} placeholder={buildSimPlayer({ ...member, overrides: undefined }, index).saveBonuses.dex} onChange={(v) => updateOverride(index, 'saveBonuses', { ...buildSimPlayer(member, index).saveBonuses, dex: v ?? buildSimPlayer({ ...member, overrides: undefined }, index).saveBonuses.dex })} />
                <OverrideField idSuffix={`${index}-con-save`} label="CON Save" value={member.overrides?.saveBonuses?.con} placeholder={buildSimPlayer({ ...member, overrides: undefined }, index).saveBonuses.con} onChange={(v) => updateOverride(index, 'saveBonuses', { ...buildSimPlayer(member, index).saveBonuses, con: v ?? buildSimPlayer({ ...member, overrides: undefined }, index).saveBonuses.con })} />
                <OverrideField idSuffix={`${index}-wis-save`} label="WIS Save" value={member.overrides?.saveBonuses?.wis} placeholder={buildSimPlayer({ ...member, overrides: undefined }, index).saveBonuses.wis} onChange={(v) => updateOverride(index, 'saveBonuses', { ...buildSimPlayer(member, index).saveBonuses, wis: v ?? buildSimPlayer({ ...member, overrides: undefined }, index).saveBonuses.wis })} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
          Add Player
        </button>
        <label className="btn-secondary inline-flex min-h-11 cursor-pointer items-center text-sm">
          Import Character JSON
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              void handleCharacterFile(event.target.files?.[0]);
              event.currentTarget.value = '';
            }}
          />
        </label>
        <div className="flex-1" />
        <button type="button" className="btn-secondary text-sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={draft.length === 0}
          onClick={() => onSave(draft)}
        >
          Save &amp; Run Forecast
        </button>
      </div>
      {importMessage && (
        <p
          className={`text-sm ${importMessage.kind === 'error' ? 'text-[var(--accent-danger)]' : 'text-[var(--text-2)]'}`}
          role={importMessage.kind === 'error' ? 'alert' : 'status'}
        >
          {importMessage.text}
        </p>
      )}
    </div>
  );
}
