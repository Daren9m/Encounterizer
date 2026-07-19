// ─── Curated Effect Summaries ────────────────────────────────────
// Hand-maintained overrides for the generated spell data — this file is
// NOT auto-generated; edit freely. Keys are spell ids from the generated
// src/data/spells-*.ts files; scripts/import-spells.ts layers these over
// its synthesized summaries at import time (re-run `npm run import:spells`
// after editing). Keep entries mechanics-first, one line, and accurate to
// the SRD 5.2.1 (2024) rules text — the verbatim description renders
// directly beneath the summary, so drift is visible at the table.
//
// Seeded from the original hand-written spell reference. Six entries were
// corrected during seeding where the 2014-era wording no longer matched
// the 2024 rules: guidance, sleep, counterspell, spiritual-weapon,
// banishment, power-word-kill.

export const SPELL_SUMMARY_OVERRIDES: Record<string, string> = {
  // ── Cantrips ──
  'fire-bolt': '1d10 fire damage (ranged spell attack). Scales: 2d10 at 5th, 3d10 at 11th, 4d10 at 17th.',
  'eldritch-blast': '1d10 force damage per beam (ranged spell attack). Extra beams at 5th (2), 11th (3), 17th (4).',
  'sacred-flame': '1d8 radiant damage (DEX save negates). No benefit from cover. Scales at 5th/11th/17th.',
  'mage-hand': 'Spectral hand that can manipulate objects, open doors, or retrieve items up to 10 lbs within 30 ft.',
  'prestidigitation': 'Minor magical trick: light/snuff flame, clean/soil object, warm/cool/flavor, color/mark, trinket/illusion. Up to 3 effects active.',
  'guidance': 'Choose a skill: target adds 1d4 to ability checks using that skill until the spell ends. Concentration.',
  'light': 'Object sheds bright light 20 ft + dim light 20 ft. DEX save for hostile creature holding it.',
  // ── 1st Level ──
  'magic-missile': '3 darts, each dealing 1d4+1 force damage. Auto-hit (no attack roll). Can split targets.',
  'shield': '+5 AC until start of your next turn (including vs triggering attack). Blocks Magic Missile.',
  'healing-word': 'Heal 2d4 + spellcasting mod HP at range. Bonus action.',
  'cure-wounds': 'Heal 2d8 + spellcasting mod HP. Touch range. Action.',
  'detect-magic': 'Sense magic within 30 ft. Action to see aura and learn school. Blocked by 1 ft stone, 1 inch metal, thin lead.',
  'thunderwave': '2d8 thunder damage in 15-ft cube (CON save half). Failed save also pushed 10 ft. Audible 300 ft.',
  'sleep': 'Each creature in 5-ft radius makes WIS save or is Incapacitated, then Unconscious on a failed repeat save. Ends on damage or action to wake.',
  'command': 'One-word command (Approach, Drop, Flee, Grovel, Halt). WIS save or obeys on its next turn.',
  // ── 2nd Level ──
  'hold-person': 'Target humanoid paralyzed (WIS save). Repeat save end of each turn. Attacks within 5 ft auto-crit.',
  'misty-step': 'Teleport 30 ft to visible unoccupied space. Bonus action, verbal only.',
  'spiritual-weapon': 'Floating weapon: bonus action melee spell attack for 1d8 + spellcasting mod force damage. Move 20 ft/turn. Concentration.',
  'scorching-ray': '3 rays, each 2d6 fire damage (ranged spell attack). Can target same or different creatures.',
  // ── 3rd Level ──
  'fireball': '8d6 fire damage in 20-ft radius (DEX save half). Ignites flammable objects. Spreads around corners.',
  'lightning-bolt': '8d6 lightning damage in 100-ft line (DEX save half). Ignites flammable objects.',
  'counterspell': 'Interrupt a spell being cast: the caster makes a CON save or the spell fails (its slot is not expended).',
  'dispel-magic': 'End one spell on target. Auto-succeeds vs spells of same level or lower. Higher: ability check DC 10 + spell level.',
  'spirit-guardians': '3d8 radiant/necrotic damage to hostiles entering or starting turn in 15-ft emanation (WIS save half). Halves speed.',
  'revivify': 'Creature dead <1 minute returns to life with 1 HP. Doesn\'t restore missing body parts. Costs 300 GP diamond.',
  // ── 4th Level ──
  'banishment': 'CHA save or banished to a harmless demiplane (Incapacitated). Aberrations/Celestials/Elementals/Fey/Fiends don\'t return if it lasts 1 minute.',
  'dimension-door': 'Teleport self + 1 willing creature to a spot within 500 ft. Can describe destination or give distance/direction.',
  'polymorph': 'Transform creature into beast of CR ≤ target\'s level (or CR). New HP pool. Reverts at 0 HP. Unwilling: WIS save.',
  // ── 5th Level ──
  'wall-of-force': 'Invisible, indestructible wall. 10 panels (10x10 ft each) or dome/sphere. Nothing passes through. Disintegrate destroys it.',
  'raise-dead': 'Dead creature (≤10 days) returns to life with 1 HP. -4 penalty to all d20 rolls, reduced by 1 per long rest. Costs 500 GP diamond.',
  // ── 6th+ Level ──
  'disintegrate': '10d6+40 force damage (DEX save negates entirely). Disintegrates target if reduced to 0 HP. Destroys force objects.',
  'wish': 'Duplicate any 8th-level or lower spell. Or state a wish — DM determines outcome. Risk: 33% chance of never casting Wish again.',
  'power-word-kill': 'If target has 100 HP or fewer, it dies (no save, no attack roll). Otherwise it takes 12d12 psychic damage.',
};
