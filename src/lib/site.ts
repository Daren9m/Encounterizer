// ─── Site Constants ──────────────────────────────────────────────
// One source of truth for the site URL, route list, and per-route copy.
// The nav, homepage cards, sitemap, and per-page metadata all read from
// here so they can never drift apart.

export const SITE_NAME = 'Encounterizer';

export const SITE_DESCRIPTION =
  'Free D&D 5.5e Dungeon Master toolkit — balanced encounters, live battle tools, '
  + 'a searchable rules reference, 331-monster SRD bestiary, maps, puzzles, and spells. '
  + 'No accounts, no server, no cost.';

/** Set the SITE_URL repo variable once the Azure Static Web App exists.
 *  `||` (not `??`) on purpose: when the repo variable is unset, GitHub
 *  Actions passes an EMPTY string, which must also fall back — new URL('')
 *  throws and kills the build. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://encounterizer.azurestaticapps.net';

/** Lucide icon names for the tool routes — rendered by RouteIcon. */
export type RouteIconName =
  | 'swords'
  | 'skull'
  | 'map'
  | 'puzzle'
  | 'sparkles'
  | 'screen'
  | 'battle'
  | 'book';

export interface RouteInfo {
  path: string;
  label: string;
  title: string;
  description: string;
  icon: RouteIconName;
}

export type ToolSectionId = 'prep' | 'run' | 'reference';

export interface ToolSection {
  id: ToolSectionId;
  label: string;
  description: string;
  routes: RouteInfo[];
}

/**
 * The primary information architecture for the toolkit. Keep tools grouped by
 * the moment a DM needs them instead of adding more items to one flat menu.
 */
export const TOOL_SECTIONS: ToolSection[] = [
  {
    id: 'prep',
    label: 'Prep',
    description: 'Create the encounters, locations, and scenes for your next session.',
    routes: [
      {
        path: '/encounters',
        label: 'Encounters',
        title: 'Encounter Builder',
        description:
          'Build balanced D&D 5.5e encounters with 2024 XP budgets, then run the Battle Forecast — 1,000 simulated fights before your party rolls initiative.',
        icon: 'swords',
      },
      {
        path: '/maps',
        label: 'Maps',
        title: 'Battle Map Generator',
        description:
          'Procedural battle maps for D&D — BSP dungeons, cellular-automata caves, and outdoor terrain, tuned per environment.',
        icon: 'map',
      },
      {
        path: '/noncombat',
        label: 'Puzzles & Challenges',
        title: 'Puzzles & Challenges',
        description:
          'Verified puzzles, riddles, ciphers, contests, social encounters, journeys, traps, chases, and investigations — one levered, themed, seeded generator.',
        icon: 'puzzle',
      },
    ],
  },
  {
    id: 'run',
    label: 'Run',
    description: 'Keep the session moving with a focused screen and live battle flow.',
    routes: [
      {
        path: '/dm-screen',
        label: 'DM Screen',
        title: 'DM Screen',
        description:
          'Build a private, collapsible command screen from monsters, spells, notes, tool links, and a live battle tracker—then export the complete setup.',
        icon: 'screen',
      },
      {
        path: '/battle',
        label: 'Battle',
        title: 'Battle Organizer',
        description:
          'Gather initiative, call next up and on deck, track HP, conditions, concentration, reactions, legendary actions, rounds, and the flow of a live battle.',
        icon: 'battle',
      },
    ],
  },
  {
    id: 'reference',
    label: 'Reference',
    description: 'Find the rules, creatures, and spells you need without breaking the flow.',
    routes: [
      {
        path: '/reference',
        label: 'DM Reference',
        title: 'DM Reference',
        description:
          'Search the rules DMs reach for most—conditions, checks, combat, damage, recovery, movement, and visibility—in one fast reference.',
        icon: 'book',
      },
      {
        path: '/monsters',
        label: 'Bestiary',
        title: 'Monster Bestiary',
        description:
          'Browse 331 SRD 5.2.1 monsters with deep filters — CR, type, movement, damage types, resistances — or import your own from JSON.',
        icon: 'skull',
      },
      {
        path: '/spells',
        label: 'Spells',
        title: 'Spell Reference',
        description:
          'Every SRD 5.2.1 spell, levels 0–9, with mechanics-first summaries, full rules text, filters for level, school, class, concentration, and side-by-side pinning.',
        icon: 'sparkles',
      },
    ],
  },
];

/** Flat compatibility view for metadata, cards, and consumers that do not need sections. */
export const TOOL_ROUTES: RouteInfo[] = TOOL_SECTIONS.flatMap((section) => section.routes);

/** Tools that make sense as links from inside a DM Screen. The screen itself
 * is intentionally excluded: embedding a link back to the current surface is
 * circular and appears broken when selected. */
export const DM_SCREEN_TOOL_ROUTES: RouteInfo[] = TOOL_ROUTES.filter(
  (route) => route.path !== '/dm-screen',
);

/** Every indexable route — drives sitemap.xml. */
export const ALL_ROUTE_PATHS: string[] = [
  '/',
  ...TOOL_ROUTES.map((r) => r.path),
  '/credits',
];
