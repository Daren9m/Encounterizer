import { describe, expect, it } from 'vitest';
import {
  ALL_ROUTE_PATHS,
  DM_SCREEN_TOOL_ROUTES,
  TOOL_ROUTES,
  TOOL_SECTIONS,
  type ToolSectionId,
} from '@/lib/site';

const EXPECTED_TOPOLOGY: Record<ToolSectionId, string[]> = {
  prep: ['/encounters', '/maps', '/noncombat'],
  run: ['/dm-screen', '/battle'],
  reference: ['/reference', '/monsters', '/spells'],
};

describe('site information architecture', () => {
  it('groups tools by the point in the DM workflow where they are used', () => {
    expect(TOOL_SECTIONS.map((section) => section.id)).toEqual(['prep', 'run', 'reference']);

    for (const section of TOOL_SECTIONS) {
      expect(section.routes.map((route) => route.path)).toEqual(EXPECTED_TOPOLOGY[section.id]);
    }
  });

  it('keeps the compatibility route list flattened in section order', () => {
    expect(TOOL_ROUTES).toEqual(TOOL_SECTIONS.flatMap((section) => section.routes));
  });

  it('assigns every tool path exactly once', () => {
    const paths = TOOL_ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((path) => path.startsWith('/'))).toBe(true);
  });

  it('indexes the DM Reference and exposes it inside the DM Screen', () => {
    expect(ALL_ROUTE_PATHS).toContain('/reference');
    expect(ALL_ROUTE_PATHS.filter((path) => path === '/reference')).toHaveLength(1);
    expect(DM_SCREEN_TOOL_ROUTES.map((route) => route.path)).toContain('/reference');
    expect(DM_SCREEN_TOOL_ROUTES.map((route) => route.path)).not.toContain('/dm-screen');
  });

  it('keeps the sitemap unique and leaves the chromeless player handout unindexed', () => {
    expect(new Set(ALL_ROUTE_PATHS).size).toBe(ALL_ROUTE_PATHS.length);
    expect(ALL_ROUTE_PATHS).not.toContain('/noncombat/player');
  });
});
