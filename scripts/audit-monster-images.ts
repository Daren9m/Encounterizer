import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import visualDatasetJson from '../src/data/monster-visuals.json';
import type { MonsterVisualDataset } from '../src/lib/monster-visuals';

const EXPECTED_WIDTH = 1024;
const EXPECTED_HEIGHT = 1280;
const MAX_FILE_SIZE = 500_000;
const projectRoot = path.resolve(import.meta.dirname, '..');
const imageRoot = path.join(projectRoot, 'public', 'images', 'monsters');
const dataset = visualDatasetJson as MonsterVisualDataset;

function readWebpDimensions(buffer: Buffer): { width: number; height: number } {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('File is not a valid WebP RIFF container.');
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;

    if (chunkType === 'VP8X' && dataOffset + 10 <= buffer.length) {
      return {
        width: buffer.readUIntLE(dataOffset + 4, 3) + 1,
        height: buffer.readUIntLE(dataOffset + 7, 3) + 1,
      };
    }

    if (chunkType === 'VP8 ' && dataOffset + 10 <= buffer.length) {
      if (buffer[dataOffset + 3] !== 0x9d || buffer[dataOffset + 4] !== 0x01 || buffer[dataOffset + 5] !== 0x2a) {
        throw new Error('VP8 frame header is invalid.');
      }
      return {
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff,
      };
    }

    if (chunkType === 'VP8L' && dataOffset + 5 <= buffer.length) {
      if (buffer[dataOffset] !== 0x2f) throw new Error('VP8L frame header is invalid.');
      const bits = buffer.readUInt32LE(dataOffset + 1);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }

    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  throw new Error('WebP image dimensions were not found.');
}

const expectedIds = new Set(
  dataset.records
    .filter((record) => ['draft', 'approved', 'needs-revision'].includes(record.imageStatus))
    .map((record) => record.monsterId),
);
const files = readdirSync(imageRoot, { withFileTypes: true }).filter((entry) => entry.isFile());
const webpIds = new Set(files.filter((entry) => entry.name.endsWith('.webp')).map((entry) => path.basename(entry.name, '.webp')));
const sourcePngs = files.filter((entry) => entry.name.endsWith('.png'));
const errors: string[] = [];

if (sourcePngs.length > 0) errors.push(`Unoptimized PNG files remain: ${sourcePngs.map((entry) => entry.name).join(', ')}`);

for (const id of expectedIds) {
  if (!webpIds.has(id)) {
    errors.push(`Missing image for ${id}.`);
    continue;
  }

  const filePath = path.join(imageRoot, `${id}.webp`);
  const buffer = readFileSync(filePath);
  const { width, height } = readWebpDimensions(buffer);
  if (width !== EXPECTED_WIDTH || height !== EXPECTED_HEIGHT) {
    errors.push(`${id}.webp is ${width}x${height}; expected ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}.`);
  }
  if (buffer.length > MAX_FILE_SIZE) {
    errors.push(`${id}.webp is ${buffer.length} bytes; expected at most ${MAX_FILE_SIZE}.`);
  }
}

for (const id of webpIds) {
  if (!expectedIds.has(id)) errors.push(`Untracked image asset: ${id}.webp.`);
}

if (errors.length > 0) throw new Error(errors.join('\n'));

const totalBytes = [...webpIds].reduce(
  (total, id) => total + readFileSync(path.join(imageRoot, `${id}.webp`)).length,
  0,
);
console.log(
  `Audited ${webpIds.size} monster images at ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT} (${(totalBytes / 1_000_000).toFixed(2)} MB total).`,
);
