import { NextRequest, NextResponse } from 'next/server';
import { generateMap } from '@/lib/map-generator';
import type { Environment } from '@/lib/types';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const {
    environment = 'Underdark',
    width = 24,
    height = 18,
  } = body as {
    environment?: Environment;
    width?: number;
    height?: number;
  };

  const map = generateMap({
    environment,
    width: Math.max(10, Math.min(40, width)),
    height: Math.max(10, Math.min(30, height)),
    seed: Date.now(),
  });

  return NextResponse.json(map);
}
