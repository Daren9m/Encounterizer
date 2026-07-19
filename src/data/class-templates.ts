// ─── Battle Forecast Class Templates ─────────────────────────────
// "Typical build" stats per class at four level tiers, so a DM can
// configure a party in four clicks instead of forty fields.
//
// Derivation rules (2024 PHB progression, no magic items assumed):
// - Representative levels per tier: 3 / 8 / 13 / 18 (prof +2/+3/+5/+6).
// - Primary ability on the standard 16 → 18 (lvl 4) → 20 (lvl 8) track,
//   so attack bonus ≈ prof + mod: +5 / +8 / +10 / +11.
// - attacksPerRound: Extra Attack at 5 (martials → 2), Fighter 3 at 11,
//   Monk counts Bonus Action strikes, Warlock counts Eldritch Blast beams.
// - avgDamagePerHit: weapon/cantrip average + ability mod + amortized
//   riders (superiority dice, smites, Rage bonus, Hex/Agonizing Blast).
// - avgSpellDamagePerRound: leveled-spell surplus for casters, resolved
//   in-engine against the target's DEX save vs spellDc.
// - healingPerRound: typical healing output averaged across a fight.
// - HP is NOT stored: it's computed from the actual level via the 2024
//   fixed-average rule in buildSimPlayer(). Only conMod is stored.
// Values are deliberately "typical", not optimized — the forecast is a
// weather report, not a DPR calculator. Sanity-checked by
// class-templates.test.ts (tier monotonicity + DPR bands).

import type { PartyMemberConfig, SimPlayer } from '@/lib/battle-sim-types';

export type LevelTier = '1-4' | '5-10' | '11-16' | '17-20';

export interface TemplateTierStats {
  ac: number;
  conMod: number;
  attacksPerRound: number;
  attackBonus: number;
  avgDamagePerHit: number;
  saveBonuses: { dex: number; con: number; wis: number };
  spellDc?: number;
  avgSpellDamagePerRound?: number;
  healingPerRound?: number;
  special?: { rage?: boolean; evasion?: boolean; sneakDamage?: number };
}

export interface ClassTemplate {
  id: string;
  name: string;
  role: 'Martial' | 'Caster' | 'Hybrid';
  hitDie: 6 | 8 | 10 | 12;
  description: string;
  tiers: Record<LevelTier, TemplateTierStats>;
}

