import { describe, expect, it } from 'vitest';
import type { Spell } from '@/data/spells';
import { EMPTY_BATTLE } from '@/lib/battle-organizer';
import {
  DM_SCREEN_EXPORT_KIND,
  DM_SCREEN_EXPORT_VERSION,
  createDmScreenExportEnvelope,
  parseDmScreenImport,
  planDmScreenImport,
  planDmScreenResourceRestore,
} from '@/lib/dm-screen-import';
import { makeMonster } from './test-helpers';

const copiedSpell: Spell = {
  id: 'test-spell',
  name: 'Test Spell',
  level: 1,
  school: 'Abjuration',
  castingTime: '1 action',
  range: '60 feet',
  components: 'V, S',
  duration: '1 round',
  concentration: false,
  ritual: false,
  effectSummary: 'Protect a nearby creature.',
  classes: ['Wizard'],
  description: 'A brief protective ward surrounds the target.',
  source: 'SRD',
};

function legacyScreen(title = 'Imported screen') {
  return {
    version: 1,
    title,
    autoAddPinnedMonsters: true,
    autoAddPinnedSpells: false,
    sections: [{
      id: 'shared-section',
      title: 'Scene',
      collapsed: false,
      items: [{
        id: 'shared-monster-item',
        kind: 'monster',
        title: 'Test Monster',
        resourceId: 'test-monster',
        collapsed: false,
        hidden: false,
        origin: 'manual',
      }, {
        id: 'shared-spell-item',
        kind: 'spell',
        title: 'Test Spell',
        resourceId: 'test-spell',
        collapsed: true,
        hidden: false,
        origin: 'manual',
      }, {
        id: 'shared-note-item',
        kind: 'note',
        title: 'Secret',
        body: 'The door is trapped.',
        collapsed: true,
        hidden: true,
        origin: 'manual',
      }],
      children: [{
        id: 'nested-section',
        title: 'Nested',
        collapsed: true,
        items: [],
        children: [],
      }],
    }],
  };
}

function deterministicDocumentOptions(prefix: string) {
  let next = 0;
  return { createId: () => `${prefix}-${++next}` };
}

function legacyEnvelope(overrides: Record<string, unknown> = {}) {
  return {
    exportedAt: '2026-07-21T00:00:00.000Z',
    dmScreen: legacyScreen(),
    battle: EMPTY_BATTLE,
    resources: {
      monsters: [makeMonster()],
      spells: [copiedSpell],
    },
    ...overrides,
  };
}

function requireCandidate(value: unknown, prefix = 'candidate') {
  const parsed = parseDmScreenImport(
    JSON.stringify(value),
    deterministicDocumentOptions(prefix),
  );
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.candidate;
}

