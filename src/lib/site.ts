// ─── Site Constants ──────────────────────────────────────────────
// One source of truth for the site URL, route list, and per-route copy.
// The nav, homepage cards, sitemap, and per-page metadata all read from
// here so they can never drift apart.

export const SITE_NAME = 'Encounterizer';

export const SITE_DESCRIPTION =
  'Free D&D 5.5e encounter toolkit — balanced encounters, battle forecasts, '
  + 'a 331-monster SRD bestiary, battle maps, puzzles, and spells. '
  + 'No accounts, no server, no cost.';

/** Set the SITE_URL repo variable once the Azure Static Web App exists. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://encounterizer.azurestaticapps.net';

export interface RouteInfo {
  path: string;
  label: string;
  title: string;
  description: string;
  icon: string;
}

export const TOOL_ROUTES: RouteInfo[] = [
  {
    path: '/encounters',
    label: 'Encounters',
    title: 'Encounter Builder',
    description:
      'Build balanced D&D 5.5e encounters with 2024 XP budgets, then run the Battle Forecast — 1,000 simulated fights before your party rolls initiative.',
    icon: '⚔️',
  },
  {
    path: '/monsters',
    label: 'Bestiary',
    title: 'Monster Bestiary',
    description:
      'Browse 331 SRD 5.2.1 monsters with deep filters — CR, type, movement, damage types, resistances — or import your own from JSON.',
    icon: '🐉',
  },
  {
    path: '/maps',
    label: 'Maps',
    title: 'Battle Map Generator',
    description:
      'Procedural battle maps for D&D — BSP dungeons, cellular-automata caves, and outdoor terrain, tuned per environment.',
    icon: '🗺️',
  },
  {
    path: '/puzzles',
    label: 'Puzzles',
    title: 'Puzzle Generator',
    description:
      'Ready-to-run riddles, ciphers, and minigames with DM briefs, read-aloud text, player handouts, and progressive hints.',
    icon: '🧩',
  },
  {
    path: '/challenges',
    label: 'Challenges',
    title: 'Non-Combat Challenges',
    description:
      'Social encounters, exploration hazards, skill challenges, and traps — complete with stakes, complications, and outcomes.',
    icon: '🎭',
  },
  {
    path: '/spells',
    label: 'Spells',
    title: 'Spell Reference',
    description:
      'Instant spell lookup with mechanics-first summaries, filters for level, school, class, concentration, and side-by-side pinning.',
    icon: '✨',
  },
];

/** Every indexable route — drives sitemap.xml. */
export const ALL_ROUTE_PATHS: string[] = [
  '/',
  ...TOOL_ROUTES.map((r) => r.path),
  '/credits',
];