export const CLASS_TEMPLATES: ClassTemplate[] = [
  {
    id: 'fighter-champion',
    name: 'Fighter (Champion)',
    role: 'Martial',
    hitDie: 10,
    description: 'High AC, consistent weapon damage, extra crits',
    tiers: {
      '1-4':   { ac: 18, conMod: 2, attacksPerRound: 1, attackBonus: 5,  avgDamagePerHit: 10, saveBonuses: { dex: 1, con: 5, wis: 1 } },
      '5-10':  { ac: 18, conMod: 2, attacksPerRound: 2, attackBonus: 8,  avgDamagePerHit: 12, saveBonuses: { dex: 2, con: 6, wis: 2 } },
      '11-16': { ac: 19, conMod: 3, attacksPerRound: 3, attackBonus: 10, avgDamagePerHit: 13, saveBonuses: { dex: 2, con: 8, wis: 3 } },
      '17-20': { ac: 19, conMod: 3, attacksPerRound: 3, attackBonus: 11, avgDamagePerHit: 15, saveBonuses: { dex: 3, con: 9, wis: 3 } },
    },
  },
  {
    id: 'fighter-battlemaster',
    name: 'Fighter (Battle Master)',
    role: 'Martial',
    hitDie: 10,
    description: 'Weapon master with superiority-die burst',
    tiers: {
      '1-4':   { ac: 18, conMod: 2, attacksPerRound: 1, attackBonus: 5,  avgDamagePerHit: 12, saveBonuses: { dex: 1, con: 5, wis: 1 } },
      '5-10':  { ac: 18, conMod: 2, attacksPerRound: 2, attackBonus: 8,  avgDamagePerHit: 14, saveBonuses: { dex: 2, con: 6, wis: 2 } },
      '11-16': { ac: 19, conMod: 3, attacksPerRound: 3, attackBonus: 10, avgDamagePerHit: 15, saveBonuses: { dex: 2, con: 8, wis: 3 } },
      '17-20': { ac: 19, conMod: 3, attacksPerRound: 3, attackBonus: 11, avgDamagePerHit: 16, saveBonuses: { dex: 3, con: 9, wis: 3 } },
    },
  },
  {
    id: 'barbarian-berserker',
    name: 'Barbarian (Berserker)',
    role: 'Martial',
    hitDie: 12,
    description: 'Huge HP pool, Rage halves weapon damage taken',
    tiers: {
      '1-4':   { ac: 15, conMod: 3, attacksPerRound: 1, attackBonus: 5,  avgDamagePerHit: 11, saveBonuses: { dex: 1, con: 5, wis: 0 },  special: { rage: true } },
      '5-10':  { ac: 16, conMod: 4, attacksPerRound: 2, attackBonus: 8,  avgDamagePerHit: 14, saveBonuses: { dex: 2, con: 7, wis: 1 },  special: { rage: true } },
      '11-16': { ac: 17, conMod: 5, attacksPerRound: 2, attackBonus: 10, avgDamagePerHit: 16, saveBonuses: { dex: 2, con: 9, wis: 1 },  special: { rage: true } },
      '17-20': { ac: 18, conMod: 5, attacksPerRound: 2, attackBonus: 11, avgDamagePerHit: 18, saveBonuses: { dex: 3, con: 10, wis: 2 }, special: { rage: true } },
    },
  },
  {
    id: 'rogue-thief',
    name: 'Rogue (Thief)',
    role: 'Martial',
    hitDie: 8,
    description: 'Sneak Attack spikes, Evasion, slippery',
    tiers: {
      '1-4':   { ac: 15, conMod: 1, attacksPerRound: 2, attackBonus: 5,  avgDamagePerHit: 7,  saveBonuses: { dex: 5, con: 1, wis: 1 },  special: { sneakDamage: 7 } },
      '5-10':  { ac: 16, conMod: 2, attacksPerRound: 2, attackBonus: 8,  avgDamagePerHit: 8,  saveBonuses: { dex: 8, con: 2, wis: 2 },  special: { sneakDamage: 14, evasion: true } },
      '11-16': { ac: 17, conMod: 2, attacksPerRound: 2, attackBonus: 10, avgDamagePerHit: 9,  saveBonuses: { dex: 10, con: 2, wis: 3 }, special: { sneakDamage: 24, evasion: true } },
      '17-20': { ac: 17, conMod: 2, attacksPerRound: 2, attackBonus: 11, avgDamagePerHit: 10, saveBonuses: { dex: 11, con: 3, wis: 4 }, special: { sneakDamage: 31, evasion: true } },
    },
  },
  {
    id: 'monk-open-hand',
    name: 'Monk (Open Hand)',
    role: 'Martial',
    hitDie: 8,
    description: 'Many attacks, high mobility, Evasion',
    tiers: {
      '1-4':   { ac: 16, conMod: 1, attacksPerRound: 2, attackBonus: 5,  avgDamagePerHit: 6,  saveBonuses: { dex: 5, con: 3, wis: 3 } },
      '5-10':  { ac: 17, conMod: 2, attacksPerRound: 3, attackBonus: 8,  avgDamagePerHit: 9,  saveBonuses: { dex: 8, con: 4, wis: 5 },  special: { evasion: true } },
      '11-16': { ac: 18, conMod: 2, attacksPerRound: 4, attackBonus: 10, avgDamagePerHit: 10, saveBonuses: { dex: 10, con: 4, wis: 6 }, special: { evasion: true } },
      '17-20': { ac: 19, conMod: 2, attacksPerRound: 4, attackBonus: 11, avgDamagePerHit: 11, saveBonuses: { dex: 11, con: 5, wis: 7 }, special: { evasion: true } },
    },
  },
  {
    id: 'ranger-hunter',
    name: 'Ranger (Hunter)',
    role: 'Martial',
    hitDie: 10,
    description: "Ranged damage with Hunter's Mark sustain",
    tiers: {
      '1-4':   { ac: 15, conMod: 1, attacksPerRound: 1, attackBonus: 5,  avgDamagePerHit: 11, saveBonuses: { dex: 5, con: 2, wis: 1 } },
      '5-10':  { ac: 16, conMod: 2, attacksPerRound: 2, attackBonus: 8,  avgDamagePerHit: 13, saveBonuses: { dex: 8, con: 3, wis: 2 } },
      '11-16': { ac: 17, conMod: 2, attacksPerRound: 2, attackBonus: 10, avgDamagePerHit: 14, saveBonuses: { dex: 10, con: 3, wis: 2 } },
      '17-20': { ac: 17, conMod: 2, attacksPerRound: 2, attackBonus: 11, avgDamagePerHit: 15, saveBonuses: { dex: 11, con: 4, wis: 3 } },
    },
  },
  {
    id: 'paladin-devotion',
    name: 'Paladin (Devotion)',
    role: 'Hybrid',
    hitDie: 10,
    description: 'Plate-and-shield tank with smites and healing',
    tiers: {
      '1-4':   { ac: 19, conMod: 1, attacksPerRound: 1, attackBonus: 5,  avgDamagePerHit: 10, saveBonuses: { dex: 0, con: 4, wis: 1 }, healingPerRound: 2 },
      '5-10':  { ac: 20, conMod: 2, attacksPerRound: 2, attackBonus: 8,  avgDamagePerHit: 13, saveBonuses: { dex: 2, con: 6, wis: 5 }, healingPerRound: 3 },
      '11-16': { ac: 21, conMod: 2, attacksPerRound: 2, attackBonus: 10, avgDamagePerHit: 15, saveBonuses: { dex: 3, con: 8, wis: 6 }, healingPerRound: 4 },
      '17-20': { ac: 21, conMod: 3, attacksPerRound: 2, attackBonus: 11, avgDamagePerHit: 16, saveBonuses: { dex: 3, con: 9, wis: 7 }, healingPerRound: 5 },
    },
  },
  {
    id: 'paladin-vengeance',
    name: 'Paladin (Vengeance)',
    role: 'Hybrid',
    hitDie: 10,
    description: 'Burst-damage smite machine',
    tiers: {
      '1-4':   { ac: 18, conMod: 1, attacksPerRound: 1, attackBonus: 5,  avgDamagePerHit: 11, saveBonuses: { dex: 0, con: 4, wis: 1 }, healingPerRound: 1 },
      '5-10':  { ac: 19, conMod: 2, attacksPerRound: 2, attackBonus: 8,  avgDamagePerHit: 15, saveBonuses: { dex: 2, con: 6, wis: 5 }, healingPerRound: 2 },
      '11-16': { ac: 20, conMod: 2, attacksPerRound: 2, attackBonus: 10, avgDamagePerHit: 17, saveBonuses: { dex: 3, con: 8, wis: 6 }, healingPerRound: 2 },
      '17-20': { ac: 20, conMod: 3, attacksPerRound: 2, attackBonus: 11, avgDamagePerHit: 18, saveBonuses: { dex: 3, con: 9, wis: 7 }, healingPerRound: 3 },
    },
  },
  {
    id: 'wizard-evoker',
    name: 'Wizard (Evoker)',
    role: 'Caster',
    hitDie: 6,
    description: 'AoE blaster — fragile but devastating',
    tiers: {
      '1-4':   { ac: 12, conMod: 1, attacksPerRound: 1, attackBonus: 5,  avgDamagePerHit: 5,  saveBonuses: { dex: 2, con: 1, wis: 3 }, spellDc: 13, avgSpellDamagePerRound: 8 },
      '5-10':  { ac: 13, conMod: 2, attacksPerRound: 1, attackBonus: 8,  avgDamagePerHit: 11, saveBonuses: { dex: 2, con: 2, wis: 6 }, spellDc: 16, avgSpellDamagePerRound: 16 },
      '11-16': { ac: 14, conMod: 2, attacksPerRound: 1, attackBonus: 10, avgDamagePerHit: 16, saveBonuses: { dex: 3, con: 2, wis: 7 }, spellDc: 18, avgSpellDamagePerRound: 24 },
      '17-20': { ac: 15, conMod: 3, attacksPerRound: 1, attackBonus: 11, avgDamagePerHit: 22, saveBonuses: { dex: 3, con: 3, wis: 8 }, spellDc: 19, avgSpellDamagePerRound: 32 },
    },
  },
  {
    id: 'cleric-life',
    name: 'Cleric (Life)',
    role: 'Caster',
    hitDie: 8,
    description: 'Armored healer with Spirit Guardians sustain',
    tiers: {
      '1-4':   { ac: 18, conMod: 1, attacksPerRound: 1, attackBonus: 5,  avgDamagePerHit: 8,  saveBonuses: { dex: 0, con: 1, wis: 5 },  spellDc: 13, avgSpellDamagePerRound: 4,  healingPerRound: 5 },
      '5-10':  { ac: 18, conMod: 2, attacksPerRound: 1, attackBonus: 8,  avgDamagePerHit: 10, saveBonuses: { dex: 1, con: 2, wis: 7 },  spellDc: 15, avgSpellDamagePerRound: 8,  healingPerRound: 8 },
      '11-16': { ac: 19, conMod: 2, attacksPerRound: 1, attackBonus: 10, avgDamagePerHit: 12, saveBonuses: { dex: 1, con: 2, wis: 9 },  spellDc: 17, avgSpellDamagePerRound: 12, healingPerRound: 11 },
      '17-20': { ac: 19, conMod: 3, attacksPerRound: 1, attackBonus: 11, avgDamagePerHit: 13, saveBonuses: { dex: 2, con: 3, wis: 10 }, spellDc: 18, avgSpellDamagePerRound: 14, healingPerRound: 14 },
    },
  },
  {
    id: 'sorcerer-draconic',
    name: 'Sorcerer (Draconic)',
    role: 'Caster',
    hitDie: 6,
    description: 'Metamagic blaster with draconic toughness',
    tiers: {
      '1-4':   { ac: 14, conMod: 1, attacksPerRound: 1, attackBonus: 5,  avgDamagePerHit: 6,  saveBonuses: { dex: 2, con: 3, wis: 1 }, spellDc: 13, avgSpellDamagePerRound: 8 },
      '5-10':  { ac: 15, conMod: 2, attacksPerRound: 1, attackBonus: 8,  avgDamagePerHit: 12, saveBonuses: { dex: 2, con: 5, wis: 2 }, spellDc: 16, avgSpellDamagePerRound: 18 },
      '11-16': { ac: 16, conMod: 2, attacksPerRound: 1, attackBonus: 10, avgDamagePerHit: 18, saveBonuses: { dex: 3, con: 7, wis: 2 }, spellDc: 18, avgSpellDamagePerRound: 26 },
      '17-20': { ac: 17, conMod: 3, attacksPerRound: 1, attackBonus: 11, avgDamagePerHit: 24, saveBonuses: { dex: 3, con: 9, wis: 3 }, spellDc: 19, avgSpellDamagePerRound: 34 },
    },
  },
  {
    id: 'warlock-fiend',
    name: 'Warlock (Fiend)',
    role: 'Caster',
    hitDie: 8,
    description: 'Eldritch Blast + Hex sustained damage',
    tiers: {
      '1-4':   { ac: 13, conMod: 1, attacksPerRound: 1, attackBonus: 5,  avgDamagePerHit: 12, saveBonuses: { dex: 1, con: 1, wis: 4 }, spellDc: 13, avgSpellDamagePerRound: 3 },
      '5-10':  { ac: 14, conMod: 2, attacksPerRound: 2, attackBonus: 8,  avgDamagePerHit: 12, saveBonuses: { dex: 2, con: 2, wis: 6 }, spellDc: 16, avgSpellDamagePerRound: 5 },
      '11-16': { ac: 15, conMod: 2, attacksPerRound: 3, attackBonus: 10, avgDamagePerHit: 13, saveBonuses: { dex: 2, con: 3, wis: 8 }, spellDc: 18, avgSpellDamagePerRound: 6 },
      '17-20': { ac: 16, conMod: 3, attacksPerRound: 4, attackBonus: 11, avgDamagePerHit: 13, saveBonuses: { dex: 3, con: 3, wis: 9 }, spellDc: 19, avgSpellDamagePerRound: 8 },
    },
  },
  {
    id: 'druid-moon',
    name: 'Druid (Moon)',
    role: 'Hybrid',
    hitDie: 8,
    description: 'Wild Shape HP sponge plus spellcasting',
    tiers: {
      '1-4':   { ac: 14, conMod: 3, attacksPerRound: 2, attackBonus: 5,  avgDamagePerHit: 7,  saveBonuses: { dex: 1, con: 3, wis: 5 },  spellDc: 13, avgSpellDamagePerRound: 4,  healingPerRound: 3 },
      '5-10':  { ac: 15, conMod: 4, attacksPerRound: 2, attackBonus: 8,  avgDamagePerHit: 10, saveBonuses: { dex: 2, con: 5, wis: 7 },  spellDc: 15, avgSpellDamagePerRound: 8,  healingPerRound: 5 },
      '11-16': { ac: 16, conMod: 5, attacksPerRound: 2, attackBonus: 10, avgDamagePerHit: 12, saveBonuses: { dex: 2, con: 6, wis: 9 },  spellDc: 17, avgSpellDamagePerRound: 12, healingPerRound: 7 },
      '17-20': { ac: 17, conMod: 5, attacksPerRound: 2, attackBonus: 11, avgDamagePerHit: 14, saveBonuses: { dex: 3, con: 7, wis: 10 }, spellDc: 18, avgSpellDamagePerRound: 16, healingPerRound: 9 },
    },
  },
  {
    id: 'bard-lore',
    name: 'Bard (Lore)',
    role: 'Caster',
    hitDie: 8,
    description: 'Support caster — control, healing, moderate damage',
    tiers: {
      '1-4':   { ac: 14, conMod: 1, attacksPerRound: 1, attackBonus: 5,  avgDamagePerHit: 6,  saveBonuses: { dex: 4, con: 1, wis: 2 }, spellDc: 13, avgSpellDamagePerRound: 6,  healingPerRound: 3 },
      '5-10':  { ac: 15, conMod: 2, attacksPerRound: 1, attackBonus: 8,  avgDamagePerHit: 9,  saveBonuses: { dex: 6, con: 2, wis: 3 }, spellDc: 16, avgSpellDamagePerRound: 10, healingPerRound: 5 },
      '11-16': { ac: 16, conMod: 2, attacksPerRound: 1, attackBonus: 10, avgDamagePerHit: 11, saveBonuses: { dex: 8, con: 2, wis: 4 }, spellDc: 18, avgSpellDamagePerRound: 14, healingPerRound: 7 },
      '17-20': { ac: 16, conMod: 3, attacksPerRound: 1, attackBonus: 11, avgDamagePerHit: 13, saveBonuses: { dex: 9, con: 3, wis: 5 }, spellDc: 19, avgSpellDamagePerRound: 18, healingPerRound: 9 },
    },
  },
  {
    id: 'artificer-armorer',
    name: 'Artificer (Armorer)',
    role: 'Hybrid',
    hitDie: 8,
    description: 'Armored inventor — steady damage and utility',
    tiers: {
      '1-4':   { ac: 18, conMod: 2, attacksPerRound: 1, attackBonus: 5,  avgDamagePerHit: 8,  saveBonuses: { dex: 1, con: 4, wis: 2 }, spellDc: 13, avgSpellDamagePerRound: 3 },
      '5-10':  { ac: 19, conMod: 2, attacksPerRound: 2, attackBonus: 8,  avgDamagePerHit: 11, saveBonuses: { dex: 2, con: 5, wis: 3 }, spellDc: 15, avgSpellDamagePerRound: 6 },
      '11-16': { ac: 20, conMod: 3, attacksPerRound: 2, attackBonus: 10, avgDamagePerHit: 13, saveBonuses: { dex: 2, con: 7, wis: 4 }, spellDc: 17, avgSpellDamagePerRound: 8 },
      '17-20': { ac: 20, conMod: 3, attacksPerRound: 2, attackBonus: 11, avgDamagePerHit: 14, saveBonuses: { dex: 3, con: 8, wis: 5 }, spellDc: 18, avgSpellDamagePerRound: 10 },
    },
  },
];

