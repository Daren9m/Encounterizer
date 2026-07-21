import type { Metadata } from 'next';
import { TOOL_ROUTES } from '@/lib/site';

const route = TOOL_ROUTES.find((item) => item.path === '/compendium');

export const metadata: Metadata = {
  title: route?.title ?? 'SRD Compendium',
  description: route?.description
    ?? 'Search every SRD 5.2.1 magic item, feat, background, and species in Encounterizer.',
};

export default function CompendiumLayout({ children }: { children: React.ReactNode }) {
  return children;
}
