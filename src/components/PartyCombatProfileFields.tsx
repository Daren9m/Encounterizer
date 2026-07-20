'use client';

import { useState } from 'react';
import {
  buildSimPlayer,
  CLASS_TEMPLATES,
  type ClassTemplate,
} from '@/data/class-templates';
import type { PartyMemberConfig } from '@/lib/battle-sim-types';
import type {
  PartyCombatFieldName,
  PartyMemberFormErrors,
} from '@/lib/party-member-form';
import { parseCombatOverrideInput } from '@/lib/party-member-form';
import type { PartyCombatOverrides, PartySaveBonuses } from '@/lib/party';

const TEMPLATE_ROLES: ClassTemplate['role'][] = ['Martial', 'Caster', 'Hybrid'];

export function PartyClassTemplateSelect({
  id,
  value,
  onChange,
  describedBy,
  invalid = false,
}: {
  id: string;
  value: string;
  onChange: (templateId: string) => void;
  describedBy?: string;
  invalid?: boolean;
}) {
  return (
    <select
      id={id}
      className="w-full text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
    >
      {TEMPLATE_ROLES.map((role) => (
        <optgroup key={role} label={role}>
          {CLASS_TEMPLATES.filter((template) => template.role === role).map((template) => (
            <option key={template.id} value={template.id}>{template.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function PartyCombatStatPreview({
  member,
  index = 0,
}: {
  member: PartyMemberConfig;
  index?: number;
}) {
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
  return <p className="text-xs text-[var(--text-2)]">{parts.join(' · ')}</p>;
}

export function partyCombatFieldId(idPrefix: string, field: PartyCombatFieldName): string {
  return `${idPrefix}-combat-${field}`;
}

interface OverrideFieldProps {
  idPrefix: string;
  field: PartyCombatFieldName;
  label: string;
  value: number | undefined;
  placeholder: number;
  min: number;
  max: number;
  step?: number | 'any';
  error?: string;
  onChange: (value: number | undefined) => void;
}

function OverrideField({
  idPrefix,
  field,
  label,
  value,
  placeholder,
  min,
  max,
  step = 1,
  error,
  onChange,
}: OverrideFieldProps) {
  const id = partyCombatFieldId(idPrefix, field);
  const errorId = `${id}-error`;
  const [rawInput, setRawInput] = useState<{
    raw: string;
    parsed: number | undefined;
  } | null>(null);
  const displayedValue = rawInput && Object.is(rawInput.parsed, value)
    ? rawInput.raw
    : value === undefined || !Number.isFinite(value)
      ? ''
      : String(value);

  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <input
        id={id}
        type="text"
        inputMode={min < 0 || step !== 1 ? 'decimal' : 'numeric'}
        className="w-full text-sm"
        value={displayedValue}
        placeholder={String(placeholder)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          const raw = event.target.value;
          const parsed = parseCombatOverrideInput(raw);
          setRawInput({ raw, parsed });
          onChange(parsed);
        }}
        onBlur={() => {
          if (rawInput && (rawInput.raw.trim() === '' || Number.isFinite(rawInput.parsed))) {
            setRawInput(null);
          }
        }}
      />
      {error && <p id={errorId} className="field-error" role="alert">{error}</p>}
    </div>
  );
}

export function PartyCombatProfileFields({
  member,
  index = 0,
  idPrefix,
  containerId,
  errors = {},
  className = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6',
  onChange,
}: {
  member: PartyMemberConfig;
  index?: number;
  idPrefix: string;
  containerId?: string;
  errors?: PartyMemberFormErrors;
  className?: string;
  onChange: (
    overrides: PartyCombatOverrides | undefined,
    changedField: PartyCombatFieldName,
  ) => void;
}) {
  const baseline = buildSimPlayer({ ...member, overrides: undefined }, index);
  const current = buildSimPlayer(member, index);

  function updateOverride<K extends keyof PartyCombatOverrides>(
    key: K,
    value: PartyCombatOverrides[K] | undefined,
    changedField: PartyCombatFieldName,
  ) {
    const overrides = { ...member.overrides };
    if (value === undefined) delete overrides[key];
    else overrides[key] = value;
    onChange(Object.keys(overrides).length > 0 ? overrides : undefined, changedField);
  }

  function updateSave(ability: keyof PartySaveBonuses, value: number | undefined) {
    updateOverride('saveBonuses', {
      ...current.saveBonuses,
      [ability]: value ?? baseline.saveBonuses[ability],
    }, `${ability}Save` as PartyCombatFieldName);
  }

  return (
    <div id={containerId} className={className}>
      <OverrideField idPrefix={idPrefix} field="ac" label="AC" value={member.overrides?.ac} placeholder={baseline.ac} min={1} max={100} error={errors.ac} onChange={(value) => updateOverride('ac', value, 'ac')} />
      <OverrideField idPrefix={idPrefix} field="maxHp" label="Max HP" value={member.overrides?.maxHp} placeholder={baseline.maxHp} min={1} max={1_000_000} error={errors.maxHp} onChange={(value) => updateOverride('maxHp', value, 'maxHp')} />
      <OverrideField idPrefix={idPrefix} field="attackBonus" label="Atk Bonus" value={member.overrides?.attackBonus} placeholder={baseline.attackBonus} min={-50} max={100} error={errors.attackBonus} onChange={(value) => updateOverride('attackBonus', value, 'attackBonus')} />
      <OverrideField idPrefix={idPrefix} field="attacksPerRound" label="Attacks" value={member.overrides?.attacksPerRound} placeholder={baseline.attacksPerRound} min={1} max={100} error={errors.attacksPerRound} onChange={(value) => updateOverride('attacksPerRound', value, 'attacksPerRound')} />
      <OverrideField idPrefix={idPrefix} field="avgDamagePerHit" label="Dmg/Hit" value={member.overrides?.avgDamagePerHit} placeholder={baseline.avgDamagePerHit} min={0} max={1_000_000} step="any" error={errors.avgDamagePerHit} onChange={(value) => updateOverride('avgDamagePerHit', value, 'avgDamagePerHit')} />
      <OverrideField idPrefix={idPrefix} field="healingPerRound" label="Heal/Rd" value={member.overrides?.healingPerRound} placeholder={baseline.healingPerRound ?? 0} min={0} max={1_000_000} step="any" error={errors.healingPerRound} onChange={(value) => updateOverride('healingPerRound', value, 'healingPerRound')} />
      <OverrideField idPrefix={idPrefix} field="dexSave" label="DEX Save" value={member.overrides?.saveBonuses?.dex} placeholder={baseline.saveBonuses.dex} min={-50} max={100} error={errors.dexSave} onChange={(value) => updateSave('dex', value)} />
      <OverrideField idPrefix={idPrefix} field="conSave" label="CON Save" value={member.overrides?.saveBonuses?.con} placeholder={baseline.saveBonuses.con} min={-50} max={100} error={errors.conSave} onChange={(value) => updateSave('con', value)} />
      <OverrideField idPrefix={idPrefix} field="wisSave" label="WIS Save" value={member.overrides?.saveBonuses?.wis} placeholder={baseline.saveBonuses.wis} min={-50} max={100} error={errors.wisSave} onChange={(value) => updateSave('wis', value)} />
    </div>
  );
}
