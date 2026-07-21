import {
  DM_SCREEN_DOCUMENT_VERSION,
  isDmScreenState,
  mergeDmScreenDocuments,
  type DmScreenIdFactory,
  type DmScreenItem,
  type DmScreenItemKind,
  type DmScreenMergeResult,
  type DmScreenPanelWidth,
  type DmScreenSection,
  type DmScreenState,
} from './dm-screen';

export const BUILT_IN_DM_SCREEN_TEMPLATE_IDS = [
  'quick-start',
  'combat-night',
  'story-exploration',
  'blank',
] as const;

export type BuiltInDmScreenTemplateId = typeof BUILT_IN_DM_SCREEN_TEMPLATE_IDS[number];

export interface DmScreenTemplateFactoryOptions {
  /** Primarily useful for deterministic tests and imported user templates. */
  createId?: DmScreenIdFactory;
}

/**
 * The chooser consumes this contract rather than a closed union, leaving room
 * for user-saved and campaign templates to provide the same factory later.
 */
export interface DmScreenTemplateDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Short, ordered labels suitable for a chooser preview. */
  readonly contents: readonly string[];
  create(options?: DmScreenTemplateFactoryOptions): DmScreenState;
}

interface TemplateItemBlueprint {
  readonly kind: DmScreenItemKind;
  readonly title: string;
  readonly width: DmScreenPanelWidth;
  readonly body?: string;
  readonly href?: string;
  readonly collapsed?: boolean;
}

interface TemplateSectionBlueprint {
  readonly title: string;
  readonly items: readonly TemplateItemBlueprint[];
  readonly children?: readonly TemplateSectionBlueprint[];
  readonly collapsed?: boolean;
}

interface TemplateBlueprint {
  readonly id: BuiltInDmScreenTemplateId;
  readonly name: string;
  readonly description: string;
  readonly contents: readonly string[];
  readonly screenTitle: string;
  readonly autoAddPinnedMonsters: boolean;
  readonly autoAddPinnedSpells: boolean;
  readonly density: 'comfortable' | 'compact';
  readonly sections: readonly TemplateSectionBlueprint[];
}

let fallbackIdCounter = 0;

function createDefaultId(kind: Parameters<DmScreenIdFactory>[0]): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${kind}-${uuid}`;

  fallbackIdCounter += 1;
  return `${kind}-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function instantiateItem(
  blueprint: TemplateItemBlueprint,
  createId: DmScreenIdFactory,
): DmScreenItem {
  return {
    id: createId('item'),
    kind: blueprint.kind,
    title: blueprint.title,
    collapsed: blueprint.collapsed ?? false,
    layout: {
      width: blueprint.width,
      stashed: false,
      excludedFromPrint: false,
    },
    origin: 'manual',
    ...(blueprint.body === undefined ? {} : { body: blueprint.body }),
    ...(blueprint.href === undefined ? {} : { href: blueprint.href }),
  };
}

function instantiateSection(
  blueprint: TemplateSectionBlueprint,
  createId: DmScreenIdFactory,
): DmScreenSection {
  return {
    id: createId('section'),
    title: blueprint.title,
    collapsed: blueprint.collapsed ?? false,
    items: blueprint.items.map((item) => instantiateItem(item, createId)),
    children: (blueprint.children ?? []).map((section) => instantiateSection(section, createId)),
  };
}

function instantiateBlueprint(
  blueprint: TemplateBlueprint,
  options: DmScreenTemplateFactoryOptions = {},
): DmScreenState {
  const createId = options.createId ?? createDefaultId;
  const document: DmScreenState = {
    version: DM_SCREEN_DOCUMENT_VERSION,
    id: createId('screen'),
    revision: 0,
    title: blueprint.screenTitle,
    autoAddPinnedMonsters: blueprint.autoAddPinnedMonsters,
    autoAddPinnedSpells: blueprint.autoAddPinnedSpells,
    layout: { columns: 'auto', density: blueprint.density },
    sections: blueprint.sections.map((section) => instantiateSection(section, createId)),
  };

  if (!isDmScreenState(document)) {
    throw new TypeError(`DM Screen template "${blueprint.id}" produced an invalid document.`);
  }
  return document;
}

