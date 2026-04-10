'use client';

import { useState } from 'react';
import { generateMap } from '@/lib/map-generator';
import type { EncounterMap, Environment } from '@/lib/types';
import MapGrid from '@/components/MapGrid';

const ENVIRONMENTS: Environment[] = [
  'Arctic', 'Coastal', 'Desert', 'Forest', 'Grassland', 'Hill',
  'Mountain', 'Swamp', 'Underdark', 'Underwater', 'Urban', 'Planar',
];

export default function MapsPage() {
  const [environment, setEnvironment] = useState<Environment>('Underdark');
  const [width, setWidth] = useState(24);
  const [height, setHeight] = useState(18);
  const [map, setMap] = useState<EncounterMap | null>(null);

  function handleGenerate() {
    const result = generateMap({
      environment,
      width,
      height,
      seed: Date.now(),
    });
    setMap(result);
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold text-[var(--gold)] mb-6">Map Generator</h1>

      <div className="card mb-6">
        <div className="grid sm:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">
              Environment
            </label>
            <select
              value={environment}
              onChange={e => setEnvironment(e.target.value as Environment)}
              className="w-full"
            >
              {ENVIRONMENTS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">
              Width (cells)
            </label>
            <input
              type="number"
              min={10}
              max={40}
              value={width}
              onChange={e => setWidth(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-[var(--gold)] mb-1 uppercase tracking-wider">
              Height (cells)
            </label>
            <input
              type="number"
              min={10}
              max={30}
              value={height}
              onChange={e => setHeight(Number(e.target.value))}
              className="w-full"
            />
          </div>
        </div>

        <button type="button" onClick={handleGenerate} className="btn-gold text-lg">
          Generate Map
        </button>

        <p className="mt-3 text-xs text-[var(--parchment-dark)]">
          Dungeons &amp; Urban: BSP room carving with corridors.
          Underdark &amp; Caves: Cellular automata.
          Outdoor: Scattered terrain features.
          Each generation is unique.
        </p>
      </div>

      {map && (
        <div className="card overflow-x-auto animate-fade-in">
          <MapGrid map={map} />
        </div>
      )}
    </div>
  );
}
