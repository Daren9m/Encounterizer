'use client';

import { useState, useCallback } from 'react';
import { generateMap, TERRAIN_INFO } from '@/lib/map-generator';
import { usePersistentState } from '@/lib/use-persistent-state';
import type { EncounterMap, Environment } from '@/lib/types';
import MapGrid from '@/components/MapGrid';

const ENVIRONMENTS: Environment[] = [
  'Arctic', 'Coastal', 'Desert', 'Forest', 'Grassland', 'Hill',
  'Mountain', 'Swamp', 'Underdark', 'Underwater', 'Urban', 'Planar',
];

const isMapEnvironment = (v: unknown): v is Environment =>
  typeof v === 'string' && (ENVIRONMENTS as string[]).includes(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isMapArray = (v: unknown): v is EncounterMap[] => Array.isArray(v);

const ENV_DESCRIPTIONS: Partial<Record<Environment, string>> = {
  Underdark: 'Cellular automata caverns with organic tunnels',
  Urban: 'BSP dungeon rooms connected by corridors',
  Forest: 'Open terrain with vegetation, streams, and bridges',
  Mountain: 'Caves or elevated passes with chasms and rubble',
  Swamp: 'Waterlogged terrain with difficult ground',
  Desert: 'Open sand with dunes and elevated terrain',
  Arctic: 'Icy terrain with frozen surfaces',
  Coastal: 'Shoreline with water features',
  Grassland: 'Open fields with scattered vegetation',
  Hill: 'Rolling terrain with elevation changes',
  Underwater: 'Submerged battlefield with water and currents',
  Planar: 'Otherworldly caverns and rifts',
};

export default function MapsPage() {
  const [environment, setEnvironment] = usePersistentState<Environment>('mapEnvironment', 'Underdark', isMapEnvironment);
  const [width, setWidth] = usePersistentState<number>('mapWidth', 24, isNumber);
  const [height, setHeight] = usePersistentState<number>('mapHeight', 18, isNumber);
  const [map, setMap] = useState<EncounterMap | null>(null);
  const [history, setHistory] = usePersistentState<EncounterMap[]>('mapHistory', [], isMapArray);

  const handleGenerate = useCallback(() => {
    const result = generateMap({
      environment,
      width,
      height,
      seed: Date.now(),
    });
    setMap(result);
    setHistory(prev => [result, ...prev.slice(0, 9)]);
  }, [environment, width, height, setHistory]);

  const handleExport = useCallback(() => {
    if (!map) return;
    const json = JSON.stringify(map, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${map.name.toLowerCase().replace(/\s+/g, '-')}-${map.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [map]);

  const handleExportText = useCallback(() => {
    if (!map) return;
    const lines = map.grid.map(row =>
      row.map(cell => TERRAIN_INFO[cell.terrain].symbol).join('')
    );
    const text = `${map.name}\n${map.width}×${map.height} — ${map.environment}\n\n${lines.join('\n')}`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${map.name.toLowerCase().replace(/\s+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [map]);

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold text-[var(--gold)] mb-6">Map Generator</h1>

      <div className="card mb-6 print:hidden">
        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label htmlFor="map-environment" className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">
              Environment
            </label>
            <select
              id="map-environment"
              value={environment}
              onChange={e => setEnvironment(e.target.value as Environment)}
              className="w-full"
            >
              {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <p className="mt-1 text-xs text-[var(--parchment-dark)] opacity-60">
              {ENV_DESCRIPTIONS[environment]}
            </p>
          </div>
          <div>
            <label htmlFor="map-width" className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">
              Width (cells)
            </label>
            <input
              id="map-width"
              type="number"
              min={10}
              max={40}
              value={width}
              onChange={e => setWidth(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex gap-1 mt-1">
              {[16, 24, 32].map(w => (
                <button key={w} type="button" onClick={() => setWidth(w)}
                  aria-pressed={width === w}
                  className={`text-xs px-2 py-0.5 rounded ${width === w ? 'bg-[var(--gold)] text-[var(--dungeon-dark)]' : 'bg-[var(--dungeon-accent)] text-[var(--parchment-dark)]'}`}
                >{w}</button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="map-height" className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">
              Height (cells)
            </label>
            <input
              id="map-height"
              type="number"
              min={10}
              max={30}
              value={height}
              onChange={e => setHeight(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex gap-1 mt-1">
              {[12, 18, 24].map(h => (
                <button key={h} type="button" onClick={() => setHeight(h)}
                  aria-pressed={height === h}
                  className={`text-xs px-2 py-0.5 rounded ${height === h ? 'bg-[var(--gold)] text-[var(--dungeon-dark)]' : 'bg-[var(--dungeon-accent)] text-[var(--parchment-dark)]'}`}
                >{h}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={handleGenerate} className="btn-gold text-lg">
            Generate Map
          </button>
          {map && (
            <>
              <button type="button" onClick={handleGenerate} className="btn-secondary">
                Regenerate
              </button>
              <button type="button" onClick={handleExport} className="btn-secondary">
                Export JSON
              </button>
              <button type="button" onClick={handleExportText} className="btn-secondary">
                Export Text
              </button>
            </>
          )}
        </div>
      </div>

      {map && (
        <div className="card overflow-x-auto animate-fade-in">
          <MapGrid map={map} />
        </div>
      )}

      {/* Map History (persists across visits) */}
      {history.length > 0 && !(history.length === 1 && map?.id === history[0].id) && (
        <div className="mt-6 print:hidden">
          <h2 className="text-lg font-bold text-[var(--gold)] mb-3">Recent Maps</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {history.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMap(m)}
                className={`card text-left text-sm ${map?.id === m.id ? 'border-[var(--gold)]' : ''}`}
              >
                <div className="font-bold text-[var(--parchment)]">{m.name}</div>
                <div className="text-xs text-[var(--parchment-dark)]">
                  {m.width}x{m.height} — {m.environment}
                </div>
                {i === 0 && (
                  <span className="text-[10px] text-[var(--gold)]">Latest</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
