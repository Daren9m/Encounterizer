'use client';

// The single merge point: every monster consumer (bestiary, encounter
// builder, battle forecast) reads the pool from here so custom monsters
// appear everywhere built-ins do.

import { useMemo } from 'react';
import { ALL_MONSTERS } from '@/data';
import { mergeMonsters } from '@/lib/monster-merge';
import type { Monster } from '@/lib/types';
import { useCustomMonsters } from './useCustomMonsters';

export function useMonsters(): { all: Monster[]; custom: Monster[] } {
  const { customMonsters } = useCustomMonsters();
  const all = useMemo(() => mergeMonsters(ALL_MONSTERS, customMonsters), [customMonsters]);
  return { all, custom: customMonsters };
}
