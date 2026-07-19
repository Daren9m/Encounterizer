'use client';

// ─── Spell Pool ──────────────────────────────────────────────────
// The single merge point for built-in SRD spells + the user's custom
// imports. Every spell consumer reads from here (mirrors useMonsters).

import { useMemo } from 'react';
import { SRD_SPELLS, type Spell } from '@/data/spells';
import { mergeSpells } from '@/lib/spell-merge';
import { useCustomSpells } from './useCustomSpells';

export function useSpells(): Spell[] {
  const { customSpells } = useCustomSpells();
  return useMemo(() => mergeSpells(SRD_SPELLS, customSpells), [customSpells]);
}
