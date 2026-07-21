import type {
  Background,
  Feat,
  FeatCategory,
  MagicItem,
  MagicItemCategory,
  MagicItemRarity,
  Species,
  SpeciesTrait,
} from '../../src/lib/srd-content-types';
import { SRD_DOCUMENT } from '../../src/lib/srd-content-types';
import { markdownToPlainText, parseSrdEntry, slugifySrdName } from './parse-entry';

/**
 * The pinned upstream is a Markdown transcription of a PDF and contains five
 * known page-boundary errors in the magic-item split files. Keep the repairs
 * explicit, narrow, and audited rather than teaching the generic parser to
 * guess at malformed entries.
 */
export function repairKnownSourceDefects(path: string, markdown: string): string {
  const file = path.replace(/\\/g, '/').split('/').at(-1);
  const normalized = markdown.replace(/\r\n?/g, '\n');
  switch (file) {
    case 'Cubic_Gate.md':
      return normalized.replace('# Cubic Gate\n\n', '# Cubic Gate\n\n*Wondrous Item, Legendary*\n\n');
    case 'Dragon_Slayer.md':
      return normalized.replace(
        /# Dragon Slayer\n\nOn a failed save,[\s\S]*?Lesser Restoration\* spell\.\n\n/,
        '# Dragon Slayer\n\n',
      );
    case 'Mirror_of_Life_Trapping.md':
      return normalized
        .replace(
          /\*Wondrous Item, Very Rare\* armor normally imposes[^\n]+/,
          '*Wondrous Item, Very Rare*',
        )
        .replace(/\n\n\| Mithral Armor[\s\S]*$/, '');
    case 'Potion_of_Poison.md':
      return normalized.replace('# Potion of Poison\n\n', '# Potion of Poison\n\n*Potion, Uncommon*\n\n');
    case 'Staff_of_the_Python.md':
      return normalized.replace(
        /\*Staff, Uncommon \(Requires Attunement\)\* magic Quarterstaff[^\n]+/,
        '*Staff, Uncommon (Requires Attunement)*',
      );
    default:
      return normalized;
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function requireField(fields: Record<string, string>, name: string, entryName: string): string {
  const value = fields[name]?.trim();
  if (!value) throw new Error(`${entryName}: missing required field "${name}".`);
  return value;
}

const MAGIC_CATEGORIES: MagicItemCategory[] = [
  'Wondrous Item', 'Armor', 'Potion', 'Ring', 'Rod', 'Scroll', 'Staff', 'Wand', 'Weapon',
];

export function convertMagicItem(path: string, rawMarkdown: string): MagicItem {
  const entry = parseSrdEntry(repairKnownSourceDefects(path, rawMarkdown));
  if (!entry.subtitle) throw new Error(`${entry.name}: missing magic-item subtitle.`);

  const category = MAGIC_CATEGORIES.find((candidate) =>
    entry.subtitle!.startsWith(candidate),
  );
  if (!category) throw new Error(`${entry.name}: unknown magic-item category in "${entry.subtitle}".`);

  const categoryDetailMatch = entry.subtitle.match(
    new RegExp(`^${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(([^)]+)\\)`),
  );
  const categoryDetail = categoryDetailMatch?.[1];
  const attunementMatch = entry.subtitle.match(/\(Requires Attunement(?: by ([^)]+))?\)/);
  const categorySegment = categoryDetailMatch?.[0] ?? category;
  if (entry.subtitle.at(categorySegment.length) !== ',') {
    throw new Error(`${entry.name}: missing rarity separator in "${entry.subtitle}".`);
  }
  const rarityText = entry.subtitle
    .slice(categorySegment.length + 1)
    .replace(/\s*\(Requires Attunement(?: by [^)]+)?\)\s*$/, '')
    .trim();
  const rarityMatches = rarityText.match(/Rarity Varies|Very Rare|Uncommon|Common|Legendary|Artifact|Rare/g) ?? [];
  const rarities = unique(rarityMatches.map<MagicItemRarity>((rarity) =>
    rarity === 'Rarity Varies' ? 'Varies' : rarity as MagicItemRarity,
  ));
  if (rarities.length === 0) throw new Error(`${entry.name}: no recognized rarity in "${entry.subtitle}".`);
  if (!entry.description) throw new Error(`${entry.name}: empty magic-item description.`);

  return {
    id: slugifySrdName(entry.name),
    name: entry.name,
    category,
    ...(categoryDetail ? { categoryDetail } : {}),
    rarities,
    rarityText,
    requiresAttunement: Boolean(attunementMatch),
    ...(attunementMatch?.[1] ? { attunement: attunementMatch[1] } : {}),
    description: entry.description,
    source: SRD_DOCUMENT,
  };
}

