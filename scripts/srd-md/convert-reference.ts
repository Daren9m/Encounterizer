import type {
  SrdClassEntry,
  SrdEquipmentCategory,
  SrdEquipmentFact,
  SrdEquipmentItem,
  SrdReferenceArticle,
  SrdRuleGroup,
  SrdTextSection,
} from '../../src/lib/srd-content-types';
import {
  markdownToPlainText,
  parseSrdEntry,
  slugifySrdName,
} from './parse-entry';

function sectionsFromMarkdown(markdown: string): SrdTextSection[] {
  return parseSrdEntry(markdown).sections
    .map((section) => ({ heading: section.heading, text: section.text }))
    .filter((section) => section.heading || section.text);
}

function firstUsefulText(sections: SrdTextSection[]): string {
  const text = sections
    .map((section) => section.text)
    .find((candidate) => candidate.trim().length > 0)
    ?.replace(/\s+/g, ' ')
    .trim() ?? '';
  if (text.length <= 180) return text;
  const sentence = text.match(/^.{40,177}?[.!?](?:\s|$)/)?.[0]?.trim();
  return sentence ?? `${text.slice(0, 177).trimEnd()}…`;
}

function articleId(group: SrdRuleGroup, name: string): string {
  return `${slugifySrdName(group)}-${slugifySrdName(name)}`;
}

function cargoCapacity(tons: string): string | undefined {
  if (!tons || tons === '-') return undefined;
  return `${tons} ${tons === '1' || tons === '1/2' ? 'ton' : 'tons'}`;
}

export function convertRuleEntry(markdown: string): SrdReferenceArticle {
  const parsed = parseSrdEntry(markdown);
  const sections = sectionsFromMarkdown(markdown);
  return {
    id: articleId('Rules Glossary', parsed.name),
    name: parsed.name,
    group: 'Rules Glossary',
    summary: firstUsefulText(sections),
    sections,
    source: 'SRD 5.2.1',
  };
}

export function convertChapterArticles(
  markdown: string,
  group: Exclude<SrdRuleGroup, 'Rules Glossary'>,
  excludedHeadings: readonly string[] = [],
): SrdReferenceArticle[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const articles: SrdReferenceArticle[] = [];
  let heading: string | undefined;
  let body: string[] = [];

  const flush = () => {
    if (!heading || excludedHeadings.includes(heading)) {
      body = [];
      return;
    }
    const entryMarkdown = [`# ${heading}`, ...body].join('\n');
    const sections = sectionsFromMarkdown(entryMarkdown);
    articles.push({
      id: articleId(group, heading),
      name: heading,
      group,
      summary: firstUsefulText(sections),
      sections,
      source: 'SRD 5.2.1',
    });
    body = [];
  };

  for (const line of lines) {
    const match = line.trim().match(/^##\s+(.+)$/);
    if (match) {
      flush();
      const nextHeading = markdownToPlainText(match[1]);
      if (excludedHeadings.includes(nextHeading)) {
        heading = undefined;
        break;
      }
      heading = nextHeading;
      continue;
    }
    if (heading) body.push(line);
  }
  flush();
  return articles;
}

export function convertClassFile(markdown: string): SrdClassEntry[] {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const className = parseSrdEntry(normalized).name;
  const subclassMatch = /^##\s+(.+?)\s+Subclass:\s+(.+)$/m.exec(normalized);
  if (!subclassMatch || subclassMatch.index === undefined) {
    throw new Error(`${className}: subclass heading is missing.`);
  }

  const classMarkdown = normalized.slice(0, subclassMatch.index).trim();
  const subclassBodyStart = subclassMatch.index + subclassMatch[0].length;
  const subclassName = markdownToPlainText(subclassMatch[2]);
  const subclassMarkdown = `# ${subclassName}\n${normalized.slice(subclassBodyStart).trim()}`;

  return [
    {
      id: slugifySrdName(className),
      name: className,
      kind: 'Class',
      className,
      summary: `Complete ${className} progression, core traits, and level 1–20 class features.`,
      sections: sectionsFromMarkdown(classMarkdown),
      source: 'SRD 5.2.1',
    },
    {
      id: slugifySrdName(subclassName),
      name: subclassName,
      kind: 'Subclass',
      className,
      summary: `${className} subclass with its complete SRD feature progression.`,
      sections: sectionsFromMarkdown(subclassMarkdown),
      source: 'SRD 5.2.1',
    },
  ];
}

interface MarkdownTable {
  headers: string[];
  rows: string[][];
}

function tableAfter(markdown: string, marker: string): MarkdownTable {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const markerIndex = lines.findIndex((line) => line.trim() === marker);
  if (markerIndex === -1) throw new Error(`Equipment table marker is missing: ${marker}`);
  const tableStart = lines.findIndex((line, index) => index > markerIndex && line.trim().startsWith('|'));
  if (tableStart === -1) throw new Error(`Equipment table is missing after: ${marker}`);

  const tableLines: string[] = [];
  for (let index = tableStart; index < lines.length; index++) {
    if (!lines[index].trim().startsWith('|')) break;
    tableLines.push(lines[index]);
  }
  const cells = (line: string) => line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => markdownToPlainText(cell));
  const headers = cells(tableLines[0]);
  const rows = tableLines.slice(2).map(cells);
  return { headers, rows };
}

