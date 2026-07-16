'use client';

import { useState } from 'react';
import type {
  MonsterFilter, Size, CreatureType, Environment, DamageType,
  MovementMode, AttackDelivery, Condition,
} from '@/lib/types';

const SIZES: Size[] = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
const TYPES: CreatureType[] = [
  'Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental',
  'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Undead',
];
const ENVIRONMENTS: Environment[] = [
  'Arctic', 'Coastal', 'Desert', 'Forest', 'Grassland', 'Hill',
  'Mountain', 'Swamp', 'Underdark', 'Underwater', 'Urban', 'Planar',
];
const DAMAGE_TYPES: DamageType[] = [
  'Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning',
  'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder',
];
const MOVEMENT_MODES: MovementMode[] = ['Walk', 'Fly', 'Swim', 'Burrow', 'Climb', 'Hover'];
const ATTACK_MODES: AttackDelivery[] = ['Melee', 'Ranged'];
const CONDITIONS: Condition[] = [
  'Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened',
  'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified',
  'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious',
];

interface FilterPanelProps {
  filter: MonsterFilter;
  onChange: (filter: MonsterFilter) => void;
  resultCount?: number;
}

function ChipGroup<T extends string>({
  label, options, selected, onToggle,
}: {
  label: string;
  options: T[];
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div>
      <span className="micro-label block mb-1">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            aria-pressed={selected.includes(opt)}
            className={`filter-chip ${selected.includes(opt) ? 'active' : ''}`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FilterPanel({ filter, onChange, resultCount }: FilterPanelProps) {
  const [expanded, setExpanded] = useState(false);

  function toggle<T extends string>(
    key: keyof MonsterFilter,
    value: T
  ) {
    const current = (filter[key] as T[] | undefined) ?? [];
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    onChange({ ...filter, [key]: next.length > 0 ? next : undefined });
  }

  function set<K extends keyof MonsterFilter>(key: K, value: MonsterFilter[K] | undefined) {
    onChange({ ...filter, [key]: value });
  }

  const activeFilterCount = Object.values(filter).filter(
    v => v !== undefined && v !== '' && (!Array.isArray(v) || v.length > 0)
  ).length;

  return (
    <div className="card mb-6 print:hidden">
      {/* Search + CR range (always visible) */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="filter-search" className="micro-label block mb-1">
            Search
          </label>
          <input
            id="filter-search"
            type="text"
            placeholder="Monster name, type, or tag..."
            value={filter.search ?? ''}
            onChange={e => set('search', e.target.value || undefined)}
            className="w-full"
          />
        </div>
        <div className="w-24">
          <label htmlFor="filter-cr-min" className="micro-label block mb-1">
            CR Min
          </label>
          <input
            id="filter-cr-min"
            type="number"
            min={0}
            max={30}
            step={0.125}
            value={filter.crMin ?? ''}
            onChange={e => set('crMin', e.target.value ? Number(e.target.value) : undefined)}
            className="w-full"
          />
        </div>
        <div className="w-24">
          <label htmlFor="filter-cr-max" className="micro-label block mb-1">
            CR Max
          </label>
          <input
            id="filter-cr-max"
            type="number"
            min={0}
            max={30}
            step={0.125}
            value={filter.crMax ?? ''}
            onChange={e => set('crMax', e.target.value ? Number(e.target.value) : undefined)}
            className="w-full"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-controls="filter-panel-expanded"
            className="btn-secondary text-sm"
          >
            {expanded ? 'Less Filters' : 'More Filters'}
            {activeFilterCount > 0 && (
              <span className="ml-1 bg-[var(--steel-950)] text-[var(--bronze)] font-bold rounded-full px-1.5 text-xs">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => onChange({})}
              className="text-sm text-[var(--text-2)] hover:text-[var(--bronze)] underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {resultCount !== undefined && (
        <div className="mt-2 text-sm text-[var(--text-2)]">
          {resultCount} monster{resultCount !== 1 ? 's' : ''} found
        </div>
      )}

      {/* Expanded filters */}
      {expanded && (
        <div id="filter-panel-expanded" className="mt-4 space-y-4 animate-fade-in">
          <ChipGroup label="Size" options={SIZES} selected={filter.sizes ?? []} onToggle={v => toggle('sizes', v)} />
          <ChipGroup label="Creature Type" options={TYPES} selected={filter.types ?? []} onToggle={v => toggle('types', v)} />
          <ChipGroup label="Environment" options={ENVIRONMENTS} selected={filter.environments ?? []} onToggle={v => toggle('environments', v)} />
          <ChipGroup label="Movement" options={MOVEMENT_MODES} selected={filter.movementModes ?? []} onToggle={v => toggle('movementModes', v)} />
          <ChipGroup label="Deals Damage Type" options={DAMAGE_TYPES} selected={filter.attackDamageTypes ?? []} onToggle={v => toggle('attackDamageTypes', v)} />
          <ChipGroup label="Attack Range" options={ATTACK_MODES} selected={filter.attackDeliveryModes ?? []} onToggle={v => toggle('attackDeliveryModes', v)} />
          <ChipGroup label="Resistant To" options={DAMAGE_TYPES} selected={filter.damageResistances ?? []} onToggle={v => toggle('damageResistances', v)} />
          <ChipGroup label="Immune To (Damage)" options={DAMAGE_TYPES} selected={filter.damageImmunities ?? []} onToggle={v => toggle('damageImmunities', v)} />
          <ChipGroup label="Vulnerable To" options={DAMAGE_TYPES} selected={filter.damageVulnerabilities ?? []} onToggle={v => toggle('damageVulnerabilities', v)} />
          <ChipGroup label="Condition Immunities" options={CONDITIONS} selected={filter.conditionImmunities ?? []} onToggle={v => toggle('conditionImmunities', v)} />

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filter.isLegendary ?? false}
                onChange={e => set('isLegendary', e.target.checked || undefined)}
                className="accent-[var(--bronze)]"
              />
              <span className="text-sm">Legendary only</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filter.hasSpellcasting ?? false}
                onChange={e => set('hasSpellcasting', e.target.checked || undefined)}
                className="accent-[var(--bronze)]"
              />
              <span className="text-sm">Has Spellcasting</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filter.hasLair ?? false}
                onChange={e => set('hasLair', e.target.checked || undefined)}
                className="accent-[var(--bronze)]"
              />
              <span className="text-sm">Has Lair</span>
            </label>
          </div>

          {/* Sort */}
          <div className="flex gap-4 items-end">
            <div>
              <label htmlFor="filter-sort-by" className="micro-label block mb-1">
                Sort By
              </label>
              <select
                id="filter-sort-by"
                value={filter.sortBy ?? 'name'}
                onChange={e => set('sortBy', e.target.value as MonsterFilter['sortBy'])}
              >
                <option value="name">Name</option>
                <option value="cr">Challenge Rating</option>
                <option value="hp">Hit Points</option>
                <option value="ac">Armor Class</option>
              </select>
            </div>
            <div>
              <label htmlFor="filter-sort-dir" className="micro-label block mb-1">
                Direction
              </label>
              <select
                id="filter-sort-dir"
                value={filter.sortDir ?? 'asc'}
                onChange={e => set('sortDir', e.target.value as 'asc' | 'desc')}
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
