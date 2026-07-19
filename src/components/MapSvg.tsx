'use client';

import { useMemo, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { EncounterMap, MapToken } from '@/lib/types';
import { TERRAIN_INFO } from '@/lib/map-generator';
import { buildMapScene, CELL, RULER_GUTTER } from '@/lib/map-render/scene';
import { DARK_PALETTE, LIGHT_PALETTE } from '@/lib/map-render/palettes';
import { sceneToSvgString } from '@/lib/map-render/svg';

// Clean-tactical battle map renderer. The svg is built as a string
// (single source shared with PNG export and print) and injected; one
// pointer handler on the wrapper replaces per-cell listeners, and an
// absolutely-positioned outline marks the inspected cell.
//
// Injection safety: sceneToSvgString emits only our own markup —
// numbers, palette hex constants, and esc()-escaped text placed in
// text-node positions (never attributes). Token names/labels are the
// only user-influenced strings and are covered by an escaping test in
// map-render.test.ts. Keep that invariant if you extend the builder.

const ZOOM_LEVELS = [0.75, 1, 1.25] as const;

export default function MapSvg({ map, tokens }: { map: EncounterMap; tokens?: MapToken[] }) {
  const [inspected, setInspected] = useState({ x: 0, y: 0 });
  const [zoomIndex, setZoomIndex] = useState(1);
  const zoom = ZOOM_LEVELS[zoomIndex];

  const scene = useMemo(() => buildMapScene(map, tokens ?? []), [map, tokens]);
  const screenSvg = useMemo(() => sceneToSvgString(scene, DARK_PALETTE), [scene]);
  const printSvg = useMemo(() => sceneToSvgString(scene, LIGHT_PALETTE), [scene]);

  const notableCells = useMemo(
    () => map.grid.flatMap((row, y) => row
      .map((cell, x) => ({ cell, x, y }))
      .filter(({ cell }) => Boolean(cell.label))).slice(0, 8),
    [map],
  );

  const moveInspection = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setInspected(prev => ({
      x: Math.max(0, Math.min(map.width - 1, prev.x + move[0])),
      y: Math.max(0, Math.min(map.height - 1, prev.y + move[1])),
    }));
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const svgEl = e.currentTarget.querySelector('svg');
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const scale = rect.width / scene.widthPx;
    const x = Math.floor(((e.clientX - rect.left) / scale - RULER_GUTTER) / CELL);
    const y = Math.floor(((e.clientY - rect.top) / scale - RULER_GUTTER) / CELL);
    if (x >= 0 && y >= 0 && x < map.width && y < map.height) {
      setInspected(prev => (prev.x === x && prev.y === y ? prev : { x, y }));
    }
  };

  const inspectedCell = map.grid[inspected.y]?.[inspected.x] ?? null;
  const inspectedToken = scene.tokens.find(t =>
    inspected.x >= t.x && inspected.x < t.x + t.sizeCells &&
    inspected.y >= t.y && inspected.y < t.y + t.sizeCells);

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
            disabled={zoomIndex === 0}
            onClick={() => setZoomIndex(value => Math.max(0, value - 1))}
          >
            <Minus size={15} aria-hidden="true" />
          </button>
          <span className="flex min-w-14 items-center justify-center text-xs text-[var(--text-2)]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="segmented-option inline-flex items-center"
            aria-label="Zoom map in"
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            onClick={() => setZoomIndex(value => Math.min(ZOOM_LEVELS.length - 1, value + 1))}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <p id="map-svg-help" className="mb-2 text-xs text-[var(--text-3)] print:hidden">
        Point at a cell for details. Focus the map and use the arrow keys to inspect neighboring terrain.
      </p>
      <div className="surface-inset max-h-[70vh] overflow-auto p-3 print:hidden">
        <div
          role="img"
          aria-label={`Battle map: ${map.name}, ${map.width} by ${map.height} cells, ${map.environment}`}
          aria-describedby="map-svg-help"
          tabIndex={0}
          className="relative inline-block outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bronze)] [&_svg]:h-auto [&_svg]:w-full"
          style={{ width: scene.widthPx * zoom }}
          onMouseMove={handleMouseMove}
          onKeyDown={moveInspection}
          dangerouslySetInnerHTML={{ __html: screenSvg }}
        />
      </div>
      {/* Light-palette twin so printed maps spend ink on walls, not background. */}
      <div
        aria-hidden
        className="hidden print:block"
        dangerouslySetInnerHTML={{ __html: printSvg }}
      />

      <div className="mt-3 min-h-6 text-sm text-[var(--text-2)] print:hidden" aria-live="polite">
        {inspectedCell && (
          <span>
            {scene.rulers.cols[inspected.x]}{inspected.y + 1} · {TERRAIN_INFO[inspectedCell.terrain].label}
            {inspectedCell.label ? ` · ${inspectedCell.label}` : ''}
            {inspectedToken ? ` · ${inspectedToken.name}` : ''}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-[var(--text-2)]">
        {Object.entries(TERRAIN_INFO)
          .filter(([type]) =>
            map.grid.some(row => row.some(cell => cell.terrain === type)))
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
              <button
                type="button"
                className="hover:text-[var(--bronze)] hover:underline"
                onClick={() => setInspected({ x, y })}
              >
                {cell.label} ({scene.rulers.cols[x]}{y + 1})
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
