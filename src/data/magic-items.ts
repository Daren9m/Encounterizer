import { MAGIC_ITEMS_COMMON_UNCOMMON } from './magic-items-common-uncommon';
import { MAGIC_ITEMS_LEGENDARY_ARTIFACT } from './magic-items-legendary-artifact';
import { MAGIC_ITEMS_RARE } from './magic-items-rare';
import { MAGIC_ITEMS_VARIES } from './magic-items-varies';
import { MAGIC_ITEMS_VERY_RARE } from './magic-items-very-rare';

export type { MagicItem, MagicItemCategory, MagicItemRarity } from '../lib/srd-content-types';

export const MAGIC_ITEMS = [
  ...MAGIC_ITEMS_COMMON_UNCOMMON,
  ...MAGIC_ITEMS_RARE,
  ...MAGIC_ITEMS_VERY_RARE,
  ...MAGIC_ITEMS_LEGENDARY_ARTIFACT,
  ...MAGIC_ITEMS_VARIES,
];
