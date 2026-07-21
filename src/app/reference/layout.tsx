import type { Metadata } from 'next';
import { TOOL_ROUTES } from '@/lib/site';

const route = TOOL_ROUTES.find((item) => item.path === '/reference');

export const metadata: Metadata = {
  title: route?.title ?? 'Reference Library',
  description: route?.description ?? 'Search SRD rules, classes, spells, equipment, magic items, and character options in one table-ready reference.',
};

export default function ReferenceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
