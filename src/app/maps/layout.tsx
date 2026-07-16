import type { Metadata } from 'next';
import { TOOL_ROUTES } from '@/lib/site';

const route = TOOL_ROUTES.find((r) => r.path === '/maps')!;

export const metadata: Metadata = {
  title: route.title,
  description: route.description,
};

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
