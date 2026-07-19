// ─── Non-Combat Challenge Cast Pools ──────────────────────────────
// Content library for the social framework in src/lib/challenge-
// frameworks/social.ts. PR 2's counterpart to noncombat-scenarios.ts.
// Personas, wants, secrets, and leverage combine to build a principal
// NPC; complications and interruptions add live pressure to the scene.
//
// Authoring rule: no dice expressions or DC numbers in these strings
// — the engines attach the numbers. Keep prose vivid and table-ready,
// D&D fantasy register, no anachronisms.

export interface Persona { archetype: string; quirk: string; speech: string }
export interface Leverage {
  kind: 'coin' | 'flattery' | 'threat' | 'logic' | 'favor' | 'secret-for-secret';
  approach: string;   // what moves them
  counter: string;    // what backfires
}

// ─── Personas ───────────────────────────────────────────────────────
export const PERSONAS: Persona[] = [
  { archetype: 'a guild clerk drowning in ledgers', quirk: 'stacks and restacks papers when nervous', speech: 'answers questions with smaller questions' },
  { archetype: 'a retired sell-sword turned innkeep', quirk: 'polishes the same tankard throughout', speech: 'short sentences, long pauses' },
  { archetype: 'a temple acolyte assigned to watch the visitors', quirk: 'touches the holy symbol before every lie', speech: 'quotes scripture that never quite fits' },
  { archetype: 'a caravan master counting losses', quirk: 'taps a tally stick against their palm', speech: 'talks in freight weights and travel days' },
  { archetype: "a minor noble's steward doing the noble's real work", quirk: 'straightens whatever is nearest before speaking', speech: 'formal to the point of stiffness, until provoked' },
  { archetype: 'a midwife who has delivered half the district', quirk: 'sizes up strangers like she is checking for a fever', speech: 'blunt, and unbothered by rank' },
  { archetype: 'a river ferryman who has seen every kind of passenger', quirk: 'spits over the rail before naming a price', speech: 'trades in questions that are really answers' },
  { archetype: 'a disgraced hedge-mage scraping by on charms', quirk: 'mutters the end of every sentence twice', speech: 'over-explains the harmless magic and dodges the rest' },
  { archetype: 'a town crier who knows more than the news he shouts', quirk: 'clears his throat before anything true', speech: 'performs even private conversations' },
  { archetype: 'a mercenary captain between contracts', quirk: 'counts exits in any room within a breath of entering', speech: 'names a price for everything, including advice' },
  { archetype: 'a widowed innfolk running the family trade alone', quirk: 'wipes hands on an apron that is never actually dirty', speech: 'warm until money or the dead come up' },
  { archetype: "a gatehouse sergeant tired of being no one's priority", quirk: 'rolls a shoulder that never quite healed right', speech: 'clipped orders even when making requests' },
  { archetype: 'a traveling relic-appraiser with a magnifying loupe on a chain', quirk: 'squints at anything shiny, mid-sentence', speech: 'prices things aloud without meaning to' },
  { archetype: 'a shrine keeper tending a god whose worship has thinned', quirk: 'lights a candle for every visitor, believer or not', speech: 'gentle, but circles back to the same worry' },
];

// ─── Wants ──────────────────────────────────────────────────────────
export const WANTS: string[] = [
  'safe passage for a wagon that must not be inspected',
  "a rival's letter retrieved before it is read aloud at council",
  'proof that a debt was already paid, before the collectors arrive',
  'someone trustworthy to carry a message no courier will touch',
  'a missing relative found before the harvest festival',
  'a rival merchant undercut without anyone tracing it back',
  'an old promise called in, quietly, without witnesses',
  'a stolen heirloom returned before its absence is noticed',
  'a dangerous rumor about them stopped before it spreads further',
  'an outsider to vouch for them at a hearing they cannot attend',
  'safe escort past a watch post they would rather not explain',
  'a poisoned business deal undone before the ink dries',
  'someone willing to take the blame for a mistake that was not theirs',
  'a family grudge settled without it turning into a feud',
  'a shipment recovered before its owner learns it went missing',
  'a confession pried from someone who owes them nothing',
  'protection for a family member who has made dangerous enemies',
  'a forged document quietly destroyed before it is used against them',
  'an old rival humiliated in a way that cannot be traced back to them',
  'the truth about a death that the authorities have already closed the book on',
];

