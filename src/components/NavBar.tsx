'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TOOL_ROUTES } from '@/lib/site';

function NavLink({
  href,
  active,
  children,
  onNavigate,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={`px-3 py-2 rounded transition-colors hover:bg-[var(--dungeon-accent)] hover:text-[var(--gold)] ${
        active
          ? 'text-[var(--gold)] font-bold border-b-2 border-[var(--gold)] rounded-b-none'
          : 'text-[var(--parchment-dark)]'
      }`}
    >
      {children}
    </Link>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu after navigating.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`);

  return (
    <header className="border-b border-[var(--dungeon-accent)] bg-[var(--dungeon-mid)] print:hidden">
      <nav aria-label="Main" className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl" aria-hidden="true">⚔️</span>
            <span className="text-xl font-bold text-[var(--gold)] font-heading">Encounterizer</span>
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-1">
            {TOOL_ROUTES.map((route) => (
              <NavLink key={route.path} href={route.path} active={isActive(route.path)}>
                {route.label}
              </NavLink>
            ))}
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="md:hidden p-2 rounded text-[var(--parchment-dark)] hover:text-[var(--gold)] hover:bg-[var(--dungeon-accent)]"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label="Toggle navigation menu"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile panel */}
        {menuOpen && (
          <div id="mobile-nav" className="md:hidden mt-2 pb-2 flex flex-col gap-1 animate-fade-in">
            {TOOL_ROUTES.map((route) => (
              <NavLink
                key={route.path}
                href={route.path}
                active={isActive(route.path)}
                onNavigate={() => setMenuOpen(false)}
              >
                <span aria-hidden="true" className="mr-2">{route.icon}</span>
                {route.label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>
    </header>
  );
}
