import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression guard: page components must NOT use next/navigation's
 * useSearchParams.
 *
 * Root cause (2026-07-20): under `next dev` (Next 16 / React 19), a hard
 * navigation to a URL with query params leaves the Suspense boundary around
 * a useSearchParams() consumer permanently dehydrated — the prerendered
 * HTML stays visible but React never attaches (no fibers, no effects), so
 * share-link hydration silently never runs. Client-side transitions and the
 * production static build are unaffected, which made this easy to miss.
 *
 * In a fully static export, query params are a client-only concern: read
 * `window.location.search` inside a mount effect instead. That never
 * suspends, so pages hydrate identically in dev and prod.
 */

function collectPageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectPageFiles(full));
    else if (entry === 'page.tsx') out.push(full);
  }
  return out;
}

describe('share-param hydration policy', () => {
  const appDir = join(__dirname, '..');
  const pages = collectPageFiles(appDir);

  it('finds the app pages', () => {
    expect(pages.length).toBeGreaterThanOrEqual(7);
  });

  it.each(pages.map((p) => [p.slice(appDir.length + 1), p]))(
    '%s does not use useSearchParams',
    (_label, fullPath) => {
      const source = readFileSync(fullPath, 'utf8');
      // Forbid the import and any call — prose mentions in comments are fine.
      expect(source).not.toMatch(/import\s*{[^}]*useSearchParams|useSearchParams\s*\(/);
    },
  );
});
