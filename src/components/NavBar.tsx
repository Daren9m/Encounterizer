'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Swords, X } from 'lucide-react';
import { TOOL_ROUTES, type RouteInfo } from '@/lib/site';
import RouteIcon from '@/components/RouteIcon';

function NavLink({
  route,
  active,
  onNavigate,
  mobile = false,
}: {
  route: RouteInfo;
  active: boolean;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  return (
    <Link
      href={route.path}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={`group relative inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        mobile ? 'w-full' : ''
      } ${
        active
          ? 'border-[var(--steel-700)] bg-[var(--steel-800)] text-[var(--text-1)] shadow-sm'
          : 'border-transparent text-[var(--text-2)] hover:border-[var(--steel-800)] hover:bg-[var(--steel-800)] hover:text-[var(--text-1)]'
      }`}
    >
      <RouteIcon
        name={route.icon}
        size={mobile ? 19 : 17}
        className={active
          ? 'text-[var(--bronze)]'
          : 'text-[var(--text-3)] transition-colors group-hover:text-[var(--bronze)]'}
      />
      <span>{route.label}</span>
      {active && (
        <span
          className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--bronze)] lg:hidden"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Close the mobile menu after navigating.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Put keyboard users directly into the opened menu and return them to the
  // trigger when Escape closes it.
  useEffect(() => {
    if (!menuOpen) return;

    const focusFrame = window.requestAnimationFrame(() => {
      mobileMenuRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`);

  return (
    <header
      className="sticky top-0 z-50 border-b border-[var(--steel-800)] bg-[var(--steel-900)] shadow-[0_10px_30px_rgba(0,0,0,0.16)] backdrop-blur-xl print:hidden"
      style={{ backgroundColor: 'color-mix(in srgb, var(--steel-900) 90%, transparent)' }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[var(--bronze)] to-transparent opacity-30"
        aria-hidden="true"
      />
      <nav aria-label="Main" className="relative mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            aria-current={pathname === '/' ? 'page' : undefined}
            className="group inline-flex min-h-11 items-center gap-3 rounded-lg"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--steel-700)] bg-[var(--steel-950)] shadow-sm transition-colors group-hover:border-[var(--bronze)]">
              <Swords size={20} className="text-[var(--bronze)]" aria-hidden="true" />
            </span>
            <span className="leading-none">
              <span className="block text-xl font-display">Encounterizer</span>
              <span className="mt-1 hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-3)] sm:block">
                Dungeon Master Toolkit
              </span>
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden items-center gap-1 lg:flex">
            {TOOL_ROUTES.map((route) => (
              <NavLink key={route.path} route={route} active={isActive(route.path)} />
            ))}
          </div>

          {/* Mobile hamburger */}
          <button
            ref={menuButtonRef}
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--steel-800)] text-[var(--text-2)] transition-colors hover:border-[var(--steel-700)] hover:bg-[var(--steel-800)] hover:text-[var(--text-1)] lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? 'Close main navigation' : 'Open main navigation'}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? (
              <X size={24} aria-hidden="true" />
            ) : (
              <Menu size={24} aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Mobile panel */}
        {menuOpen && (
          <div
            id="mobile-nav"
            ref={mobileMenuRef}
            className="mt-3 border-t border-[var(--steel-800)] pt-3 lg:hidden"
          >
            <div className="grid gap-1.5 pb-1 sm:grid-cols-2">
              {TOOL_ROUTES.map((route) => (
                <NavLink
                  key={route.path}
                  route={route}
                  active={isActive(route.path)}
                  onNavigate={() => setMenuOpen(false)}
                  mobile
                />
              ))}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
