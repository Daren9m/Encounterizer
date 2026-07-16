// ─── 5etools Spell Converter (SRD 5.2.1) ─────────────────────────
// Converts raw 5etools 2024 spell JSON (data/spells/spells-xphb.json) into
// the app's Spell shape. Pure functions — no I/O, no DOM — consumed by
// scripts/import-spells.ts. Tag stripping and slugification are shared with
// the bestiary converter so spell text and monster text render identically.

import { entriesToText, stripTags, slugifyMonsterName } from './import-5etools';
import type { FiveEToolsSpell, FiveEToolsSpellDuration, FiveEToolsSpellRange } from './types';
import type { Spell, SpellSchool } from '../data/spells';

export interface SpellConvertOptions {
  /** Value for every converted spell's `source` field, e.g. 'SRD 5.2.1' */
  source: string;
  /** Raw (pre-rename) spell name → class names, built from data/spells/sources.json */
  classesByOriginalName: Map<string, string[]>;
  /** Curated effectSummary overrides keyed by spell id (src/data/spell-summaries.ts) */
  summaryOverrides?: Record<string, string>;
}

export function slugifySpellName(name: string): string {
  return slugifyMonsterName(name);
}

// ─── Field Formatters ────────────────────────────────────────────

const SCHOOL_NAME: Record<string, SpellSchool> = {
  A: 'Abjuration',
  C: 'Conjuration',
  D: 'Divination',
  E: 'Enchantment',
  V: 'Evocation',
  I: 'Illusion',
  N: 'Necromancy',
  T: 'Transmutation',
};

const SAVE_ABBR: Record<string, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

/** Range types that describe a shape originating from the caster. */
const SHAPE_RANGE_TYPES = new Set(['emanation', 'cone', 'sphere', 'cube', 'line', 'hemisphere', 'radius']);

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function formatCastingTime(raw: FiveEToolsSpell): string {
  const t = raw.time[0];
  switch (t.unit) {
    case 'action': return 'Action';
    case 'bonus': return 'Bonus Action';
    case 'reaction': return 'Reaction';
    case 'minute': return t.number === 1 ? '1 Minute' : `${t.number} Minutes`;
    case 'hour': return t.number === 1 ? '1 Hour' : `${t.number} Hours`;
    default: return `${t.number} ${capitalize(t.unit)}`;
  }
}

function formatPointDistance(distance: { type: string; amount?: number }): string {
  switch (distance.type) {
    case 'feet': return `${distance.amount} ft`;
    case 'miles': return distance.amount === 1 ? '1 mile' : `${distance.amount} miles`;
    case 'touch': return 'Touch';
    case 'self': return 'Self';
    case 'sight': return 'Sight';
    case 'unlimited': return 'Unlimited';
    default: return 'Special';
  }
}

/** Shape ranges become range 'Self' with the shape expressed via `area`. */
function formatRange(range: FiveEToolsSpellRange): { range: string; shapeArea?: string } {
  if (SHAPE_RANGE_TYPES.has(range.type) && range.distance) {
    const unit = range.distance.type === 'miles' ? 'mile' : 'ft';
    return { range: 'Self', shapeArea: `${range.distance.amount}-${unit} ${range.type}` };
  }
  return { range: range.distance ? formatPointDistance(range.distance) : 'Special' };
}

// Best-effort area for point-range AoE spells (e.g. Fireball): pull the
// first shape mention out of the opening text. Misses are fine — `area`
// is optional and the shape is always described in the prose.
const AREA_PATTERN = /(\d+)-foot(-radius|-long|-wide|-high)?\s+(radius|sphere|cone|cube|line|cylinder|emanation|square|hemisphere|wall)/i;

function deriveAreaFromText(description: string): string | undefined {
  const openingText = description.split('\n\n').slice(0, 2).join(' ');
  const match = openingText.match(AREA_PATTERN);
  if (!match) return undefined;
  const [, size, qualifier, shape] = match;
  const q = qualifier === '-radius' ? ' radius' : '';
  return `${size}-ft${q} ${shape.toLowerCase()}`;
}

function formatComponents(raw: FiveEToolsSpell): string {
  const parts: string[] = [];
  if (raw.components.v) parts.push('V');
  if (raw.components.s) parts.push('S');
  const m = raw.components.m;
  if (m === true) parts.push('M');
  else if (m) parts.push(`M (${stripTags(typeof m === 'string' ? m : m.text)})`);
  return parts.join(', ');
}

function formatOneDuration(d: FiveEToolsSpellDuration): string {
  switch (d.type) {
    case 'instant': return 'Instantaneous';
    case 'special': return 'Special';
    case 'permanent': {
      if (d.ends?.includes('dispel')) {
        return d.ends.includes('trigger') ? 'Until dispelled or triggered' : 'Until dispelled';
      }
      return 'Permanent';
    }
    case 'timed': {
      if (!d.duration) return 'Special';
      const { type, amount, upTo } = d.duration;
      const label = `${amount} ${amount === 1 ? type : `${type}s`}`;
      return upTo ? `Up to ${label}` : label;
    }
    default: return 'Special';
  }
}

