import type { Encounter, Monster } from './types';

function safeFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'encounter';
}

function monsterMarkdown(monster: Monster, count: number): string {
  const actions = monster.actions
    .map((action) => `- **${action.name}.** ${action.description}`)
    .join('\n');
  return [
    `### ${count}× ${monster.name}`,
    `*${monster.size} ${monster.type}, ${monster.alignment} · CR ${monster.challengeRating}*`,
    `**AC** ${monster.armor.ac} · **HP** ${monster.hitPoints} (${monster.hitDice}) · **Speed** ${Object.entries(monster.speed).map(([mode, feet]) => `${mode} ${feet} ft`).join(', ')}`,
    `**STR** ${monster.abilities.str} · **DEX** ${monster.abilities.dex} · **CON** ${monster.abilities.con} · **INT** ${monster.abilities.int} · **WIS** ${monster.abilities.wis} · **CHA** ${monster.abilities.cha}`,
    actions,
  ].filter(Boolean).join('\n\n');
}

export function encounterToMarkdown(encounter: Encounter): string {
  const roster = encounter.monsters.map(({ monster, count }) => monsterMarkdown(monster, count)).join('\n\n---\n\n');
  const map = encounter.map
    ? `## Battle Map\n\n${encounter.map.width} × ${encounter.map.height} squares, seed ${encounter.map.seed ?? encounter.seed}.${encounter.map.rooms?.length ? ` ${encounter.map.rooms.length} keyed rooms.` : ''}`
    : '';
  return [
    `# ${encounter.name}`,
    encounter.description,
    `**Environment:** ${encounter.environment}  \n**Difficulty:** ${encounter.difficulty}  \n**Rules XP:** ${encounter.totalXp.toLocaleString()}  \n**Seed:** ${encounter.seed}`,
    `## Monsters\n\n${roster}`,
    encounter.tactics ? `## Tactics\n\n${encounter.tactics}` : '',
    encounter.treasure ? `## Treasure\n\n${encounter.treasure}` : '',
    map,
  ].filter(Boolean).join('\n\n');
}

/** Deliberately excludes roster, XP, HP, tactics, treasure, and keyed-room notes. */
export function encounterPlayerHandoutMarkdown(encounter: Encounter): string {
  return [
    `# ${encounter.name}`,
    encounter.description,
    `**Environment:** ${encounter.environment}`,
    encounter.map ? `## Visible Battle Map\n\n${encounter.map.width} × ${encounter.map.height} squares. Use the printed map or the map shown by the DM.` : '',
  ].filter(Boolean).join('\n\n');
}

/** Portable Foundry bundle: actors, journal text, and scene metadata. */
export function encounterToFoundry(encounter: Encounter) {
  return {
    format: 'encounterizer-foundry-v1',
    name: encounter.name,
    journal: { name: encounter.name, text: encounterToMarkdown(encounter) },
    actors: encounter.monsters.map(({ monster, count }) => ({
      name: monster.name,
      count,
      type: monster.type,
      system: {
        details: { cr: monster.challengeRating, alignment: monster.alignment, source: monster.source },
        attributes: { ac: monster.armor.ac, hp: { value: monster.hitPoints, max: monster.hitPoints } },
        abilities: monster.abilities,
        traits: { size: monster.size, languages: monster.languages, senses: monster.senses },
        actions: monster.actions,
      },
    })),
    scene: encounter.map ? {
      name: `${encounter.name} — ${encounter.environment}`,
      width: encounter.map.width,
      height: encounter.map.height,
      grid: { size: 70, distance: 5, units: 'ft' },
      seed: encounter.map.seed ?? encounter.seed,
    } : null,
  };
}

export function encounterExportFilename(encounter: Encounter, extension: string): string {
  return `${safeFilePart(encounter.name)}.${extension.replace(/^\./, '')}`;
}
