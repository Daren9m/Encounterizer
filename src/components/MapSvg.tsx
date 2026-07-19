'use client';

import { useMemo, useState } from 'react';
import type { EncounterMap, MapToken } from '@/lib/types';
import { TERRAIN_INFO } from '@/lib/map-generator';
import { buildMapScene, CELL, RULER_GUTTER } from '@/lib/map-render/scene';
import { DARK_PALETTE, LIGHT_PALETTE } from '@/lib/map-render/palettes';
import { sceneToSvgString } from '@/lib/map-render/svg';

// Clean-tactical battle map renderer. The svg is built as a string
// (single source shared with PNG export and print) and injected; one
// pointer handler on the wrapper replaces per-cell listeners.
//
// Injection safety: sceneToSvgString emits only our own markup —
// numbers, palette hex constants, and esc()-escaped text placed in
// text-node positions (never attributes). Token names/labels are the
// only user-influenced strings and are covered by an escaping test in
// map-render.test.ts. Keep that invariant if you extend the builder.

export default function MapSvg({ map, tokens }: { map: EncounterMap; tokens?: MapToken[] }) {
  const [hovered, setHovered] = useState<{ x: number; y: number } | null>(null);

  const scene = useMemo(() => buildMapScene(map, tokens ?? []), [map, tokens]);
  const screenSvg = useMemo(() => sceneToSvgString(scene, DARK_PALETTE), [scene]);
  const printSvg = useMemo(() => sceneToSvgString(scene, LIGHT_PALETTE), [scene]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const svgEl = e.currentTarget.firstElementChild;
    if (!svgEl) return;
    const rect = svgEl.getBoundingClientRect();
    const scale = rect.width / scene.widthPx;
    const x = Math.floor(((e.clientX - rect.left) / scale - RULER_GUTTER) / CELL);
    const y = Math.floor(((e.clientY - rect.top) / scale - RULER_GUTTER) / CELL);
    if (x >= 0 && y >= 0 && x < map.width && y < map.height) {
      setHovered(prev => (prev && prev.x === x && prev.y === y ? prev : { x, y }));
    } else {
      setHovered(null);
    }
  };

  const hoveredCell = hovered ? map.grid[hovered.y]?.[hovered.x] : null;
  const hoveredToken = hovered
    ? scene.tokens.find(t =>
        hovered.x >= t.x && hovered.x < t.x + t.sizeCells &&
        hovered.y >= t.y && hovered.y < t.y + t.sizeCells)
    : null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg">{map.name}</h3>
        <span className="text-sm text-[var(--text-2)]">
          {map.width} × {map.height} — {map.environment}
        </span>
      </div>

      <div
        role="img"
        aria-label={`Battle map: ${map.name}, ${map.width} by ${map.height} cells, ${map.environment}`}
        className="print:hidden overflow-x-auto"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHovered(null)}
        dangerouslySetInnerHTML={{ __html: screenSvg }}
      />
      {/* Light-palette twin so printed maps spend ink on walls, not background. */}
      <div
        aria-hidden
        className="hidden print:block"
        dangerouslySetInnerHTML={{ __html: printSvg }}
      />

      <div className="mt-2 h-6 text-sm text-[var(--text-2)] print:hidden">
        {hovered && hoveredCell && (
          <span>
            {scene.rulers.cols[hovered.x]}{hovered.y + 1} — {TERRAIN_INFO[hoveredCell.terrain].label}
            {hoveredCell.label ? `: ${hoveredCell.label}` : ''}
            {hoveredToken ? ` — ${hoveredToken.name}` : ''}
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
    </div>
  );
}
