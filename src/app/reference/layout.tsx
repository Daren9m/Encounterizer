import type { Metadata } from 'next';
import { TOOL_ROUTES } from '@/lib/site';

const route = TOOL_ROUTES.find((item) => item.path === '/reference');

export const metadata: Metadata = {
  title: route?.title ?? 'Reference Library',
  description: route?.description ?? 'Search rules, spells, magic items, feats, backgrounds, and species in one table-ready reference.',
};

export default function ReferenceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
