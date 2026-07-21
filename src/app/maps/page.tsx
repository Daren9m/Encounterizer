'use client';

import Link from 'next/link';
import { SlidersHorizontal, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePartyLibrary } from '@/app/hooks/usePartyLibrary';
import { useToolPartySetup } from '@/app/hooks/useToolPartySetup';
import {
  generateMap,
  isMapLayout,
  isMapScale,
  MAP_LAYOUT_OPTIONS,
  MAP_SCALE_OPTIONS,
  TERRAIN_INFO,
  type MapFeatureDensity,
  type MapTerrainVariety,
} from '@/lib/map-generator';
import { buildMapScene } from '@/lib/map-render/scene';
import { LIGHT_PALETTE } from '@/lib/map-render/palettes';
import { sceneToSvgString } from '@/lib/map-render/svg';
import { randomSeed } from '@/lib/random';
import { usePersistentState } from '@/lib/use-persistent-state';
import type {
  EncounterMap, Environment, MapLayout, MapScale, MapToken,
} from '@/lib/types';
import { mapToMarkdown } from '@/lib/map-export-text';
import {
  historyEntryPartyCount,
  historyEntryPartyTokens,
  isMapHistoryArray,
  resolveHistoryEntry,
  toHistoryEntry,
  type MapHistoryEntry,
} from '@/lib/map-history';
import { getActiveParty } from '@/lib/party';
import {
  createActiveToolPartySetup,
  createCustomToolPartySetup,
  getToolPartyTokenIdentities,
  MAX_CUSTOM_PARTY_MEMBERS,
  MAX_SCENE_PARTY_MEMBERS,
  resolveToolPartySetup,
} from '@/lib/tool-party';
import {
  labelPartyTokens,
  placeTokens,
  preparePartyTokensForExport,
  type PartyTokenIdentity,
} from '@/lib/token-placement';
import { buildUvtt } from '@/lib/uvtt-export';
import MapSvg from '@/components/MapSvg';
import PartyAttendanceList from '@/components/PartyAttendanceList';
import PrintButton from '@/components/PrintButton';
import ResetGeneratorButton from '@/components/ResetGeneratorButton';
import RoomKeyPanel from '@/components/RoomKeyPanel';
import ToolPageHeader from '@/components/ToolPageHeader';
import { downloadBlob, rasterizeSvg, svgToPngBase64 } from '@/components/map-export';

const ENVIRONMENTS: Environment[] = [
  'Arctic', 'Coastal', 'Desert', 'Forest', 'Grassland', 'Hill',
  'Mountain', 'Swamp', 'Underdark', 'Underwater', 'Urban', 'Planar',
];

