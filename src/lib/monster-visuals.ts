import type { Monster } from '@/lib/types';
import { formatMonsterSize } from '@/lib/monster-size';

export const MONSTER_VISUAL_SCHEMA_VERSION = 1;
export const MONSTER_IMAGE_PROMPT_VERSION = 1;

export const PILOT_MONSTER_IDS = [
  'aboleth',
  'bat',
  'couatl',
  'animated-armor',
  'red-dragon-wyrmling',
  'fire-elemental',
  'goblin-warrior',
  'imp',
  'fire-giant',
  'bandit',
  'owlbear',
  'gelatinous-cube',
  'awakened-shrub',
  'ghost',
] as const;

export const MONSTER_ART_BIBLE = {
  id: 'encounterizer-bestiary-v1',
  promptVersion: MONSTER_IMAGE_PROMPT_VERSION,
  taxonomy: 'stylized-concept',
  assetType: 'fantasy bestiary website portrait',
  aspectRatio: '4:5 portrait',
  style:
    'original cinematic painterly dark-fantasy realism, readable anatomy, tactile materials, restrained detail, no imitation of a named artist',
  composition:
    'one creature, full body visible, centered three-quarter view, strong readable silhouette, breathing room around every extremity',
  lighting:
    'soft directional key light with restrained warm rim light, clear values at thumbnail size',
  background:
    'subdued atmospheric habitat vignette, secondary to the creature, no busy storytelling elements',
  universalAvoid: [
    'text, lettering, captions, logos, watermarks, borders, UI elements',
    'multiple creatures, duplicate limbs, cropped anatomy, obscured face',
    'modern objects unless explicitly required by the approved description',
    'graphic gore, comedy caricature, chibi proportions',
  ],
} as const;

export type VisualConfidence = 'unverified' | 'reference-derived' | 'verified';
export type VisualReviewStatus = 'pending' | 'approved' | 'needs-revision';
export type VisualImageStatus = 'blocked' | 'ready' | 'draft' | 'approved' | 'needs-revision';

export interface MonsterVisualRecord {
  monsterId: string;
  monsterName: string;
  sourceFacts: string[];
  appearance: string;
  silhouette: string;
  materials: string[];
  pose: string;
  palette: string[];
  mustInclude: string[];
  mustAvoid: string[];
  environment: string;
  altText: string;
  confidence: VisualConfidence;
  reviewStatus: VisualReviewStatus;
  imageStatus: VisualImageStatus;
  promptVersion: number;
  inputHash: string;
}

export interface MonsterVisualDataset {
  schemaVersion: number;
  promptVersion: number;
  artBibleId: string;
  source: {
    work: string;
    creator: string;
    sourceUrl: string;
    license: 'CC-BY-4.0';
    licenseUrl: string;
    sourceCommit: string;
  };
  records: MonsterVisualRecord[];
}

export interface MonsterPhysicalDescriptionDataset {
  schemaVersion: number;
  sourceCommit: string;
  descriptions: Record<string, string>;
}

export interface MonsterVisualBatch {
  id: string;
  label: string;
  count: number;
  monsterIds: string[];
}

export interface MonsterVisualBatchManifest {
  schemaVersion: number;
  algorithm: string;
  totalMonsters: number;
  batches: MonsterVisualBatch[];
}

