import { ALL_MONSTERS } from '../../src/data';
import { BACKGROUNDS } from '../../src/data/backgrounds';
import { BESTIARY_META } from '../../src/data/bestiary-meta';
import { FEATS } from '../../src/data/feats';
import { FEATS_META } from '../../src/data/feats-meta';
import { MAGIC_ITEMS } from '../../src/data/magic-items';
import { MAGIC_ITEMS_META } from '../../src/data/magic-items-meta';
import { ORIGINS_META } from '../../src/data/origins-meta';
import { SPECIES } from '../../src/data/species';
import { SRD_SPELLS } from '../../src/data/spells';
import { SPELLS_META } from '../../src/data/spells-meta';
import { slugifySrdName } from './parse-entry';
import { SRD_REFORGED_REPOSITORY, SRD_REFORGED_SHA } from './source';

const EXPECTED = {
  monsters: 331,
  spells: 339,
  magicItems: 257,
  feats: 17,
  backgrounds: 4,
  species: 9,
} as const;

const LEGACY_SPELL_IDS = [
  'fire-bolt', 'eldritch-blast', 'sacred-flame', 'mage-hand', 'prestidigitation', 'guidance', 'light',
  'magic-missile', 'shield', 'healing-word', 'cure-wounds', 'detect-magic', 'thunderwave', 'sleep', 'command',
  'hold-person', 'misty-step', 'spiritual-weapon', 'scorching-ray', 'fireball', 'lightning-bolt',
  'counterspell', 'dispel-magic', 'spirit-guardians', 'revivify', 'banishment', 'dimension-door',
  'polymorph', 'wall-of-force', 'raise-dead', 'disintegrate', 'wish', 'power-word-kill',
] as const;

