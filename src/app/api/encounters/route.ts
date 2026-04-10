import { NextRequest, NextResponse } from 'next/server';
import { SRD_MONSTERS } from '@/data/srd-monsters';
import { filterMonsters } from '@/lib/monster-filter';
import { generateEncounter } from '@/lib/encounter-generator';
import { generateMap } from '@/lib/map-generator';
import type { Difficulty, Environment, Party } from '@/lib/types';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const {
    partySize = 4,
    partyLevel = 3,
    difficulty = 'Medium',
    environment = 'Forest',
    includeMap = true,
    monsterFilter,
  } = body as {
    partySize?: number;
    partyLevel?: number;
    difficulty?: Difficulty;
    environment?: Environment;
    includeMap?: boolean;
    monsterFilter?: Record<string, unknown>;
  };

  const party: Party = {
    id: 'api-party',
    name: 'Party',
    members: Array.from({ length: Math.max(1, partySize) }, (_, i) => ({
      name: `Player ${i + 1}`,
      level: Math.max(1, Math.min(20, partyLevel)),
      className: 'Adventurer',
    })),
  };

  const encounter = generateEncounter(
    SRD_MONSTERS,
    { party, difficulty, environment, filter: monsterFilter as never },
    filterMonsters
  );

  if (includeMap) {
    encounter.map = generateMap({ environment, seed: Date.now() });
  }

  return NextResponse.json(encounter);
}