function formatDuration(raw: FiveEToolsSpell): string {
  return raw.duration.map(formatOneDuration).join(' or ');
}

function formatSaveType(raw: FiveEToolsSpell): string | undefined {
  if (!raw.savingThrow || raw.savingThrow.length === 0) return undefined;
  return raw.savingThrow.map((s) => SAVE_ABBR[s.toLowerCase()] ?? s.toUpperCase()).join(' or ');
}

function formatAttackType(raw: FiveEToolsSpell): 'melee' | 'ranged' | undefined {
  const code = raw.spellAttack?.[0];
  if (code === 'R') return 'ranged';
  if (code === 'M') return 'melee';
  return undefined;
}

function formatDamageType(raw: FiveEToolsSpell): string | undefined {
  if (!raw.damageInflict || raw.damageInflict.length === 0) return undefined;
  return raw.damageInflict.map(capitalize).join(', ');
}

function extractUpcast(raw: FiveEToolsSpell): string | undefined {
  if (!raw.entriesHigherLevel || raw.entriesHigherLevel.length === 0) return undefined;
  const text = raw.entriesHigherLevel
    .map((block) => stripTags(entriesToText(block.entries ?? [])))
    .join(' ')
    .trim();
  return text || undefined;
}

// ─── Description Flattening ─────────────────────────────────────
// Unlike entriesToText (tuned for monster action lines), this keeps
// paragraph identity: each returned string is one display paragraph.
// Lists and tables become single blocks with `\n` line breaks inside,
// rendered by the UI via whitespace-pre-line.

type RawEntry = string | { [key: string]: unknown };

function tableCellText(cell: unknown): string {
  if (typeof cell === 'string' || typeof cell === 'number') return String(cell);
  if (cell && typeof cell === 'object') {
    const roll = (cell as { roll?: { exact?: number; min?: number; max?: number } }).roll;
    if (roll) {
      if (roll.exact !== undefined) return String(roll.exact);
      if (roll.min !== undefined && roll.max !== undefined) return `${roll.min}–${roll.max}`;
    }
    const entry = cell as { type?: string; entry?: unknown };
    if (entry.entry) return tableCellText(entry.entry);
  }
  return '';
}

function tableToBlock(entry: { [key: string]: unknown }): string {
  const caption = typeof entry.caption === 'string' ? entry.caption : undefined;
  const colLabels = Array.isArray(entry.colLabels) ? (entry.colLabels as unknown[]).map(tableCellText) : [];
  const rows = Array.isArray(entry.rows) ? (entry.rows as unknown[][]) : [];
  const lines: string[] = [];
  if (caption) lines.push(caption);
  if (colLabels.length > 2 || (!caption && colLabels.length > 0)) lines.push(colLabels.join(' | '));
  for (const row of rows) {
    const cells = row.map(tableCellText);
    lines.push(colLabels.length === 2 ? `${cells[0]}: ${cells.slice(1).join(' ')}` : cells.join(' | '));
  }
  return lines.join('\n');
}

function listToBlock(entry: { [key: string]: unknown }): string {
  const items = Array.isArray(entry.items) ? (entry.items as RawEntry[]) : [];
  const lines = items.map((item) => {
    if (typeof item === 'string') return `- ${item}`;
    const name = typeof item.name === 'string' ? item.name : undefined;
    const body = Array.isArray(item.entries)
      ? entriesToText(item.entries)
      : typeof item.entry === 'string' ? item.entry : entriesToText(item.entry);
    return name ? `- ${name}: ${body}` : `- ${body}`;
  });
  return lines.join('\n');
}

export function entriesToParagraphs(entries: unknown): string[] {
  if (!Array.isArray(entries)) return typeof entries === 'string' ? [entries] : [];
  const paragraphs: string[] = [];
  for (const entry of entries as RawEntry[]) {
    if (typeof entry === 'string') {
      paragraphs.push(entry);
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    if (entry.type === 'table') {
      const block = tableToBlock(entry);
      if (block) paragraphs.push(block);
      continue;
    }
    if (entry.type === 'list') {
      const block = listToBlock(entry);
      if (block) paragraphs.push(block);
      continue;
    }
    if (Array.isArray(entry.entries)) {
      const sub = entriesToParagraphs(entry.entries);
      const name = typeof entry.name === 'string' ? entry.name : undefined;
      if (name && sub.length > 0) sub[0] = `${name}: ${sub[0]}`;
      else if (name && sub.length === 0) sub.push(name);
      paragraphs.push(...sub);
      continue;
    }
    const fallback = entriesToText([entry]);
    if (fallback) paragraphs.push(fallback);
  }
  return paragraphs;
}

/** Reaction triggers read "which you take when ..." — surface as a Trigger line. */
function reactionTriggerParagraph(raw: FiveEToolsSpell): string | undefined {
  const condition = raw.time[0]?.condition;
  if (!condition) return undefined;
  const cleaned = stripTags(condition).replace(/^which you take,?\s*/i, '').trim();
  return cleaned ? `Trigger: ${cleaned}` : undefined;
}

function buildDescription(raw: FiveEToolsSpell): string {
  const paragraphs = entriesToParagraphs(raw.entries)
    .map((p) => stripTags(p).trim())
    .filter(Boolean);
  const trigger = reactionTriggerParagraph(raw);
  if (trigger) paragraphs.unshift(trigger);
  return paragraphs.join('\n\n');
}

// ─── Effect Summary ──────────────────────────────────────────────
// Layered: curated override → synthesized mechanics line → first sentence.
// Synthesis only claims success when it found damage or a condition;
// pure-utility spells read better as their own opening sentence.

const SUMMARY_MAX = 180;

function firstSentence(description: string): string {
  const firstBody = description.split('\n\n').find((p) => !p.startsWith('Trigger: ')) ?? '';
  const match = firstBody.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : firstBody).trim();
}

