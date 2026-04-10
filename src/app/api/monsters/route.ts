import { NextRequest, NextResponse } from 'next/server';
import { ALL_MONSTERS } from '@/data';
import { filterMonsters } from '@/lib/monster-filter';
import type { MonsterFilter } from '@/lib/types';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const filter: MonsterFilter = {};

  if (params.has('search')) filter.search = params.get('search')!;
  if (params.has('crMin')) filter.crMin = Number(params.get('crMin'));
  if (params.has('crMax')) filter.crMax = Number(params.get('crMax'));
  if (params.has('sizes')) filter.sizes = params.get('sizes')!.split(',') as MonsterFilter['sizes'];
  if (params.has('types')) filter.types = params.get('types')!.split(',') as MonsterFilter['types'];
  if (params.has('environments')) filter.environments = params.get('environments')!.split(',') as MonsterFilter['environments'];
  if (params.has('movementModes')) filter.movementModes = params.get('movementModes')!.split(',') as MonsterFilter['movementModes'];
  if (params.has('attackDamageTypes')) filter.attackDamageTypes = params.get('attackDamageTypes')!.split(',') as MonsterFilter['attackDamageTypes'];
  if (params.has('attackDeliveryModes')) filter.attackDeliveryModes = params.get('attackDeliveryModes')!.split(',') as MonsterFilter['attackDeliveryModes'];
  if (params.has('isLegendary')) filter.isLegendary = params.get('isLegendary') === 'true';
  if (params.has('hasSpellcasting')) filter.hasSpellcasting = params.get('hasSpellcasting') === 'true';
  if (params.has('sortBy')) filter.sortBy = params.get('sortBy') as MonsterFilter['sortBy'];
  if (params.has('sortDir')) filter.sortDir = params.get('sortDir') as MonsterFilter['sortDir'];

  const results = filterMonsters(ALL_MONSTERS, filter);

  return NextResponse.json({
    count: results.length,
    monsters: results,
  });
}
