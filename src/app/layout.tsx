import type { Metadata } from 'next';
import Link from 'next/link';
import { Cinzel } from 'next/font/google';
import './globals.css';
import NavBar from '@/components/NavBar';
import { SITE_DESCRIPTION, SITE_URL } from '@/lib/site';

// Self-hosted at build time by next/font — zero runtime requests.
const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['700'],
  variable: '--font-heading',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Encounterizer — D&D 5.5e Encounter Toolkit',
    template: '%s · Encounterizer',
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'Encounterizer',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cinzel.variable}>
      <body className="min-h-screen flex flex-col">
        <NavBar />

        {/* Main Content */}
        <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-[var(--dungeon-accent)] bg-[var(--dungeon-mid)] py-4 print:hidden">
          <div className="max-w-7xl mx-auto px-4 text-center text-sm text-[var(--parchment-dark)] opacity-60 space-y-1">
            <div>Encounterizer — Built for Dungeon Masters. Uses 5.5e / 2024 rules.</div>
            <div>
              Includes material from the SRD 5.2.1 by Wizards of the Coast LLC, licensed under
              CC-BY-4.0. Unofficial fan content.{' '}
              <Link href="/credits" className="underline hover:text-[var(--gold)]">
                Credits &amp; licensing
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