function truncate(text: string): string {
  if (text.length <= SUMMARY_MAX) return text;
  const cut = text.slice(0, SUMMARY_MAX - 1);
  return `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

export function synthesizeEffectSummary(
  raw: FiveEToolsSpell,
  converted: Pick<Spell, 'concentration'> & Partial<Pick<Spell, 'saveType' | 'attackType' | 'area'>>,
  description: string,
): string {
  const pieces: string[] = [];

  const dice = JSON.stringify(raw.entries).match(/\{@damage ([^}]+)\}/)?.[1];
  const damageTypes = (raw.damageInflict ?? []).map(capitalize).join('/');
  if (dice && damageTypes) {
    let clause = `${dice} ${damageTypes} damage`;
    if (converted.saveType) {
      const half = /half as much damage|Success:\s*Half damage/i.test(description);
      clause += ` (${converted.saveType} save${half ? ' half' : ''})`;
    } else if (converted.attackType) {
      clause += ` (${converted.attackType} spell attack)`;
    }
    if (converted.area) clause += ` in ${converted.area}`;
    pieces.push(`${clause}.`);
  }

  const conditions = (raw.conditionInflict ?? []).map(capitalize).join(', ');
  if (conditions) pieces.push(`Inflicts ${conditions}.`);

  if (pieces.length === 0) return '';

  if (converted.concentration) pieces.push('Concentration.');

  const scalingRaw = Array.isArray(raw.scalingLevelDice) ? raw.scalingLevelDice[0] : raw.scalingLevelDice;
  if (raw.level === 0 && scalingRaw?.scaling) {
    const steps = ['5', '11', '17']
      .filter((l) => scalingRaw.scaling[l])
      .map((l) => `${scalingRaw.scaling[l]} at ${l}th`);
    if (steps.length > 0) pieces.push(`Scales: ${steps.join(', ')}.`);
  }

  return pieces.join(' ');
}

// ─── Conversion ──────────────────────────────────────────────────

export function convert5eToolsSpell(raw: FiveEToolsSpell, opts: SpellConvertOptions): Spell {
  const name = typeof raw.srd52 === 'string' ? raw.srd52 : raw.name;
  const id = slugifySpellName(name);

  const school = SCHOOL_NAME[raw.school];
  if (!school) throw new Error(`${raw.name}: unknown school code '${raw.school}'`);

  const { range, shapeArea } = formatRange(raw.range);
  const description = buildDescription(raw);
  const area = shapeArea
    ?? ((raw.areaTags?.length ?? 0) > 0 ? deriveAreaFromText(description) : undefined);

  const saveType = formatSaveType(raw);
  const attackType = formatAttackType(raw);
  const damageType = formatDamageType(raw);
  const upcast = extractUpcast(raw);
  const concentration = raw.duration.some((d) => d.concentration === true);

  const effectSummary = opts.summaryOverrides?.[id]
    ?? truncate(
      synthesizeEffectSummary(raw, { concentration, saveType, attackType, area }, description)
        || firstSentence(description),
    );

  return {
    id,
    name,
    level: raw.level,
    school,
    castingTime: formatCastingTime(raw),
    range,
    ...(area ? { area } : {}),
    components: formatComponents(raw),
    duration: formatDuration(raw),
    concentration,
    ritual: raw.meta?.ritual === true,
    ...(saveType ? { saveType } : {}),
    ...(attackType ? { attackType } : {}),
    ...(damageType ? { damageType } : {}),
    effectSummary,
    ...(upcast ? { upcast } : {}),
    classes: [...(opts.classesByOriginalName.get(raw.name) ?? [])].sort(),
    description,
    source: opts.source,
  };
}

export function import5eToolsSpells(
  json: { spell: FiveEToolsSpell[] },
  opts: SpellConvertOptions,
): Spell[] {
  return json.spell.map((raw) => convert5eToolsSpell(raw, opts));
}