export function getTemplateById(id: string): ClassTemplate | undefined {
  return CLASS_TEMPLATES.find((t) => t.id === id);
}

export function tierForLevel(level: number): LevelTier {
  if (level <= 4) return '1-4';
  if (level <= 10) return '5-10';
  if (level <= 16) return '11-16';
  return '17-20';
}

/** 2024 fixed-average HP: max die at level 1, (die/2 + 1) per level after. */
export function computeHp(hitDie: number, conMod: number, level: number): number {
  return hitDie + conMod + (level - 1) * (hitDie / 2 + 1 + conMod);
}

// ─── Spatial-mode combat profile ─────────────────────────────────
// Primary attack range per class chassis (feet). Melee chassis fight
// at 5 ft; casters at their bread-and-butter cantrip's range.
const TEMPLATE_RANGE_FT: Record<string, number> = {
  'fighter-champion': 5,
  'fighter-battlemaster': 5,
  'barbarian-berserker': 5,
  'rogue-thief': 5,
  'monk-open-hand': 5,
  'paladin-devotion': 5,
  'paladin-vengeance': 5,
  'ranger-hunter': 150,      // longbow
  'wizard-evoker': 120,      // fire bolt
  'cleric-life': 60,         // sacred flame
  'sorcerer-draconic': 120,  // fire bolt
  'warlock-fiend': 120,      // eldritch blast
  'druid-moon': 5,           // wild shape melee
  'bard-lore': 60,           // vicious mockery
  'artificer-armorer': 5,    // thunder gauntlets
};