describe('DM Screen JSON import', () => {
  it('migrates the legacy unversioned envelope and builds a useful preview', () => {
    const candidate = requireCandidate(legacyEnvelope());

    expect(candidate.dmScreen.version).toBe(2);
    expect(candidate.preview).toMatchObject({
      source: 'legacy',
      migrated: true,
      title: 'Imported screen',
      sections: 2,
      items: 3,
      monsters: 1,
      spells: 1,
      battleIncluded: true,
      battleCombatants: 0,
      battlePhase: 'setup',
    });
    expect(candidate.preview.itemsByKind).toEqual({ monster: 1, spell: 1, note: 1 });
    expect(candidate.warnings.join(' ')).toMatch(/unversioned/i);
    expect(candidate.dmScreen.sections[0].items[2].layout).toMatchObject({
      stashed: true,
      excludedFromPrint: false,
    });
  });

  it('round-trips advanced copied monster details instead of reducing the stat block', () => {
    const richMonster = makeMonster({
      savingThrows: { dex: 4, wis: 3 },
      skills: { Perception: 5, Stealth: 6 },
      damageResistanceNotes: 'from nonmagical attacks',
      damageImmunityNotes: 'while in shadow',
      actions: [{
        name: 'Longbow',
        description: 'A precise ranged strike.',
        attackDelivery: 'Ranged',
        attackType: 'Weapon',
        attackBonus: 6,
        range: 150,
        longRange: 600,
        damageTypes: ['Piercing'],
        damageDice: '1d8+3',
        damageAvg: 7,
      }],
      legendary: {
        description: 'The creature can take two legendary actions.',
        actionsPerRound: 2,
        actions: [{ name: 'Step', description: 'Move without provoking.' }],
      },
      mythic: [{ name: 'Return', description: 'Regain 20 hit points.' }],
      lair: [{ name: 'Shadows', description: 'The lights dim.' }],
      spellcasting: {
        ability: 'wis',
        dc: 14,
        attackBonus: 6,
        atWill: ['guidance'],
        perDay: { '1': ['moonbeam'] },
        slots: { '2': ['lesser restoration'] },
      },
      isLegendary: true,
      isMythic: true,
      hasLair: true,
      hasSpellcasting: true,
    });
    const candidate = requireCandidate(legacyEnvelope({
      resources: { monsters: [richMonster], spells: [] },
    }));
    const restored = candidate.resources.monsters[0];

    expect(restored.savingThrows).toEqual(richMonster.savingThrows);
    expect(restored.skills).toEqual(richMonster.skills);
    expect(restored.damageResistanceNotes).toBe('from nonmagical attacks');
    expect(restored.damageImmunityNotes).toBe('while in shadow');
    expect(restored.actions[0]).toMatchObject({ attackType: 'Weapon', longRange: 600 });
    expect(restored.legendary).toEqual(richMonster.legendary);
    expect(restored.mythic).toEqual(richMonster.mythic);
    expect(restored.lair).toEqual(richMonster.lair);
    expect(restored.spellcasting).toEqual(richMonster.spellcasting);
  });

  it('rejects invalid JSON, future envelopes, and missing envelope fields with paths', () => {
    const invalidJson = parseDmScreenImport('{ nope');
    expect(invalidJson).toMatchObject({ ok: false, reason: 'invalid-json' });
    if (!invalidJson.ok) expect(invalidJson.errors[0]).toMatch(/^\$/);

    const future = parseDmScreenImport(JSON.stringify({
      kind: DM_SCREEN_EXPORT_KIND,
      version: 3,
      dmScreen: legacyScreen(),
    }));
    expect(future).toMatchObject({ ok: false, reason: 'future-version' });
    if (!future.ok) expect(future.errors[0]).toContain('$.version');

    const missing = parseDmScreenImport(JSON.stringify({ resources: [] }));
    expect(missing).toMatchObject({ ok: false, reason: 'invalid-envelope' });
    if (!missing.ok) {
      expect(missing.errors).toContain('$.dmScreen: field is required.');
      expect(missing.errors).toContain('$.resources: expected an object when present.');
    }
  });

  it('reports document, battle, monster, and spell failures at actionable paths', () => {
    const malformedDocument = legacyScreen() as Record<string, unknown>;
    malformedDocument.sections = [{
      id: 'section', title: 42, collapsed: false, items: [], children: [],
    }];
    const documentResult = parseDmScreenImport(JSON.stringify(legacyEnvelope({
      dmScreen: malformedDocument,
    })));
    expect(documentResult).toMatchObject({ ok: false, reason: 'invalid-document' });
    if (!documentResult.ok) {
      expect(documentResult.errors.some((error) => error.startsWith('$.dmScreen'))).toBe(true);
    }

    const battleResult = parseDmScreenImport(JSON.stringify(legacyEnvelope({
      battle: { ...EMPTY_BATTLE, round: 0 },
    })));
    expect(battleResult).toMatchObject({ ok: false, reason: 'invalid-envelope' });
    if (!battleResult.ok) expect(battleResult.errors[0]).toContain('$.battle');

    const resourceResult = parseDmScreenImport(JSON.stringify(legacyEnvelope({
      resources: {
        monsters: [
          makeMonster({ hitPoints: 0 }),
          makeMonster({ id: 'second-invalid', armor: {} as never }),
        ],
        spells: [{ ...copiedSpell, classes: 4 }],
      },
    })));
    expect(resourceResult).toMatchObject({ ok: false, reason: 'invalid-envelope' });
    if (!resourceResult.ok) {
      expect(resourceResult.errors.some((error) => error.startsWith('$.resources.monsters[0]'))).toBe(true);
      expect(resourceResult.errors.some((error) => error.startsWith('$.resources.monsters[1]'))).toBe(true);
      expect(resourceResult.errors.some((error) => error.startsWith('$.resources.spells[0]'))).toBe(true);
    }
  });

  it('creates an isolated, validated v2 export envelope', () => {
    const candidate = requireCandidate(legacyEnvelope(), 'export');
    const sourceTitle = candidate.dmScreen.title;
    const sourceMonster = makeMonster();
    const sourceSpell = { ...copiedSpell, classes: [...copiedSpell.classes] };
    const envelope = createDmScreenExportEnvelope({
      dmScreen: candidate.dmScreen,
      battle: candidate.battle,
      resources: { monsters: [sourceMonster], spells: [sourceSpell] },
      exportedAt: '2026-07-21T12:34:56.000Z',
    });

    expect(envelope).toMatchObject({
      kind: DM_SCREEN_EXPORT_KIND,
      version: DM_SCREEN_EXPORT_VERSION,
      exportedAt: '2026-07-21T12:34:56.000Z',
    });
    candidate.dmScreen.title = 'Changed after export';
    sourceMonster.name = 'Changed monster';
    sourceSpell.classes.push('Sorcerer');
    expect(envelope.dmScreen.title).toBe(sourceTitle);
    expect(envelope.resources.monsters[0].name).toBe('Test Monster');
    expect(envelope.resources.spells[0].source).toBe('SRD');
    expect(envelope.resources.spells[0].classes).toEqual(['Wizard']);

    const roundTrip = parseDmScreenImport(JSON.stringify(envelope));
    expect(roundTrip).toMatchObject({ ok: true });
    if (roundTrip.ok) expect(roundTrip.candidate.preview.source).toBe('v2');
  });

  it('plans collision-safe copied resources and rewrites item references without mutation', () => {
    const candidate = requireCandidate(legacyEnvelope(), 'resources');
    const originalDocument = structuredClone(candidate.dmScreen);
    const plan = planDmScreenResourceRestore(candidate, {
      monsterIds: ['test-monster', 'custom-test-monster'],
      spellIds: ['test-spell'],
    });

    expect(plan.monsterIdRemaps).toEqual([
      { from: 'test-monster', to: 'custom-test-monster-2' },
    ]);
    expect(plan.spellIdRemaps).toEqual([
      { from: 'test-spell', to: 'custom-test-spell' },
    ]);
    expect(plan.monsters[0].id).toBe('custom-test-monster-2');
    expect(plan.spells[0].id).toBe('custom-test-spell');
    expect(plan.dmScreen.sections[0].items[0].resourceId).toBe('custom-test-monster-2');
    expect(plan.dmScreen.sections[0].items[1].resourceId).toBe('custom-test-spell');
    expect(candidate.dmScreen).toEqual(originalDocument);
  });

  it('keeps merge/replace and battle restoration explicit and deterministic', () => {
    const current = requireCandidate(legacyEnvelope({
      dmScreen: legacyScreen('Current screen'),
      battle: undefined,
      resources: { monsters: [], spells: [] },
    }), 'current');
    const imported = requireCandidate(legacyEnvelope({
      dmScreen: legacyScreen('Imported screen'),
      resources: { monsters: [], spells: [] },
    }), 'incoming');

    const merged = planDmScreenImport(current.dmScreen, imported, {
      mode: 'merge',
      includeBattle: false,
      documentOptions: deterministicDocumentOptions('merge'),
    });
    expect(merged.dmScreen.title).toBe('Current screen');
    expect(merged.dmScreen.sections).toHaveLength(2);
    expect(merged.sectionIdRemaps.map((remap) => remap.from).sort()).toEqual([
      'nested-section',
      'shared-section',
    ]);
    expect(merged.itemIdRemaps.map((remap) => remap.from).sort()).toEqual([
      'shared-monster-item',
      'shared-note-item',
      'shared-spell-item',
    ]);
    const reassignedIds = [
      ...merged.sectionIdRemaps,
      ...merged.itemIdRemaps,
    ].map((remap) => remap.to);
    expect(new Set(reassignedIds).size).toBe(reassignedIds.length);
    expect(reassignedIds.every((id) => /^merge-\d+$/.test(id))).toBe(true);
    expect(merged.battle).toBeUndefined();

    const replaced = planDmScreenImport(current.dmScreen, imported, {
      mode: 'replace',
      includeBattle: true,
    });
    expect(replaced.dmScreen.title).toBe('Imported screen');
    expect(replaced.dmScreen.sections).toHaveLength(1);
    expect(replaced.sectionIdRemaps).toEqual([]);
    expect(replaced.itemIdRemaps).toEqual([]);
    expect(replaced.battle).toEqual(EMPTY_BATTLE);
    expect(replaced.battle).not.toBe(imported.battle);
  });
});
