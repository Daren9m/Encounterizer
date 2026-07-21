import { describe, expect, it } from 'vitest';
import {
  ENCOUNTER_RECIPES,
  buildRecipePlan,
  getRecipePlaybookPreview,
  type FilledRecipeSlot,
} from '@/lib/encounter-recipes';
import { makeMonster } from './test-helpers';

describe('encounter recipe playbooks', () => {
  it('gives every recipe a complete, rendered playbook', () => {
    for (const recipe of ENCOUNTER_RECIPES) {
      const filled: FilledRecipeSlot[] = recipe.slots.map((slot, index) => ({
        role: slot.role,
        count: slot.count,
        monster: makeMonster({ id: `${recipe.id}-${index}`, name: `${slot.role} Creature` }),
      }));
      const plan = buildRecipePlan(recipe, filled, {
        environment: 'Forest', partyLevel: 7, partySize: 4, seed: 42,
      });

      expect(plan.recipeId).toBe(recipe.id);
      expect(plan.objective.summary).not.toMatch(/\{[a-z]+\}/i);
      expect(plan.setup.length).toBeGreaterThan(0);
      expect(plan.beats.length).toBeGreaterThan(0);
      expect(plan.beats.every((beat) => beat.guidance.length > 0 && beat.effect.length > 0)).toBe(true);
      expect(getRecipePlaybookPreview(recipe.id)).toEqual({
        objective: plan.objective.title,
        beats: plan.beats.length,
      });
    }
  });

  it('adds a level-scaled objective ally only when the recipe calls for one', () => {
    const protect = ENCOUNTER_RECIPES.find((recipe) => recipe.id === 'protect-npc')!;
    const slots: FilledRecipeSlot[] = protect.slots.map((slot, index) => ({
      role: slot.role,
      count: slot.count,
      monster: makeMonster({ id: `ward-${index}`, name: `${slot.role} Attacker` }),
    }));
    const plan = buildRecipePlan(protect, slots, {
      environment: 'Urban', partyLevel: 8, partySize: 5, seed: 9,
    });

    expect(plan.specialParticipant).toMatchObject({
      name: 'Protected NPC', kind: 'ally', armorClass: 12, maxHp: 32,
    });
  });

  it('selects terrain deterministically from the encounter seed', () => {
    const recipe = ENCOUNTER_RECIPES[0];
    const slots: FilledRecipeSlot[] = recipe.slots.map((slot, index) => ({
      role: slot.role,
      count: slot.count,
      monster: makeMonster({ id: `det-${index}`, name: `${slot.role} Creature` }),
    }));
    const context = { environment: 'Forest' as const, partyLevel: 5, partySize: 4, seed: 123 };
    expect(buildRecipePlan(recipe, slots, context)).toEqual(buildRecipePlan(recipe, slots, context));
  });
});