/** Walking speed exceptions (feet); everyone else moves 30. */
const TEMPLATE_SPEED_FT: Record<string, number> = {
  'monk-open-hand': 45,
};

export function buildSimPlayer(
  config: PartyMemberConfig,
  index: number,
): SimPlayer {
  const template = getTemplateById(config.templateId) ?? CLASS_TEMPLATES[0];
  const level = Math.min(20, Math.max(1, config.level));
  const tier = template.tiers[tierForLevel(level)];

  const player: SimPlayer = {
    id: `player-${index}`,
    name: config.name || `Player ${index + 1}`,
    templateId: template.id,
    level,
    ac: tier.ac,
    maxHp: Math.round(computeHp(template.hitDie, tier.conMod, level)),
    attacksPerRound: tier.attacksPerRound,
    attackBonus: tier.attackBonus,
    avgDamagePerHit: tier.avgDamagePerHit,
    saveBonuses: { ...tier.saveBonuses },
    initiativeMod: tier.saveBonuses.dex,
    speedCells: Math.round((TEMPLATE_SPEED_FT[template.id] ?? 30) / 5),
    rangeCells: Math.max(1, Math.round((TEMPLATE_RANGE_FT[template.id] ?? 5) / 5)),
  };

  if (tier.spellDc) player.spellDc = tier.spellDc;
  if (tier.avgSpellDamagePerRound) player.avgSpellDamagePerRound = tier.avgSpellDamagePerRound;
  if (tier.healingPerRound) player.healingPerRound = tier.healingPerRound;
  if (tier.special) player.special = { ...tier.special };

  if (config.overrides) {
    Object.assign(player, config.overrides);
  }

  return player;
}

/** Default party composition when the DM hasn't configured one. */
export function defaultPartyConfig(size: number, level: number): PartyMemberConfig[] {
  const rotation = ['fighter-champion', 'cleric-life', 'rogue-thief', 'wizard-evoker'];
  return Array.from({ length: size }, (_, i) => ({
    name: `Player ${i + 1}`,
    templateId: rotation[i % rotation.length],
    level,
  }));
}

/**
 * Keep the forecast party aligned with the encounter builder's party controls.
 * Existing names, class templates, and explicit overrides are preserved; the
 * shared level is applied to every member and missing members use defaults.
 */
export function syncPartyConfigMembers(
  members: PartyMemberConfig[],
  size: number,
  level: number,
): PartyMemberConfig[] {
  const normalizedSize = Math.max(1, Math.min(10, Math.round(size)));
  const normalizedLevel = Math.max(1, Math.min(20, Math.round(level)));
  const defaults = defaultPartyConfig(normalizedSize, normalizedLevel);

  return defaults.map((fallback, index) => {
    const existing = members[index];
    return existing ? { ...existing, level: normalizedLevel } : fallback;
  });
}
