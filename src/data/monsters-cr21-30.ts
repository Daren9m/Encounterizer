import { Monster } from '../lib/types';

// CR 21 – 30 monsters
export const MONSTERS_CR_21_30: Monster[] = [
  {
    id: 'lich',
    name: 'Lich',
    source: 'MM2024',
    size: 'Medium',
    type: 'Undead',
    alignment: 'Neutral Evil',
    armor: { ac: 17, source: 'natural armor' },
    hitPoints: 135,
    hitDice: '18d8+54',
    speed: { walk: 30 },
    abilities: { str: 11, dex: 16, con: 16, int: 20, wis: 14, cha: 16 },
    savingThrows: { con: 10, int: 12, wis: 9 },
    skills: { 'Arcana': 19, 'History': 12, 'Insight': 9, 'Perception': 9 },
    senses: ['truesight 120 ft.', 'passive Perception 19'],
    languages: ['Common', 'up to five other languages'],
    challengeRating: 21,
    proficiencyBonus: 7,
    xp: 33000,
    damageVulnerabilities: [],
    damageResistances: ['Cold', 'Lightning', 'Necrotic'],
    damageImmunities: ['Poison'],
    damageImmunityNotes: 'bludgeoning, piercing, slashing from nonmagical attacks',
    conditionImmunities: ['Charmed', 'Exhaustion', 'Frightened', 'Paralyzed', 'Poisoned'],
    actions: [
      { name: 'Paralyzing Touch', description: 'Melee Spell Attack: +12 to hit, reach 5 ft., one creature. Hit: 10 (3d6) cold damage. The target must succeed on a DC 18 Constitution saving throw or be paralyzed for 1 minute.', attackDelivery: 'Melee', attackType: 'Spell', attackBonus: 12, damageDice: '3d6', damageTypes: ['Cold'], reach: 5 }
    ],
    specialAbilities: [
      { name: 'Legendary Resistance (3/Day)', description: 'If the lich fails a saving throw, it can choose to succeed instead.' },
      { name: 'Rejuvenation', description: 'If it has a phylactery, a destroyed lich gains a new body in 1d10 days, regaining all its hit points and becoming active again.' },
      { name: 'Turn Resistance', description: 'The lich has advantage on saving throws against any effect that turns undead.' }
    ],
    spellcasting: {
      ability: 'int',
      dc: 20,
      attackBonus: 12,
      atWill: ['mage hand', 'prestidigitation', 'ray of frost'],
      slots: {
        '1st': ['detect magic', 'magic missile', 'shield', 'thunderwave'],
        '2nd': ['detect thoughts', 'invisibility', 'mirror image'],
        '3rd': ['animate dead', 'counterspell', 'dispel magic', 'fireball'],
        '4th': ['blight', 'dimension door'],
        '5th': ['cloudkill', 'scrying'],
        '6th': ['disintegrate', 'globe of invulnerability'],
        '7th': ['finger of death', 'plane shift'],
        '8th': ['dominate monster', 'power word stun'],
        '9th': ['power word kill']
      }
    },
    legendary: {
      description: 'The lich can take 3 legendary actions.',
      actionsPerRound: 3,
      actions: [
        { name: 'Cantrip', description: 'The lich casts a cantrip.' },
        { name: 'Paralyzing Touch (Costs 2 Actions)', description: 'The lich uses its Paralyzing Touch.' },
        { name: 'Frightening Gaze (Costs 2 Actions)', description: 'The lich fixes its gaze on one creature it can see within 10 feet. The target must succeed on a DC 18 Wisdom saving throw or become frightened for 1 minute.' },
        { name: 'Disrupt Life (Costs 3 Actions)', description: 'Each non-undead creature within 20 feet must make a DC 18 Constitution saving throw, taking 21 (6d6) necrotic damage on a failed save, or half as much on a successful one.' }
      ]
    },
    lair: [
      { name: 'Lair Action', description: 'On initiative count 20, the lich can take a lair action to cause one of various effects (e.g., tethering spirits, raising undead, or negating magic).' }
    ],
    environments: ['Underdark', 'Urban'],
    isLegendary: true, isMythic: false, hasLair: true, hasSpellcasting: true,
    movementModes: ['Walk'],
    attackDamageTypes: ['Cold', 'Necrotic', 'Fire', 'Force'],
    attackDeliveryModes: ['Melee', 'Ranged'],
    tags: ['legendary', 'spellcaster', 'paralyze', 'frighten']
  },
  {
    id: 'solar',
    name: 'Solar',
    source: 'MM2024',
    size: 'Large',
    type: 'Celestial',
    alignment: 'Lawful Good',
    armor: { ac: 21, source: 'natural armor' },
    hitPoints: 243,
    hitDice: '18d10+144',
    speed: { walk: 50, fly: 150 },
    abilities: { str: 26, dex: 22, con: 26, int: 25, wis: 25, cha: 30 },
    savingThrows: { int: 14, wis: 14, cha: 17 },
    skills: { 'Perception': 14 },
    senses: ['truesight 120 ft.', 'passive Perception 24'],
    languages: ['all', 'telepathy 120 ft.'],
    challengeRating: 21,
    proficiencyBonus: 7,
    xp: 33000,
    damageVulnerabilities: [],
    damageResistances: ['Radiant'],
    damageResistanceNotes: 'bludgeoning, piercing, slashing from nonmagical attacks',
    damageImmunities: ['Necrotic', 'Poison'],
    conditionImmunities: ['Charmed', 'Exhaustion', 'Frightened', 'Poisoned'],
    actions: [
      { name: 'Multiattack', description: 'The solar makes two greatsword attacks.' },
      { name: 'Greatsword', description: 'Melee Weapon Attack: +15 to hit, reach 5 ft., one target. Hit: 22 (4d6 + 8) slashing damage plus 27 (6d8) radiant damage.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 15, damageDice: '4d6+8', damageTypes: ['Slashing', 'Radiant'], reach: 5 },
      { name: 'Slaying Longbow', description: 'Ranged Weapon Attack: +13 to hit, range 150/600 ft., one target. Hit: 15 (2d8 + 6) piercing damage plus 27 (6d8) radiant damage. If the target has 100 hit points or fewer after taking this damage, it must succeed on a DC 15 Constitution saving throw or die.', attackDelivery: 'Ranged', attackType: 'Weapon', attackBonus: 13, damageDice: '2d8+6', damageTypes: ['Piercing', 'Radiant'], range: 150, longRange: 600 },
      { name: 'Healing Touch (4/Day)', description: 'The solar touches another creature. The target magically regains 40 (8d8 + 4) hit points and is freed from any curse, disease, poison, blindness, or deafness.' }
    ],
    specialAbilities: [
      { name: 'Angelic Weapons', description: 'The solar\'s weapon attacks are magical. When the solar hits with any weapon, the weapon deals an extra 6d8 radiant damage (included in the attack).' },
      { name: 'Divine Awareness', description: 'The solar knows if it hears a lie.' },
      { name: 'Magic Resistance', description: 'The solar has advantage on saving throws against spells and other magical effects.' }
    ],
    legendary: {
      description: 'The solar can take 3 legendary actions.',
      actionsPerRound: 3,
      actions: [
        { name: 'Teleport', description: 'The solar magically teleports, along with any equipment it is wearing or carrying, up to 120 feet to an unoccupied space it can see.' },
        { name: 'Searing Burst (Costs 2 Actions)', description: 'The solar emits magical, divine energy. Each creature of its choice in a 10-foot radius must make a DC 23 Dexterity saving throw, taking 14 (4d6) fire damage plus 14 (4d6) radiant damage on a failed save, or half as much on a successful one.' },
        { name: 'Blinding Gaze (Costs 3 Actions)', description: 'The solar targets one creature it can see within 30 feet of it. The target must succeed on a DC 15 Constitution saving throw or be blinded until magic such as the lesser restoration spell removes the blindness.' }
      ]
    },
    environments: ['Planar'],
    isLegendary: true, isMythic: false, hasLair: false, hasSpellcasting: false,
    movementModes: ['Walk', 'Fly'],
    attackDamageTypes: ['Slashing', 'Piercing', 'Radiant', 'Fire'],
    attackDeliveryModes: ['Melee', 'Ranged'],
    tags: ['legendary', 'multiattack', 'magic-resistance', 'healer']
  },
  {
    id: 'ancient-white-dragon',
    name: 'Ancient White Dragon',
    source: 'MM2024',
    size: 'Gargantuan',
    type: 'Dragon',
    alignment: 'Chaotic Evil',
    armor: { ac: 20, source: 'natural armor' },
    hitPoints: 333,
    hitDice: '18d20+144',
    speed: { walk: 40, burrow: 40, fly: 80, swim: 40 },
    abilities: { str: 26, dex: 10, con: 26, int: 10, wis: 13, cha: 14 },
    savingThrows: { dex: 6, con: 14, wis: 7, cha: 8 },
    skills: { 'Perception': 13, 'Stealth': 6 },
    senses: ['blindsight 60 ft.', 'darkvision 120 ft.', 'passive Perception 23'],
    languages: ['Common', 'Draconic'],
    challengeRating: 20,
    proficiencyBonus: 6,
    xp: 25000,
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: ['Cold'],
    conditionImmunities: [],
    actions: [
      { name: 'Multiattack', description: 'The dragon makes three attacks: one with its bite and two with its claws.' },
      { name: 'Bite', description: 'Melee Weapon Attack: +14 to hit, reach 15 ft., one target. Hit: 19 (2d10 + 8) piercing damage plus 9 (2d8) cold damage.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 14, damageDice: '2d10+8', damageTypes: ['Piercing', 'Cold'], reach: 15 },
      { name: 'Claw', description: 'Melee Weapon Attack: +14 to hit, reach 10 ft., one target. Hit: 15 (2d6 + 8) slashing damage.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 14, damageDice: '2d6+8', damageTypes: ['Slashing'], reach: 10 },
      { name: 'Tail', description: 'Melee Weapon Attack: +14 to hit, reach 20 ft., one target. Hit: 17 (2d8 + 8) bludgeoning damage.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 14, damageDice: '2d8+8', damageTypes: ['Bludgeoning'], reach: 20 },
      { name: 'Cold Breath (Recharge 5-6)', description: 'The dragon exhales an icy blast in a 90-foot cone. Each creature in that area must make a DC 22 Constitution saving throw, taking 72 (16d8) cold damage on a failed save, or half as much on a successful one.', damageTypes: ['Cold'], damageDice: '16d8' }
    ],
    legendary: {
      description: 'The dragon can take 3 legendary actions.',
      actionsPerRound: 3,
      actions: [
        { name: 'Detect', description: 'The dragon makes a Wisdom (Perception) check.' },
        { name: 'Tail Attack', description: 'The dragon makes a tail attack.' },
        { name: 'Wing Attack (Costs 2 Actions)', description: 'The dragon beats its wings. Each creature within 15 feet must succeed on a DC 22 Dexterity saving throw or take 15 (2d6 + 8) bludgeoning damage and be knocked prone. The dragon can then fly up to half its flying speed.' }
      ]
    },
    environments: ['Arctic'],
    isLegendary: true, isMythic: false, hasLair: true, hasSpellcasting: false,
    movementModes: ['Walk', 'Burrow', 'Fly', 'Swim'],
    attackDamageTypes: ['Piercing', 'Slashing', 'Bludgeoning', 'Cold'],
    attackDeliveryModes: ['Melee'],
    tags: ['legendary', 'multiattack', 'breath-weapon']
  },
  {
    id: 'kraken',
    name: 'Kraken',
    source: 'MM2024',
    size: 'Gargantuan',
    type: 'Monstrosity',
    alignment: 'Chaotic Evil',
    armor: { ac: 18, source: 'natural armor' },
    hitPoints: 472,
    hitDice: '27d20+189',
    speed: { walk: 20, swim: 60 },
    abilities: { str: 30, dex: 11, con: 25, int: 22, wis: 18, cha: 20 },
    savingThrows: { str: 17, dex: 7, con: 14, int: 13, wis: 11 },
    senses: ['truesight 120 ft.', 'passive Perception 14'],
    languages: ['Abyssal', 'Celestial', 'Infernal', 'Primordial', 'telepathy 120 ft.'],
    challengeRating: 23,
    proficiencyBonus: 7,
    xp: 50000,
    damageVulnerabilities: [],
    damageResistances: [],
    damageResistanceNotes: 'bludgeoning, piercing, slashing from nonmagical attacks',
    damageImmunities: ['Lightning'],
    conditionImmunities: ['Frightened', 'Paralyzed'],
    actions: [
      { name: 'Multiattack', description: 'The kraken makes three tentacle attacks, each of which it can replace with one use of Fling.' },
      { name: 'Bite', description: 'Melee Weapon Attack: +17 to hit, reach 5 ft., one target. Hit: 23 (3d8 + 10) piercing damage. If the target is a Large or smaller creature grappled by the kraken, that creature is swallowed.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 17, damageDice: '3d8+10', damageTypes: ['Piercing'], reach: 5 },
      { name: 'Tentacle', description: 'Melee Weapon Attack: +17 to hit, reach 30 ft., one target. Hit: 20 (3d6 + 10) bludgeoning damage, and the target is grappled (escape DC 18). Until this grapple ends, the target is restrained.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 17, damageDice: '3d6+10', damageTypes: ['Bludgeoning'], reach: 30 },
      { name: 'Fling', description: 'One Large or smaller object held or creature grappled by the kraken is thrown up to 60 feet in a random direction and knocked prone.' },
      { name: 'Lightning Storm', description: 'The kraken magically creates three bolts of lightning, each of which can strike a target the kraken can see within 120 feet of it. A target must make a DC 23 Dexterity saving throw, taking 22 (4d10) lightning damage on a failed save, or half as much on a successful one.', damageTypes: ['Lightning'], damageDice: '4d10' }
    ],
    specialAbilities: [
      { name: 'Amphibious', description: 'The kraken can breathe air and water.' },
      { name: 'Freedom of Movement', description: 'The kraken ignores difficult terrain, and magical effects can\'t reduce its speed or cause it to be restrained.' },
      { name: 'Siege Monster', description: 'The kraken deals double damage to objects and structures.' }
    ],
    legendary: {
      description: 'The kraken can take 3 legendary actions.',
      actionsPerRound: 3,
      actions: [
        { name: 'Tentacle Attack or Fling', description: 'The kraken makes one tentacle attack or uses its Fling.' },
        { name: 'Lightning Storm (Costs 2 Actions)', description: 'The kraken uses Lightning Storm.' },
        { name: 'Ink Cloud (Costs 3 Actions)', description: 'While underwater, the kraken expels an ink cloud in a 60-foot radius. The cloud spreads around corners, and that area is heavily obscured to creatures other than the kraken.' }
      ]
    },
    lair: [
      { name: 'Lair Action', description: 'On initiative count 20, the kraken takes a lair action to cause strong currents, lightning strikes, or conjure water elementals.' }
    ],
    environments: ['Underwater', 'Coastal'],
    isLegendary: true, isMythic: false, hasLair: true, hasSpellcasting: false,
    movementModes: ['Walk', 'Swim'],
    attackDamageTypes: ['Piercing', 'Bludgeoning', 'Lightning'],
    attackDeliveryModes: ['Melee', 'Ranged'],
    tags: ['legendary', 'multiattack', 'swallow', 'grappler', 'siege-monster', 'amphibious']
  },
  {
    id: 'ancient-blue-dragon',
    name: 'Ancient Blue Dragon',
    source: 'MM2024',
    size: 'Gargantuan',
    type: 'Dragon',
    alignment: 'Lawful Evil',
    armor: { ac: 22, source: 'natural armor' },
    hitPoints: 481,
    hitDice: '26d20+208',
    speed: { walk: 40, burrow: 40, fly: 80 },
    abilities: { str: 29, dex: 10, con: 27, int: 18, wis: 17, cha: 21 },
    savingThrows: { dex: 7, con: 15, wis: 10, cha: 12 },
    skills: { 'Perception': 17, 'Stealth': 7 },
    senses: ['blindsight 60 ft.', 'darkvision 120 ft.', 'passive Perception 27'],
    languages: ['Common', 'Draconic'],
    challengeRating: 23,
    proficiencyBonus: 7,
    xp: 50000,
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: ['Lightning'],
    conditionImmunities: [],
    actions: [
      { name: 'Multiattack', description: 'The dragon makes three attacks: one with its bite and two with its claws.' },
      { name: 'Bite', description: 'Melee Weapon Attack: +16 to hit, reach 15 ft., one target. Hit: 20 (2d10 + 9) piercing damage plus 11 (2d10) lightning damage.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 16, damageDice: '2d10+9', damageTypes: ['Piercing', 'Lightning'], reach: 15 },
      { name: 'Claw', description: 'Melee Weapon Attack: +16 to hit, reach 10 ft., one target. Hit: 16 (2d6 + 9) slashing damage.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 16, damageDice: '2d6+9', damageTypes: ['Slashing'], reach: 10 },
      { name: 'Tail', description: 'Melee Weapon Attack: +16 to hit, reach 20 ft., one target. Hit: 18 (2d8 + 9) bludgeoning damage.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 16, damageDice: '2d8+9', damageTypes: ['Bludgeoning'], reach: 20 },
      { name: 'Lightning Breath (Recharge 5-6)', description: 'The dragon exhales lightning in a 120-foot line that is 10 feet wide. Each creature in that line must make a DC 23 Dexterity saving throw, taking 88 (16d10) lightning damage on a failed save, or half as much on a successful one.', damageTypes: ['Lightning'], damageDice: '16d10' }
    ],
    legendary: {
      description: 'The dragon can take 3 legendary actions.',
      actionsPerRound: 3,
      actions: [
        { name: 'Detect', description: 'The dragon makes a Wisdom (Perception) check.' },
        { name: 'Tail Attack', description: 'The dragon makes a tail attack.' },
        { name: 'Wing Attack (Costs 2 Actions)', description: 'The dragon beats its wings. Each creature within 15 feet must succeed on a DC 24 Dexterity saving throw or take 16 (2d6 + 9) bludgeoning damage and be knocked prone.' }
      ]
    },
    environments: ['Desert', 'Coastal'],
    isLegendary: true, isMythic: false, hasLair: true, hasSpellcasting: false,
    movementModes: ['Walk', 'Burrow', 'Fly'],
    attackDamageTypes: ['Piercing', 'Slashing', 'Bludgeoning', 'Lightning'],
    attackDeliveryModes: ['Melee'],
    tags: ['legendary', 'multiattack', 'breath-weapon']
  },
  {
    id: 'ancient-red-dragon',
    name: 'Ancient Red Dragon',
    source: 'MM2024',
    size: 'Gargantuan',
    type: 'Dragon',
    alignment: 'Chaotic Evil',
    armor: { ac: 22, source: 'natural armor' },
    hitPoints: 546,
    hitDice: '28d20+252',
    speed: { walk: 40, climb: 40, fly: 80 },
    abilities: { str: 30, dex: 10, con: 29, int: 18, wis: 15, cha: 23 },
    savingThrows: { dex: 7, con: 16, wis: 9, cha: 13 },
    skills: { 'Perception': 16, 'Stealth': 7 },
    senses: ['blindsight 60 ft.', 'darkvision 120 ft.', 'passive Perception 26'],
    languages: ['Common', 'Draconic'],
    challengeRating: 24,
    proficiencyBonus: 7,
    xp: 62000,
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: ['Fire'],
    conditionImmunities: [],
    actions: [
      { name: 'Multiattack', description: 'The dragon makes three attacks: one with its bite and two with its claws.' },
      { name: 'Bite', description: 'Melee Weapon Attack: +17 to hit, reach 15 ft., one target. Hit: 21 (2d10 + 10) piercing damage plus 14 (4d6) fire damage.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 17, damageDice: '2d10+10', damageTypes: ['Piercing', 'Fire'], reach: 15 },
      { name: 'Claw', description: 'Melee Weapon Attack: +17 to hit, reach 10 ft., one target. Hit: 17 (2d6 + 10) slashing damage.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 17, damageDice: '2d6+10', damageTypes: ['Slashing'], reach: 10 },
      { name: 'Tail', description: 'Melee Weapon Attack: +17 to hit, reach 20 ft., one target. Hit: 19 (2d8 + 10) bludgeoning damage.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 17, damageDice: '2d8+10', damageTypes: ['Bludgeoning'], reach: 20 },
      { name: 'Fire Breath (Recharge 5-6)', description: 'The dragon exhales fire in a 90-foot cone. Each creature in that area must make a DC 24 Dexterity saving throw, taking 91 (26d6) fire damage on a failed save, or half as much on a successful one.', damageTypes: ['Fire'], damageDice: '26d6' }
    ],
    legendary: {
      description: 'The dragon can take 3 legendary actions.',
      actionsPerRound: 3,
      actions: [
        { name: 'Detect', description: 'The dragon makes a Wisdom (Perception) check.' },
        { name: 'Tail Attack', description: 'The dragon makes a tail attack.' },
        { name: 'Wing Attack (Costs 2 Actions)', description: 'The dragon beats its wings. Each creature within 15 feet must succeed on a DC 25 Dexterity saving throw or take 17 (2d6 + 10) bludgeoning damage and be knocked prone.' }
      ]
    },
    lair: [
      { name: 'Lair Action', description: 'On initiative count 20, the dragon takes a lair action to cause magma eruptions, volcanic gases, or tremors.' }
    ],
    environments: ['Mountain', 'Hill'],
    isLegendary: true, isMythic: false, hasLair: true, hasSpellcasting: false,
    movementModes: ['Walk', 'Climb', 'Fly'],
    attackDamageTypes: ['Piercing', 'Slashing', 'Bludgeoning', 'Fire'],
    attackDeliveryModes: ['Melee'],
    tags: ['legendary', 'multiattack', 'breath-weapon']
  },
  {
    id: 'tarrasque',
    name: 'Tarrasque',
    source: 'MM2024',
    size: 'Gargantuan',
    type: 'Monstrosity',
    alignment: 'Unaligned',
    armor: { ac: 25, source: 'natural armor' },
    hitPoints: 676,
    hitDice: '33d20+330',
    speed: { walk: 40 },
    abilities: { str: 30, dex: 11, con: 30, int: 3, wis: 11, cha: 11 },
    savingThrows: { int: 5, wis: 9, cha: 9 },
    senses: ['blindsight 120 ft.', 'passive Perception 10'],
    languages: [],
    challengeRating: 30,
    proficiencyBonus: 9,
    xp: 155000,
    damageVulnerabilities: [],
    damageResistances: [],
    damageImmunities: ['Fire', 'Poison'],
    damageImmunityNotes: 'bludgeoning, piercing, slashing from nonmagical attacks',
    conditionImmunities: ['Charmed', 'Frightened', 'Paralyzed', 'Poisoned'],
    actions: [
      { name: 'Multiattack', description: 'The tarrasque can use its Frightful Presence. It then makes five attacks: one with its bite, two with its claws, one with its horns, and one with its tail. It can use its Swallow instead of its bite.' },
      { name: 'Bite', description: 'Melee Weapon Attack: +19 to hit, reach 10 ft., one target. Hit: 36 (4d12 + 10) piercing damage. If the target is a creature, it is grappled (escape DC 20). Until this grapple ends, the target is restrained, and the tarrasque can\'t bite another target.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 19, damageDice: '4d12+10', damageTypes: ['Piercing'], reach: 10 },
      { name: 'Claw', description: 'Melee Weapon Attack: +19 to hit, reach 15 ft., one target. Hit: 28 (4d8 + 10) slashing damage.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 19, damageDice: '4d8+10', damageTypes: ['Slashing'], reach: 15 },
      { name: 'Horns', description: 'Melee Weapon Attack: +19 to hit, reach 10 ft., one target. Hit: 32 (4d10 + 10) piercing damage.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 19, damageDice: '4d10+10', damageTypes: ['Piercing'], reach: 10 },
      { name: 'Tail', description: 'Melee Weapon Attack: +19 to hit, reach 20 ft., one target. Hit: 24 (4d6 + 10) bludgeoning damage. If the target is a creature, it must succeed on a DC 20 Strength saving throw or be knocked prone.', attackDelivery: 'Melee', attackType: 'Weapon', attackBonus: 19, damageDice: '4d6+10', damageTypes: ['Bludgeoning'], reach: 20 },
      { name: 'Swallow', description: 'The tarrasque makes one bite attack against a Large or smaller creature it is grappling. If the attack hits, the target takes the bite\'s damage, the target is swallowed, and the grapple ends.' },
      { name: 'Frightful Presence', description: 'Each creature of the tarrasque\'s choice within 120 feet must succeed on a DC 17 Wisdom saving throw or become frightened for 1 minute.' }
    ],
    specialAbilities: [
      { name: 'Legendary Resistance (3/Day)', description: 'If the tarrasque fails a saving throw, it can choose to succeed instead.' },
      { name: 'Magic Resistance', description: 'The tarrasque has advantage on saving throws against spells and other magical effects.' },
      { name: 'Reflective Carapace', description: 'Any time the tarrasque is targeted by a magic missile spell, a line spell, or a spell that requires a ranged attack roll, roll a d6. On a 1 to 5, the tarrasque is unaffected. On a 6, the tarrasque is unaffected, and the effect is reflected back at the caster as though it originated from the tarrasque, turning the caster into the target.' },
      { name: 'Siege Monster', description: 'The tarrasque deals double damage to objects and structures.' }
    ],
    legendary: {
      description: 'The tarrasque can take 3 legendary actions.',
      actionsPerRound: 3,
      actions: [
        { name: 'Attack', description: 'The tarrasque makes one claw attack or tail attack.' },
        { name: 'Move', description: 'The tarrasque moves up to half its speed.' },
        { name: 'Chomp (Costs 2 Actions)', description: 'The tarrasque makes one bite attack or uses its Swallow.' }
      ]
    },
    environments: ['Any'],
    isLegendary: true, isMythic: false, hasLair: false, hasSpellcasting: false,
    movementModes: ['Walk'],
    attackDamageTypes: ['Piercing', 'Slashing', 'Bludgeoning'],
    attackDeliveryModes: ['Melee'],
    tags: ['legendary', 'multiattack', 'swallow', 'frighten', 'magic-resistance', 'siege-monster']
  }
];
