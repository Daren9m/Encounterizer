import { TERRAIN_INFO } from './map-generator';
import type { EncounterMap, MapRoomTag } from './types';

// ─── Markdown export ─────────────────────────────────────────────
// A DM-notes-ready document: header, ASCII grid, legend, room key.
// Pure string assembly; the page wraps it in a blob download.

const TAG_LABELS: Record<MapRoomTag, string> = {
  'spawn:party': 'Party Start',
  'spawn:monster': 'Enemies',
  boss: 'Boss',
  entrance: 'Entrance',
  exit: 'Exit',
  treasure: 'Treasure',
  trap: 'Trap',
  hazard: 'Hazard',
  landmark: 'Landmark',
};

export function formatRoomTag(tag: MapRoomTag): string {
  return TAG_LABELS[tag] ?? tag;
}

export function mapToMarkdown(map: EncounterMap): string {
  const lines: string[] = [];
  lines.push(`# ${map.name}`);
  lines.push('');
  const seedPart = map.seed !== undefined ? ` — Seed ${map.seed}` : '';
  lines.push(`${map.width}×${map.height} — ${map.environment}${seedPart}`);
  lines.push('');

  lines.push('```');
  for (const row of map.grid) {
    lines.push(row.map(cell => TERRAIN_INFO[cell.terrain].symbol).join(''));
  }
  lines.push('```');
  lines.push('');

  const present = new Set(map.grid.flat().map(cell => cell.terrain));
  lines.push('**Legend:** ' + [...present]
    .map(terrain => `${TERRAIN_INFO[terrain].symbol} ${TERRAIN_INFO[terrain].label}`)
    .join(' · '));

  if (map.rooms && map.rooms.length > 0) {
    lines.push('');
    lines.push('## Room Key');
    lines.push('');
    for (const room of map.rooms) {
      const tags = room.tags.length > 0
        ? ` — _${room.tags.map(formatRoomTag).join(', ')}_`
        : '';
      lines.push(`**${room.id}. ${room.name}**${tags}`);
      lines.push('');
      lines.push(room.purpose);
      lines.push('');
      lines.push(`> ${room.readAloud}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
