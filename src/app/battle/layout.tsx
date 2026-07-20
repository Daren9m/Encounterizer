import type { Metadata } from 'next';
import { TOOL_ROUTES } from '@/lib/site';

const route = TOOL_ROUTES.find((item) => item.path === '/battle')!;

export const metadata: Metadata = { title: route.title, description: route.description };

export default function BattleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
