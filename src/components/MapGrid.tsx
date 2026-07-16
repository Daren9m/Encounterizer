'use client';

import { EncounterMap } from '@/lib/types';
import { TERRAIN_INFO } from '@/lib/map-generator';
import { useState } from 'react';

export default function MapGrid({ map }: { map: EncounterMap }) {
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);

  const hoveredTerrain = hoveredCell
    ? map.grid[hoveredCell.y]?.[hoveredCell.x]
    : null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg">{map.name}</h3>
        <span className="text-sm text-[var(--text-2)]">
          {map.width} × {map.height} — {map.environment}
        </span>
      </div>

      {/* Grid */}
      <div
        role="img"
        aria-label={`Battle map: ${map.name}, ${map.width} by ${map.height} cells, ${map.environment}`}
        className="inline-grid border border-[var(--steel-800)] rounded overflow-hidden"
        style={{
          gridTemplateColumns: `repeat(${map.width}, 24px)`,
        }}
      >
        {map.grid.map((row, y) =>
          row.map((cell, x) => {
            const info = TERRAIN_INFO[cell.terrain];
            return (
              <div
                key={`${x}-${y}`}
                className="map-cell select-none"
                style={{ backgroundColor: info.color + '30', color: info.color }}
                title={cell.label ?? info.label}
                onMouseEnter={() => setHoveredCell({ x, y })}
                onMouseLeave={() => setHoveredCell(null)}
              >
                {info.symbol}
              </div>
            );
          })
        )}
      </div>

      {/* Hover info */}
      <div className="mt-2 h-6 text-sm text-[var(--text-2)] print:hidden">
        {hoveredTerrain && (
          <span>
            ({hoveredCell!.x}, {hoveredCell!.y}) — {TERRAIN_INFO[hoveredTerrain.terrain].label}
            {hoveredTerrain.label ? `: ${hoveredTerrain.label}` : ''}
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
    </div>
  );
}
