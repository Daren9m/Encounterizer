'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  generateMap,
  TERRAIN_INFO,
  type MapFeatureDensity,
  type MapTerrainVariety,
} from '@/lib/map-generator';
import { buildMapScene } from '@/lib/map-render/scene';
import { LIGHT_PALETTE } from '@/lib/map-render/palettes';
import { sceneToSvgString } from '@/lib/map-render/svg';
import { randomSeed } from '@/lib/random';
import { usePersistentState } from '@/lib/use-persistent-state';
import type { EncounterMap, Environment } from '@/lib/types';
import MapSvg from '@/components/MapSvg';
import PrintButton from '@/components/PrintButton';
import ResetGeneratorButton from '@/components/ResetGeneratorButton';
import { downloadBlob, rasterizeSvg } from '@/components/map-export';

const ENVIRONMENTS: Environment[] = [
  'Arctic', 'Coastal', 'Desert', 'Forest', 'Grassland', 'Hill',
  'Mountain', 'Swamp', 'Underdark', 'Underwater', 'Urban', 'Planar',
];

const isMapEnvironment = (v: unknown): v is Environment =>
  typeof v === 'string' && (ENVIRONMENTS as string[]).includes(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
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

// ─── Share link ───────────────────────────────────────────────────
// `?seed&env&mw&mh&md&mv[&mr]` reproduces a map exactly (same param
// names the encounter builder uses for its embedded map). This URL
// contract is permanent.

function mapShareParams(m: EncounterMap): URLSearchParams {
  const params = new URLSearchParams();
  params.set('seed', String(m.seed ?? 0));
  params.set('env', m.environment);
  params.set('mw', String(m.width));
  params.set('mh', String(m.height));
  if (m.genOptions) {
    params.set('md', m.genOptions.featureDensity);
    params.set('mv', m.genOptions.terrainVariety);
    if (m.genOptions.roomCount) params.set('mr', String(m.genOptions.roomCount));
  }
  return params;
}

function buildShareUrl(m: EncounterMap): string {
  return `${window.location.origin}/maps?${mapShareParams(m).toString()}`;
}

export default function MapsPage() {
  // useSearchParams requires a Suspense boundary under static prerendering.
  return (
    <Suspense fallback={null}>
      <MapsBuilder />
    </Suspense>
  );
}

function MapsBuilder() {
  const [environment, setEnvironment] = usePersistentState<Environment>('mapEnvironment', 'Underdark', isMapEnvironment);
  const [width, setWidth] = usePersistentState<number>('mapWidth', 24, isNumber);
  const [height, setHeight] = usePersistentState<number>('mapHeight', 18, isNumber);
  const [featureDensity, setFeatureDensity] = usePersistentState<MapFeatureDensity>(
    'mapFeatureDensity', 'Balanced', isFeatureDensity,
  );
  const [terrainVariety, setTerrainVariety] = usePersistentState<MapTerrainVariety>(
    'mapTerrainVariety', 'Varied', isTerrainVariety,
  );
  const [roomCount, setRoomCount] = usePersistentState<number>('mapRoomCount', 0, isNumber);
  const [map, setMap] = useState<EncounterMap | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [history, setHistory] = usePersistentState<EncounterMap[]>('mapHistory', [], isMapArray);

  const runGenerate = useCallback((opts: {
    environment: Environment; width: number; height: number;
    featureDensity: MapFeatureDensity; terrainVariety: MapTerrainVariety;
    roomCount: number; seed: number;
  }) => {
    const result = generateMap({
      environment: opts.environment,
      width: opts.width,
      height: opts.height,
      featureDensity: opts.featureDensity,
      terrainVariety: opts.terrainVariety,
      ...(opts.roomCount > 0 ? { roomCount: opts.roomCount } : {}),
      seed: opts.seed,
    });
    setMap(result);
    setHistory(prev => [result, ...prev.filter(m => m.id !== result.id).slice(0, 9)]);
    window.history.replaceState(null, '', `?${mapShareParams(result).toString()}`);
  }, [setHistory]);

  // One-shot hydration from a shared link (?seed=...). Persisted lever
  // state above is declared first so a link's params win over
  // remembered preferences.
  const searchParams = useSearchParams();
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const clampInt = (raw: string | null, lo: number, hi: number): number | null => {
      if (raw === null) return null;
      const n = Number(raw);
      return Number.isInteger(n) ? Math.max(lo, Math.min(hi, n)) : null;
    };
    const seedParam = clampInt(searchParams.get('seed'), 0, 0x7fffffff);
    if (seedParam === null) return;
    const envParam = searchParams.get('env');
    const env = isMapEnvironment(envParam) ? envParam : 'Underdark';
    const mw = clampInt(searchParams.get('mw'), 10, 40) ?? 24;
    const mh = clampInt(searchParams.get('mh'), 10, 30) ?? 18;
    const mdParam = searchParams.get('md');
    const md = isFeatureDensity(mdParam) ? mdParam : 'Balanced';
    const mvParam = searchParams.get('mv');
    const mv = isTerrainVariety(mvParam) ? mvParam : 'Varied';
    const mr = clampInt(searchParams.get('mr'), 3, 14) ?? 0;
    setEnvironment(env);
    setWidth(mw);
    setHeight(mh);
    setFeatureDensity(md);
    setTerrainVariety(mv);
    setRoomCount(mr);
    runGenerate({
      environment: env, width: mw, height: mh,
      featureDensity: md, terrainVariety: mv, roomCount: mr, seed: seedParam,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = useCallback(() => {
    runGenerate({
      environment, width, height, featureDensity, terrainVariety, roomCount,
      seed: randomSeed(),
    });
  }, [environment, width, height, featureDensity, terrainVariety, roomCount, runGenerate]);

  const handleReset = useCallback(() => {
    setEnvironment('Underdark');
    setWidth(24);
    setHeight(18);
    setFeatureDensity('Balanced');
    setTerrainVariety('Varied');
    setRoomCount(0);
    setMap(null);
    window.history.replaceState(null, '', window.location.pathname);
  }, [setEnvironment, setFeatureDensity, setHeight, setRoomCount, setTerrainVariety, setWidth]);

  const handleShare = useCallback(() => {
    if (!map) return;
    navigator.clipboard.writeText(buildShareUrl(map)).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [map]);

  const handleExportPng = useCallback(async () => {
    if (!map) return;
    const svg = sceneToSvgString(buildMapScene(map), LIGHT_PALETTE);
    const blob = await rasterizeSvg(svg, map.width * 70);
    downloadBlob(blob, `${map.name.toLowerCase().replace(/\s+/g, '-')}-${map.seed ?? map.id}.png`);
  }, [map]);

  const handleExport = useCallback(() => {
    if (!map) return;
    const json = JSON.stringify(map, null, 2);
    downloadBlob(new Blob([json], { type: 'application/json' }), `${map.name.toLowerCase().replace(/\s+/g, '-')}-${map.id}.json`);
  }, [map]);

  const handleExportText = useCallback(() => {
    if (!map) return;
    const lines = map.grid.map(row =>
      row.map(cell => TERRAIN_INFO[cell.terrain].symbol).join('')
    );
    const text = `${map.name}\n${map.width}×${map.height} — ${map.environment}\n\n${lines.join('\n')}`;
    downloadBlob(new Blob([text], { type: 'text/plain' }), `${map.name.toLowerCase().replace(/\s+/g, '-')}.txt`);
  }, [map]);

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl mb-6">Map Generator</h1>

      <div className="card mb-6 print:hidden">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-4">
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
              onChange={e => setWidth(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex gap-1 mt-1">
              {[16, 24, 32].map(w => (
                <button key={w} type="button" onClick={() => setWidth(w)}
                  aria-pressed={width === w}
                  className={`text-xs px-2 py-0.5 rounded ${width === w ? 'bg-[var(--bronze)] text-[#1d1105]' : 'bg-[var(--steel-800)] text-[var(--text-2)]'}`}
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
              onChange={e => setHeight(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex gap-1 mt-1">
              {[12, 18, 24].map(h => (
                <button key={h} type="button" onClick={() => setHeight(h)}
                  aria-pressed={height === h}
                  className={`text-xs px-2 py-0.5 rounded ${height === h ? 'bg-[var(--bronze)] text-[#1d1105]' : 'bg-[var(--steel-800)] text-[var(--text-2)]'}`}
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
          <div>
            <label htmlFor="map-rooms" className="micro-label block mb-1">
              Rooms
            </label>
            <select
              id="map-rooms"
              value={roomCount}
              onChange={e => setRoomCount(Number(e.target.value))}
              className="w-full"
            >
              <option value={0}>Auto</option>
              {[4, 5, 6, 7, 8, 9, 10, 11, 12].map(count => (
                <option key={count} value={count}>{count}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--text-3)]">
              Room target for dungeon layouts (Urban).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={handleGenerate} className="btn-primary text-lg">
            Generate Map
          </button>
          <ResetGeneratorButton onReset={handleReset} label="Reset Generator" />
          {map && (
            <>
              <button type="button" onClick={handleGenerate} className="btn-secondary">
                Regenerate
              </button>
              <button type="button" onClick={handleShare} className="btn-secondary">
                {linkCopied ? 'Copied ✓' : 'Share Link'}
              </button>
              <PrintButton label="Print Map" />
              <button type="button" onClick={handleExportPng} className="btn-secondary">
                Export PNG
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
          <MapSvg map={map} />
          {map.seed !== undefined && (
            <div className="mt-3 flex items-center gap-2 print:hidden">
              <span className="text-xs px-2 py-1 rounded-full bg-[var(--steel-800)] text-[var(--text-2)]">
                Seed: {map.seed}
              </span>
              <button
                type="button"
                onClick={handleGenerate}
                className="text-xs text-[var(--bronze)] hover:underline"
              >
                Reroll
              </button>
            </div>
          )}
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
                className={`card text-left text-sm ${map?.id === m.id ? 'border-[var(--bronze)]' : ''}`}
              >
                <div className="font-bold text-[var(--text-1)]">{m.name}</div>
                <div className="text-xs text-[var(--text-2)]">
                  {m.width}x{m.height} — {m.environment}
                  {m.seed !== undefined && <span> — Seed {m.seed}</span>}
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
