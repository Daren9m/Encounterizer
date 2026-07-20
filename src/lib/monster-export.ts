import type { Monster, MonsterAction } from './types';
import { formatMonsterAlignment } from './monster-alignment';
import { formatMonsterSize } from './monster-size';

function abilityModifier(score: number): string {
  const modifier = Math.floor((score - 10) / 2);
  return modifier >= 0 ? `+${modifier}` : `${modifier}`;
}

function challengeRatingLabel(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}

function speedLabel(monster: Monster): string {
  const speed = monster.speed;
  return [
    speed.walk && `${speed.walk} ft.`,
    speed.fly && `fly ${speed.fly} ft.${speed.hover ? ' (hover)' : ''}`,
    speed.swim && `swim ${speed.swim} ft.`,
    speed.burrow && `burrow ${speed.burrow} ft.`,
    speed.climb && `climb ${speed.climb} ft.`,
  ].filter(Boolean).join(', ') || '0 ft.';
}

function actionSection(title: string, actions?: MonsterAction[]): string[] {
  if (!actions?.length) return [];
  return [
    `## ${title}`,
    '',
    ...actions.flatMap((action) => [`**${action.name}.** ${action.description}`, '']),
  ];
}

function detailLine(label: string, values?: string[], note?: string): string | undefined {
  if (!values?.length) return undefined;
  return `**${label}** ${values.join(', ')}${note ? ` (${note})` : ''}`;
}

/** Export a complete, table-ready stat block as portable Markdown. */
export function monsterToMarkdown(monster: Monster): string {
  const abilityOrder = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  const details = [
    monster.savingThrows && Object.keys(monster.savingThrows).length
      ? `**Saving Throws** ${Object.entries(monster.savingThrows).map(([key, value]) => `${key.toUpperCase()} ${Number(value) >= 0 ? '+' : ''}${value}`).join(', ')}`
      : undefined,
    monster.skills && Object.keys(monster.skills).length
      ? `**Skills** ${Object.entries(monster.skills).map(([key, value]) => `${key} ${value >= 0 ? '+' : ''}${value}`).join(', ')}`
      : undefined,
    detailLine('Damage Vulnerabilities', monster.damageVulnerabilities),
    detailLine('Damage Resistances', monster.damageResistances, monster.damageResistanceNotes),
    detailLine('Damage Immunities', monster.damageImmunities, monster.damageImmunityNotes),
    detailLine('Condition Immunities', monster.conditionImmunities),
    detailLine('Senses', monster.senses),
    detailLine('Languages', monster.languages),
  ].filter((line): line is string => Boolean(line));

  const lines = [
    `# ${monster.name}`,
    '',
    `*${formatMonsterSize(monster)} ${monster.type}${monster.subtype ? ` (${monster.subtype})` : ''}, ${formatMonsterAlignment(monster.alignment)}*`,
    '',
    '---',
    '',
    `**Armor Class** ${monster.armor.ac}${monster.armor.source ? ` (${monster.armor.source})` : ''}`,
    '',
    `**Hit Points** ${monster.hitPoints} (${monster.hitDice})`,
    '',
    `**Speed** ${speedLabel(monster)}`,
    '',
    '| STR | DEX | CON | INT | WIS | CHA |',
    '|:---:|:---:|:---:|:---:|:---:|:---:|',
    `| ${abilityOrder.map((ability) => `${monster.abilities[ability]} (${abilityModifier(monster.abilities[ability])})`).join(' | ')} |`,
    '',
    ...details.flatMap((line) => [line, '']),
    `**Challenge** ${challengeRatingLabel(monster.challengeRating)} (${monster.xp.toLocaleString('en-US')} XP)`,
    '',
    `**Proficiency Bonus** +${monster.proficiencyBonus}`,
    '',
    ...actionSection('Traits', monster.specialAbilities),
    ...actionSection('Actions', monster.actions),
    ...actionSection('Bonus Actions', monster.bonusActions),
    ...actionSection('Reactions', monster.reactions),
  ];

  if (monster.legendary) {
    lines.push('## Legendary Actions', '', monster.legendary.description, '');
    lines.push(...monster.legendary.actions.flatMap((action) => [`**${action.name}.** ${action.description}`, '']));
  }

  if (monster.tags.length) lines.push(`*Tags: ${monster.tags.join(', ')}*`, '');
  return `${lines.join('\n').trim()}\n`;
}

export function safeMonsterFilename(name: string): string {
  return name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'monster';
}
