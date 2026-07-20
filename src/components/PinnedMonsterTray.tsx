'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Pin, X } from 'lucide-react';
import type { Monster } from '@/lib/types';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import { getMonsterPhysicalDescription } from '@/data/monster-description-index';

function crDisplay(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return cr.toString();
}

export default function PinnedMonsterTray({
  monsters,
  isOpen,
  onToggleOpen,
  onSelect,
  onUnpin,
}: {
  monsters: Monster[];
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelect: (monster: Monster) => void;
  onUnpin: (monsterId: string) => void;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const allExpanded = monsters.every((monster) => expandedIds.has(monster.id));
  const allCollapsed = monsters.every((monster) => !expandedIds.has(monster.id));

  function toggleMonster(monsterId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(monsterId)) next.delete(monsterId);
      else next.add(monsterId);
      return next;
    });
  }

  function handleUnpin(monsterId: string) {
    setExpandedIds((current) => {
      if (!current.has(monsterId)) return current;
      const next = new Set(current);
      next.delete(monsterId);
      return next;
    });
    onUnpin(monsterId);
  }

  return (
    <aside
      className="mb-5 flex max-h-[80dvh] flex-col overflow-hidden rounded-2xl border border-[var(--bronze)] bg-[var(--steel-900)] shadow-xl print:hidden"
      aria-label="Pinned monsters"
    >
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex min-h-12 w-full shrink-0 items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[var(--steel-800)]"
        aria-expanded={isOpen}
        aria-controls="pinned-monster-tray-content"
      >
        <span className="inline-flex min-w-0 items-center gap-2 font-semibold">
          <Pin size={16} className="shrink-0 text-[var(--bronze)]" aria-hidden="true" />
          <span className="truncate">Pinned monster details</span>
          <span className="rounded-full bg-[var(--steel-950)] px-2 py-0.5 text-xs text-[var(--bronze)]">
            {monsters.length}
          </span>
        </span>
        {isOpen ? <ChevronDown size={17} aria-hidden="true" /> : <ChevronUp size={17} aria-hidden="true" />}
      </button>

      {isOpen && (
        <div id="pinned-monster-tray-content" className="flex min-h-0 flex-col border-t border-[var(--steel-800)]">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--steel-800)] px-3 py-2">
            <p className="mr-auto text-xs text-[var(--text-3)]">Full stat blocks · newest pin first</p>
            <button
              type="button"
              onClick={() => setExpandedIds(new Set(monsters.map((monster) => monster.id)))}
              disabled={allExpanded}
              className="btn-ghost !min-h-8 !px-2.5 text-xs disabled:cursor-default disabled:opacity-40"
            >
              Expand all
            </button>
            <button
              type="button"
              onClick={() => setExpandedIds(new Set())}
              disabled={allCollapsed}
              className="btn-ghost !min-h-8 !px-2.5 text-xs disabled:cursor-default disabled:opacity-40"
            >
              Collapse all
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-2 [scrollbar-gutter:stable] sm:p-3">
            {monsters.map((monster) => {
              const isExpanded = expandedIds.has(monster.id);
              const contentId = `pinned-monster-${monster.id}-details`;
              const labelId = `pinned-monster-${monster.id}-label`;

              return (
                <article
                  key={monster.id}
                  className="overflow-hidden rounded-xl border border-[var(--steel-800)] bg-[var(--steel-950)]"
                  aria-labelledby={labelId}
                >
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => toggleMonster(monster.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left hover:bg-[var(--steel-900)]"
                      aria-expanded={isExpanded}
                      aria-controls={contentId}
                    >
                      {isExpanded
                        ? <ChevronDown size={17} className="shrink-0 text-[var(--bronze)]" aria-hidden="true" />
                        : <ChevronRight size={17} className="shrink-0 text-[var(--bronze)]" aria-hidden="true" />}
                      <span className="min-w-0 flex-1">
                        <span id={labelId} className="block truncate font-semibold">{monster.name}</span>
                        <span className="block truncate text-xs text-[var(--text-3)]">
                          CR {crDisplay(monster.challengeRating)} · AC {monster.armor.ac} · {monster.hitPoints} HP
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUnpin(monster.id)}
                      className="inline-flex w-11 shrink-0 items-center justify-center border-l border-[var(--steel-800)] text-[var(--text-3)] hover:bg-[var(--steel-900)] hover:text-[var(--bronze)]"
                      aria-label={`Unpin ${monster.name}`}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </div>

                  {isExpanded && (
                    <div id={contentId} className="border-t border-[var(--steel-800)] p-2.5 sm:p-3">
                      <div className="mb-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => onSelect(monster)}
                          className="btn-ghost !min-h-8 !px-2.5 text-xs"
                        >
                          Open in inspector
                        </button>
                      </div>
                      <MonsterStatBlock
                        monster={monster}
                        physicalDescription={getMonsterPhysicalDescription(monster.id)}
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}
