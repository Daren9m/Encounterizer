export interface ParsedSrdSection {
  heading?: string;
  text: string;
}

export interface ParsedSrdEntry {
  name: string;
  subtitle?: string;
  fields: Record<string, string>;
  sections: ParsedSrdSection[];
  description: string;
}

const OCR_REPAIRS: Array<[RegExp, string]> = [
  [/\bS\s+tr(?=\s+[+-]?\d)/gi, 'Str'],
  [/\bD\s+ex(?=\s+[+-]?\d)/gi, 'Dex'],
  [/\bC\s+on(?=\s+[+-]?\d)/gi, 'Con'],
  [/\bI\s+nt(?=\s+[+-]?\d)/gi, 'Int'],
  [/\bW\s+is(?=\s+[+-]?\d)/gi, 'Wis'],
  [/\bC\s+ha(?=\s+[+-]?\d)/gi, 'Cha'],
];

export function repairOcrSpacing(value: string): string {
  return OCR_REPAIRS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function stripInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/___([^_]+)___/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '$1')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*/g, '')
    .replace(/\\([\\`*_[\]{}()#+.!>|-])/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function tableRowToText(line: string): string | null {
  const cells = line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => stripInlineMarkdown(cell));
  if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return null;
  return cells.filter(Boolean).join(' — ');
}

export function markdownToPlainText(markdown: string): string {
  const normalized = repairOcrSpacing(markdown.replace(/\r\n?/g, '\n'));
  const lines: string[] = [];

  for (const rawLine of normalized.split('\n')) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (lines.at(-1) !== '') lines.push('');
      continue;
    }
    if (/^\|.*\|$/.test(trimmed)) {
      const row = tableRowToText(trimmed);
      if (row) lines.push(row);
      continue;
    }

    const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      lines.push(stripInlineMarkdown(heading[1]));
      continue;
    }

    const bullet = trimmed.match(/^[-+*]\s+(.+)$/);
    if (bullet) {
      lines.push(`• ${stripInlineMarkdown(bullet[1])}`);
      continue;
    }

    lines.push(stripInlineMarkdown(trimmed));
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isStandaloneItalic(line: string): boolean {
  return /^\*[^*\n]+\*$/.test(line.trim()) || /^_[^_\n]+_$/.test(line.trim());
}

export function parseSrdEntry(markdown: string): ParsedSrdEntry {
  const normalized = repairOcrSpacing(markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')).trim();
  const lines = normalized.split('\n');
  const firstContent = lines.findIndex((line) => line.trim().length > 0);
  if (firstContent === -1) throw new Error('SRD entry is empty.');

  const titleMatch = lines[firstContent].trim().match(/^#\s+(.+)$/);
  if (!titleMatch) throw new Error('SRD entry must start with a level-one name heading.');

  const name = stripInlineMarkdown(titleMatch[1]);
  const fields: Record<string, string> = {};
  const sections: ParsedSrdSection[] = [];
  let subtitle: string | undefined;
  let currentHeading: string | undefined;
  let currentLines: string[] = [];

  const flushSection = () => {
    const text = markdownToPlainText(currentLines.join('\n'));
    if (text || currentHeading) sections.push({ heading: currentHeading, text });
    currentLines = [];
  };

  for (let index = firstContent + 1; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentLines.length > 0 && currentLines.at(-1) !== '') currentLines.push('');
      continue;
    }

    if (!subtitle && sections.length === 0 && currentLines.length === 0 && isStandaloneItalic(trimmed)) {
      subtitle = stripInlineMarkdown(trimmed);
      continue;
    }

    const fieldMatch = trimmed.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
    if (fieldMatch && sections.length === 0 && currentLines.length === 0) {
      fields[fieldMatch[1].trim()] = stripInlineMarkdown(fieldMatch[2]);
      continue;
    }

    const headingMatch = trimmed.match(/^#{2,6}\s+(.+)$/);
    if (headingMatch) {
      flushSection();
      currentHeading = stripInlineMarkdown(headingMatch[1]);
      continue;
    }

    currentLines.push(line);
  }
  flushSection();

  const description = sections
    .flatMap((section) => section.heading ? [section.heading, section.text] : [section.text])
    .filter(Boolean)
    .join('\n\n');

  return { name, subtitle, fields, sections, description };
}

export function slugifySrdName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