function fact(label: string, value: string | undefined): SrdEquipmentFact[] {
  return value && value !== '-' && value !== '--' ? [{ label, value }] : [];
}

function equipmentSummary(
  category: SrdEquipmentCategory,
  cost?: string,
  weight?: string,
  extra?: string,
): string {
  return [category, cost, weight && weight !== '-' ? weight : undefined, extra]
    .filter(Boolean)
    .join(' · ');
}

function equipmentItem(
  name: string,
  category: SrdEquipmentCategory,
  options: {
    cost?: string;
    weight?: string;
    facts?: SrdEquipmentFact[];
    description?: string;
    extraSummary?: string;
  } = {},
): SrdEquipmentItem {
  return {
    id: slugifySrdName(name),
    name,
    category,
    cost: options.cost && options.cost !== '-' ? options.cost : undefined,
    weight: options.weight && options.weight !== '-' ? options.weight : undefined,
    summary: equipmentSummary(category, options.cost, options.weight, options.extraSummary),
    facts: options.facts ?? [],
    description: options.description ?? '',
    source: 'SRD 5.2.1',
  };
}

function nameAndCost(title: string): { name: string; cost?: string } {
  const separator = title.lastIndexOf(' (');
  if (separator === -1 || !title.endsWith(')')) return { name: title };
  return {
    name: title.slice(0, separator),
    cost: title.slice(separator + 2, -1),
  };
}

export function convertAdventuringGear(
  markdown: string,
  equipmentChapter: string,
): SrdEquipmentItem {
  const parsed = parseSrdEntry(markdown);
  const { name, cost } = nameAndCost(parsed.name);
  const gearTable = tableAfter(equipmentChapter, '**Adventuring Gear**');
  const tableRow = gearTable.rows.find((row) => row[0] === name)
    ?? (name === 'Spell Scroll' ? gearTable.rows.find((row) => row[0].startsWith('Spell Scroll')) : undefined);
  const weight = tableRow?.[1];
  return equipmentItem(name, 'Adventuring Gear', {
    cost,
    weight,
    description: parsed.description,
  });
}

export function convertTool(markdown: string): SrdEquipmentItem {
  const parsed = parseSrdEntry(markdown);
  const { name, cost } = nameAndCost(parsed.name);
  const weight = parsed.fields.Weight;
  const facts = Object.entries(parsed.fields)
    .filter(([label, value]) => label !== 'Weight' && value.trim())
    .map(([label, value]) => ({ label, value }));
  return equipmentItem(name, 'Tool', {
    cost,
    weight,
    facts,
    description: parsed.description,
    extraSummary: parsed.fields.Ability,
  });
}

export function convertEquipmentTables(markdown: string): SrdEquipmentItem[] {
  const items: SrdEquipmentItem[] = [];

  let weaponCategory = '';
  for (const row of tableAfter(markdown, '**Weapons**').rows) {
    if (row.slice(1).every((cell) => !cell)) {
      weaponCategory = row[0];
      continue;
    }
    const [name, damage, properties, mastery, weight, cost] = row;
    items.push(equipmentItem(name, 'Weapon', {
      cost,
      weight,
      extraSummary: damage,
      facts: [
        ...fact('Weapon category', weaponCategory),
        ...fact('Damage', damage),
        ...fact('Properties', properties),
        ...fact('Mastery', mastery),
      ],
    }));
  }

  let armorCategory = '';
  for (const row of tableAfter(markdown, '##### Armor').rows) {
    if (row.slice(1).every((cell) => !cell)) {
      armorCategory = row[0];
      continue;
    }
    const [name, armorClass, strength, stealth, weight, cost] = row;
    items.push(equipmentItem(name, 'Armor', {
      cost,
      weight,
      extraSummary: armorClass,
      facts: [
        ...fact('Armor category', armorCategory),
        ...fact('Armor Class', armorClass),
        ...fact('Strength', strength),
        ...fact('Stealth', stealth),
      ],
    }));
  }

  for (const row of tableAfter(markdown, '**Mounts and Other Animals**').rows) {
    const [name, carryingCapacity, cost] = row;
    items.push(equipmentItem(name, 'Mount', {
      cost,
      extraSummary: carryingCapacity,
      facts: fact('Carrying Capacity', carryingCapacity),
    }));
  }

  for (const row of tableAfter(markdown, '**Tack, Harness, and Drawn Vehicles**').rows) {
    const [name, weight, cost] = row;
    items.push(equipmentItem(name, 'Tack and Vehicle', { cost, weight }));
  }

  for (const row of tableAfter(markdown, '**Airborne and Waterborne Vehicles**').rows) {
    const [name, speed, crew, passengers, cargo, armorClass, hitPoints, threshold, cost] = row;
    items.push(equipmentItem(name, 'Large Vehicle', {
      cost,
      extraSummary: speed,
      facts: [
        ...fact('Speed', speed),
        ...fact('Crew', crew),
        ...fact('Passengers', passengers),
        ...fact('Cargo', cargoCapacity(cargo)),
        ...fact('Armor Class', armorClass),
        ...fact('Hit Points', hitPoints),
        ...fact('Damage Threshold', threshold),
      ],
    }));
  }

  return items;
}
