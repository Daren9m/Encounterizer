import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Encounterizer — D&D Encounter Generator',
  description: 'Generate balanced encounters, browse monsters, and create battle maps for your D&D 5.5e campaigns.',
};

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 rounded transition-colors hover:bg-[var(--dungeon-accent)] text-[var(--parchment-dark)] hover:text-[var(--gold)]"
    >
      {children}
    </Link>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        {/* Navigation */}
        <header className="border-b border-[var(--dungeon-accent)] bg-[var(--dungeon-mid)]">
          <nav className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-2xl">⚔️</span>
              <span className="text-xl font-bold text-[var(--gold)]">Encounterizer</span>
            </Link>
            <div className="flex items-center gap-1">
              <NavLink href="/encounters">Encounters</NavLink>
              <NavLink href="/monsters">Bestiary</NavLink>
              <NavLink href="/maps">Maps</NavLink>
              <NavLink href="/puzzles">Puzzles</NavLink>
              <NavLink href="/challenges">Challenges</NavLink>
            </div>
          </nav>
        </header>

        {/* Main Content */}
        <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-[var(--dungeon-accent)] bg-[var(--dungeon-mid)] py-4">
          <div className="max-w-7xl mx-auto px-4 text-center text-sm text-[var(--parchment-dark)] opacity-60">
            Encounterizer — Built for Dungeon Masters. Uses 5.5e / 2024 rules.
          </div>
        </footer>
      </body>
    </html>
  );
}
