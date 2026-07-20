import type { Metadata } from 'next';
import { TOOL_ROUTES } from '@/lib/site';

const route = TOOL_ROUTES.find((item) => item.path === '/reference');

export const metadata: Metadata = {
  title: route?.title ?? 'DM Reference',
  description: route?.description ?? 'Search conditions, combat rules, recovery, movement, and other table-ready rules from SRD 5.2.1.',
};

export default function ReferenceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
