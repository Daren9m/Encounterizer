'use client';

import type { MapRoom } from '@/lib/types';
import { formatRoomTag } from '@/lib/map-export-text';

/** Keyed room list: number, name, tags, DM purpose, read-aloud text.
 *  Numbers match the chips drawn on the map. Prints below the map. */
export default function RoomKeyPanel({ rooms }: { rooms: MapRoom[] }) {
  if (rooms.length === 0) return null;
  return (
    <div className="card mt-6 animate-fade-in" style={{ breakInside: 'avoid-page' }}>
      <h3 className="text-lg mb-3">Room Key</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {rooms.map(room => (
          <div key={room.id} className="text-sm" style={{ breakInside: 'avoid' }}>
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span className="font-bold text-[var(--text-1)]">
                {room.id}. {room.name}
              </span>
              {room.tags.map(tag => (
                <span
                  key={tag}
                  className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--steel-800)] text-[var(--text-3)]"
                >
                  {formatRoomTag(tag)}
                </span>
              ))}
            </div>
            <p className="text-[var(--text-2)]">{room.purpose}</p>
            <p className="mt-1 italic text-[var(--text-3)]">“{room.readAloud}”</p>
          </div>
        ))}
      </div>
    </div>
  );
}
