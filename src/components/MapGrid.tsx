'use client';

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { EncounterMap } from '@/lib/types';
import { TERRAIN_INFO } from '@/lib/map-generator';

const CELL_SIZES = [18, 24, 30] as const;

export default function MapGrid({ map }: { map: EncounterMap }) {
  const [inspectedCell, setInspectedCell] = useState({ x: 0, y: 0 });
  const [cellSizeIndex, setCellSizeIndex] = useState(1);
  const cellSize = CELL_SIZES[cellSizeIndex];

  const inspectedTerrain = map.grid[inspectedCell.y]?.[inspectedCell.x] ?? null;
  const notableCells = useMemo(
    () => map.grid.flatMap((row, y) => row
      .map((cell, x) => ({ cell, x, y }))
      .filter(({ cell }) => Boolean(cell.label))).slice(0, 8),
    [map],
  );

  function moveInspection(event: ReactKeyboardEvent<HTMLButtonElement>, x: number, y: number) {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;

    event.preventDefault();
    const next = {
      x: Math.max(0, Math.min(map.width - 1, x + move[0])),
      y: Math.max(0, Math.min(map.height - 1, y + move[1])),
    };
    setInspectedCell(next);
    window.requestAnimationFrame(() => {
      document.getElementById(`map-cell-${next.x}-${next.y}`)?.focus();
    });
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="micro-label">Generated battlefield</p>
          <h3 className="mt-1 text-xl">{map.name}</h3>
          <span className="text-sm text-[var(--text-2)]">
            {map.width} × {map.height} · {map.environment}
          </span>
        </div>
        <div className="segmented-control print:hidden" role="group" aria-label="Map zoom">
          <button
            type="button"
            className="segmented-option inline-flex items-center"
            aria-label="Zoom map out"
            disabled={cellSizeIndex === 0}
            onClick={() => setCellSizeIndex((value) => Math.max(0, value - 1))}
          >
            <Minus size={15} aria-hidden="true" />
          </button>
          <span className="flex min-w-14 items-center justify-center text-xs text-[var(--text-2)]">
            {Math.round((cellSize / 24) * 100)}%
          </span>
          <button
            type="button"
            className="segmented-option inline-flex items-center"
            aria-label="Zoom map in"
            disabled={cellSizeIndex === CELL_SIZES.length - 1}
            onClick={() => setCellSizeIndex((value) => Math.min(CELL_SIZES.length - 1, value + 1))}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <p id="map-grid-help" className="mb-2 text-xs text-[var(--text-3)] print:hidden">
        Select a cell for details. Use the arrow keys to inspect neighboring terrain.
      </p>
      <div className="surface-inset max-h-[70vh] overflow-auto p-3">
        <div
          role="grid"
          aria-label={`Battle map: ${map.name}, ${map.width} by ${map.height} cells, ${map.environment}`}
          aria-describedby="map-grid-help"
          className="inline-grid overflow-hidden rounded-lg border border-[var(--line-strong)] bg-[var(--steel-950)]"
          style={{ gridTemplateColumns: `repeat(${map.width}, ${cellSize}px)` }}
        >
          {map.grid.map((row, y) => (
            <div key={y} role="row" className="contents">
              {row.map((cell, x) => {
                const info = TERRAIN_INFO[cell.terrain];
                const isInspected = inspectedCell.x === x && inspectedCell.y === y;
                return (
                  <button
                    id={`map-cell-${x}-${y}`}
                    key={`${x}-${y}`}
                    type="button"
                    role="gridcell"
                    aria-selected={isInspected}
                    aria-label={`Column ${x + 1}, row ${y + 1}: ${cell.label ?? info.label}`}
                    tabIndex={isInspected ? 0 : -1}
                    className="map-cell select-none text-[var(--text-1)]"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: `${info.color}55`,
                      fontSize: Math.max(11, cellSize * 0.56),
                    }}
                    title={cell.label ?? info.label}
                    onClick={() => setInspectedCell({ x, y })}
                    onFocus={() => setInspectedCell({ x, y })}
                    onMouseEnter={() => setInspectedCell({ x, y })}
                    onKeyDown={(event) => moveInspection(event, x, y)}
                  >
                    {info.symbol}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Selected-cell info */}
      <div className="mt-3 min-h-6 text-sm text-[var(--text-2)] print:hidden" aria-live="polite">
        {inspectedTerrain && (
          <span>
            Cell {inspectedCell.x + 1}, {inspectedCell.y + 1} · {TERRAIN_INFO[inspectedTerrain.terrain].label}
            {inspectedTerrain.label ? ` · ${inspectedTerrain.label}` : ''}
          </span>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-[var(--text-2)]">
        {Object.entries(TERRAIN_INFO)
          .filter(([type]) => {
            // Only show terrain types present in this map
            return map.grid.some(row => row.some(cell => cell.terrain === type));
          })
          .map(([type, info]) => (
            <span key={type} className="flex items-center gap-1">
              <span style={{ color: info.color }}>{info.symbol}</span> {info.label}
            </span>
          ))}
      </div>

      {notableCells.length > 0 && (
        <div className="mt-4 border-t border-[var(--line-subtle)] pt-3 text-xs text-[var(--text-3)]">
          <span className="micro-label mr-2">Notable cells</span>
          {notableCells.map(({ cell, x, y }, index) => (
            <span key={`${x}-${y}`}>
              {index > 0 && ' · '}
              {cell.label} ({x + 1}, {y + 1})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
