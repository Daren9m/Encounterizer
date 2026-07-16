import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { ALL_MONSTERS } from '../src/data';
import type { MonsterVisualBatchManifest, MonsterVisualDataset } from '../src/lib/monster-visuals';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataset = JSON.parse(
  readFileSync(path.join(projectRoot, 'src', 'data', 'monster-visuals.json'), 'utf8'),
) as MonsterVisualDataset;
const manifest = JSON.parse(
  readFileSync(path.join(projectRoot, 'src', 'data', 'monster-visual-batches.json'), 'utf8'),
) as MonsterVisualBatchManifest;
const outputDirectory = path.join(projectRoot, 'docs', 'visual-review');
mkdirSync(outputDirectory, { recursive: true });

const monstersById = new Map(ALL_MONSTERS.map((monster) => [monster.id, monster]));
const visualsById = new Map(dataset.records.map((record) => [record.monsterId, record]));

function list(values: readonly string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join('\n') : '- _Not authored_';
}

function field(value: string): string {
  return value.trim() || '_Not authored_';
}

const indexLines = [
  '# Monster visual review',
  '',
  'These files are generated from `src/data/monster-visuals.json`. Edit the sidecar or authored seed source, not these review files.',
  '',
  `Source: *${dataset.source.work}* by ${dataset.source.creator}, ${dataset.source.license}.`,
  '',
  '| Batch | Monsters | Pending | Approved | Needs revision |',
  '| --- | ---: | ---: | ---: | ---: |',
];

for (const batch of manifest.batches) {
  const records = batch.monsterIds.map((monsterId) => {
    const record = visualsById.get(monsterId);
    if (!record) throw new Error(`Missing visual record: ${monsterId}`);
    return record;
  });
  const filename = `${batch.id}.md`;
  const counts = {
    pending: records.filter((record) => record.reviewStatus === 'pending').length,
    approved: records.filter((record) => record.reviewStatus === 'approved').length,
    needsRevision: records.filter((record) => record.reviewStatus === 'needs-revision').length,
  };
  indexLines.push(
    `| [${batch.label}](./${filename}) | ${records.length} | ${counts.pending} | ${counts.approved} | ${counts.needsRevision} |`,
  );

  const lines = [
    `# ${batch.label}`,
    '',
    `${records.length} monsters. Generated review view; authoritative records live in \`src/data/monster-visuals.json\`.`,
    '',
  ];
  for (const record of records) {
    const monster = monstersById.get(record.monsterId);
    if (!monster) throw new Error(`Missing monster: ${record.monsterId}`);
    lines.push(
      `## ${monster.name}`,
      '',
      `- **ID:** \`${record.monsterId}\``,
      `- **Stat profile:** CR ${monster.challengeRating}; ${monster.size} ${monster.type}${monster.subtype ? ` (${monster.subtype})` : ''}`,
      `- **Review:** ${record.reviewStatus}`,
      `- **Image:** ${record.imageStatus}`,
      `- **Confidence:** ${record.confidence}`,
      '',
      '### Source facts',
      '',
      list(record.sourceFacts),
      '',
      '### Appearance',
      '',
      field(record.appearance),
      '',
      '### Silhouette',
      '',
      field(record.silhouette),
      '',
      '### Materials',
      '',
      list(record.materials),
      '',
      '### Pose',
      '',
      field(record.pose),
      '',
      '### Palette',
      '',
      list(record.palette),
      '',
      '### Must include',
      '',
      list(record.mustInclude),
      '',
      '### Must avoid',
      '',
      list(record.mustAvoid),
      '',
      '### Environment',
      '',
      field(record.environment),
      '',
      '### Alt text',
      '',
      field(record.altText),
      '',
      '---',
      '',
    );
  }
  while (lines.at(-1) === '') lines.pop();
  writeFileSync(path.join(outputDirectory, filename), `${lines.join('\n')}\n`, 'utf8');
}

writeFileSync(path.join(outputDirectory, 'README.md'), `${indexLines.join('\n')}\n`, 'utf8');
console.log(`Exported ${manifest.batches.length} batch review files to docs/visual-review.`);
