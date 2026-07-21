'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FileText,
  FolderPlus,
  Link as LinkIcon,
  Plus,
  Printer,
  RefreshCw,
  Sparkles,
  Swords,
  Trash2,
  Users,
} from 'lucide-react';
import { useMonsters } from '@/app/hooks/useMonsters';
import { useSpells } from '@/app/hooks/useSpells';
import { useBattleStore } from '@/app/hooks/useBattleStore';
import { useCustomMonsters } from '@/app/hooks/useCustomMonsters';
import { useCustomSpells } from '@/app/hooks/useCustomSpells';
import { useDmScreenStore } from '@/app/hooks/useDmScreenStore';
import { usePartyLibrary } from '@/app/hooks/usePartyLibrary';
import BattleOrganizer from '@/components/BattleOrganizer';
import DmScreenBackupPanel from '@/components/DmScreenBackupPanel';
import DmPartyPanel from '@/components/DmPartyPanel';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import RulesReference from '@/components/RulesReference';
import ToolPageHeader from '@/components/ToolPageHeader';
import { levelLabel, type Spell } from '@/data/spells';
import { getMonsterPhysicalDescription } from '@/data/monster-description-index';
import {
  EMPTY_DM_SCREEN,
  dmScreenToMarkdown,
  hasDmPartyItem,
  removeSectionTree,
  syncDmPartySnapshot,
  syncPinnedItems,
  updateSectionTree,
  type DmScreenItem,
  type DmScreenItemKind,
  type DmScreenIdFactory,
  type DmScreenSection,
  type DmScreenState,
} from '@/lib/dm-screen';
import {
  createDmScreenExportEnvelope,
  planDmScreenImport,
  type DmScreenImportCandidate,
  type DmScreenImportMode,
} from '@/lib/dm-screen-import';
import { getActiveParty } from '@/lib/party';
import { partyToDmScreenSummary } from '@/lib/party-adapters';
import { DM_SCREEN_DEFAULT_TOOL_PATH, DM_SCREEN_TOOL_ROUTES } from '@/lib/site';
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

function defaultItemLayout(): DmScreenItem['layout'] {
  return { width: 'full', stashed: false, excludedFromPrint: false };
}

function prepareImportedScreen(
  screen: DmScreenState,
  mode: DmScreenImportMode,
  namespace: string,
): DmScreenState {
  let sectionIndex = 0;
  let itemIndex = 0;
  const prepare = (section: DmScreenSection): DmScreenSection => ({
    ...section,
    id: mode === 'merge' ? `${namespace}-section-${++sectionIndex}` : section.id,
    items: section.items.map((item) => ({
      ...item,
      id: mode === 'merge' ? `${namespace}-item-${++itemIndex}` : item.id,
      ...(item.origin === 'auto-pin' ? { origin: 'manual' as const } : {}),
    })),
    children: section.children.map(prepare),
  });
  return { ...screen, sections: screen.sections.map(prepare) };
}

function deterministicDocumentIds(namespace: string): { createId: DmScreenIdFactory } {
  let next = 0;
  return { createId: (kind) => `${namespace}-${kind}-collision-${++next}` };
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => [key, canonicalJson(entry)]));
}

function sameResourceDefinition(
  left: { source?: unknown },
  right: { source?: unknown },
): boolean {
  const { source: _leftSource, ...leftDefinition } = left;
  const { source: _rightSource, ...rightDefinition } = right;
  return JSON.stringify(canonicalJson(leftDefinition))
    === JSON.stringify(canonicalJson(rightDefinition));
}

