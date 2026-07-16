'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { PartyMemberConfig } from '@/lib/battle-sim-types';
import {
  buildSimPlayer,
  CLASS_TEMPLATES,
  type ClassTemplate,
} from '@/data/class-templates';

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
  label: string;
  value: number | undefined;
  placeholder: number;
  onChange: (value: number | undefined) => void;
}

function OverrideField({ label, value, placeholder, onChange }: OverrideFieldProps) {
  const id = `override-${label.replace(/\W+/g, '-').toLowerCase()}-${placeholder}`;
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

  function updateMember(index: number, patch: Partial<PartyMemberConfig>) {
    setDraft((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  function updateOverride(
    index: number,
    key: keyof NonNullable<PartyMemberConfig['overrides']>,
    value: number | undefined,
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
                  className="text-[var(--accent-danger)] hover:opacity-80 px-2 text-sm inline-flex items-center"
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
                <OverrideField label="AC" value={member.overrides?.ac} placeholder={buildSimPlayer({ ...member, overrides: undefined }, index).ac} onChange={(v) => updateOverride(index, 'ac', v)} />
                <OverrideField label="Max HP" value={member.overrides?.maxHp} placeholder={buildSimPlayer({ ...member, overrides: undefined }, index).maxHp} onChange={(v) => updateOverride(index, 'maxHp', v)} />
                <OverrideField label="Atk Bonus" value={member.overrides?.attackBonus} placeholder={buildSimPlayer({ ...member, overrides: undefined }, index).attackBonus} onChange={(v) => updateOverride(index, 'attackBonus', v)} />
                <OverrideField label="Attacks" value={member.overrides?.attacksPerRound} placeholder={buildSimPlayer({ ...member, overrides: undefined }, index).attacksPerRound} onChange={(v) => updateOverride(index, 'attacksPerRound', v)} />
                <OverrideField label="Dmg/Hit" value={member.overrides?.avgDamagePerHit} placeholder={buildSimPlayer({ ...member, overrides: undefined }, index).avgDamagePerHit} onChange={(v) => updateOverride(index, 'avgDamagePerHit', v)} />
                <OverrideField label="Heal/Rd" value={member.overrides?.healingPerRound} placeholder={buildSimPlayer({ ...member, overrides: undefined }, index).healingPerRound ?? 0} onChange={(v) => updateOverride(index, 'healingPerRound', v)} />
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
    </div>
  );
}
