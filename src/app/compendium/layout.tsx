import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reference Library',
  description: 'Search Encounterizer’s unified rules and game reference.',
  alternates: { canonical: '/reference' },
  robots: { index: false, follow: true },
};

export default function CompendiumLayout({ children }: { children: React.ReactNode }) {
  return children;
}