const isMapEnvironment = (v: unknown): v is Environment =>
  typeof v === 'string' && (ENVIRONMENTS as string[]).includes(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const LAYOUT_OPTIONS = MAP_LAYOUT_OPTIONS;
const SCALE_OPTIONS = MAP_SCALE_OPTIONS;
const isFeatureDensity = (v: unknown): v is MapFeatureDensity =>
  v === 'Sparse' || v === 'Balanced' || v === 'Dense';
const isTerrainVariety = (v: unknown): v is MapTerrainVariety =>
  v === 'Focused' || v === 'Varied' || v === 'Wild';

const ENV_DESCRIPTIONS: Partial<Record<Environment, string>> = {
  Underdark: 'Cellular automata caverns with organic tunnels',
  Urban: 'City streets, blocks, and plazas',
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
// `?seed&env&(ms|mw&mh)&md&mv[&ml][&mr][&pc]` reproduces a map exactly.
// Scale-mode maps serialize `ms` (regeneration must replay the jitter
// draws); legacy links carry exact `mw`/`mh` and skip them. This URL
// contract is permanent.

/** Export scaling: VTT-standard 70 px/cell until the 4096px raster cap
 *  bites, then exact integer px/cell so grid alignment never drifts. */
function exportPpg(map: EncounterMap): number {
  return Math.min(70, Math.floor(4096 / Math.max(map.width, map.height)));
}

function mapShareParams(m: EncounterMap, partyCount = 0): URLSearchParams {
  const params = new URLSearchParams();
  params.set('seed', String(m.seed ?? 0));
  params.set('env', m.environment);
  if (m.genOptions?.scale) {
    // Scale-generated maps replay scale mode (jitter draws included).
    params.set('ms', m.genOptions.scale);
  } else {
    params.set('mw', String(m.width));
    params.set('mh', String(m.height));
  }
  if (m.genOptions) {
    params.set('md', m.genOptions.featureDensity);
    params.set('mv', m.genOptions.terrainVariety);
    if (m.genOptions.layout) params.set('ml', m.genOptions.layout);
    if (m.genOptions.roomCount) params.set('mr', String(m.genOptions.roomCount));
  }
  if (partyCount > 0) {
    params.set('pc', String(Math.min(MAX_SCENE_PARTY_MEMBERS, Math.floor(partyCount))));
  }
  return params;
}

function buildShareUrl(m: EncounterMap, partyCount: number): string {
  return `${window.location.origin}/maps?${mapShareParams(m, partyCount).toString()}`;
}

export default function MapsPage() {
  return <MapsBuilder />;
}

function MapsBuilder() {
  const {
    library: partyLibrary,
    hydrated: partyLibraryHydrated,
    status: partyLibraryStatus,
  } = usePartyLibrary();
  const durableParty = partyLibrary ? getActiveParty(partyLibrary) : null;
  const partyLibraryUnavailable = partyLibraryStatus === 'unavailable'
    || partyLibraryStatus === 'error';
  const {
    setup: partySetup,
    setSetup: setPartySetup,
    hydrated: partySetupHydrated,
  } = useToolPartySetup({
    key: 'mapPartySetup1',
    activeParty: durableParty,
    partyHydrated: partyLibraryHydrated,
    defaultCustomSize: 0,
    defaultCustomLevel: 1,
  });
  const resolvedParty = resolveToolPartySetup(partySetup, durableParty);
  const [environment, setEnvironment] = usePersistentState<Environment>('mapEnvironment', 'Underdark', isMapEnvironment);
  const [layout, setLayout] = usePersistentState<MapLayout>('mapLayout', 'auto', isMapLayout);
  const [scale, setScale] = usePersistentState<MapScale>('mapScale', 'Standard', isMapScale);
  const [featureDensity, setFeatureDensity] = usePersistentState<MapFeatureDensity>(
    'mapFeatureDensity', 'Balanced', isFeatureDensity,
  );
  const [terrainVariety, setTerrainVariety] = usePersistentState<MapTerrainVariety>(
    'mapTerrainVariety', 'Varied', isTerrainVariety,
  );
  const [roomCount, setRoomCount] = usePersistentState<number>('mapRoomCount', 0, isNumber);
  const [map, setMap] = useState<EncounterMap | null>(null);
  const [mapTokens, setMapTokens] = useState<MapToken[]>([]);
  const [mapPartyCount, setMapPartyCount] = useState(0);
  const [placementNotes, setPlacementNotes] = useState<string[]>([]);
  const [includeNamesInExports, setIncludeNamesInExports] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  // History stores ~200-byte stubs (seed + options) and regenerates on
  // click; pre-overhaul full-map entries still load and age out.
  const [history, setHistory] = usePersistentState<MapHistoryEntry[]>('mapHistory', [], isMapHistoryArray);
  const exportTokens = useMemo(
    () => preparePartyTokensForExport(mapTokens, includeNamesInExports),
    [includeNamesInExports, mapTokens],
  );

  const runGenerate = useCallback((opts: {
    environment: Environment; layout: MapLayout; scale: MapScale;
    featureDensity: MapFeatureDensity; terrainVariety: MapTerrainVariety;
    roomCount: number; seed: number;
    partyCount: number;
    partyIdentities?: readonly PartyTokenIdentity[];
    /** Legacy links only — exact dimensions bypass scale mode. */
    width?: number; height?: number;
  }) => {
    const result = generateMap({
      environment: opts.environment,
      layout: opts.layout,
      scale: opts.scale,
      ...(opts.width !== undefined ? { width: opts.width } : {}),
      ...(opts.height !== undefined ? { height: opts.height } : {}),
      featureDensity: opts.featureDensity,
      terrainVariety: opts.terrainVariety,
      ...(opts.roomCount > 0 ? { roomCount: opts.roomCount } : {}),
      seed: opts.seed,
    });
    const requestedPartyCount = Math.max(
      0,
      Math.min(MAX_SCENE_PARTY_MEMBERS, Math.floor(opts.partyCount)),
    );
    const placement = placeTokens(result, [], requestedPartyCount, opts.seed);
    const localTokens = labelPartyTokens(
      placement.tokens,
      opts.partyIdentities ?? [],
    );
    setMap(result);
    setMapTokens(localTokens);
    setMapPartyCount(requestedPartyCount);
    setPlacementNotes(placement.notes);
    setIncludeNamesInExports(false);
    setHistory(prev => [
      toHistoryEntry(result, localTokens, requestedPartyCount),
      ...prev.filter(m => m.id !== result.id).slice(0, 9),
    ]);
    window.history.replaceState(
      null,
      '',
      `?${mapShareParams(result, requestedPartyCount).toString()}`,
    );
  }, [setHistory]);

  // One-shot hydration from a shared link (?seed=...). Persisted lever
  // state above is declared first so a link's params win over
  // remembered preferences.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    // Read params from the location directly: effects only run client-side,
    // and unlike useSearchParams this never suspends hydration (which under
    // `next dev` left hard-loaded share links permanently dehydrated).
    const searchParams = new URLSearchParams(window.location.search);
    const clampInt = (raw: string | null, lo: number, hi: number): number | null => {
      if (raw === null) return null;
      const n = Number(raw);
      return Number.isInteger(n) ? Math.max(lo, Math.min(hi, n)) : null;
    };
    const seedParam = clampInt(searchParams.get('seed'), 0, 0x7fffffff);
    if (seedParam === null) return;
    const envParam = searchParams.get('env');
    const env = isMapEnvironment(envParam) ? envParam : 'Underdark';
    const mlParam = searchParams.get('ml');
    const ml = isMapLayout(mlParam) ? mlParam : 'auto';
    const msParam = searchParams.get('ms');
    const ms = isMapScale(msParam) ? msParam : 'Standard';
    // Legacy links carry exact dimensions (mw/mh) instead of a scale.
    const mw = clampInt(searchParams.get('mw'), 10, 60);
    const mh = clampInt(searchParams.get('mh'), 10, 45);
    const legacyDims = msParam === null && (mw !== null || mh !== null);
    const mdParam = searchParams.get('md');
    const md = isFeatureDensity(mdParam) ? mdParam : 'Balanced';
    const mvParam = searchParams.get('mv');
    const mv = isTerrainVariety(mvParam) ? mvParam : 'Varied';
    const mr = clampInt(searchParams.get('mr'), 3, 14) ?? 0;
    // Party identity never enters the URL. Links only reproduce anonymous
    // positional markers; legacy links without `pc` remain tokenless.
    const pc = clampInt(searchParams.get('pc'), 0, MAX_SCENE_PARTY_MEMBERS) ?? 0;
    setEnvironment(env);
    setLayout(ml);
    setScale(ms);
    setFeatureDensity(md);
    setTerrainVariety(mv);
    setRoomCount(mr);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot share-link hydration must render the exact seeded map.
    runGenerate({
      environment: env, layout: ml, scale: ms,
      ...(legacyDims ? { width: mw ?? 24, height: mh ?? 18 } : {}),
      featureDensity: md, terrainVariety: mv, roomCount: mr, seed: seedParam,
      partyCount: pc,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGenerate = useCallback(() => {
    if (!partySetupHydrated) return;
    runGenerate({
      environment, layout, scale,
      featureDensity, terrainVariety, roomCount,
      seed: randomSeed(),
      partyCount: resolvedParty.partySize,
      partyIdentities: getToolPartyTokenIdentities(resolvedParty),
    });
  }, [
    environment,
    featureDensity,
    layout,
    partySetupHydrated,
    resolvedParty,
    roomCount,
    runGenerate,
    scale,
    terrainVariety,
  ]);

  const handleReset = useCallback(() => {
    setEnvironment('Underdark');
    setLayout('auto');
    setScale('Standard');
    setFeatureDensity('Balanced');
    setTerrainVariety('Varied');
    setRoomCount(0);
    setPartySetup(durableParty
      ? createActiveToolPartySetup(durableParty)
      : createCustomToolPartySetup(0, 1));
    setMap(null);
    setMapTokens([]);
    setMapPartyCount(0);
    setPlacementNotes([]);
    setIncludeNamesInExports(false);
    window.history.replaceState(null, '', window.location.pathname);
  }, [
    durableParty,
    setEnvironment,
    setFeatureDensity,
    setLayout,
    setPartySetup,
    setRoomCount,
    setScale,
    setTerrainVariety,
  ]);

  const handleShare = useCallback(() => {
    if (!map) return;
    navigator.clipboard.writeText(buildShareUrl(map, mapPartyCount)).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [map, mapPartyCount]);

  const handleExportPng = useCallback(async () => {
    if (!map) return;
    const svg = sceneToSvgString(buildMapScene(map, exportTokens), LIGHT_PALETTE);
    const blob = await rasterizeSvg(svg, map.width * exportPpg(map));
    downloadBlob(blob, `${map.name.toLowerCase().replace(/\s+/g, '-')}-${map.seed ?? map.id}.png`);
  }, [exportTokens, map]);

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

  const handleExportMarkdown = useCallback(() => {
    if (!map) return;
    downloadBlob(
      new Blob([mapToMarkdown(map)], { type: 'text/markdown' }),
      `${map.name.toLowerCase().replace(/\s+/g, '-')}.md`,
    );
  }, [map]);

  const handleExportUvtt = useCallback(async () => {
    if (!map) return;
    // The embedded image must be exactly pixels_per_grid px per cell
    // with no rulers, or the VTT grid won't line up with the walls.
    const svg = sceneToSvgString(
      buildMapScene(map, exportTokens),
      LIGHT_PALETTE,
      { showRulers: false, showRoomLabels: false },
    );
    const ppg = exportPpg(map);
    const image = await svgToPngBase64(svg, map.width * ppg);
    const doc = buildUvtt(map, image, ppg);
    downloadBlob(
      new Blob([JSON.stringify(doc)], { type: 'application/json' }),
      `${map.name.toLowerCase().replace(/\s+/g, '-')}.dd2vtt`,
    );
  }, [exportTokens, map]);

  function chooseActiveParty() {
    if (!durableParty) return;
    setPartySetup(createActiveToolPartySetup(durableParty));
  }

  function chooseCustomParty() {
    if (partySetup.mode === 'custom') return;
    setPartySetup(createCustomToolPartySetup(0, 1));
  }

  function handleCustomTokenCount(raw: string) {
    if (partySetup.mode !== 'custom') return;
    const next = Number(raw);
    if (!Number.isInteger(next) || next < 0 || next > MAX_CUSTOM_PARTY_MEMBERS) return;
    setPartySetup(createCustomToolPartySetup(next, 1, { size: 0, level: 1 }));
  }

  function handleHistorySelection(entry: MapHistoryEntry) {
    const restoredMap = resolveHistoryEntry(entry);
    const restoredTokens = historyEntryPartyTokens(entry);
    const partyCount = historyEntryPartyCount(entry);
    const replay = placeTokens(restoredMap, [], partyCount, restoredMap.seed ?? 0);
    setMap(restoredMap);
    setMapTokens(restoredTokens);
    setMapPartyCount(partyCount);
    setPlacementNotes(replay.notes);
    setIncludeNamesInExports(false);
    window.history.replaceState(
      null,
      '',
      `?${mapShareParams(restoredMap, partyCount).toString()}`,
    );
  }

  return (
    <div className="animate-fade-in">
      <ToolPageHeader
        path="/maps"
        description="Generate a readable, terrain-aware battle map in seconds, then inspect, share, print, or export it for the table."
      />
      <p className="sr-only" aria-live="polite">
        {map ? `${map.name} generated. ${map.width} by ${map.height} cells.` : ''}
      </p>

      <div className="card panel-accent mb-6 print:hidden">
        <div className="mb-5">
          <p className="micro-label">Map setup</p>
          <h2 className="mt-1 text-xl">Frame the battlefield</h2>
        </div>
        <section className="mb-5 border-b border-[var(--line-subtle)] pb-5" aria-labelledby="map-party-heading">
          <div className="mb-3 flex items-start gap-3">
            <span className="setup-group-icon" aria-hidden="true"><Users size={18} /></span>
            <div>
              <h3 id="map-party-heading" className="text-base">Place the party</h3>
              <p className="mt-1 text-sm text-[var(--text-3)]">
                Add starting markers now, or generate a clean battlefield with no player tokens.
              </p>
            </div>
          </div>

          <fieldset>
            <legend className="sr-only">Party marker source</legend>
            <div className="option-card-grid mb-3">
              <label className={`option-card option-card-toggle ${partySetup.mode === 'active' ? 'is-active' : ''}`}>
                <Users size={18} aria-hidden="true" />
                <span className="option-card-copy">
                  <strong>Use active party</strong>
                  <small>{durableParty?.name ?? 'No saved party yet'}</small>
                </span>
                <input
                  type="radio"
                  name="map-party-source"
                  checked={partySetup.mode === 'active'}
                  disabled={!durableParty || !partySetupHydrated}
                  onChange={chooseActiveParty}
                />
              </label>
              <label className={`option-card option-card-toggle ${partySetup.mode === 'custom' ? 'is-active' : ''}`}>
                <SlidersHorizontal size={18} aria-hidden="true" />
                <span className="option-card-copy">
                  <strong>Temporary markers</strong>
                  <small>Anonymous tokens for this map</small>
                </span>
                <input
                  type="radio"
                  name="map-party-source"
                  checked={partySetup.mode === 'custom'}
                  disabled={!partySetupHydrated}
                  onChange={chooseCustomParty}
                />
              </label>
            </div>
          </fieldset>

          {!partySetupHydrated ? (
            <div className="surface-inset p-4 text-sm text-[var(--text-2)]" role="status">
              Loading party setup…
            </div>
          ) : partySetup.mode === 'active' && durableParty ? (
            <div className="surface-inset space-y-3 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[var(--text-1)]">{durableParty.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-3)]">
                    {resolvedParty.partySize} of {durableParty.members.length} selected for the next map
                  </p>
                </div>
                <Link href="/party/" className="btn-ghost text-xs">Manage parties</Link>
              </div>
              <PartyAttendanceList
                id="map-party-attendance"
                party={durableParty}
                selectedMemberIds={resolvedParty.selectedMemberIds}
                onChange={(selectedMemberIds) => {
                  if (partySetup.mode !== 'active') return;
                  setPartySetup({ ...partySetup, selectedMemberIds });
                }}
                legend="Map markers"
                hint="Clear everyone for a tokenless map. This choice does not change the saved party."
              />
            </div>
          ) : partySetup.mode === 'active' ? (
            <div className="surface-inset p-4 text-sm text-[var(--text-2)]">
              <p className="font-semibold text-[var(--text-1)]">
                {partyLibraryUnavailable ? 'Party Library unavailable' : 'No active party'}
              </p>
              <p className="mt-1 text-xs text-[var(--text-3)]">
                Create or activate a saved party, or continue with anonymous markers.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/party/" className="btn-secondary text-xs">Manage parties</Link>
                <button type="button" className="btn-ghost text-xs" onClick={chooseCustomParty}>
                  Use anonymous markers
                </button>
              </div>
            </div>
          ) : (
            <div className="surface-inset p-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-44">
                  <label htmlFor="map-party-count" className="field-label">Player tokens</label>
                  <input
                    id="map-party-count"
                    type="number"
                    min={0}
                    max={MAX_CUSTOM_PARTY_MEMBERS}
                    step={1}
                    inputMode="numeric"
                    value={partySetup.size}
                    onChange={event => handleCustomTokenCount(event.target.value)}
                    className="w-full"
                  />
                  <p className="field-hint">0–{MAX_CUSTOM_PARTY_MEMBERS} anonymous markers</p>
                </div>
                {!durableParty && <Link href="/party/" className="btn-ghost text-xs">Create a saved party</Link>}
              </div>
              {partyLibraryUnavailable && (
                <p className="mt-3 text-xs text-[var(--text-3)]">
                  Saved parties are unavailable, but temporary markers still work.
                </p>
              )}
            </div>
          )}
        </section>

        <p className="micro-label mb-3">Shape and terrain</p>
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
            <label htmlFor="map-layout" className="micro-label block mb-1">
              Layout
            </label>
            <select
              id="map-layout"
              value={layout}
              onChange={e => setLayout(e.target.value as MapLayout)}
              className="w-full"
            >
              {LAYOUT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--text-3)]">
              {LAYOUT_OPTIONS.find(o => o.value === layout)?.hint}
            </p>
          </div>
          <div>
            <label htmlFor="map-scale" className="micro-label block mb-1">
              Scale
            </label>
            <select
              id="map-scale"
              value={scale}
              onChange={e => setScale(e.target.value as MapScale)}
              className="w-full"
            >
              {SCALE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[var(--text-3)]">
              {SCALE_OPTIONS.find(o => o.value === scale)?.hint}, varied per seed
            </p>
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

        {map && mapTokens.some((token) => token.kind === 'party') && (
          <div className="surface-inset mb-4 flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
            <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--text-1)]">
              <input
                type="checkbox"
                checked={includeNamesInExports}
                onChange={event => setIncludeNamesInExports(event.target.checked)}
              />
              <span>
                <strong className="block">Include character names in print, PNG, and UVTT</strong>
                <span className="mt-0.5 block text-xs text-[var(--text-3)]">
                  Off by default. When enabled, initials and names are included; durable IDs never are.
                </span>
              </span>
            </label>
            <span className="text-xs text-[var(--text-3)]">
              Share links and map data exports stay anonymous.
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line-subtle)] pt-4">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!partySetupHydrated}
            className="btn-primary text-lg"
          >
            {map ? 'Generate a New Map' : 'Generate Map'}
          </button>
          <ResetGeneratorButton onReset={handleReset} label="Reset Generator" />
          {map && (
            <>
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
              <button type="button" onClick={handleExportMarkdown} className="btn-secondary">
                Export Markdown
              </button>
              <button type="button" onClick={handleExportUvtt} className="btn-secondary">
                Export UVTT
              </button>
            </>
          )}
        </div>
      </div>

      {map && (
        <>
          <div className="card overflow-x-auto animate-fade-in">
            <MapSvg map={map} tokens={mapTokens} printTokens={exportTokens} />
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
          {placementNotes.length > 0 && (
            <div className="surface-inset mt-4 p-4 print:hidden" role="status">
              <p className="micro-label">Placement notes</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--text-2)]">
                {placementNotes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}
              </ul>
            </div>
          )}
          {map.rooms && <RoomKeyPanel rooms={map.rooms} />}
        </>
      )}

      {!map && (
        <div className="empty-state print:hidden">
          <p className="micro-label">Battlefield preview</p>
          <h2 className="mt-2 text-xl">Your next map starts with the table</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--text-3)]">
            Choose who needs a marker, then set the environment and scale. Terrain, cover, hazards, and routes are generated locally in your browser.
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
                onClick={() => handleHistorySelection(m)}
                aria-pressed={map?.id === m.id}
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