export function convertFeat(path: string, rawMarkdown: string): Feat {
  const entry = parseSrdEntry(repairKnownSourceDefects(path, rawMarkdown));
  const match = entry.subtitle?.match(
    /^(Origin|General|Fighting Style|Epic Boon) Feat(?: \(Prerequisite: (.+)\))?$/,
  );
  if (!match) throw new Error(`${entry.name}: invalid feat subtitle "${entry.subtitle ?? ''}".`);
  if (!entry.description) throw new Error(`${entry.name}: empty feat description.`);

  return {
    id: slugifySrdName(entry.name),
    name: entry.name,
    category: match[1] as FeatCategory,
    ...(match[2] ? { prerequisite: match[2] } : {}),
    description: entry.description,
    source: SRD_DOCUMENT,
  };
}

function splitList(value: string): string[] {
  return value.split(/,\s*|\s+and\s+/).map((part) => part.trim()).filter(Boolean);
}

export function convertBackground(path: string, rawMarkdown: string): Background {
  const entry = parseSrdEntry(repairKnownSourceDefects(path, rawMarkdown));
  const feat = requireField(entry.fields, 'Feat', entry.name).replace(/\s+\(see "Feats"\)$/, '');
  return {
    id: slugifySrdName(entry.name),
    name: entry.name,
    abilityScores: splitList(requireField(entry.fields, 'Ability Scores', entry.name)),
    feat,
    skillProficiencies: splitList(requireField(entry.fields, 'Skill Proficiencies', entry.name)),
    toolProficiency: requireField(entry.fields, 'Tool Proficiency', entry.name),
    equipment: requireField(entry.fields, 'Equipment', entry.name),
    description: entry.description,
    source: SRD_DOCUMENT,
  };
}

function extractTraits(markdown: string): SpeciesTrait[] {
  const paragraphs = markdown.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const traits: SpeciesTrait[] = [];
  let current: SpeciesTrait | undefined;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed || /^#{2,6}\s/.test(trimmed)) {
      current = undefined;
      continue;
    }
    const match = trimmed.match(/^\*{2,3}([^*\n]+?)\.\*{2,3}\s*([\s\S]*)$/);
    if (match) {
      current = { name: markdownToPlainText(match[1]), description: markdownToPlainText(match[2]) };
      traits.push(current);
      continue;
    }
    if (current) {
      const continuation = markdownToPlainText(trimmed);
      if (continuation) current.description += `\n\n${continuation}`;
    }
  }
  return traits;
}

export function convertSpecies(path: string, rawMarkdown: string): Species {
  const repaired = repairKnownSourceDefects(path, rawMarkdown);
  const entry = parseSrdEntry(repaired);
  const speedText = requireField(entry.fields, 'Speed', entry.name);
  const speed = Number(speedText.match(/\d+/)?.[0]);
  if (!Number.isFinite(speed)) throw new Error(`${entry.name}: invalid Speed "${speedText}".`);
  const traits = extractTraits(repaired);
  if (traits.length === 0) throw new Error(`${entry.name}: no species traits parsed.`);

  return {
    id: slugifySrdName(entry.name),
    name: entry.name,
    creatureType: requireField(entry.fields, 'Creature Type', entry.name),
    size: requireField(entry.fields, 'Size', entry.name),
    speed,
    traits,
    description: entry.description,
    source: SRD_DOCUMENT,
  };
}
