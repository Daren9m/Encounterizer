import monsterImagesJson from './monster-images.json';

export interface MonsterImage {
  src: string;
  alt: string;
}

interface MonsterImageDataset {
  schemaVersion: number;
  images: Record<string, MonsterImage>;
}

const dataset = monsterImagesJson as MonsterImageDataset;

/**
 * Returns a website-ready image only after the pipeline says an asset exists.
 * `ready` means generation may start, while draft and later statuses are
 * guaranteed by the image audit to have a matching optimized WebP file.
 */
export function getMonsterImage(monsterId: string): MonsterImage | undefined {
  return dataset.images[monsterId];
}
