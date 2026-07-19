'use client';

import { useState } from 'react';
import { RotateCcw, Save, X } from 'lucide-react';
import type { Monster } from '@/lib/types';
import { validateMonster } from '@/lib/validate-monster';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function retainArray<T>(value: T[] | undefined, fallback: T[]): T[] {
  return Array.isArray(value) ? value : fallback;
}

function normalizeEditedMonster(input: unknown, original: Monster): { monster?: Monster; error?: string } {
  const checked = validateMonster(input);
  if (!checked.ok) return { error: checked.errors.join('; ') };

  const raw = input as Partial<Monster>;
  const normalized = checked.monster;
  const monster: Monster = {
    ...normalized,
    ...raw,
    id: original.id,
    source: raw.source ?? original.source,
    armor: {
      ...normalized.armor,
      ...(isRecord(raw.armor) ? raw.armor : {}),
    },
    speed: {
      ...normalized.speed,
      ...(isRecord(raw.speed) ? raw.speed : {}),
    },
    abilities: {
      ...normalized.abilities,
      ...(isRecord(raw.abilities) ? raw.abilities : {}),
    },
    senses: retainArray(raw.senses, normalized.senses),
    languages: retainArray(raw.languages, normalized.languages),
    damageVulnerabilities: retainArray(raw.damageVulnerabilities, normalized.damageVulnerabilities),
    damageResistances: retainArray(raw.damageResistances, normalized.damageResistances),
    damageImmunities: retainArray(raw.damageImmunities, normalized.damageImmunities),
    conditionImmunities: retainArray(raw.conditionImmunities, normalized.conditionImmunities),
    actions: retainArray(raw.actions, normalized.actions),
    environments: retainArray(raw.environments, normalized.environments),
    movementModes: retainArray(raw.movementModes, normalized.movementModes),
    attackDamageTypes: retainArray(raw.attackDamageTypes, normalized.attackDamageTypes),
    attackDeliveryModes: retainArray(raw.attackDeliveryModes, normalized.attackDeliveryModes),
    tags: retainArray(raw.tags, normalized.tags),
    isLegendary: typeof raw.isLegendary === 'boolean' ? raw.isLegendary : normalized.isLegendary,
    isMythic: typeof raw.isMythic === 'boolean' ? raw.isMythic : normalized.isMythic,
    hasLair: typeof raw.hasLair === 'boolean' ? raw.hasLair : normalized.hasLair,
    hasSpellcasting: typeof raw.hasSpellcasting === 'boolean' ? raw.hasSpellcasting : normalized.hasSpellcasting,
  };

  return { monster };
}

export default function MonsterEditor({
  monster,
  canReset,
  onSave,
  onReset,
  onClose,
}: {
  monster: Monster;
  canReset: boolean;
  onSave: (monster: Monster) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [json, setJson] = useState(() => JSON.stringify(monster, null, 2));
  const [error, setError] = useState<string>();

  function applyChanges() {
    try {
      const result = normalizeEditedMonster(JSON.parse(json), monster);
      if (!result.monster) {
        setError(result.error ?? 'The stat block could not be applied.');
        return;
      }
      onSave(result.monster);
      onClose();
    } catch (parseError) {
      setError(`Invalid JSON: ${(parseError as Error).message}`);
    }
  }

  return (
    <section className="surface-inset mb-3 p-3 print:hidden" aria-labelledby="monster-editor-title">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 id="monster-editor-title" className="text-base">Edit {monster.name}</h3>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">
            Edit any field in the complete stat-block JSON. The original remains available with Reset.
          </p>
        </div>
        <button type="button" onClick={onClose} className="btn-ghost !min-h-9 !px-2" aria-label="Close stat block editor">
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <label htmlFor="monster-stat-json" className="sr-only">Monster stat block JSON</label>
      <textarea
        id="monster-stat-json"
        value={json}
        onChange={(event) => {
          setJson(event.target.value);
          setError(undefined);
        }}
        spellCheck={false}
        className="min-h-80 w-full resize-y font-mono text-xs leading-relaxed"
      />
      {error && <p role="alert" className="mt-2 text-sm text-[var(--accent-danger)]">{error}</p>}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {canReset && (
          <button
            type="button"
            className="btn-ghost !min-h-9 text-xs"
            onClick={() => {
              onReset();
              onClose();
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Reset original
          </button>
        )}
        <button type="button" className="btn-primary !min-h-9 text-xs" onClick={applyChanges}>
          <Save size={14} aria-hidden="true" />
          Apply changes
        </button>
      </div>
    </section>
  );
}
