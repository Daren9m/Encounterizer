'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  FileText,
  FolderPlus,
  Link as LinkIcon,
  Plus,
  Printer,
  Sparkles,
  Swords,
  Trash2,
} from 'lucide-react';
import { useMonsters } from '@/app/hooks/useMonsters';
import { useSpells } from '@/app/hooks/useSpells';
import BattleOrganizer from '@/components/BattleOrganizer';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import RulesReference from '@/components/RulesReference';
import ToolPageHeader from '@/components/ToolPageHeader';
import { levelLabel, type Spell } from '@/data/spells';
import { getMonsterPhysicalDescription } from '@/data/monster-description-index';
import { EMPTY_BATTLE, isBattleState, type BattleState } from '@/lib/battle-organizer';
import {
  EMPTY_DM_SCREEN,
  dmScreenToMarkdown,
  isDmScreenState,
  removeSectionTree,
  syncPinnedItems,
  updateSectionTree,
  type DmScreenItem,
  type DmScreenItemKind,
  type DmScreenSection,
  type DmScreenState,
} from '@/lib/dm-screen';
import { DM_SCREEN_TOOL_ROUTES } from '@/lib/site';
import type { Monster } from '@/lib/types';
import { usePersistentState } from '@/lib/use-persistent-state';

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function download(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function flattenSections(sections: DmScreenSection[], depth = 0): { id: string; label: string }[] {
  return sections.flatMap((section) => [
    { id: section.id, label: `${'— '.repeat(depth)}${section.title}` },
    ...flattenSections(section.children, depth + 1),
  ]);
}

export default function DmScreenPage() {
  const [screen, setScreen] = usePersistentState<DmScreenState>('dmScreen', EMPTY_DM_SCREEN, isDmScreenState);
  const [battle] = usePersistentState<BattleState>('battleOrganizer', EMPTY_BATTLE, isBattleState);
  const [pinnedMonsterIds] = usePersistentState<string[]>('bestiaryPinnedMonsters', [], (value): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string'));
  const [pinnedSpellIds] = usePersistentState<string[]>('pinnedSpells', [], (value): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string'));
  const { all: monsters } = useMonsters();
  const spells = useSpells();
  const monsterMap = useMemo(() => new Map(monsters.map((monster) => [monster.id, monster])), [monsters]);
  const spellMap = useMemo(() => new Map(spells.map((spell) => [spell.id, spell])), [spells]);
  const sectionOptions = useMemo(() => flattenSections(screen.sections), [screen.sections]);
  const [targetSectionId, setTargetSectionId] = useState('');
  const [addKind, setAddKind] = useState<DmScreenItemKind>('note');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [resourceQuery, setResourceQuery] = useState('');
  const [toolPath, setToolPath] = useState(DM_SCREEN_TOOL_ROUTES[0].path);
  const selectedTargetSectionId = sectionOptions.some((section) => section.id === targetSectionId)
    ? targetSectionId
    : sectionOptions[0]?.id ?? '';

  useEffect(() => {
    setScreen((current) => {
      const next = syncPinnedItems(
        current,
        pinnedMonsterIds,
        pinnedSpellIds,
        (resourceId) => monsterMap.get(resourceId)?.name,
        (resourceId) => spellMap.get(resourceId)?.name,
      );
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [monsterMap, pinnedMonsterIds, pinnedSpellIds, screen.autoAddPinnedMonsters, screen.autoAddPinnedSpells, setScreen, spellMap]);

  const resourceResults = useMemo(() => {
    const query = resourceQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    if (addKind === 'monster') return monsters
      .filter((monster) => monster.name.toLowerCase().includes(query))
      .slice(0, 10)
      .map((monster) => ({ id: monster.id, name: monster.name, detail: `CR ${monster.challengeRating} · ${monster.type}` }));
    if (addKind === 'spell') return spells
      .filter((spell) => spell.name.toLowerCase().includes(query))
      .slice(0, 10)
      .map((spell) => ({ id: spell.id, name: spell.name, detail: `${levelLabel(spell.level)} · ${spell.school}` }));
    return [];
  }, [addKind, monsters, resourceQuery, spells]);

  function addSection(parentId?: string) {
    const section: DmScreenSection = { id: id('section'), title: 'New section', collapsed: false, items: [], children: [] };
    setScreen((current) => ({
      ...current,
      sections: parentId
        ? updateSectionTree(current.sections, parentId, (parent) => ({ ...parent, children: [...parent.children, section] }))
        : [...current.sections, section],
    }));
    setTargetSectionId(section.id);
  }

  function addItem(item: DmScreenItem) {
    if (!selectedTargetSectionId) return;
    setScreen((current) => ({
      ...current,
      sections: updateSectionTree(current.sections, selectedTargetSectionId, (section) => ({ ...section, items: [...section.items, item] })),
    }));
    setTitle('');
    setBody('');
    setResourceQuery('');
  }

  function addConfiguredItem() {
    if (addKind === 'note' && (title.trim() || body.trim())) {
      addItem({ id: id('note'), kind: 'note', title: title.trim() || 'Note', body: body.trim(), collapsed: false, hidden: false, origin: 'manual' });
    }
    if (addKind === 'tool') {
      const route = DM_SCREEN_TOOL_ROUTES.find((candidate) => candidate.path === toolPath)!;
      addItem({ id: id('tool'), kind: 'tool', title: title.trim() || route.title, body: body.trim() || route.description, href: route.path, collapsed: false, hidden: false, origin: 'manual' });
    }
    if (addKind === 'initiative') {
      addItem({ id: id('initiative'), kind: 'initiative', title: title.trim() || 'Initiative Tracker', collapsed: false, hidden: false, origin: 'manual' });
    }
    if (addKind === 'rules') {
      addItem({ id: id('rules'), kind: 'rules', title: title.trim() || 'Table Rules Reference', collapsed: false, hidden: false, origin: 'manual' });
    }
  }

  function addResource(resourceId: string, resourceTitle: string) {
    addItem({ id: id(addKind), kind: addKind, title: resourceTitle, resourceId, collapsed: false, hidden: false, origin: 'manual' });
  }

  function exportJson() {
    const usedMonsterIds = new Set<string>();
    const usedSpellIds = new Set<string>();
    const walk = (sections: DmScreenSection[]) => sections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.kind === 'monster' && item.resourceId) usedMonsterIds.add(item.resourceId);
        if (item.kind === 'spell' && item.resourceId) usedSpellIds.add(item.resourceId);
      });
      walk(section.children);
    });
    walk(screen.sections);
    const exported = {
      exportedAt: new Date().toISOString(),
      dmScreen: screen,
      battle,
      resources: {
        monsters: [...usedMonsterIds].map((resourceId) => monsterMap.get(resourceId)).filter(Boolean),
        spells: [...usedSpellIds].map((resourceId) => spellMap.get(resourceId)).filter(Boolean),
      },
    };
    download('dm-screen.json', JSON.stringify(exported, null, 2), 'application/json');
  }

  return <div className="animate-fade-in dm-screen-print">
    <ToolPageHeader
      path="/dm-screen"
      description="Assemble a private command surface for the session. Add references, notes, app tools, and the live battle organizer; collapse or hide anything until you need it."
      actions={<div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary text-sm" onClick={() => download('dm-screen.md', dmScreenToMarkdown(screen, monsterMap, spellMap, battle), 'text/markdown')}><FileText size={16} aria-hidden="true" /> MD</button>
        <button type="button" className="btn-secondary text-sm" onClick={exportJson}><Download size={16} aria-hidden="true" /> JSON</button>
        <button type="button" className="btn-secondary text-sm" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Print</button>
      </div>}
    />

    <div className="card panel-accent mb-5 print:hidden">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="text-sm font-semibold">Screen title<input className="mt-1 w-full text-xl" value={screen.title} onChange={(event) => setScreen((current) => ({ ...current, title: event.target.value }))} /></label>
        <div className="flex flex-wrap gap-4 pb-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={screen.autoAddPinnedMonsters} onChange={(event) => setScreen((current) => ({ ...current, autoAddPinnedMonsters: event.target.checked }))} /> Auto-add pinned monsters</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={screen.autoAddPinnedSpells} onChange={(event) => setScreen((current) => ({ ...current, autoAddPinnedSpells: event.target.checked }))} /> Auto-add pinned spells</label>
        </div>
      </div>
    </div>

    <section className="card mb-5 print:hidden" aria-labelledby="add-to-screen-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><p className="micro-label">Screen builder</p><h2 id="add-to-screen-heading" className="text-xl">Add to the screen</h2></div>
        <button type="button" className="btn-secondary text-sm" onClick={() => addSection()}><FolderPlus size={17} aria-hidden="true" /> New section</button>
      </div>
      {sectionOptions.length > 0 ? <>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-[1fr_0.8fr_1.2fr]">
          <label className="text-xs font-semibold">Destination<select className="mt-1 w-full" value={selectedTargetSectionId} onChange={(event) => setTargetSectionId(event.target.value)}>{sectionOptions.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}</select></label>
          <label className="text-xs font-semibold">Content type<select className="mt-1 w-full" value={addKind} onChange={(event) => setAddKind(event.target.value as DmScreenItemKind)}><option value="note">Note</option><option value="rules">Rules reference</option><option value="monster">Monster</option><option value="spell">Spell</option><option value="tool">App tool</option><option value="initiative">Initiative tracker</option></select></label>
          {(addKind === 'monster' || addKind === 'spell') ? <label className="text-xs font-semibold">Find {addKind}<input className="mt-1 w-full" value={resourceQuery} onChange={(event) => setResourceQuery(event.target.value)} placeholder={`Search ${addKind}s…`} /></label> : <label className="text-xs font-semibold">Title (optional)<input className="mt-1 w-full" value={title} onChange={(event) => setTitle(event.target.value)} /></label>}
        </div>
        {(addKind === 'monster' || addKind === 'spell') && resourceResults.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{resourceResults.map((result) => <button key={result.id} type="button" className="rounded-lg border border-[var(--steel-800)] p-3 text-left hover:border-[var(--bronze)]" onClick={() => addResource(result.id, result.name)}><span className="block font-semibold">{result.name}</span><span className="text-xs text-[var(--text-3)]">{result.detail}</span></button>)}</div>}
        {addKind === 'note' && <textarea className="mt-3 w-full" rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Rules reminder, boxed text, NPC notes, session beats…" />}
        {addKind === 'tool' && <div className="mt-3 grid gap-2 md:grid-cols-[1fr_2fr]"><select value={toolPath} onChange={(event) => setToolPath(event.target.value)}>{DM_SCREEN_TOOL_ROUTES.map((route) => <option key={route.path} value={route.path}>{route.title}</option>)}</select><input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Optional reminder about how you’ll use this tool" /></div>}
        {(addKind === 'note' || addKind === 'tool' || addKind === 'rules' || addKind === 'initiative') && <button type="button" className="btn-primary mt-3" onClick={addConfiguredItem}><Plus size={17} aria-hidden="true" /> Add {addKind === 'initiative' ? 'tracker' : addKind === 'rules' ? 'reference' : addKind}</button>}
      </> : <div className="rounded-lg border border-dashed border-[var(--steel-700)] p-5 text-center text-sm text-[var(--text-2)]">Create a section first, then fill it with anything you need at the table.</div>}
    </section>

    <div className="mb-5 hidden print:block"><h1 className="text-3xl">{screen.title}</h1><p className="text-sm text-[var(--text-3)]">Encounterizer DM Screen</p></div>

    {screen.sections.length > 0 ? <div className="space-y-4">
      {screen.sections.map((section) => <ScreenSection key={section.id} section={section} depth={0} monsters={monsterMap} spells={spellMap} onAddChild={addSection} onUpdate={(sectionId, update) => setScreen((current) => ({ ...current, sections: updateSectionTree(current.sections, sectionId, update) }))} onRemove={(sectionId) => { if (window.confirm('Remove this section, its subsections, and all of its items?')) setScreen((current) => ({ ...current, sections: removeSectionTree(current.sections, sectionId) })); }} />)}
    </div> : <div className="empty-state"><BookOpen className="mx-auto mb-3 text-[var(--bronze)]" size={38} aria-hidden="true" /><p className="font-semibold">Your screen is ready to be arranged</p><p className="mt-1 text-sm">Create sections for the scene, rules, NPCs, spells, or anything else you want close at hand.</p><button type="button" className="btn-primary mt-4 print:hidden" onClick={() => addSection()}><FolderPlus size={17} aria-hidden="true" /> Create first section</button></div>}
  </div>;
}

function ScreenSection({ section, depth, monsters, spells, onAddChild, onUpdate, onRemove }: {
  section: DmScreenSection;
  depth: number;
  monsters: ReadonlyMap<string, Monster>;
  spells: ReadonlyMap<string, Spell>;
  onAddChild: (parentId: string) => void;
  onUpdate: (sectionId: string, update: (section: DmScreenSection) => DmScreenSection) => void;
  onRemove: (sectionId: string) => void;
}) {
  function updateItem(itemId: string, update: (item: DmScreenItem) => DmScreenItem) {
    onUpdate(section.id, (current) => ({ ...current, items: current.items.map((item) => item.id === itemId ? update(item) : item) }));
  }
  return <section className={`${depth === 0 ? 'card !p-0' : 'rounded-xl border border-[var(--steel-800)] bg-[var(--steel-950)]'} overflow-hidden`}>
    <header className="flex items-center gap-2 border-b border-[var(--steel-800)] px-4 py-3 print:px-0">
      <button type="button" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-[var(--steel-800)] print:hidden" onClick={() => onUpdate(section.id, (current) => ({ ...current, collapsed: !current.collapsed }))} aria-expanded={!section.collapsed} aria-label={`${section.collapsed ? 'Expand' : 'Collapse'} ${section.title}`}>{section.collapsed ? <ChevronDown size={19} /> : <ChevronUp size={19} />}</button>
      <input className={`min-w-0 flex-1 !border-0 !bg-transparent !p-0 font-display font-semibold ${depth === 0 ? 'text-xl' : 'text-base'} print:min-h-0`} value={section.title} onChange={(event) => onUpdate(section.id, (current) => ({ ...current, title: event.target.value }))} aria-label="Section title" />
      <span className="text-xs text-[var(--text-3)] print:hidden">{section.items.length} items · {section.children.length} subsections</span>
      <button type="button" className="btn-ghost !min-h-10 !px-2 text-xs print:hidden" onClick={() => onAddChild(section.id)}><FolderPlus size={15} /> Subsection</button>
      <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--accent-danger)] hover:bg-[var(--steel-800)] print:hidden" onClick={() => onRemove(section.id)} aria-label={`Remove ${section.title}`}><Trash2 size={17} /></button>
    </header>
    <div className={`${section.collapsed ? 'hidden print:block' : ''} space-y-3 p-4 print:p-0 print:pt-3`}>
      {section.items.map((item) => <ScreenItem key={item.id} item={item} monster={item.resourceId ? monsters.get(item.resourceId) : undefined} spell={item.resourceId ? spells.get(item.resourceId) : undefined} onUpdate={(update) => updateItem(item.id, update)} onRemove={() => onUpdate(section.id, (current) => ({ ...current, items: current.items.filter((candidate) => candidate.id !== item.id) }))} />)}
      {section.children.map((child) => <ScreenSection key={child.id} section={child} depth={depth + 1} monsters={monsters} spells={spells} onAddChild={onAddChild} onUpdate={onUpdate} onRemove={onRemove} />)}
      {section.items.length === 0 && section.children.length === 0 && <p className="rounded-lg border border-dashed border-[var(--steel-800)] p-4 text-center text-sm text-[var(--text-3)] print:hidden">Choose this section in the builder above to add content.</p>}
    </div>
  </section>;
}

function ScreenItem({ item, monster, spell, onUpdate, onRemove }: {
  item: DmScreenItem;
  monster?: Monster;
  spell?: Spell;
  onUpdate: (update: (item: DmScreenItem) => DmScreenItem) => void;
  onRemove: () => void;
}) {
  const Icon = item.kind === 'monster' ? Swords : item.kind === 'spell' ? Sparkles : item.kind === 'tool' ? LinkIcon : item.kind === 'rules' ? BookOpen : item.kind === 'initiative' || item.kind === 'battle' ? Swords : FileText;
  return <article className={`rounded-xl border ${item.hidden ? 'border-dashed border-[var(--steel-700)] opacity-70 print:opacity-100' : 'border-[var(--steel-800)]'} bg-[var(--steel-900)]`}>
    <header className="flex items-center gap-2 px-3 py-2">
      <Icon size={17} className="shrink-0 text-[var(--bronze)]" aria-hidden="true" />
      <input className="min-w-0 flex-1 !border-0 !bg-transparent !p-0 font-semibold print:min-h-0" value={item.title} onChange={(event) => onUpdate((current) => ({ ...current, title: event.target.value }))} aria-label="Item title" />
      {item.origin === 'auto-pin' && <span className="rounded-full bg-[var(--bronze-wash)] px-2 py-0.5 text-[10px] font-semibold text-[var(--bronze)] print:hidden">AUTO-PINNED</span>}
      {item.hidden && <span className="text-xs text-[var(--text-3)] print:hidden">Hidden</span>}
      <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--steel-800)] print:hidden" onClick={() => onUpdate((current) => ({ ...current, hidden: !current.hidden }))} aria-label={`${item.hidden ? 'Show' : 'Hide'} ${item.title}`}>{item.hidden ? <Eye size={17} /> : <EyeOff size={17} />}</button>
      <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--steel-800)] print:hidden" onClick={() => onUpdate((current) => ({ ...current, collapsed: !current.collapsed }))} aria-label={`${item.collapsed ? 'Open' : 'Collapse'} ${item.title}`}>{item.collapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button>
      <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--accent-danger)] hover:bg-[var(--steel-800)] print:hidden" onClick={onRemove} aria-label={`Remove ${item.title}`}><Trash2 size={16} /></button>
    </header>
    <div className={`${item.hidden || item.collapsed ? 'hidden print:block' : ''} border-t border-[var(--steel-800)] p-3 print:p-0 print:pt-2`}>
      {item.kind === 'note' && <textarea className="w-full border-0 bg-transparent print:min-h-0" rows={Math.max(3, (item.body?.split('\n').length ?? 1) + 1)} value={item.body ?? ''} onChange={(event) => onUpdate((current) => ({ ...current, body: event.target.value }))} />}
      {item.kind === 'monster' && (monster ? <MonsterStatBlock monster={monster} physicalDescription={getMonsterPhysicalDescription(monster.id)} /> : <p className="text-sm text-[var(--accent-danger)]">This monster is no longer available.</p>)}
      {item.kind === 'spell' && (spell ? <SpellReference spell={spell} /> : <p className="text-sm text-[var(--accent-danger)]">This spell is no longer available.</p>)}
      {item.kind === 'tool' && <div><p className="text-sm text-[var(--text-2)]">{item.body}</p>{item.href && <Link className="btn-secondary mt-3 text-sm print:hidden" href={item.href}>Open tool <span aria-hidden="true">→</span></Link>}</div>}
      {item.kind === 'rules' && <RulesReference />}
      {(item.kind === 'initiative' || item.kind === 'battle') && <BattleOrganizer mode="initiative" />}
    </div>
  </article>;
}

function SpellReference({ spell }: { spell: Spell }) {
  return <div className="rounded-lg bg-[var(--steel-950)] p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-xl">{spell.name}</h3><p className="text-xs text-[var(--text-2)]">{levelLabel(spell.level)} {spell.school} · {spell.components}</p></div><div className="flex gap-1">{spell.concentration && <span className="rounded bg-[var(--bronze-wash)] px-2 py-1 text-xs text-[var(--bronze)]">Concentration</span>}{spell.ritual && <span className="rounded bg-[var(--steel-800)] px-2 py-1 text-xs">Ritual</span>}</div></div>
    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3"><div><dt className="micro-label">Casting time</dt><dd>{spell.castingTime}</dd></div><div><dt className="micro-label">Range</dt><dd>{spell.range}</dd></div><div><dt className="micro-label">Duration</dt><dd>{spell.duration}</dd></div></dl>
    <p className="mt-3 font-semibold">{spell.effectSummary}</p>
    <div className="mt-3 space-y-2 text-sm leading-relaxed">{spell.description.split('\n\n').map((paragraph, index) => <p key={index} className="whitespace-pre-line">{paragraph}</p>)}</div>
  </div>;
}
