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

const SORT_SELECTIONS = {
  'family:asc': { sortBy: 'family', sortDir: 'asc' },
  'family:desc': { sortBy: 'family', sortDir: 'desc' },
  'name:asc': { sortBy: 'name', sortDir: 'asc' },
  'name:desc': { sortBy: 'name', sortDir: 'desc' },
  'cr:asc': { sortBy: 'cr', sortDir: 'asc' },
  'cr:desc': { sortBy: 'cr', sortDir: 'desc' },
  'hp:asc': { sortBy: 'hp', sortDir: 'asc' },
  'hp:desc': { sortBy: 'hp', sortDir: 'desc' },
  'ac:asc': { sortBy: 'ac', sortDir: 'asc' },
  'ac:desc': { sortBy: 'ac', sortDir: 'desc' },
} as const satisfies Record<string, Pick<MonsterFilter, 'sortBy' | 'sortDir'>>;

type SortSelection = keyof typeof SORT_SELECTIONS;

function isSortSelection(value: string): value is SortSelection {
  return value in SORT_SELECTIONS;
}

interface FilterPanelProps {
  filter: MonsterFilter;
  onChange: (filter: MonsterFilter) => void;
  resultCount?: number;
  defaultSortBy?: NonNullable<MonsterFilter['sortBy']>;
  /** Removes the outer card treatment when the filters already sit inside a panel. */
  embedded?: boolean;
  /** The encounter builder already has one authoritative environment field. */
  hideEnvironment?: boolean;
  /** Sorting changes list presentation, not the generator's candidate pool. */
  hideSort?: boolean;
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
    <fieldset>
      <legend className="micro-label mb-1">
        {label}
      </legend>
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
    </fieldset>
  );
}

export default function FilterPanel({
  filter,
  onChange,
  resultCount,
  defaultSortBy = 'name',
  embedded = false,
  hideEnvironment = false,
  hideSort = false,
}: FilterPanelProps) {
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

  function setSort(value: string) {
    if (!isSortSelection(value)) return;
    onChange({ ...filter, ...SORT_SELECTIONS[value] });
  }

  const sortSelection = `${filter.sortBy ?? defaultSortBy}:${filter.sortDir ?? 'asc'}`;
  const selectedSort = isSortSelection(sortSelection) ? sortSelection : `${defaultSortBy}:asc`;

  const activeFilterCount = Object.entries(filter).filter(
    ([key, value]) => !['sortBy', 'sortDir'].includes(key)
      && value !== undefined
      && value !== ''
      && (!Array.isArray(value) || value.length > 0)
  ).length;

  return (
    <div className={`filter-panel print:hidden ${embedded ? 'p-4' : 'card mb-4 !p-3'}`}>
      {/* Search + CR range (always visible) */}
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="filter-search" className="field-label">
            Search
          </label>
          <input
            id="filter-search"
            type="text"
            placeholder="Monster name, type, or tag..."
            value={filter.search ?? ''}
            onChange={e => set('search', e.target.value || undefined)}
            className="filter-control w-full"
          />
        </div>
        <div className="w-24">
          <label htmlFor="filter-cr-min" className="field-label">
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
            className="filter-control w-full"
          />
        </div>
        <div className="w-24">
          <label htmlFor="filter-cr-max" className="field-label">
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
            className="filter-control w-full"
          />
        </div>
        {!hideSort && (
          <div className="w-full sm:w-60">
            <label htmlFor="filter-sort" className="field-label">
              Sort
            </label>
            <select
              id="filter-sort"
              value={selectedSort}
              onChange={e => setSort(e.target.value)}
              className="filter-control w-full"
            >
              <optgroup label="Related monsters">
                <option value="family:asc">Related monsters: A–Z</option>
                <option value="family:desc">Related monsters: Z–A</option>
              </optgroup>
              <optgroup label="Name">
                <option value="name:asc">Name: A–Z</option>
                <option value="name:desc">Name: Z–A</option>
              </optgroup>
              <optgroup label="Challenge rating">
                <option value="cr:asc">CR: low to high</option>
                <option value="cr:desc">CR: high to low</option>
              </optgroup>
              <optgroup label="Hit points">
                <option value="hp:asc">HP: low to high</option>
                <option value="hp:desc">HP: high to low</option>
              </optgroup>
              <optgroup label="Armor class">
                <option value="ac:asc">AC: low to high</option>
                <option value="ac:desc">AC: high to low</option>
              </optgroup>
            </select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-controls="filter-panel-expanded"
            className="btn-secondary px-3 text-sm"
          >
            {expanded ? 'Fewer filters' : 'More filters'}
            {activeFilterCount > 0 && (
              <span className="ml-1 bg-[var(--steel-950)] text-[var(--bronze)] font-bold rounded-full px-1.5 text-xs">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => onChange(hideSort ? {} : {
                sortBy: filter.sortBy ?? defaultSortBy,
                sortDir: filter.sortDir,
              })}
              className="btn-ghost px-2 text-sm"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {resultCount !== undefined && (
        <div className="mt-2 text-sm text-[var(--text-2)]" aria-live="polite">
          {resultCount} monster{resultCount !== 1 ? 's' : ''} found
        </div>
      )}

      {/* Expanded filters */}
      {expanded && (
        <div id="filter-panel-expanded" className="filter-groups-grid mt-3 grid gap-2.5 animate-fade-in xl:grid-cols-2">
          <ChipGroup label="Size" options={SIZES} selected={filter.sizes ?? []} onToggle={v => toggle('sizes', v)} />
          <ChipGroup label="Creature Type" options={TYPES} selected={filter.types ?? []} onToggle={v => toggle('types', v)} />
          {!hideEnvironment && (
            <ChipGroup label="Environment" options={ENVIRONMENTS} selected={filter.environments ?? []} onToggle={v => toggle('environments', v)} />
          )}
          <ChipGroup label="Movement" options={MOVEMENT_MODES} selected={filter.movementModes ?? []} onToggle={v => toggle('movementModes', v)} />
          <ChipGroup label="Deals Damage Type" options={DAMAGE_TYPES} selected={filter.attackDamageTypes ?? []} onToggle={v => toggle('attackDamageTypes', v)} />
          <ChipGroup label="Attack Range" options={ATTACK_MODES} selected={filter.attackDeliveryModes ?? []} onToggle={v => toggle('attackDeliveryModes', v)} />
          <ChipGroup label="Resistant To" options={DAMAGE_TYPES} selected={filter.damageResistances ?? []} onToggle={v => toggle('damageResistances', v)} />
          <ChipGroup label="Immune To (Damage)" options={DAMAGE_TYPES} selected={filter.damageImmunities ?? []} onToggle={v => toggle('damageImmunities', v)} />
          <ChipGroup label="Vulnerable To" options={DAMAGE_TYPES} selected={filter.damageVulnerabilities ?? []} onToggle={v => toggle('damageVulnerabilities', v)} />
          <ChipGroup label="Condition Immunities" options={CONDITIONS} selected={filter.conditionImmunities ?? []} onToggle={v => toggle('conditionImmunities', v)} />

          <div className="flex flex-wrap gap-x-4 gap-y-2 xl:col-span-2">
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

        </div>
      )}
    </div>
  );
}
