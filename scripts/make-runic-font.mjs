// One-off build: subsets Noto Sans Runic to U+16A0–16F8 as woff2.
// Usage: npm run make:runic-font  (expects scripts/vendor/NotoSansRunic-Regular.ttf)
import { readFile, writeFile } from 'node:fs/promises';
import subsetFont from 'subset-font';

const source = await readFile('scripts/vendor/NotoSansRunic-Regular.ttf');
const runes = Array.from({ length: 0x16f9 - 0x16a0 }, (_, i) => String.fromCodePoint(0x16a0 + i)).join('');
const woff2 = await subsetFont(source, runes, { targetFormat: 'woff2' });
await writeFile('public/fonts/noto-sans-runic-subset.woff2', woff2);
console.log(`wrote public/fonts/noto-sans-runic-subset.woff2 (${woff2.length} bytes)`);
