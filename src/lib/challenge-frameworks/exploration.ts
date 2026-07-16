// ─── Exploration / Journey ───────────────────────────────────────
// Obstacle chains sized by time budget, tier-aware creative menus,
// and resource costs by difficulty (spec §8.3).

import { pickRandom as pick, shuffleArray } from '../random';
import { OBSTACLES, WEATHER } from '../../data/noncombat-scenarios';
import { dcFor, groupCheckThreshold, tierIndex } from '../noncombat/levers';
import { cap, failureText, rewardText } from '../noncombat/theming';
import type { ChallengeFramework, FrameworkInput, FrameworkOutput, SkillCheck } from './frame';

export const TIER_GUIDANCE = [
  'no flight or teleport assumed; rope, timing, and wits carry the day',
  'misty step, spider climb, and enhanced jumps are on the table — gate the shortcut, not the crossing',
  'assume fly and dimension door: the obstacle should threaten the whole party\'s transit, not one climber',
  'routine flight and teleport: make the obstacle wide, warded, or alive so it stays interesting',
] as const;

const CHAIN_LENGTH = { quick: 1, standard: 2, 'set-piece': 3 } as const;

const RESOURCE_COST = {
  Easy: 'a failed attempt costs time — hours of detour or backtracking',
  Medium: 'a failed attempt costs time and grinds the party down — 1 level of exhaustion for the one who slipped',
  Hard: 'a failed attempt costs time, supplies (rations, rope, or a tool of the DM\'s choice), and 1 level of exhaustion',
} as const;

export const exploration: ChallengeFramework = {
  key: 'exploration',
  label: 'Exploration Challenge',
  description: 'Environmental obstacles and journeys — chained for longer sessions',
  generate({ levers, rng }: FrameworkInput): FrameworkOutput {
    const pack = levers.theme;
    const chain = shuffleArray(OBSTACLES, rng).slice(0, CHAIN_LENGTH[levers.timeBudget]);
    const lead = chain[0];
    const weather = pick(WEATHER, rng);
    const dc = dcFor(levers.partyLevel, levers.difficulty);
    const threshold = groupCheckThreshold(levers.partySize);
    const guidance = TIER_GUIDANCE[tierIndex(levers.partyLevel)];
    const groupCheck: SkillCheck = {
      skill: lead.skills[0], dc,
      onSuccess: `Group check: at least ${threshold} of ${levers.partySize} succeed and the whole party crosses together.`,
      onFailure: `Group check: fewer than ${threshold} of ${levers.partySize} make it — the stragglers pay the crossing's price.`,
    };
    const rest: SkillCheck[] = chain.flatMap((o, i) =>
      o.skills.slice(i === 0 ? 1 : 0).map(s => ({
        skill: s, dc,
        onSuccess: `${s} finds a way past ${o.name.toLowerCase()}.`,
        // Spec §6.2: exploration obstacle failure is one-time CLIMACTIC harm.
        onFailure: failureText(levers, rng, { kind: 'climactic', context: `${cap(o.name)} exacts its toll.`, save: 'DEX' }),
      })),
    );
    return {
      name: chain.length > 1 ? `The ${pick(['Long Road', 'Hard Crossing', 'Winding Descent', 'Overland Gauntlet'], rng)}` : lead.name,
      readAloud: `${cap(lead.desc)} Overhead, ${weather} — ${pack.sensory[3] ?? pack.sensory[0]}.`,
      situation: `The party must get through. Weather: ${weather}. At this tier, ${guidance}. Creative route for ${lead.name.toLowerCase()}: ${lead.creative}.`,
      stakes: `Success: the journey continues on schedule. Failure: ${RESOURCE_COST[levers.difficulty]}.`,
      skillChecks: [groupCheck, ...rest],
      complication: pick(pack.consequences, rng),
      outcomes: [
        { label: 'Push through', description: 'Checks and grit — the party arrives tired but on time.' },
        { label: 'The creative route', description: chain.map(o => o.creative).join(' Then: ') },
        { label: 'Go around', description: 'Half a day lost, but no risk — and whatever waits ahead has longer to prepare.' },
      ],
      reward: rewardText(levers, rng),
      stages: chain.length > 1
        ? chain.map(o => ({ title: o.name, text: `${o.desc} Creative option: ${o.creative}` }))
        : undefined,
    };
  },
};