function ScreenSaveStatus({
  hydrated,
  status,
  dirty,
  error,
  onRetry,
}: {
  hydrated: boolean;
  status: ReturnType<typeof useDmScreenStore>['status'];
  dirty: boolean;
  error: ReturnType<typeof useDmScreenStore>['error'];
  onRetry: () => void;
}) {
  if (!hydrated || status === 'idle' || status === 'loading') {
    return <p className="mt-2 text-xs text-[var(--text-3)]" role="status">Loading saved screen…</p>;
  }
  if (status === 'saving') {
    return <p className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--text-2)]" role="status"><RefreshCw size={14} className="animate-spin" aria-hidden="true" /> Saving screen…</p>;
  }
  if (status === 'error' || status === 'unavailable') {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-wash)] p-3 text-sm" role="alert">
        <p><strong>{dirty ? 'Screen changes are only available in this tab.' : 'The saved screen was left untouched.'}</strong> {error?.message ?? 'Browser storage is unavailable.'}</p>
        <button type="button" className="btn-secondary text-xs" onClick={onRetry}><RefreshCw size={15} aria-hidden="true" /> Retry</button>
      </div>
    );
  }
  return <p className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--text-3)]" role="status"><CheckCircle2 size={14} className="text-[var(--status-success)]" aria-hidden="true" /> Saved in this browser</p>;
}

