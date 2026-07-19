// ─── Player-View Projection ──────────────────────────────────────
// The single choke point defining what players see. Everything the
// player route and DM toolbar render or export passes through here —
// the spoiler lint (player-view.test.ts) targets this output, so no
// generator can leak mechanics by forgetting which field is
// player-facing. Spec: 2026-07-19-player-handout-overhaul-design.md.

import { handoutToText } from './handout-text';
import type { HandoutSpec } from './types';
import type { NoncombatResult } from './generate';

export interface PlayerView {
  title: string;
  readAloud: string;
  handout?: HandoutSpec;
}

export interface PlayerViewMeta {
  seed: number;
  /** Absolute URL of the PLAYER route (never the DM route). */
  playerUrl: string;
}

// Trap frame names describe the mechanism — a neutral title instead.
const TRAP_TITLE = 'The Way Ahead';

export function toPlayerView(result: NoncombatResult): PlayerView {
  return {
    title: result.kind === 'trap' ? TRAP_TITLE : result.name,
    readAloud: result.readAloud,
    // Investigation's clue-card deck is dealt one card at a time by the
    // DM — projecting the whole deck (red herring and culprit clues
    // included) onto the player screen would solve the mystery at scene
    // start, so it stays DM-side like the trap frame's name.
    handout: result.kind === 'investigation' ? undefined : result.handout,
  };
}

export function playerViewToMarkdown(view: PlayerView): string {
  const lines = [`# ${view.title}`, '', ...view.readAloud.split('\n').map(l => `> ${l}`)];
  if (view.handout) {
    const heading = view.handout.kind === 'text' && view.handout.title ? view.handout.title : 'Handout';
    // Text handouts embed their title in handoutToText — use the body
    // directly so the heading is not duplicated.
    const body = view.handout.kind === 'text' ? view.handout.body : handoutToText(view.handout);
    lines.push('', `## ${heading}`, '', body);
  }
  return lines.join('\n');
}

export function playerViewToJson(view: PlayerView, meta: PlayerViewMeta): string {
  return JSON.stringify(
    {
      format: 'encounterizer-player-handout',
      version: 1,
      seed: meta.seed,
      playerUrl: meta.playerUrl,
      title: view.title,
      readAloud: view.readAloud,
      handout: view.handout ?? null,
    },
    null,
    2,
  );
}
