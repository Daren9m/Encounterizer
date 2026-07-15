import type { MetadataRoute } from 'next';
import { ALL_ROUTE_PATHS, SITE_URL } from '@/lib/site';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return ALL_ROUTE_PATHS.map((path) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}/`,
    changeFrequency: 'monthly',
    priority: path === '/' ? 1 : 0.8,
  }));
}