export default function DmScreenPage() {
  const {
    screen,
    status: screenStatus,
    hydrated: screenHydrated,
    dirty: screenDirty,
    error: screenError,
    updateScreen,
    replaceScreen,
    retryScreenStorage,
  } = useDmScreenStore();
  const setScreen = useCallback((transform: (current: DmScreenState) => DmScreenState) => {
    void updateScreen(transform);
  }, [updateScreen]);
  const { battle, replaceBattle } = useBattleStore();
  const {
    library: partyLibrary,
    hydrated: partyLibraryHydrated,
    status: partyLibraryStatus,
  } = usePartyLibrary();
  const activeParty = partyLibrary ? getActiveParty(partyLibrary) : null;
  const currentPartySummary = useMemo(
    () => activeParty ? partyToDmScreenSummary(activeParty) : null,
    [activeParty],
  );
  const partyLibraryCanRefresh = partyLibraryHydrated && partyLibrary !== null;
  const partySummary = currentPartySummary
    ?? (!partyLibraryCanRefresh ? screen?.partySnapshot ?? null : null);
  const containsPartyItem = useMemo(
    () => screen ? hasDmPartyItem(screen.sections) : false,
    [screen],
  );
  const [pinnedMonsterIds] = usePersistentState<string[]>('bestiaryPinnedMonsters', [], (value): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string'));
  const [pinnedSpellIds] = usePersistentState<string[]>('pinnedSpells', [], (value): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === 'string'));
  const { all: monsters } = useMonsters();
  const spells = useSpells();
  const { addMonsters, removeMonster } = useCustomMonsters();
  const { addSpells, removeSpell } = useCustomSpells();
  const monsterMap = useMemo(() => new Map(monsters.map((monster) => [monster.id, monster])), [monsters]);
  const spellMap = useMemo(() => new Map(spells.map((spell) => [spell.id, spell])), [spells]);
  const sectionOptions = useMemo(() => flattenSections(screen?.sections ?? []), [screen]);
  const [targetSectionId, setTargetSectionId] = useState('');
  const [addKind, setAddKind] = useState<DmScreenItemKind>('note');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [resourceQuery, setResourceQuery] = useState('');
  const [toolPath, setToolPath] = useState<string>(DM_SCREEN_DEFAULT_TOOL_PATH);
  const selectedTargetSectionId = sectionOptions.some((section) => section.id === targetSectionId)
    ? targetSectionId
    : sectionOptions[0]?.id ?? '';
  const screenAvailable = screen !== null;

  useEffect(() => {
    if (!screenAvailable) return;
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
  }, [monsterMap, pinnedMonsterIds, pinnedSpellIds, screen?.autoAddPinnedMonsters, screen?.autoAddPinnedSpells, screenAvailable, setScreen, spellMap]);

  useEffect(() => {
    if (!screenAvailable) return;
    if (containsPartyItem && !partyLibraryCanRefresh) return;
    setScreen((current) => syncDmPartySnapshot(current, currentPartySummary));
  }, [containsPartyItem, currentPartySummary, partyLibraryCanRefresh, screenAvailable, setScreen]);

  function screenForExport(): DmScreenState | null {
    if (!screen) return null;
    return containsPartyItem && !partyLibraryCanRefresh
      ? screen
      : syncDmPartySnapshot(screen, currentPartySummary);
  }

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
      addItem({ id: id('note'), kind: 'note', title: title.trim() || 'Note', body: body.trim(), collapsed: false, layout: defaultItemLayout(), origin: 'manual' });
    }
    if (addKind === 'tool') {
      const route = DM_SCREEN_TOOL_ROUTES.find((candidate) => candidate.path === toolPath)!;
      addItem({ id: id('tool'), kind: 'tool', title: title.trim() || route.title, body: body.trim() || route.description, href: route.path, collapsed: false, layout: defaultItemLayout(), origin: 'manual' });
    }
    if (addKind === 'initiative') {
      addItem({ id: id('initiative'), kind: 'initiative', title: title.trim() || 'Initiative Tracker', collapsed: false, layout: defaultItemLayout(), origin: 'manual' });
    }
    if (addKind === 'rules') {
      addItem({ id: id('rules'), kind: 'rules', title: title.trim() || 'Table Rules Reference', collapsed: false, layout: defaultItemLayout(), origin: 'manual' });
    }
    if (addKind === 'party') {
      addItem({ id: id('party'), kind: 'party', title: title.trim() || 'Active Party', collapsed: false, layout: defaultItemLayout(), origin: 'manual' });
    }
  }

  function addResource(resourceId: string, resourceTitle: string) {
    addItem({ id: id(addKind), kind: addKind, title: resourceTitle, resourceId, collapsed: false, layout: defaultItemLayout(), origin: 'manual' });
  }

  function exportJson() {
    const exportScreen = screenForExport();
    if (!exportScreen) return;
    const usedMonsterIds = new Set<string>();
    const usedSpellIds = new Set<string>();
    const walk = (sections: DmScreenSection[]) => sections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.kind === 'monster' && item.resourceId) usedMonsterIds.add(item.resourceId);
        if (item.kind === 'spell' && item.resourceId) usedSpellIds.add(item.resourceId);
      });
      walk(section.children);
    });
    walk(exportScreen.sections);
    const exported = createDmScreenExportEnvelope({
      dmScreen: exportScreen,
      battle,
      resources: {
        monsters: [...usedMonsterIds]
          .map((resourceId) => monsterMap.get(resourceId))
          .filter((monster): monster is Monster => monster !== undefined),
        spells: [...usedSpellIds]
          .map((resourceId) => spellMap.get(resourceId))
          .filter((spell): spell is Spell => spell !== undefined),
      },
    });
    download('encounterizer-dm-screen.json', JSON.stringify(exported, null, 2), 'application/json');
  }

  function restoreWarnings(candidate: DmScreenImportCandidate): string[] {
    let identicalResources = 0;
    let collidingResources = 0;
    let autoPinnedPanels = 0;
    let unresolvedResources = 0;
    const bundledMonsters = new Set(candidate.resources.monsters.map((monster) => monster.id));
    const bundledSpells = new Set(candidate.resources.spells.map((spell) => spell.id));
    for (const monster of candidate.resources.monsters) {
      const existing = monsterMap.get(monster.id);
      if (!existing) continue;
      if (sameResourceDefinition(existing, monster)) identicalResources += 1;
      else collidingResources += 1;
    }
    for (const spell of candidate.resources.spells) {
      const existing = spellMap.get(spell.id);
      if (!existing) continue;
      if (sameResourceDefinition(existing, spell)) identicalResources += 1;
      else collidingResources += 1;
    }
    const visit = (sections: readonly DmScreenSection[]) => {
      for (const section of sections) {
        for (const item of section.items) {
          if (item.origin === 'auto-pin') autoPinnedPanels += 1;
          if (!item.resourceId) continue;
          if (item.kind === 'monster'
            && !monsterMap.has(item.resourceId)
            && !bundledMonsters.has(item.resourceId)) unresolvedResources += 1;
          if (item.kind === 'spell'
            && !spellMap.has(item.resourceId)
            && !bundledSpells.has(item.resourceId)) unresolvedResources += 1;
        }
        visit(section.children);
      }
    };
    visit(candidate.dmScreen.sections);

    const warnings: string[] = [];
    if (identicalResources > 0) warnings.push(`${identicalResources} identical copied resource${identicalResources === 1 ? ' is' : 's are'} already available and will not be duplicated.`);
    if (collidingResources > 0) warnings.push(`${collidingResources} copied resource${collidingResources === 1 ? ' has' : 's have'} the same ID as different local content and will receive a new ID.`);
    if (unresolvedResources > 0) warnings.push(`${unresolvedResources} panel${unresolvedResources === 1 ? '' : 's'} reference resources that are neither bundled nor available in this browser.`);
    if (autoPinnedPanels > 0) warnings.push(`${autoPinnedPanels} auto-pinned panel${autoPinnedPanels === 1 ? '' : 's'} will become regular panels so the restored screen does not depend on this browser’s pin list.`);
    if (candidate.preview.sections > 0) warnings.push('Choosing “Add imported sections” assigns new local IDs to every imported section and panel, so current content cannot be overwritten.');
    return warnings;
  }

  async function applyImport(
    candidate: DmScreenImportCandidate,
    mode: DmScreenImportMode,
    includeBattle: boolean,
  ) {
    if (!screen && mode === 'merge') {
      return { ok: false, error: 'A valid current screen is required before imported sections can be added.' };
    }

    const restoreNamespace = id('restore');
    const candidateWithoutKnownCopies: DmScreenImportCandidate = {
      ...candidate,
      dmScreen: prepareImportedScreen(candidate.dmScreen, mode, restoreNamespace),
      resources: {
        monsters: candidate.resources.monsters.filter((monster) => {
          const existing = monsterMap.get(monster.id);
          return !existing || !sameResourceDefinition(existing, monster);
        }),
        spells: candidate.resources.spells.filter((spell) => {
          const existing = spellMap.get(spell.id);
          return !existing || !sameResourceDefinition(existing, spell);
        }),
      },
    };
    const base = screen ?? EMPTY_DM_SCREEN;
    const plan = planDmScreenImport(base, candidateWithoutKnownCopies, {
      mode,
      includeBattle,
      existingMonsterIds: monsterMap.keys(),
      existingSpellIds: spellMap.keys(),
      documentOptions: deterministicDocumentIds(restoreNamespace),
    });

    const monsterRestore = addMonsters(plan.monsters);
    if (monsterRestore.error) {
      return { ok: false, error: `The screen was not changed. Copied monsters could not be restored: ${monsterRestore.error}` };
    }
    const spellRestore = addSpells(plan.spells);
    if (spellRestore.error) {
      plan.monsters.forEach((monster) => removeMonster(monster.id));
      return { ok: false, error: `The screen was not changed. Copied spells could not be restored: ${spellRestore.error}` };
    }

    const screenResult = mode === 'merge'
      ? await updateScreen((current) => planDmScreenImport(current, candidateWithoutKnownCopies, {
          mode: 'merge',
          existingMonsterIds: monsterMap.keys(),
          existingSpellIds: spellMap.keys(),
          documentOptions: deterministicDocumentIds(restoreNamespace),
        }).dmScreen)
      : await replaceScreen(plan.dmScreen);
    let saveWarning = '';
    if (!screenResult.ok) {
      if (screenResult.queued) {
        saveWarning = ' The imported screen is available in this tab but still needs to be saved; use Retry in the save status.';
      } else {
        plan.monsters.forEach((monster) => removeMonster(monster.id));
        plan.spells.forEach((spell) => removeSpell(spell.id));
        return { ok: false, error: screenResult.error?.message ?? 'The restored screen could not be saved.' };
      }
    }

    let battleWarning = '';
    if (plan.battle) {
      const battleResult = replaceBattle(plan.battle);
      if (!battleResult.ok) battleWarning = ' The included battle is available in this tab but could not be saved.';
    }
    const remaps = plan.sectionIdRemaps.length
      + plan.itemIdRemaps.length
      + plan.monsterIdRemaps.length
      + plan.spellIdRemaps.length;
    return {
      ok: true,
      message: mode === 'merge'
        ? `Added ${candidate.preview.sections} imported section${candidate.preview.sections === 1 ? '' : 's'}${remaps ? ` and safely reassigned ${remaps} colliding ID${remaps === 1 ? '' : 's'}` : ''}.${saveWarning}${battleWarning}`
        : `Replaced the DM Screen with “${candidate.preview.title}”.${saveWarning}${battleWarning}`,
    };
  }

  const pageHeader = <ToolPageHeader
      path="/dm-screen"
      description="Build a durable command surface for your games. Keep references, notes, party details, and live tools together; stash panels until you need them."
      actions={<div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary text-sm" disabled={!screen} onClick={() => {
          const exportScreen = screenForExport();
          if (!exportScreen) return;
          download('dm-screen.md', dmScreenToMarkdown(exportScreen, monsterMap, spellMap, battle), 'text/markdown');
        }}><FileText size={16} aria-hidden="true" /> MD</button>
        <button type="button" className="btn-secondary text-sm" disabled={!screen} onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Print</button>
      </div>}
    />;

  if (!screen) {
    const loadingScreen = !screenHydrated || screenStatus === 'idle' || screenStatus === 'loading';
    return <div className="animate-fade-in dm-screen-print">
      {pageHeader}
      <section className="card panel-accent" aria-labelledby="dm-screen-recovery-heading">
        <p className="micro-label">Saved screen</p>
        <h2 id="dm-screen-recovery-heading" className="mt-1 text-2xl">{loadingScreen ? 'Opening your DM Screen…' : 'Your saved DM Screen needs attention'}</h2>
        <p className="mt-2 max-w-3xl text-sm text-[var(--text-2)]">
          {loadingScreen
            ? 'Loading the durable screen saved in this browser.'
            : 'Encounterizer could not safely open this document, so its saved data has been left untouched. Retry browser storage or restore a validated backup to continue.'}
        </p>
        <ScreenSaveStatus
          hydrated={screenHydrated}
          status={screenStatus}
          dirty={screenDirty}
          error={screenError}
          onRetry={() => void retryScreenStorage()}
        />
        {!loadingScreen && <DmScreenBackupPanel
            saving={screenStatus === 'saving'}
            canExport={false}
            canMerge={false}
            onExport={() => undefined}
            onApply={applyImport}
            getRestoreWarnings={restoreWarnings}
          />}
      </section>
    </div>;
  }

  return <div className="animate-fade-in dm-screen-print">
    {pageHeader}

    <div className="card panel-accent mb-5 print:hidden">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="text-sm font-semibold">Screen title<input className="mt-1 w-full text-xl" value={screen.title} onChange={(event) => {
          const nextTitle = event.target.value;
          setScreen((current) => ({ ...current, title: nextTitle }));
        }} /></label>
        <div className="flex flex-wrap gap-4 pb-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={screen.autoAddPinnedMonsters} onChange={(event) => {
            const checked = event.target.checked;
            setScreen((current) => ({ ...current, autoAddPinnedMonsters: checked }));
          }} /> Auto-add pinned monsters</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={screen.autoAddPinnedSpells} onChange={(event) => {
            const checked = event.target.checked;
            setScreen((current) => ({ ...current, autoAddPinnedSpells: checked }));
          }} /> Auto-add pinned spells</label>
        </div>
      </div>
      <ScreenSaveStatus
        hydrated={screenHydrated}
        status={screenStatus}
        dirty={screenDirty}
        error={screenError}
        onRetry={() => void retryScreenStorage()}
      />
      <DmScreenBackupPanel
        saving={screenStatus === 'saving'}
        canExport={screenHydrated}
        canMerge={screenHydrated}
        onExport={exportJson}
        onApply={applyImport}
        getRestoreWarnings={restoreWarnings}
      />
    </div>

    <section className="card mb-5 print:hidden" aria-labelledby="add-to-screen-heading">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><p className="micro-label">Screen builder</p><h2 id="add-to-screen-heading" className="text-xl">Add to the screen</h2></div>
        <button type="button" className="btn-secondary text-sm" onClick={() => addSection()}><FolderPlus size={17} aria-hidden="true" /> New section</button>
      </div>
      {sectionOptions.length > 0 ? <>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-[1fr_0.8fr_1.2fr]">
          <label className="text-xs font-semibold">Destination<select className="mt-1 w-full" value={selectedTargetSectionId} onChange={(event) => setTargetSectionId(event.target.value)}>{sectionOptions.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}</select></label>
          <label className="text-xs font-semibold">Content type<select className="mt-1 w-full" value={addKind} onChange={(event) => setAddKind(event.target.value as DmScreenItemKind)}><option value="note">Note</option><option value="party">Active party</option><option value="rules">Rules reference</option><option value="monster">Monster</option><option value="spell">Spell</option><option value="tool">App tool</option><option value="initiative">Initiative tracker</option></select></label>
          {(addKind === 'monster' || addKind === 'spell') ? <label className="text-xs font-semibold">Find {addKind}<input className="mt-1 w-full" value={resourceQuery} onChange={(event) => setResourceQuery(event.target.value)} placeholder={`Search ${addKind}s…`} /></label> : <label className="text-xs font-semibold">Title (optional)<input className="mt-1 w-full" value={title} onChange={(event) => setTitle(event.target.value)} /></label>}
        </div>
        {(addKind === 'monster' || addKind === 'spell') && resourceResults.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{resourceResults.map((result) => <button key={result.id} type="button" className="rounded-lg border border-[var(--steel-800)] p-3 text-left hover:border-[var(--bronze)]" onClick={() => addResource(result.id, result.name)}><span className="block font-semibold">{result.name}</span><span className="text-xs text-[var(--text-3)]">{result.detail}</span></button>)}</div>}
        {addKind === 'note' && <textarea className="mt-3 w-full" rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Rules reminder, boxed text, NPC notes, session beats…" />}
        {addKind === 'tool' && <div className="mt-3 grid gap-2 md:grid-cols-[1fr_2fr]"><select value={toolPath} onChange={(event) => setToolPath(event.target.value)}>{DM_SCREEN_TOOL_ROUTES.map((route) => <option key={route.path} value={route.path}>{route.title}</option>)}</select><input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Optional reminder about how you’ll use this tool" /></div>}
        {(addKind === 'note' || addKind === 'tool' || addKind === 'rules' || addKind === 'party' || addKind === 'initiative') && <button type="button" className="btn-primary mt-3" onClick={addConfiguredItem}><Plus size={17} aria-hidden="true" /> Add {addKind === 'initiative' ? 'tracker' : addKind === 'rules' ? 'reference' : addKind}</button>}
      </> : <div className="rounded-lg border border-dashed border-[var(--steel-700)] p-5 text-center text-sm text-[var(--text-2)]">Create a section first, then fill it with anything you need at the table.</div>}
    </section>

    <div className="mb-5 hidden print:block"><h1 className="text-3xl">{screen.title}</h1><p className="text-sm text-[var(--text-3)]">Encounterizer DM Screen</p></div>

    {screen.sections.length > 0 ? <div className="space-y-4">
      {screen.sections.map((section) => <ScreenSection key={section.id} section={section} depth={0} monsters={monsterMap} spells={spellMap} partySummary={partySummary} partyLoading={!partyLibraryHydrated && !partySummary} partyUnavailable={partyLibraryStatus === 'unavailable' || partyLibraryStatus === 'error'} onAddChild={addSection} onUpdate={(sectionId, update) => setScreen((current) => ({ ...current, sections: updateSectionTree(current.sections, sectionId, update) }))} onRemove={(sectionId) => { if (window.confirm('Remove this section, its subsections, and all of its items?')) setScreen((current) => ({ ...current, sections: removeSectionTree(current.sections, sectionId) })); }} />)}
    </div> : <div className="empty-state"><BookOpen className="mx-auto mb-3 text-[var(--bronze)]" size={38} aria-hidden="true" /><p className="font-semibold">Your screen is ready to be arranged</p><p className="mt-1 text-sm">Create sections for the scene, rules, NPCs, spells, or anything else you want close at hand.</p><button type="button" className="btn-primary mt-4 print:hidden" onClick={() => addSection()}><FolderPlus size={17} aria-hidden="true" /> Create first section</button></div>}
  </div>;
}

function ScreenSection({ section, depth, monsters, spells, partySummary, partyLoading, partyUnavailable, onAddChild, onUpdate, onRemove }: {
  section: DmScreenSection;
  depth: number;
  monsters: ReadonlyMap<string, Monster>;
  spells: ReadonlyMap<string, Spell>;
  partySummary: ReturnType<typeof partyToDmScreenSummary> | null;
  partyLoading: boolean;
  partyUnavailable: boolean;
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
      <input className={`min-w-0 flex-1 !border-0 !bg-transparent !p-0 font-display font-semibold ${depth === 0 ? 'text-xl' : 'text-base'} print:min-h-0`} value={section.title} onChange={(event) => {
        const nextTitle = event.target.value;
        onUpdate(section.id, (current) => ({ ...current, title: nextTitle }));
      }} aria-label="Section title" />
      <span className="text-xs text-[var(--text-3)] print:hidden">{section.items.length} items · {section.children.length} subsections</span>
      <button type="button" className="btn-ghost !min-h-10 !px-2 text-xs print:hidden" onClick={() => onAddChild(section.id)}><FolderPlus size={15} /> Subsection</button>
      <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--accent-danger)] hover:bg-[var(--steel-800)] print:hidden" onClick={() => onRemove(section.id)} aria-label={`Remove ${section.title}`}><Trash2 size={17} /></button>
    </header>
    <div className={`${section.collapsed ? 'hidden print:block' : ''} space-y-3 p-4 print:p-0 print:pt-3`}>
      {section.items.map((item) => <ScreenItem key={item.id} item={item} monster={item.resourceId ? monsters.get(item.resourceId) : undefined} spell={item.resourceId ? spells.get(item.resourceId) : undefined} partySummary={partySummary} partyLoading={partyLoading} partyUnavailable={partyUnavailable} onUpdate={(update) => updateItem(item.id, update)} onRemove={() => onUpdate(section.id, (current) => ({ ...current, items: current.items.filter((candidate) => candidate.id !== item.id) }))} />)}
      {section.children.map((child) => <ScreenSection key={child.id} section={child} depth={depth + 1} monsters={monsters} spells={spells} partySummary={partySummary} partyLoading={partyLoading} partyUnavailable={partyUnavailable} onAddChild={onAddChild} onUpdate={onUpdate} onRemove={onRemove} />)}
      {section.items.length === 0 && section.children.length === 0 && <p className="rounded-lg border border-dashed border-[var(--steel-800)] p-4 text-center text-sm text-[var(--text-3)] print:hidden">Choose this section in the builder above to add content.</p>}
    </div>
  </section>;
}