// ─── Secrets ────────────────────────────────────────────────────────
export const SECRETS: string[] = [
  'the debt they owe is to someone who does not forgive in coin',
  'they witnessed the crime everyone is asking about — from the wrong side',
  'they are not who their papers say they are',
  'they once took a bribe that got someone else killed',
  'they are hiding a sibling the law wants for a crime long past',
  'the object everyone assumes was stolen was theirs to give away',
  'they have been forging a signature for years and no one has noticed',
  'they know exactly where the missing person is, and why they left',
  'they broke a vow to a temple that has not forgotten',
  'the accident that maimed them was no accident at all',
  'they are quietly buying up debts to seize the land beneath them',
  'they have been feeding information to the very people they claim to fear',
  "they buried a body and have told three different lies about the grave since",
  'their claim to the family trade rests on a will that was never real',
  'they let an innocent take the blame once, and would do it again',
  'they are dying of something slow, and no one else knows yet',
  'the ledger they keep so carefully is a second, false set of books',
  'they once loved someone the party is now hunting',
  'they arranged the very disaster they are now offering to help solve',
  'they have been quietly stockpiling supplies for a war no one else believes is coming',
];

// ─── Leverage ───────────────────────────────────────────────────────
export const LEVERAGE: Leverage[] = [
  { kind: 'coin', approach: 'a fair price named plainly, half up front', counter: 'haggling insults them — the price rises' },
  { kind: 'secret-for-secret', approach: 'trade a confidence of equal weight', counter: 'a hollow or invented secret ends all trust' },
  { kind: 'flattery', approach: 'genuine praise for the one thing they are actually proud of', counter: 'flattery that misses the mark reads as mockery' },
  { kind: 'threat', approach: 'a quiet, specific warning of a consequence they cannot afford', counter: 'an empty or exaggerated threat makes them call the bluff — and remember the insult' },
  { kind: 'logic', approach: 'lay out the plain arithmetic of their own self-interest', counter: 'condescension in the explanation turns agreement into stubbornness' },
  { kind: 'favor', approach: 'call on a debt they already owe, or offer one worth collecting later', counter: 'a favor that costs them more than it is worth breeds resentment, not gratitude' },
];

// ─── Social Complications ───────────────────────────────────────────
export const SOCIAL_COMPLICATIONS: string[] = [
  'a rival faction watches the conversation and will act on whatever is agreed',
  'the persona is being watched by someone they are terrified of, and it shows',
  'a mutual acquaintance arrives and expects to be included in the conversation',
  'the persona has already promised the same thing to someone else',
  'guards patrol close enough to overhear anything said too loudly',
  'the persona is testing the party to see if they can be trusted with something larger',
  'someone in earshot is taking notes for a person the party has not met yet',
  'the persona is only half paying attention — a real crisis is unfolding elsewhere',
  'the deal being struck would ruin a friend of the persona if it ever got out',
  'a child or apprentice of the persona is present and old enough to understand everything',
];

// ─── Interruptions ──────────────────────────────────────────────────
export const INTERRUPTIONS: string[] = [
  'a third party arrives mid-conversation with a competing offer',
  'a messenger bursts in with news that changes the persona\'s priorities entirely',
  'the persona is suddenly and visibly recognized by someone they hoped to avoid',
  'a loud commotion outside draws everyone\'s attention for a crucial moment',
  'someone the persona owes money to walks in and demands to be paid on the spot',
  'a piece of evidence relevant to the secret is dropped, delivered, or overheard in the room',
  'the persona receives a note that visibly unsettles them and changes their tone',
  'an old enemy of the persona recognizes one of the party and says so, loudly',
];
