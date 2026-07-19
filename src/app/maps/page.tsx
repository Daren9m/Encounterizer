'use client';

import { useState, useCallback } from 'react';
import {
  generateMap,
  TERRAIN_INFO,
  type MapFeatureDensity,
  type MapTerrainVariety,
} from '@/lib/map-generator';
import { usePersistentState } from '@/lib/use-persistent-state';
import type { EncounterMap, Environment } from '@/lib/types';
import MapGrid from '@/components/MapGrid';
import ResetGeneratorButton from '@/components/ResetGeneratorButton';
import ToolPageHeader from '@/components/ToolPageHeader';

const ENVIRONMENTS: Environment[] = [
  'Arctic', 'Coastal', 'Desert', 'Forest', 'Grassland', 'Hill',
  'Mountain', 'Swamp', 'Underdark', 'Underwater', 'Urban', 'Planar',
];

const isMapEnvironment = (v: unknown): v is Environment =>
  typeof v === 'string' && (ENVIRONMENTS as string[]).includes(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isMapWidth = (v: unknown): v is number => isNumber(v) && v >= 10 && v <= 40;
const isMapHeight = (v: unknown): v is number => isNumber(v) && v >= 10 && v <= 30;
const isMapArray = (v: unknown): v is EncounterMap[] => Array.isArray(v);
const isFeatureDensity = (v: unknown): v is MapFeatureDensity =>
  v === 'Sparse' || v === 'Balanced' || v === 'Dense';
const isTerrainVariety = (v: unknown): v is MapTerrainVariety =>
  v === 'Focused' || v === 'Varied' || v === 'Wild';

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

function clampDimension(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export default function MapsPage() {
  const [environment, setEnvironment] = usePersistentState<Environment>('mapEnvironment', 'Underdark', isMapEnvironment);
  const [width, setWidth] = usePersistentState<number>('mapWidth', 24, isMapWidth);
  const [height, setHeight] = usePersistentState<number>('mapHeight', 18, isMapHeight);
  const [featureDensity, setFeatureDensity] = usePersistentState<MapFeatureDensity>(
    'mapFeatureDensity', 'Balanced', isFeatureDensity,
  );
  const [terrainVariety, setTerrainVariety] = usePersistentState<MapTerrainVariety>(
    'mapTerrainVariety', 'Varied', isTerrainVariety,
  );
  const [map, setMap] = useState<EncounterMap | null>(null);
  const [history, setHistory] = usePersistentState<EncounterMap[]>('mapHistory', [], isMapArray);

  const handleGenerate = useCallback(() => {
    const safeWidth = clampDimension(width, 10, 40, 24);
    const safeHeight = clampDimension(height, 10, 30, 18);
    if (safeWidth !== width) setWidth(safeWidth);
    if (safeHeight !== height) setHeight(safeHeight);
    const result = generateMap({
      environment,
      width: safeWidth,
      height: safeHeight,
      featureDensity,
      terrainVariety,
      seed: Date.now(),
    });
    setMap(result);
    setHistory(prev => [result, ...prev.slice(0, 9)]);
  }, [environment, width, height, featureDensity, terrainVariety, setHeight, setHistory, setWidth]);

  const handleReset = useCallback(() => {
    setEnvironment('Underdark');
    setWidth(24);
    setHeight(18);
    setFeatureDensity('Balanced');
    setTerrainVariety('Varied');
    setMap(null);
  }, [setEnvironment, setFeatureDensity, setHeight, setTerrainVariety, setWidth]);

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
      <ToolPageHeader
        path="/maps"
        description="Generate a readable, terrain-aware battle map in seconds, then inspect, print, or export it for the table."
      />
      <p className="sr-only" aria-live="polite">
        {map ? `${map.name} generated. ${map.width} by ${map.height} cells.` : ''}
      </p>

      <div className="card panel-accent mb-6 print:hidden">
        <div className="mb-5">
          <p className="micro-label">Map setup</p>
          <h2 className="mt-1 text-xl">Frame the battlefield</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
          <div>
            <label htmlFor="map-environment" className="micro-label block mb-1">
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
            <p className="mt-1 text-xs text-[var(--text-3)]">
              {ENV_DESCRIPTIONS[environment]}
            </p>
          </div>
          <div>
            <label htmlFor="map-width" className="micro-label block mb-1">
              Width (cells)
            </label>
            <input
              id="map-width"
              type="number"
              min={10}
              max={40}
              value={width}
              onChange={e => setWidth(clampDimension(Number(e.target.value), 10, 40, 24))}
              className="w-full"
            />
            <div className="segmented-control mt-2" role="group" aria-label="Common map widths">
              {[16, 24, 32].map(w => (
                <button key={w} type="button" onClick={() => setWidth(w)}
                  aria-pressed={width === w}
                  className="segmented-option"
                >{w}</button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="map-height" className="micro-label block mb-1">
              Height (cells)
            </label>
            <input
              id="map-height"
              type="number"
              min={10}
              max={30}
              value={height}
              onChange={e => setHeight(clampDimension(Number(e.target.value), 10, 30, 18))}
              className="w-full"
            />
            <div className="segmented-control mt-2" role="group" aria-label="Common map heights">
              {[12, 18, 24].map(h => (
                <button key={h} type="button" onClick={() => setHeight(h)}
                  aria-pressed={height === h}
                  className="segmented-option"
                >{h}</button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="map-density" className="micro-label block mb-1">
              Object Density
            </label>
            <select
              id="map-density"
              value={featureDensity}
              onChange={e => setFeatureDensity(e.target.value as MapFeatureDensity)}
              className="w-full"
            >
              {(['Sparse', 'Balanced', 'Dense'] as MapFeatureDensity[]).map(value => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--text-3)]">
              Controls cover, obstacles, traps, and features.
            </p>
          </div>
          <div>
            <label htmlFor="map-variety" className="micro-label block mb-1">
              Terrain Mix
            </label>
            <select
              id="map-variety"
              value={terrainVariety}
              onChange={e => setTerrainVariety(e.target.value as MapTerrainVariety)}
              className="w-full"
            >
              {(['Focused', 'Varied', 'Wild'] as MapTerrainVariety[]).map(value => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--text-3)]">
              Controls how many terrain types appear.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line-subtle)] pt-4">
          <button type="button" onClick={handleGenerate} className="btn-primary text-lg">
            {map ? 'Generate a New Map' : 'Generate Map'}
          </button>
          <ResetGeneratorButton onReset={handleReset} label="Reset Generator" />
          {map && (
            <>
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
        <div className="card animate-fade-in">
          <MapGrid map={map} />
        </div>
      )}

      {!map && (
        <div className="empty-state print:hidden">
          <p className="micro-label">Battlefield preview</p>
          <h2 className="mt-2 text-xl">Your next map starts with five choices</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--text-3)]">
            Choose an environment and scale above. Terrain, cover, hazards, and routes are generated locally in your browser.
          </p>
        </div>
      )}

      {/* Map History (persists across visits) */}
      {history.length > 0 && !(history.length === 1 && map?.id === history[0].id) && (
        <div className="mt-6 print:hidden">
          <h2 className="text-lg mb-3">Recent Maps</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {history.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMap(m)}
                aria-pressed={map?.id === m.id}
                className={`card text-left text-sm ${map?.id === m.id ? 'border-[var(--bronze)]' : ''}`}
              >
                <div className="font-bold text-[var(--text-1)]">{m.name}</div>
                <div className="text-xs text-[var(--text-2)]">
                  {m.width}x{m.height} — {m.environment}
                </div>
                {i === 0 && (
                  <span className="text-[10px] text-[var(--bronze)]">Latest</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
