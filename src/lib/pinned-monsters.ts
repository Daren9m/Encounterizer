export function prioritizePinnedMonsters<T extends { id: string }>(
  monsters: readonly T[],
  pinnedIds: readonly string[],
): T[] {
  const monstersById = new Map(monsters.map((monster) => [monster.id, monster]));
  const includedPinnedIds = new Set<string>();
  const pinned: T[] = [];

  for (const id of pinnedIds) {
    const monster = monstersById.get(id);
    if (!monster || includedPinnedIds.has(id)) continue;
    includedPinnedIds.add(id);
    pinned.push(monster);
  }

  return [
    ...pinned,
    ...monsters.filter((monster) => !includedPinnedIds.has(monster.id)),
  ];
}
