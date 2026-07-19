import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Player Handout',
  description: 'A player-safe view of one generated scene — read-aloud text and handout only.',
  robots: { index: false },
};

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
