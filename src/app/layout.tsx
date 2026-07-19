import type { Metadata } from 'next';
import Link from 'next/link';
import { Spectral, IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import NavBar from '@/components/NavBar';
import { SITE_DESCRIPTION, SITE_URL } from '@/lib/site';

// Self-hosted at build time by next/font — zero runtime requests.
const spectral = Spectral({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-body',
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
    <html lang="en" className={`${spectral.variable} ${plexSans.variable}`}>
      <body className="min-h-screen flex flex-col">
        <NavBar />

        {/* Main Content */}
        <main className="flex-1 max-w-7xl mx-auto px-4 py-6 w-full">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-[var(--steel-800)] bg-[var(--steel-900)] py-4 print:hidden">
          <div className="max-w-7xl mx-auto px-4 text-center text-sm text-[var(--text-3)] space-y-1">
            <div>Encounterizer — Built for Dungeon Masters. Uses 5.5e / 2024 rules.</div>
            {/* Full SRD 5.2.1 / CC-BY-4.0 attribution lives on /credits; a
                footer link satisfies the license (CC-BY-4.0 §3(a)(2)). */}
            <div>
              Unofficial Fan Content ·{' '}
              <Link href="/credits" className="underline hover:text-[var(--bronze)]">
                Credits &amp; licensing
              </Link>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