function ScreenItem({ item, monster, spell, partySummary, partyLoading, partyUnavailable, onUpdate, onRemove }: {
  item: DmScreenItem;
  monster?: Monster;
  spell?: Spell;
  partySummary: ReturnType<typeof partyToDmScreenSummary> | null;
  partyLoading: boolean;
  partyUnavailable: boolean;
  onUpdate: (update: (item: DmScreenItem) => DmScreenItem) => void;
  onRemove: () => void;
}) {
  const Icon = item.kind === 'party' ? Users : item.kind === 'monster' ? Swords : item.kind === 'spell' ? Sparkles : item.kind === 'tool' ? LinkIcon : item.kind === 'rules' ? BookOpen : item.kind === 'initiative' || item.kind === 'battle' ? Swords : FileText;
  return <article className={`rounded-xl border ${item.layout.stashed ? 'border-dashed border-[var(--steel-700)] opacity-70 print:opacity-100' : 'border-[var(--steel-800)]'} ${item.layout.excludedFromPrint ? 'print:hidden' : ''} bg-[var(--steel-900)]`}>
    <header className="flex items-center gap-2 px-3 py-2">
      <Icon size={17} className="shrink-0 text-[var(--bronze)]" aria-hidden="true" />
      <input className="min-w-0 flex-1 !border-0 !bg-transparent !p-0 font-semibold print:min-h-0" value={item.title} onChange={(event) => {
        const nextTitle = event.target.value;
        onUpdate((current) => ({ ...current, title: nextTitle }));
      }} aria-label="Item title" />
      {item.origin === 'auto-pin' && <span className="rounded-full bg-[var(--bronze-wash)] px-2 py-0.5 text-[10px] font-semibold text-[var(--bronze)] print:hidden">AUTO-PINNED</span>}
      {item.layout.stashed && <span className="text-xs text-[var(--text-3)] print:hidden">Stashed</span>}
      {item.layout.excludedFromPrint && <span className="text-xs text-[var(--text-3)] print:hidden">Not printed</span>}
      <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--steel-800)] print:hidden" onClick={() => onUpdate((current) => ({ ...current, layout: { ...current.layout, stashed: !current.layout.stashed } }))} aria-label={`${item.layout.stashed ? 'Restore' : 'Stash'} ${item.title}`}>{item.layout.stashed ? <Eye size={17} /> : <EyeOff size={17} />}</button>
      <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[var(--steel-800)] print:hidden" onClick={() => onUpdate((current) => ({ ...current, collapsed: !current.collapsed }))} aria-label={`${item.collapsed ? 'Open' : 'Collapse'} ${item.title}`}>{item.collapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button>
      <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--accent-danger)] hover:bg-[var(--steel-800)] print:hidden" onClick={onRemove} aria-label={`Remove ${item.title}`}><Trash2 size={16} /></button>
    </header>
    <div className={`${item.layout.stashed || item.collapsed ? 'hidden print:block' : ''} border-t border-[var(--steel-800)] p-3 print:p-0 print:pt-2`}>
      <label className="mb-3 flex items-center gap-2 text-xs text-[var(--text-3)] print:hidden">
        <input type="checkbox" checked={item.layout.excludedFromPrint} onChange={(event) => {
          const checked = event.target.checked;
          onUpdate((current) => ({ ...current, layout: { ...current.layout, excludedFromPrint: checked } }));
        }} />
        Exclude this panel from print and Markdown
      </label>
      {item.kind === 'note' && <textarea className="w-full border-0 bg-transparent print:min-h-0" rows={Math.max(3, (item.body?.split('\n').length ?? 1) + 1)} value={item.body ?? ''} onChange={(event) => {
        const nextBody = event.target.value;
        onUpdate((current) => ({ ...current, body: nextBody }));
      }} />}
      {item.kind === 'monster' && (monster ? <MonsterStatBlock monster={monster} physicalDescription={getMonsterPhysicalDescription(monster.id)} /> : <p className="text-sm text-[var(--accent-danger)]">This monster is no longer available.</p>)}
      {item.kind === 'spell' && (spell ? <SpellReference spell={spell} /> : <p className="text-sm text-[var(--accent-danger)]">This spell is no longer available.</p>)}
      {item.kind === 'tool' && <div><p className="text-sm text-[var(--text-2)]">{item.body}</p>{item.href && <Link className="btn-secondary mt-3 text-sm print:hidden" href={item.href}>Open tool <span aria-hidden="true">→</span></Link>}</div>}
      {item.kind === 'rules' && <RulesReference />}
      {item.kind === 'party' && <DmPartyPanel summary={partySummary} loading={partyLoading} unavailable={partyUnavailable} />}
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