const BUILT_IN_BLUEPRINTS = [
  {
    id: 'quick-start',
    name: 'Quick Start',
    description: 'The essentials for running almost any session.',
    contents: ['Party overview', 'Initiative', 'Quick notes', 'Core rules'],
    screenTitle: 'Tonight’s DM Screen',
    autoAddPinnedMonsters: true,
    autoAddPinnedSpells: true,
    density: 'comfortable',
    sections: [
      {
        title: 'Session Control',
        items: [
          { kind: 'party', title: 'Party Overview', width: 'wide' },
          { kind: 'initiative', title: 'Initiative', width: 'wide' },
        ],
      },
      {
        title: 'Notes & Rules',
        items: [
          {
            kind: 'note',
            title: 'Quick Notes',
            width: 'standard',
            body: 'Names, rulings, reminders, and anything you need to remember tonight.',
          },
          { kind: 'rules', title: 'Core Rules', width: 'full', collapsed: true },
        ],
      },
    ],
  },
  {
    id: 'combat-night',
    name: 'Combat Night',
    description: 'Initiative, party status, enemy references, conditions, and combat notes.',
    contents: ['Wide initiative', 'Party status', 'Monsters', 'Conditions', 'Combat notes'],
    screenTitle: 'Combat Night',
    autoAddPinnedMonsters: true,
    autoAddPinnedSpells: true,
    density: 'compact',
    sections: [
      {
        title: 'Combat Control',
        items: [
          { kind: 'initiative', title: 'Initiative & Rounds', width: 'wide' },
          { kind: 'party', title: 'Party Status', width: 'standard' },
        ],
      },
      {
        title: 'Encounter Reference',
        items: [
          {
            kind: 'tool',
            title: 'Monsters',
            width: 'standard',
            body: 'Open the bestiary to find stat blocks. Pinned monsters appear on this screen automatically.',
            href: '/monsters',
          },
          { kind: 'rules', title: 'Conditions & Combat Rules', width: 'wide', collapsed: true },
        ],
      },
      {
        title: 'Combat Notes',
        items: [
          {
            kind: 'note',
            title: 'Combat Notes',
            width: 'full',
            body: 'Enemy tactics, battlefield changes, concentration, reinforcements, and rulings.',
          },
        ],
      },
    ],
  },
  {
    id: 'story-exploration',
    name: 'Story & Exploration',
    description: 'Scene notes, clues, party context, and common checks.',
    contents: ['Scene notes', 'Clues & discoveries', 'NPC reminders', 'Party overview', 'Common checks'],
    screenTitle: 'Story & Exploration',
    autoAddPinnedMonsters: true,
    autoAddPinnedSpells: true,
    density: 'comfortable',
    sections: [
      {
        title: 'Current Scene',
        items: [
          {
            kind: 'note',
            title: 'Scene Notes',
            width: 'wide',
            body: 'Location, mood, sensory details, active threats, and what changes if the party waits.',
          },
          {
            kind: 'note',
            title: 'Clues & Discoveries',
            width: 'standard',
            body: 'Clues discovered, open questions, hidden connections, and information still in play.',
          },
          {
            kind: 'note',
            title: 'NPC Reminders',
            width: 'standard',
            body: 'Names, motives, voices, relationships, and what each NPC wants right now.',
          },
        ],
      },
      {
        title: 'At a Glance',
        items: [
          { kind: 'party', title: 'Party Overview', width: 'standard' },
          { kind: 'rules', title: 'Common Checks', width: 'wide', collapsed: true },
        ],
      },
    ],
  },
  {
    id: 'blank',
    name: 'Blank Screen',
    description: 'Start empty and add only what this session needs.',
    contents: [],
    screenTitle: 'Untitled DM Screen',
    autoAddPinnedMonsters: false,
    autoAddPinnedSpells: false,
    density: 'comfortable',
    sections: [],
  },
] as const satisfies readonly TemplateBlueprint[];

function defineBuiltInTemplate(blueprint: TemplateBlueprint): DmScreenTemplateDefinition {
  return Object.freeze({
    id: blueprint.id,
    name: blueprint.name,
    description: blueprint.description,
    contents: Object.freeze([...blueprint.contents]),
    create: (options?: DmScreenTemplateFactoryOptions) => instantiateBlueprint(blueprint, options),
  });
}

export const DM_SCREEN_TEMPLATES: readonly DmScreenTemplateDefinition[] = Object.freeze(
  BUILT_IN_BLUEPRINTS.map(defineBuiltInTemplate),
);

export function getDmScreenTemplate(id: string): DmScreenTemplateDefinition | undefined {
  return DM_SCREEN_TEMPLATES.find((template) => template.id === id);
}

function resolveTemplate(
  templateOrId: string | DmScreenTemplateDefinition,
): DmScreenTemplateDefinition {
  if (typeof templateOrId !== 'string') return templateOrId;
  const template = getDmScreenTemplate(templateOrId);
  if (!template) throw new RangeError(`Unknown DM Screen template: ${templateOrId}`);
  return template;
}

export function createDmScreenFromTemplate(
  templateOrId: string | DmScreenTemplateDefinition,
  options: DmScreenTemplateFactoryOptions = {},
): DmScreenState {
  const template = resolveTemplate(templateOrId);
  const document = template.create(options);
  if (!isDmScreenState(document)) {
    throw new TypeError(`DM Screen template "${template.id}" produced an invalid document.`);
  }
  return document;
}

/**
 * Adds a freshly instantiated template after existing sections. Both source
 * orders are retained, and the document merge remaps any colliding IDs.
 */
export function addDmScreenTemplate(
  current: DmScreenState,
  templateOrId: string | DmScreenTemplateDefinition,
  options: DmScreenTemplateFactoryOptions = {},
): DmScreenMergeResult {
  const incoming = createDmScreenFromTemplate(templateOrId, options);
  return mergeDmScreenDocuments(current, incoming, { createId: options.createId });
}
