'use client';

import { useState, useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { SRD_SPELLS, searchSpells, filterSpells, levelLabel } from '@/data/spells';
import { usePersistentState } from '@/lib/use-persistent-state';
import type { Spell, SpellSchool } from '@/data/spells';

const SCHOOLS: SpellSchool[] = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
// SRD 5.2.1 class spell lists only — Artificer's list comes from a non-SRD source.
const CLASSES = ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'];

export default function SpellsPage() {
  const [query, setQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<number | ''>('');
  const [schoolFilter, setSchoolFilter] = useState<SpellSchool | ''>('');
  const [classFilter, setClassFilter] = useState('');
  const [concFilter, setConcFilter] = useState<'' | 'yes' | 'no'>('');
  const [ritualFilter, setRitualFilter] = useState<'' | 'yes' | 'no'>('');
  const [selected, setSelected] = useState<Spell | null>(null);
  // Pins persist as ids so a data update can't strand stale spell objects.
  const [pinnedIds, setPinnedIds] = usePersistentState<string[]>(
    'pinnedSpells', [], (v): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string'),
  );
  const pinned = useMemo(
    () => pinnedIds
      .map((id) => SRD_SPELLS.find((s) => s.id === id))
      .filter((s): s is Spell => s !== undefined),
    [pinnedIds],
  );

  const results = useMemo(() => {
    let spells = searchSpells(query, SRD_SPELLS);
    spells = filterSpells(spells, {
      level: levelFilter === '' ? undefined : levelFilter,
      school: schoolFilter || undefined,
      className: classFilter || undefined,
      concentration: concFilter === '' ? undefined : concFilter === 'yes',
      ritual: ritualFilter === '' ? undefined : ritualFilter === 'yes',
    });
    return spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }, [query, levelFilter, schoolFilter, classFilter, concFilter, ritualFilter]);

  function togglePin(spell: Spell) {
    setPinnedIds(prev => prev.includes(spell.id)
      ? prev.filter(id => id !== spell.id)
      : [...prev.slice(-2), spell.id]);
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl mb-2">Spell Reference</h1>
      <p className="text-[var(--text-2)] mb-4 text-sm">
        Type to search. Results appear instantly. Click a spell for full mechanics.
      </p>

      {/* Search */}
      <div className="card mb-4">
        <input
          type="text"
          aria-label="Search spells"
          placeholder="Search by name, school, class, damage type..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full text-lg"
          autoFocus
        />
        {/* Compact filters */}
        <div className="flex flex-wrap gap-2 mt-3">
          <select aria-label="Filter by level" value={levelFilter} onChange={e => setLevelFilter(e.target.value === '' ? '' : Number(e.target.value))} className="text-sm">
            <option value="">All Levels</option>
            {[0,1,2,3,4,5,6,7,8,9].map(l => <option key={l} value={l}>{levelLabel(l)}</option>)}
          </select>
          <select aria-label="Filter by school" value={schoolFilter} onChange={e => setSchoolFilter(e.target.value as SpellSchool | '')} className="text-sm">
            <option value="">All Schools</option>
            {SCHOOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select aria-label="Filter by class" value={classFilter} onChange={e => setClassFilter(e.target.value)} className="text-sm">
            <option value="">All Classes</option>
            {CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select aria-label="Filter by concentration" value={concFilter} onChange={e => setConcFilter(e.target.value as '' | 'yes' | 'no')} className="text-sm">
            <option value="">Concentration?</option>
            <option value="yes">Concentration</option>
            <option value="no">No Concentration</option>
          </select>
          <select aria-label="Filter by ritual" value={ritualFilter} onChange={e => setRitualFilter(e.target.value as '' | 'yes' | 'no')} className="text-sm">
            <option value="">Ritual?</option>
            <option value="yes">Ritual</option>
            <option value="no">Not Ritual</option>
          </select>
          <span className="text-xs text-[var(--text-2)] self-center ml-2">{results.length} spells</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Spell List */}
        <div className="lg:col-span-1 space-y-1 max-h-[75vh] overflow-y-auto">
          {results.map(spell => (
            <button
              key={spell.id}
              type="button"
              onClick={() => setSelected(spell)}
              className={`w-full text-left p-2 rounded text-sm transition-colors ${
                selected?.id === spell.id ? 'bg-[var(--steel-800)] border border-[var(--bronze)]' : 'hover:bg-[var(--steel-900)] border border-transparent'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{spell.name}</span>
                <span className="text-xs text-[var(--bronze)]">{levelLabel(spell.level)}</span>
              </div>
              <div className="text-xs text-[var(--text-2)]">
                {spell.school} · {spell.castingTime} · {spell.range}
                {spell.concentration && <span className="ml-1 text-[var(--bronze)]">C</span>}
                {spell.ritual && <span className="ml-1 text-[var(--text-3)]">R</span>}
              </div>
            </button>
          ))}
          {results.length === 0 && (
            <div className="text-center py-8 text-[var(--text-2)]">No spells match.</div>
          )}
        </div>

        {/* Spell Detail + Pinned */}
        <div className="lg:col-span-2 space-y-4">
          {selected ? (
            <SpellCard spell={selected} onPin={togglePin} isPinned={pinned.some(p => p.id === selected.id)} />
          ) : (
            <div className="card text-center py-12 text-[var(--text-2)]">
              <div className="mb-3 flex justify-center" aria-hidden="true">
                <Sparkles size={40} className="text-[var(--text-3)]" />
              </div>
              <p>Select a spell to view its mechanics</p>
            </div>
          )}

          {/* Pinned comparison */}
          {pinned.length > 0 && (
            <div>
              <h3 className="micro-label font-sans mb-2">
                Pinned for Comparison ({pinned.length}/3)
              </h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {pinned.map(p => (
                  <SpellCard key={p.id} spell={p} onPin={togglePin} isPinned compact />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SpellCard({ spell, onPin, isPinned, compact }: { spell: Spell; onPin: (s: Spell) => void; isPinned: boolean; compact?: boolean }) {
  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <h2 className={`${compact ? 'text-base' : 'text-xl'}`}>{spell.name}</h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onPin(spell)} aria-pressed={isPinned} title={isPinned ? 'Unpin' : 'Pin for comparison'}
            className={`text-sm px-2 py-0.5 rounded ${isPinned ? 'bg-[var(--bronze)] text-[#1d1105]' : 'bg-[var(--steel-800)] text-[var(--text-2)]'}`}>
            {isPinned ? 'Pinned' : 'Pin'}
          </button>
          <span className="text-sm font-bold text-[var(--bronze)]">{levelLabel(spell.level)}</span>
        </div>
      </div>

      {/* One-line summary */}
      <div className="text-xs text-[var(--text-2)] mb-2">
        {spell.school} · {spell.components}
        {spell.concentration && <span className="ml-1 text-[var(--bronze)] font-bold">[C]</span>}
        {spell.ritual && <span className="ml-1 text-[var(--text-3)] font-bold">[R]</span>}
      </div>

      {/* Classes */}
      <div className="flex flex-wrap gap-1 mb-2">
        {spell.classes.map(c => (
          <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--steel-800)] text-[var(--text-2)]">{c}</span>
        ))}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--steel-950)] text-[var(--text-2)] opacity-60">{spell.source}</span>
      </div>

      {/* Key mechanics row */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-2">
        <span><span className="text-[var(--bronze)] font-bold">Cast:</span> {spell.castingTime}</span>
        <span><span className="text-[var(--bronze)] font-bold">Range:</span> {spell.range}</span>
        {spell.area && <span><span className="text-[var(--bronze)] font-bold">Area:</span> {spell.area}</span>}
        <span><span className="text-[var(--bronze)] font-bold">Duration:</span> {spell.duration}</span>
        {spell.saveType && <span><span className="text-[var(--accent-danger)] font-bold">Save:</span> {spell.saveType}</span>}
        {spell.attackType && <span><span className="text-[var(--accent-danger)] font-bold">Attack:</span> {spell.attackType} spell</span>}
        {spell.damageType && <span><span className="text-[var(--accent-danger)] font-bold">Damage:</span> {spell.damageType}</span>}
      </div>

      <hr className="border-[var(--steel-800)] my-2" />

      {/* Effect summary — the key mechanic */}
      <p className="text-sm font-bold mb-1">{spell.effectSummary}</p>

      {spell.upcast && (
        <p className="text-xs text-[var(--text-2)] mt-1">
          <span className="text-[var(--bronze)] font-bold">At Higher Levels:</span> {spell.upcast}
        </p>
      )}

      {/* Full description — SRD text; \n inside a paragraph block is a
          list/table line break, preserved via whitespace-pre-line */}
      {!compact && spell.description.split('\n\n').map((paragraph, i) => (
        <p key={i} className={`text-sm leading-relaxed whitespace-pre-line ${i === 0 ? 'mt-3' : 'mt-2'}`}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}