const MARKDOWN_RESIDUE = /\{@|\[object Object\]|[*`]|\[[^\]]+\]\([^)]+\)|^#{1,6}\s|^\s*\|/m;
const OCR_ABILITY_RESIDUE = /\b(?:S\s+tr|D\s+ex|C\s+on|I\s+nt|W\s+is|C\s+ha)\s+[+-]?\d/i;

export interface SrdAuditFailure {
  entry: string;
  problem: string;
}

export function auditSrdContent(): SrdAuditFailure[] {
  const failures: SrdAuditFailure[] = [];
  const fail = (entry: string, problem: string) => failures.push({ entry, problem });
  const count = (label: keyof typeof EXPECTED, actual: number) => {
    if (actual !== EXPECTED[label]) fail('(aggregate)', `${label}: ${actual} !== ${EXPECTED[label]}`);
  };

  count('monsters', ALL_MONSTERS.length);
  count('spells', SRD_SPELLS.length);
  count('magicItems', MAGIC_ITEMS.length);
  count('feats', FEATS.length);
  count('backgrounds', BACKGROUNDS.length);
  count('species', SPECIES.length);

  if (BESTIARY_META.count !== EXPECTED.monsters) fail('(meta)', 'bestiary count is stale');
  if (SPELLS_META.count !== EXPECTED.spells) fail('(meta)', 'spell count is stale');
  if (MAGIC_ITEMS_META.count !== EXPECTED.magicItems) fail('(meta)', 'magic-item count is stale');
  if (FEATS_META.count !== EXPECTED.feats) fail('(meta)', 'feat count is stale');
  if (ORIGINS_META.count !== EXPECTED.backgrounds + EXPECTED.species) fail('(meta)', 'origin count is stale');
  for (const meta of [MAGIC_ITEMS_META, FEATS_META, ORIGINS_META]) {
    if (meta.sourceRepository !== SRD_REFORGED_REPOSITORY) fail('(meta)', 'unexpected SRD-reForged repository');
    if (meta.sourceCommit !== SRD_REFORGED_SHA) fail('(meta)', 'unexpected SRD-reForged commit');
  }

  const collections: Array<[string, Array<{ id: string; name: string }>, boolean]> = [
    ['monster', ALL_MONSTERS, false],
    ['spell', SRD_SPELLS, false],
    ['magic item', MAGIC_ITEMS, true],
    ['feat', FEATS, true],
    ['background', BACKGROUNDS, true],
    ['species', SPECIES, true],
  ];
  for (const [label, entries, enforceGeneratedSlug] of collections) {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const entry of entries) {
      if (ids.has(entry.id)) fail(entry.name, `duplicate ${label} id ${entry.id}`);
      if (names.has(entry.name)) fail(entry.name, `duplicate ${label} name`);
      ids.add(entry.id);
      names.add(entry.name);
      if (enforceGeneratedSlug && entry.id !== slugifySrdName(entry.name)) {
        fail(entry.name, `unstable slug ${entry.id}`);
      }
    }
  }

  const spellIds = new Set(SRD_SPELLS.map((spell) => spell.id));
  for (const legacyId of LEGACY_SPELL_IDS) {
    if (!spellIds.has(legacyId)) fail('(legacy spell IDs)', `missing ${legacyId}`);
  }
  if (!spellIds.has('summon-dragon')) {
    fail('Summon Dragon', 'missing; the official SRD 5.2.1 index and PDF include this spell');
  }

  const auditText = (entry: string, field: string, value: string) => {
    if (!value.trim()) fail(entry, `${field} is empty`);
    if (MARKDOWN_RESIDUE.test(value)) fail(entry, `${field} contains Markdown or converter residue`);
    if (OCR_ABILITY_RESIDUE.test(value)) fail(entry, `${field} contains an unrepaired OCR ability label`);
  };

  for (const item of MAGIC_ITEMS) {
    auditText(item.name, 'description', item.description);
    if (item.rarities.length === 0) fail(item.name, 'rarities is empty');
    if (!item.category) fail(item.name, 'category is empty');
  }
  for (const feat of FEATS) auditText(feat.name, 'description', feat.description);
  for (const background of BACKGROUNDS) {
    for (const [field, value] of Object.entries({
      feat: background.feat,
      toolProficiency: background.toolProficiency,
      equipment: background.equipment,
    })) auditText(background.name, field, value);
    if (background.abilityScores.length !== 3) fail(background.name, 'must provide exactly three ability scores');
    if (background.skillProficiencies.length !== 2) fail(background.name, 'must provide exactly two skill proficiencies');
    if (background.description) auditText(background.name, 'description', background.description);
  }
  for (const species of SPECIES) {
    auditText(species.name, 'creatureType', species.creatureType);
    auditText(species.name, 'size', species.size);
    auditText(species.name, 'description', species.description);
    if (!(species.speed > 0)) fail(species.name, 'speed must be positive');
    if (species.traits.length === 0) fail(species.name, 'traits is empty');
    for (const trait of species.traits) {
      auditText(species.name, `trait ${trait.name}`, trait.description);
    }
  }

  const item = (id: string) => MAGIC_ITEMS.find((candidate) => candidate.id === id);
  if (!item('cubic-gate')?.rarities.includes('Legendary')) fail('Cubic Gate', 'known source repair was not applied');
  if (item('dragon-slayer')?.description.includes('sneezing')) fail('Dragon Slayer', 'page-boundary residue remains');
  if (item('mirror-of-life-trapping')?.description.toLowerCase().includes('mithral')) {
    fail('Mirror of Life Trapping', 'page-boundary residue remains');
  }
  if (!item('potion-of-poison')?.rarities.includes('Uncommon')) fail('Potion of Poison', 'known source repair was not applied');
  if (item('staff-of-the-python')?.description.includes('grants a +2 bonus')) {
    fail('Staff of the Python', 'Staff of Power residue remains');
  }

  return failures;
}

function main(): void {
  const failures = auditSrdContent();
  if (failures.length > 0) {
    console.error(`SRD AUDIT FAILED — ${failures.length} problem(s):`);
    for (const failure of failures) console.error(`  ${failure.entry}: ${failure.problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `SRD audit passed: ${EXPECTED.monsters} monsters, ${EXPECTED.spells} spells, `
      + `${EXPECTED.magicItems} magic items, ${EXPECTED.feats} feats, `
      + `${EXPECTED.backgrounds} backgrounds, ${EXPECTED.species} species.`,
  );
}

main();
