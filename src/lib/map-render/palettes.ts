import type { TerrainType } from '../types';

// ─── Map Palettes ────────────────────────────────────────────────
// Concrete hex only — NO css variables. The svg string these colors
// end up in is rasterized to PNG (image export, UVTT embed) where no
// stylesheet exists, so every color must be self-contained.

export interface MapPalette {
  /** Page behind the rulers. */
  background: string;
  /** Base color of open ground. */
  floor: string;
  grid: string;
  wallFill: string;
  wallStroke: string;
  ruler: string;
  roomChipFill: string;
  roomChipText: string;
  /** Full-cell area washes (8-digit hex = baked-in alpha). */
  tint: Partial<Record<TerrainType, string>>;
  /** Glyph colors for point features. */
  icon: Partial<Record<TerrainType, string>>;
  tokenPartyFill: string;
  tokenPartyRing: string;
  tokenMonsterFill: string;
  tokenMonsterRing: string;
  tokenText: string;
}

/** Dusksteel screen palette. */
export const DARK_PALETTE: MapPalette = {
  background: '#16161c',
  floor: '#26262e',
  grid: '#32323c',
  wallFill: '#0e0e12',
  wallStroke: '#6a6a78',
  ruler: '#9494a2',
  roomChipFill: '#e69c55',
  roomChipText: '#1d1105',
  tint: {
    water: '#4a90d966',
    difficult: '#8b735566',
    vegetation: '#2e8b5766',
    ice: '#b0e0e666',
    elevated: '#7d6b5d80',
    rubble: '#80808059',
    lava: '#ff450080',
    chasm: '#000000cc',
  },
  icon: {
    door: '#c8a15a',
    trap: '#d4a017',
    treasure: '#f0c040',
    entrance: '#4caf50',
    exit: '#f44336',
    pillar: '#9e9e9e',
    altar: '#b07fd4',
    stairs: '#a0a0ac',
    bridge: '#8b6914',
  },
  tokenPartyFill: '#32323c',
  tokenPartyRing: '#e69c55',
  tokenMonsterFill: '#4a1f1f',
  tokenMonsterRing: '#d46a6a',
  tokenText: '#f2f2f7',
};

/** Print / image-export palette: light ground, dark ink. */
export const LIGHT_PALETTE: MapPalette = {
  background: '#ffffff',
  floor: '#f7f4ec',
  grid: '#d8d2c4',
  wallFill: '#2b2b31',
  wallStroke: '#16161c',
  ruler: '#6b6b76',
  roomChipFill: '#b06f33',
  roomChipText: '#ffffff',
  tint: {
    water: '#4a90d94d',
    difficult: '#8b73554d',
    vegetation: '#2e8b574d',
    ice: '#7ec8e366',
    elevated: '#7d6b5d4d',
    rubble: '#8080804d',
    lava: '#ff450066',
    chasm: '#33333366',
  },
  icon: {
    door: '#8b6914',
    trap: '#b8860b',
    treasure: '#c09010',
    entrance: '#2e7d32',
    exit: '#c62828',
    pillar: '#55555f',
    altar: '#7b3fa0',
    stairs: '#55555f',
    bridge: '#8b6914',
  },
  tokenPartyFill: '#ffffff',
  tokenPartyRing: '#b06f33',
  tokenMonsterFill: '#fbe9e7',
  tokenMonsterRing: '#c62828',
  tokenText: '#16161c',
};