function compareMonsters(a: Monster, b: Monster): number {
  if (a.challengeRating !== b.challengeRating) {
    return a.challengeRating - b.challengeRating;
  }
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return 0;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function fnv1a32(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function visualInputFor(monster: Monster): object {
  return {
    promptVersion: MONSTER_IMAGE_PROMPT_VERSION,
    artBibleId: MONSTER_ART_BIBLE.id,
    id: monster.id,
    name: monster.name,
    size: formatMonsterSize(monster),
    type: monster.type,
    subtype: monster.subtype ?? null,
    armorSource: monster.armor.source ?? null,
    movementModes: sortedUnique(monster.movementModes),
    environments: sortedUnique(monster.environments),
    attackDamageTypes: sortedUnique(monster.attackDamageTypes),
    tags: sortedUnique(monster.tags),
    actionNames: sortedUnique([
      ...monster.actions.map((action) => action.name),
      ...(monster.bonusActions ?? []).map((action) => action.name),
      ...(monster.reactions ?? []).map((action) => action.name),
      ...(monster.specialAbilities ?? []).map((action) => action.name),
      ...(monster.legendary?.actions ?? []).map((action) => action.name),
      ...(monster.mythic ?? []).map((action) => action.name),
      ...(monster.lair ?? []).map((action) => action.name),
    ]),
  };
}

export function visualInputHash(monster: Monster): string {
  return fnv1a32(JSON.stringify(visualInputFor(monster)));
}

export function deriveSourceFacts(monster: Monster): string[] {
  const facts = [
    `Size: ${formatMonsterSize(monster)}.`,
    `Creature type: ${monster.type}${monster.subtype ? ` (${monster.subtype})` : ''}.`,
  ];

  if (monster.armor.source) facts.push(`Armor source: ${monster.armor.source}.`);
  if (monster.movementModes.length > 0) {
    facts.push(`Movement modes: ${sortedUnique(monster.movementModes).join(', ')}.`);
  }
  if (monster.environments.length > 0) {
    facts.push(`Listed environments: ${sortedUnique(monster.environments).join(', ')}.`);
  }
  if (monster.attackDamageTypes.length > 0) {
    facts.push(`Attack damage types: ${sortedUnique(monster.attackDamageTypes).join(', ')}.`);
  }
  return facts;
}

export function createPendingVisualRecord(monster: Monster): MonsterVisualRecord {
  return {
    monsterId: monster.id,
    monsterName: monster.name,
    sourceFacts: deriveSourceFacts(monster),
    appearance: '',
    silhouette: '',
    materials: [],
    pose: '',
    palette: [],
    mustInclude: [],
    mustAvoid: [],
    environment: '',
    altText: '',
    confidence: 'reference-derived',
    reviewStatus: 'pending',
    imageStatus: 'blocked',
    promptVersion: MONSTER_IMAGE_PROMPT_VERSION,
    inputHash: visualInputHash(monster),
  };
}

export function createBatchManifest(monsters: readonly Monster[]): MonsterVisualBatchManifest {
  if (new Set(monsters.map((monster) => monster.id)).size !== monsters.length) {
    throw new Error('Bestiary contains duplicate monster IDs.');
  }
  const byId = new Map(monsters.map((monster) => [monster.id, monster]));
  const missingPilot = PILOT_MONSTER_IDS.filter((id) => !byId.has(id));
  if (missingPilot.length > 0) {
    throw new Error(`Pilot monsters not found: ${missingPilot.join(', ')}`);
  }

  const pilotIds = new Set<string>(PILOT_MONSTER_IDS);
  const remaining = monsters.filter((monster) => !pilotIds.has(monster.id)).sort(compareMonsters);
  const batchSizes = [...Array(9).fill(29), 28, 28];
  let offset = 0;
  const productionBatches = batchSizes.map((count, index) => {
    const assigned = remaining.slice(offset, offset + count);
    offset += count;
    return {
      id: `production-${String(index + 1).padStart(2, '0')}`,
      label: `Production batch ${index + 1}`,
      count: assigned.length,
      monsterIds: assigned.map((monster) => monster.id),
    };
  });

  if (offset !== remaining.length) {
    throw new Error(
      `Batch algorithm expects 317 non-pilot monsters but found ${remaining.length}. Update the batch plan intentionally.`,
    );
  }

  return {
    schemaVersion: MONSTER_VISUAL_SCHEMA_VERSION,
    algorithm: 'fixed 14-monster pilot; remaining monsters sorted by CR, name, and id; 9x29 then 2x28',
    totalMonsters: monsters.length,
    batches: [
      {
        id: 'pilot',
        label: '14-type style pilot',
        count: PILOT_MONSTER_IDS.length,
        monsterIds: [...PILOT_MONSTER_IDS],
      },
      ...productionBatches,
    ],
  };
}

function requiredApprovedFields(record: MonsterVisualRecord): string[] {
  const missing: string[] = [];
  if (!record.appearance.trim()) missing.push('appearance');
  if (!record.silhouette.trim()) missing.push('silhouette');
  if (!record.pose.trim()) missing.push('pose');
  if (record.palette.length === 0) missing.push('palette');
  if (!record.altText.trim()) missing.push('altText');
  return missing;
}

export function validateMonsterVisualCoverage(
  monsters: readonly Monster[],
  records: readonly MonsterVisualRecord[],
): string[] {
  const errors: string[] = [];
  const monstersById = new Map(monsters.map((monster) => [monster.id, monster]));
  const seen = new Set<string>();

  for (const record of records) {
    if (seen.has(record.monsterId)) errors.push(`Duplicate visual record: ${record.monsterId}`);
    seen.add(record.monsterId);
    const monster = monstersById.get(record.monsterId);
    if (!monster) {
      errors.push(`Orphaned visual record: ${record.monsterId}`);
      continue;
    }
    if (record.monsterName !== monster.name) errors.push(`Name mismatch: ${record.monsterId}`);
    if (record.inputHash !== visualInputHash(monster)) errors.push(`Stale visual record: ${record.monsterId}`);
    if (record.promptVersion !== MONSTER_IMAGE_PROMPT_VERSION) {
      errors.push(`Stale prompt version: ${record.monsterId}`);
    }
    if (record.reviewStatus === 'approved') {
      const missing = requiredApprovedFields(record);
      if (missing.length > 0) errors.push(`Approved record ${record.monsterId} is missing: ${missing.join(', ')}`);
    }
  }

  for (const monster of monsters) {
    if (!seen.has(monster.id)) errors.push(`Missing visual record: ${monster.id}`);
  }
  return errors;
}

export function compileMonsterImagePrompt(monster: Monster, record: MonsterVisualRecord): string {
  if (record.monsterId !== monster.id) throw new Error('Monster and visual record IDs do not match.');
  if (record.inputHash !== visualInputHash(monster)) throw new Error(`Visual record is stale: ${monster.id}`);
  if (record.reviewStatus !== 'approved') throw new Error(`Visual description is not approved: ${monster.id}`);
  const missing = requiredApprovedFields(record);
  if (missing.length > 0) throw new Error(`Approved visual record is incomplete: ${missing.join(', ')}`);

  const materials = record.materials.length > 0 ? record.materials.join(', ') : 'as described above';
  const environment = record.environment.trim() || MONSTER_ART_BIBLE.background;
  const mustInclude = record.mustInclude.length > 0 ? record.mustInclude.join('; ') : 'approved anatomy and silhouette';
  const avoid = [...MONSTER_ART_BIBLE.universalAvoid, ...record.mustAvoid].join('; ');

  return [
    `Create a ${MONSTER_ART_BIBLE.taxonomy} ${MONSTER_ART_BIBLE.assetType} of ${monster.name}.`,
    `Subject: ${record.appearance}`,
    `Silhouette: ${record.silhouette}`,
    `Materials and surface detail: ${materials}.`,
    `Pose and expression: ${record.pose}`,
    `Environment: ${environment}.`,
    `Style: ${MONSTER_ART_BIBLE.style}.`,
    `Composition: ${MONSTER_ART_BIBLE.composition}; ${MONSTER_ART_BIBLE.aspectRatio}.`,
    `Lighting: ${MONSTER_ART_BIBLE.lighting}.`,
    `Palette: ${record.palette.join(', ')}.`,
    `Must include: ${mustInclude}.`,
    `Avoid: ${avoid}.`,
  ].join('\n');
}
