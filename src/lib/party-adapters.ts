import { buildSimPlayer } from '@/data/class-templates';
import type { BattleCombatant } from './battle-organizer';
import type { PartyConfig, PartyMemberConfig, SimPlayer } from './battle-sim-types';
import {
  getSelectedPartyMembers,
  type PartyMemberProfile,
  type PartyProfile,
} from './party';
import type { Party as BudgetParty } from './types';

function cloneOverrides(member: PartyMemberProfile): PartyMemberConfig['overrides'] {
  if (!member.overrides) return undefined;
  return {
    ...member.overrides,
    ...(member.overrides.saveBonuses
      ? { saveBonuses: { ...member.overrides.saveBonuses } }
      : {}),
  };
}

function selectedMembers(
  party: PartyProfile,
  memberIds?: readonly string[],
): PartyMemberProfile[] {
  return getSelectedPartyMembers(party, memberIds);
}

/** Exact levels are retained for 2024 encounter-budget calculations. */
export function partyToBudgetParty(
  party: PartyProfile,
  memberIds?: readonly string[],
): BudgetParty {
  return {
    id: party.id,
    name: party.name,
    members: selectedMembers(party, memberIds).map((member, index) => ({
      name: member.name || `Player ${index + 1}`,
      level: member.level,
      className: member.classLabel || member.templateId,
    })),
  };
}

export function partyToForecastConfig(
  party: PartyProfile,
  memberIds?: readonly string[],
): PartyConfig {
  return {
    version: 1,
    members: selectedMembers(party, memberIds).map((member, index) => ({
      id: member.id,
      name: member.name || `Player ${index + 1}`,
      templateId: member.templateId,
      level: member.level,
      ...(member.initiativeBonus !== undefined
        ? { initiativeBonus: member.initiativeBonus }
        : {}),
      ...(member.overrides ? { overrides: cloneOverrides(member) } : {}),
    })),
  };
}

/** Forecast players retain durable IDs instead of positional player-N IDs. */
export function partyToSimPlayers(
  party: PartyProfile,
  memberIds?: readonly string[],
): SimPlayer[] {
  return partyToForecastConfig(party, memberIds).members.map(buildSimPlayer);
}

/** Create fresh live-state snapshots; no combat state is written back to Party. */
export function partyToBattleCombatants(
  party: PartyProfile,
  memberIds?: readonly string[],
): BattleCombatant[] {
  const members = selectedMembers(party, memberIds);
  return partyToForecastConfig(party, memberIds).members.map((config, index) => {
    const member = members[index];
    const simulated = buildSimPlayer(config, index);
    const detail = [
      `Level ${member.level}`,
      member.classLabel || member.templateId,
      member.notes?.trim(),
    ].filter(Boolean).join(' · ');
    return {
      id: `party-${member.id}`,
      sourcePartyMemberId: member.id,
      name: simulated.name,
      kind: 'player',
      initiative: 0,
      // Party profiles do not model ability scores. A neutral value keeps the
      // organizer honest until the DM enters the character's actual Dexterity.
      dexterity: 10,
      armorClass: simulated.ac,
      maxHp: simulated.maxHp,
      currentHp: simulated.maxHp,
      tempHp: 0,
      conditions: [],
      concentration: false,
      reactionUsed: false,
      legendaryActionsMax: 0,
      legendaryActionsUsed: 0,
      notes: detail,
    };
  });
}

export interface PartyNoncombatDefaults {
  partySize: number;
  partyLevel: number;
}

/** Noncombat engines currently accept one level, so use the rounded mean. */
export function partyToNoncombatDefaults(
  party: PartyProfile,
  memberIds?: readonly string[],
): PartyNoncombatDefaults | null {
  const members = selectedMembers(party, memberIds);
  if (members.length === 0) return null;
  return {
    partySize: members.length,
    partyLevel: Math.round(members.reduce((sum, member) => sum + member.level, 0) / members.length),
  };
}

export interface DmPartyMemberSummary {
  id: string;
  name: string;
  playerName?: string;
  classLabel: string;
  level: number;
  armorClass: number;
  initiativeBonus?: number;
  passivePerception?: number;
  notes?: string;
}

export interface DmPartySummary {
  id: string;
  name: string;
  memberCount: number;
  levelRange: { min: number; max: number } | null;
  members: DmPartyMemberSummary[];
}

export function partyToDmScreenSummary(
  party: PartyProfile,
  memberIds?: readonly string[],
): DmPartySummary {
  const members = selectedMembers(party, memberIds);
  const summaries = partyToForecastConfig(party, memberIds).members.map((config, index) => {
    const source = members[index];
    const simulated = buildSimPlayer(config, index);
    return {
      id: source.id,
      name: simulated.name,
      ...(source.playerName !== undefined ? { playerName: source.playerName } : {}),
      classLabel: source.classLabel || source.templateId,
      level: source.level,
      armorClass: simulated.ac,
      ...(source.initiativeBonus !== undefined
        ? { initiativeBonus: source.initiativeBonus }
        : {}),
      ...(source.passivePerception !== undefined
        ? { passivePerception: source.passivePerception }
        : {}),
      ...(source.notes !== undefined ? { notes: source.notes } : {}),
    };
  });
  const levels = summaries.map((member) => member.level);
  return {
    id: party.id,
    name: party.name,
    memberCount: summaries.length,
    levelRange: levels.length > 0 ? { min: Math.min(...levels), max: Math.max(...levels) } : null,
    members: summaries,
  };
}
