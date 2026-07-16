import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  PILOT_MONSTER_IDS,
  type MonsterVisualDataset,
} from '../src/lib/monster-visuals';
import type { AuthoredVisual } from './visual-descriptions/types';

const descriptions: Record<(typeof PILOT_MONSTER_IDS)[number], AuthoredVisual> = {
  aboleth: {
    appearance:
      'A massive primordial amphibious predator with a long, muscular fishlike body, a broad blunt head, three pale eyes arranged vertically, and four powerful facial tentacles. Its slick skin is ridged and scarred, with low fins running along the spine and a heavy tapering tail built for deep water.',
    silhouette:
      'Long horizontal body with a blunt wedge-shaped head, four trailing tentacles, low dorsal fins, and a broad swimming tail.',
    materials: ['slick blue-gray hide', 'translucent fin membranes', 'ropes of clear mucus', 'ivory teeth'],
    pose: 'Swimming toward the viewer in a slow three-quarter turn, tentacles spread to probe the dark water.',
    palette: ['abyssal blue-gray', 'bruised violet', 'pale pearl eyes', 'cold cyan rim light'],
    mustInclude: ['exactly four prominent facial tentacles', 'three vertically arranged eyes', 'visible mucus cloud', 'aquatic tail and fins'],
    mustAvoid: ['octopus body', 'humanoid torso', 'extra eyes', 'extra tentacles', 'dry skin'],
    environment: 'A lightless submerged cavern with distant stone columns and drifting particulate',
    altText: 'A huge blue-gray aboleth with three eyes and four tentacles glides through a dark underwater cavern.',
  },
  bat: {
    appearance:
      'A tiny natural bat with a compact furred body, a short muzzle, large alert ears, small dark eyes, and broad finger-boned wings joined by thin membranes. Its hind feet curl beneath the body and the wing membranes show delicate veins in the light.',
    silhouette: 'A small central body beneath two broad angular wings, with large pointed ears and tiny hooked feet.',
    materials: ['soft charcoal-brown fur', 'thin leathery wing membranes', 'small black claws'],
    pose: 'Banking in mid-flight with one wing slightly forward, ears raised as if tracking a sound.',
    palette: ['charcoal brown', 'warm umber', 'soft gray', 'moonlit blue'],
    mustInclude: ['two wings with clearly readable finger bones', 'large ears', 'realistic bat anatomy'],
    mustAvoid: ['vampire costume elements', 'horns', 'dragon wings', 'snarling monster proportions'],
    environment: 'The mouth of a quiet limestone cave at dusk with a soft, uncluttered background',
    altText: 'A small charcoal-brown bat banks through the moonlit mouth of a limestone cave.',
  },
  couatl: {
    appearance:
      'A graceful celestial serpent covered in fine jewel-toned feathers rather than scales, with a refined draconic head, calm luminous eyes, and a pair of broad feathered wings. Long iridescent plumes flow from its crown and tail, giving the creature a sacred, ceremonial presence.',
    silhouette: 'An elegant S-curved serpent framed by two fully spread feathered wings and a long tapering plume-tail.',
    materials: ['layered iridescent feathers', 'soft down along the throat', 'polished ivory fangs', 'subtle golden radiance'],
    pose: 'Hovering in a serene ascending coil, wings open symmetrically and head turned in watchful profile.',
    palette: ['emerald', 'turquoise', 'sapphire', 'sunlit gold', 'small accents of crimson'],
    mustInclude: ['serpentine body', 'one pair of feathered wings', 'feathered body covering', 'benevolent celestial expression'],
    mustAvoid: ['legs', 'multiple wing pairs', 'bat wings', 'western dragon body', 'menacing demonic expression'],
    environment: 'A sunlit forest-temple clearing with soft stone shapes and mist kept well behind the subject',
    altText: 'An iridescent feathered couatl coils in the air with broad wings spread above a misty temple clearing.',
  },
  'animated-armor': {
    appearance:
      'An empty suit of full plate armor held upright by invisible force. The helmet visor is black and vacant, every articulated plate is present, and faint arcane light leaks through narrow joints without forming a body inside.',
    silhouette: 'A broad-shouldered armored humanoid with a closed helm, heavy gauntlets, plated skirt, and firmly planted sabatons.',
    materials: ['darkened steel plate', 'worn leather straps', 'small brass rivets', 'faint blue arcane light'],
    pose: 'Advancing with both empty gauntlets raised for a crushing slam, torso rigid and unnaturally balanced.',
    palette: ['gunmetal', 'aged iron', 'muted brass', 'cold spectral blue'],
    mustInclude: ['clearly empty visor', 'complete suit of plate armor', 'two raised gauntlets', 'subtle magic visible at joints'],
    mustAvoid: ['visible wearer', 'exposed flesh', 'weapon', 'floating disconnected armor pieces', 'ornate royal regalia'],
    environment: 'A shadowed castle corridor with worn flagstones and restrained blue ambient light',
    altText: 'An empty dark-steel suit of animated plate armor advances through a castle corridor with raised fists.',
  },
  'red-dragon-wyrmling': {
    appearance:
      'A young but powerfully built red dragon with four clawed legs, two leathery wings, a long counterbalancing tail, and a wedge-shaped head crowned by swept-back horns. Overlapping crimson scales darken along the spine, while ember light glows between a few throat scales.',
    silhouette: 'Compact quadrupedal dragon with high folded wings, a horned angular head, low shoulders, and a long whip-like tail.',
    materials: ['overlapping crimson scales', 'dark horn and claw keratin', 'smoky wing membranes', 'ember-lit throat plates'],
    pose: 'Crouched on volcanic rock with wings half-open, head thrust forward as smoke curls from its jaws.',
    palette: ['deep crimson', 'charred maroon', 'black horn', 'molten orange'],
    mustInclude: ['four legs', 'exactly two wings', 'swept-back horns', 'juvenile proportions', 'sign of gathering fire breath'],
    mustAvoid: ['adult colossal proportions', 'feathers', 'extra limbs', 'friendly pet expression', 'golden or metallic scales'],
    environment: 'A rocky mountainside vent with dim smoke and a restrained lava glow in the distance',
    altText: 'A juvenile red dragon crouches on volcanic rock, wings spread and smoke curling from its jaws.',
  },
  'fire-elemental': {
    appearance:
      'A towering living conflagration whose torso, head, and long arms are suggested by layered sheets of flame rather than solid anatomy. A white-hot core shows through the chest, while the lower body narrows into a turbulent column of fire and airborne embers.',
    silhouette: 'Tall tapering flame-form with a narrow crown-like head, two elongated arms, broad shoulders, and no legs or solid feet.',
    materials: ['transparent layered flame', 'white-hot plasma core', 'dark sparks', 'heat distortion'],
    pose: 'Surging forward in a sweeping arc, one flame-arm extended as the whole figure streams with its motion.',
    palette: ['white-yellow core', 'gold', 'orange', 'deep ember red', 'charcoal sparks'],
    mustInclude: ['entire body made of fire', 'two readable arm shapes', 'tapering flame base', 'visible heat distortion'],
    mustAvoid: ['solid skin', 'armor', 'clothing', 'separate legs', 'human facial detail', 'blue water effects'],
    environment: 'A scorched planar expanse with black glassy ground and subdued smoke',
    altText: 'A towering humanoid-shaped fire elemental surges across blackened ground in a shower of embers.',
  },
  'goblin-warrior': {
    appearance:
      'A small, wiry fey goblinoid warrior with angular features, large pointed ears, keen eyes, and quick, balanced limbs. It wears practical mismatched armor over travel-stained clothing and carries a curved scimitar with a shortbow and compact quiver close to the body.',
    silhouette: 'Small crouched humanoid with oversized pointed ears, a curved blade held low, and a shortbow crossing the back.',
    materials: ['patched leather', 'dented iron plates', 'rough woven cloth', 'dark wood bow', 'well-used steel'],
    pose: 'In a low mobile fighting stance, scimitar forward and free hand ready to dart away.',
    palette: ['moss green skin', 'rust brown', 'dull iron', 'mustard cloth', 'dark wood'],
    mustInclude: ['large pointed ears', 'scimitar', 'shortbow and quiver', 'light practical armor', 'small agile build'],
    mustAvoid: ['childlike proportions', 'oversized muscular body', 'modern gear', 'comedic expression', 'orc tusks'],
    environment: 'A dim forest path beside weathered stones with enough open ground to read the full stance',
    altText: 'A small green-skinned goblin warrior crouches on a forest path with scimitar drawn and shortbow ready.',
  },
  imp: {
    appearance:
      'A tiny lean devil with leathery wings, narrow shoulders, long clawed fingers, short curved horns, and a flexible tail ending in a sharp venomous barb. Its angular face carries an alert, calculating expression rather than brute ferocity.',
    silhouette: 'Small airborne humanoid framed by two pointed batlike wings, with horns above and a long barbed tail curling below.',
    materials: ['dark red leathery hide', 'smoky wing membranes', 'black horn and claw keratin', 'glossy tail barb'],
    pose: 'Hovering in a tight turn with claws tucked and the barbed tail poised to strike from below.',
    palette: ['oxblood red', 'smoke black', 'burnt umber', 'small sulfur-yellow highlights'],
    mustInclude: ['tiny scale', 'one pair of leathery wings', 'two short horns', 'long tail with a single stinger barb'],
    mustAvoid: ['trident', 'hooves', 'large muscular demon body', 'extra wings', 'cartoon mascot expression'],
    environment: 'A shadowed infernal stone alcove lit by a low ember glow',
    altText: 'A tiny red imp hovers in a dark stone alcove with leathery wings spread and barbed tail raised.',
  },
  'fire-giant': {
    appearance:
      'A towering, massively built giant with charcoal-dark skin, ember-red hair, and a squared, disciplined bearing. Heavy blackened plate armor protects the torso and limbs; one hand grips an immense flame-edged sword while a brutal throwing hammer hangs ready at the belt.',
    silhouette: 'Huge broad humanoid with a high armored chest, thick limbs, a long heavy sword, and a blocky hammer at the hip.',
    materials: ['blackened iron plate', 'soot-dark leather', 'coarse ember-red hair', 'heat-stained steel', 'orange flame'],
    pose: 'Standing in a grounded martial stance with the flame sword angled down and the hammer hand ready.',
    palette: ['charcoal skin', 'matte black iron', 'ember red', 'furnace orange', 'dark brown leather'],
    mustInclude: ['enormous scale', 'heavy black plate armor', 'flame sword', 'throwing hammer', 'red hair'],
    mustAvoid: ['horns', 'demonic wings', 'bare barbarian clothing', 'normal human scale', 'ornamental golden armor'],
    environment: 'A vast volcanic forge hall with distant furnaces and architecture scaled for giants',
    altText: 'A colossal charcoal-skinned fire giant in black plate stands in a volcanic forge with a flaming sword.',
  },
  bandit: {
    appearance:
      'A compact adult humanoid outlaw in layered, travel-worn clothing and light protection chosen for speed. A scarf and low hood partly conceal the face; a curved scimitar is held in one hand and a light crossbow is slung within easy reach.',
    silhouette: 'Small hooded humanoid with an asymmetrical cloak, curved sword at the side, and compact crossbow across the back.',
    materials: ['weathered wool', 'patched leather', 'dull steel', 'frayed linen', 'dark wood crossbow'],
    pose: 'Half-crouched beside the road, scimitar drawn while glancing toward an unseen approaching traveler.',
    palette: ['dust brown', 'faded olive', 'charcoal', 'dull steel', 'muted burgundy accent'],
    mustInclude: ['adult humanoid', 'scimitar', 'light crossbow', 'practical worn clothing', 'small stature'],
    mustAvoid: ['specific real-world ethnicity', 'pirate costume', 'heavy armor', 'modern firearm', 'heroic noble regalia'],
    environment: 'A lonely roadside cut with scrub, weathered rocks, and subdued overcast light',
    altText: 'A small hooded bandit waits beside a lonely road with scimitar drawn and crossbow on their back.',
  },
  owlbear: {
    appearance:
      'A massive quadrupedal predator combining the barrel-chested body and powerful limbs of a bear with a great owl-like head. A hooked beak, forward-facing amber eyes, and a facial disk of stiff feathers blend into a thick feathered mantle before giving way to coarse fur.',
    silhouette: 'Heavy bear body on four clawed legs with a round feathered head, hooked beak, high shoulder mantle, and no wings.',
    materials: ['dense brown fur', 'layered tawny feathers', 'dark hooked beak', 'heavy black claws'],
    pose: 'Lunging forward from a low four-legged stance, one forepaw lifted and the beak open in a warning cry.',
    palette: ['umber fur', 'tawny cream feathers', 'dark brown', 'amber eyes', 'black claws'],
    mustInclude: ['bear body', 'owl head and facial disk', 'hooked beak', 'four powerful legs', 'seamless feather-to-fur transition'],
    mustAvoid: ['wings', 'humanoid posture', 'separate owl perched on a bear', 'antlers', 'cute plush proportions'],
    environment: 'A shadowed temperate forest floor with broken branches and soft shafts of daylight',
    altText: 'A huge brown owlbear lunges through a forest, its owl face and feathered mantle rising from a bear body.',
  },
  'gelatinous-cube': {
    appearance:
      'A nearly transparent cube of dense living gel large enough to fill a dungeon corridor. Its edges sag slightly under their own weight, faint ripples travel through the clear body, and a few corroded scraps and pale mineral fragments hang suspended inside.',
    silhouette: 'A large upright cube with softly rounded edges, a broad contact surface, and subtle internal distortions.',
    materials: ['clear viscous gel', 'wet reflective surface', 'suspended bubbles', 'partly corroded metal scraps'],
    pose: 'Advancing as one lower edge bulges forward, leaving a thin acidic sheen across the stones.',
    palette: ['nearly colorless', 'faint blue-green', 'acid yellow highlights', 'cool gray reflections'],
    mustInclude: ['recognizable cube shape', 'high transparency', 'subtle suspended debris', 'wet acidic trail'],
    mustAvoid: ['eyes', 'mouth', 'face', 'opaque slime', 'graphic remains', 'perfect hard glass edges'],
    environment: 'A narrow torchlit stone dungeon corridor that clearly shows the creature filling the passage',
    altText: 'A transparent gelatinous cube fills a stone corridor, with bubbles and corroded scraps suspended inside.',
  },
  'awakened-shrub': {
    appearance:
      'A waist-high living shrub pulled free of the soil, its tangled root mass divided into several sturdy walking roots and its woody branches flexing like simple arms. Knots and bark folds suggest an alert face without becoming a carved wooden mask.',
    silhouette: 'Low irregular crown of leafy branches above a narrow trunk, two branch-arms, and a splayed cluster of root-legs.',
    materials: ['rough living bark', 'fresh green leaves', 'thin flexible twigs', 'soil-clotted roots'],
    pose: 'Scuttling forward on spread roots with one thorny branch drawn back to rake.',
    palette: ['leaf green', 'warm bark brown', 'dark soil', 'small yellow-green new growth'],
    mustInclude: ['shrub-sized scale', 'walking root cluster', 'branch-like arms', 'natural leaves', 'subtle face formed by bark'],
    mustAvoid: ['towering tree size', 'human hands', 'human legs', 'carved face', 'flowerpot', 'friendly cartoon smile'],
    environment: 'A damp woodland clearing with leaf litter and a small patch of disturbed soil behind it',
    altText: 'A small awakened shrub scuttles across a woodland floor on tangled roots with thorny branches raised.',
  },
  ghost: {
    appearance:
      'A translucent humanoid apparition whose gaunt face and hands retain the memory of a former person. Tattered period-neutral garments dissolve into vapor at the edges, and the lower body fades completely into a drifting incorporeal trail rather than legs.',
    silhouette: 'Upright floating humanoid with a readable head and reaching hands, ragged shoulders, and a long tapering vapor trail.',
    materials: ['translucent spectral vapor', 'frayed cloth-like ectoplasm', 'cold internal glow', 'wisps of mist'],
    pose: 'Hovering forward with one hand reaching out, garments and vapor streaming as though through an unseen current.',
    palette: ['pale blue-white', 'desaturated gray', 'faint sea green', 'deep shadow blue'],
    mustInclude: ['translucent humanoid form', 'incorporeal lower body', 'tattered garments', 'clearly readable sorrowful face and hands'],
    mustAvoid: ['solid feet', 'skeleton body', 'bedsheet shape', 'graphic wounds', 'comedic expression', 'modern clothing'],
    environment: 'An abandoned stone interior with distant moonlight and restrained ground mist',
    altText: 'A pale translucent ghost in tattered garments reaches forward while drifting through a moonlit ruin.',
  },
};

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const datasetPath = path.join(projectRoot, 'src', 'data', 'monster-visuals.json');
const dataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as MonsterVisualDataset;
const recordsById = new Map(dataset.records.map((record) => [record.monsterId, record]));
const authoredFields = [
  'appearance',
  'silhouette',
  'materials',
  'pose',
  'palette',
  'mustInclude',
  'mustAvoid',
  'environment',
  'altText',
] as const;
let seeded = 0;
let preserved = 0;

for (const monsterId of PILOT_MONSTER_IDS) {
  const record = recordsById.get(monsterId);
  if (!record) throw new Error(`Missing pilot visual record: ${monsterId}`);
  const description = descriptions[monsterId];
  const existingDescription = Object.fromEntries(
    authoredFields.map((field) => [field, record[field]]),
  ) as AuthoredVisual;
  const hasAuthoredContent = authoredFields.some((field) =>
    Array.isArray(record[field]) ? record[field].length > 0 : record[field].trim().length > 0,
  );
  if (hasAuthoredContent) {
    if (JSON.stringify(existingDescription) !== JSON.stringify(description)) {
      throw new Error(`Refusing to overwrite an edited description: ${monsterId}`);
    }
    preserved += 1;
    continue;
  }
  Object.assign(record, description, {
    confidence: 'reference-derived',
    reviewStatus: 'pending',
    imageStatus: 'blocked',
  });
  seeded += 1;
}

writeFileSync(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
console.log(`Pilot descriptions: seeded=${seeded}, preserved=${preserved}.`);
