import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Spell Reference',
  description: 'Search SRD spells inside Encounterizer’s unified Reference Library.',
  alternates: { canonical: '/reference' },
  robots: { index: false, follow: true },
};

export default function SectionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
