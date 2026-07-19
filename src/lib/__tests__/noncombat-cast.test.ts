import { describe, it, expect } from 'vitest';
import { PERSONAS, WANTS, SECRETS, LEVERAGE, SOCIAL_COMPLICATIONS, INTERRUPTIONS } from '../../data/noncombat-cast';
import { SKILL_OBJECTIVES, OBSTACLES, WEATHER, TRAP_FRAMES, QUARRIES, WAYPOINTS, INVESTIGATION_FRAMES } from '../../data/noncombat-scenarios';

const SKILL_ABILITY: Record<string, string> = {
  Athletics: 'STR',
  Acrobatics: 'DEX', 'Sleight of Hand': 'DEX', Stealth: 'DEX',
  Arcana: 'INT', History: 'INT', Investigation: 'INT', Nature: 'INT', Religion: 'INT',
  'Animal Handling': 'WIS', Insight: 'WIS', Medicine: 'WIS', Perception: 'WIS', Survival: 'WIS',
  Deception: 'CHA', Intimidation: 'CHA', Performance: 'CHA', Persuasion: 'CHA',
  Constitution: 'CON', "Thieves' Tools": 'DEX',
};

const NO_MECHANICS = (pools: string[][]) => {
  for (const pool of pools) {
    for (const s of pool) {
      expect(s, s).not.toMatch(/\d+d\d+/);
      expect(s, s).not.toMatch(/\bDC\b/);
    }
  }
};

describe('cast pools (spec §8.2)', () => {
  it('meets minimum sizes', () => {
    expect(PERSONAS.length).toBeGreaterThanOrEqual(12);
    expect(WANTS.length).toBeGreaterThanOrEqual(16);
    expect(SECRETS.length).toBeGreaterThanOrEqual(16);
    expect(LEVERAGE).toHaveLength(6);
    expect(SOCIAL_COMPLICATIONS.length).toBeGreaterThanOrEqual(8);
    expect(INTERRUPTIONS.length).toBeGreaterThanOrEqual(6);
  });
  it('leverage covers all six kinds exactly once', () => {
    expect(new Set(LEVERAGE.map(l => l.kind)).size).toBe(6);
  });
  it('carries no dice or DC text (tone/severity layers own numbers)', () => {
    NO_MECHANICS([
      PERSONAS.flatMap(p => [p.archetype, p.quirk, p.speech]),
      WANTS, SECRETS,
      LEVERAGE.flatMap(l => [l.approach, l.counter]),
      SOCIAL_COMPLICATIONS, INTERRUPTIONS,
    ]);
  });
});

describe('scenario pools (spec §8)', () => {
  it('meets minimum sizes', () => {
    expect(SKILL_OBJECTIVES.length).toBeGreaterThanOrEqual(12);
    expect(OBSTACLES.length).toBeGreaterThanOrEqual(15);
    expect(WEATHER.length).toBeGreaterThanOrEqual(8);
    expect(TRAP_FRAMES.length).toBeGreaterThanOrEqual(12);
    expect(QUARRIES.length).toBeGreaterThanOrEqual(10);
    expect(WAYPOINTS.length).toBeGreaterThanOrEqual(12);
    expect(INVESTIGATION_FRAMES.length).toBeGreaterThanOrEqual(10);
  });
  it.each(SKILL_OBJECTIVES.map(o => [o.name, o] as const))('%s: primary skills span ≥4 abilities', (_n, o) => {
    expect(o.primarySkills.length).toBeGreaterThanOrEqual(4);
    expect(o.secondarySkills.length).toBeGreaterThanOrEqual(3);
    const abilities = new Set(o.primarySkills.map(s => {
      expect(SKILL_ABILITY[s], `unknown skill ${s}`).toBeDefined();
      return SKILL_ABILITY[s];
    }));
    expect(abilities.size).toBeGreaterThanOrEqual(4);
    expect(o.phaseTitles).toHaveLength(3);
  });
  it.each(TRAP_FRAMES.map(t => [t.name, t] as const))('%s: 3 distinct-skill countermeasures, ≥2 clues', (_n, t) => {
    expect(t.countermeasures).toHaveLength(3);
    expect(new Set(t.countermeasures.map(c => c.skill)).size).toBe(3);
    expect(t.clues.length).toBeGreaterThanOrEqual(2);
  });
  it('obstacles carry 2–3 skills; investigation frames carry ≥2 methods and motives', () => {
    for (const o of OBSTACLES) {
      expect(o.skills.length).toBeGreaterThanOrEqual(2);
      expect(o.skills.length).toBeLessThanOrEqual(3);
    }
    for (const f of INVESTIGATION_FRAMES) {
      expect(f.methods.length).toBeGreaterThanOrEqual(2);
      expect(f.motives.length).toBeGreaterThanOrEqual(2);
    }
  });
  it('carries no dice or DC text', () => {
    NO_MECHANICS([
      SKILL_OBJECTIVES.flatMap(o => [o.name, o.setup, ...o.phaseTitles]),
      OBSTACLES.flatMap(o => [o.name, o.desc, o.creative]),
      WEATHER,
      TRAP_FRAMES.flatMap(t => [t.name, t.trigger, t.effect, t.escalation, t.reset, t.twist, ...t.clues, ...t.countermeasures.map(c => c.action)]),
      QUARRIES.flatMap(q => [q.archetype, q.speedNote, q.trick, q.desperation]),
      WAYPOINTS.map(w => w.text),
      INVESTIGATION_FRAMES.flatMap(f => [f.crime, ...f.methods, ...f.motives]),
    ]);
  });
});
