'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Swords, X } from 'lucide-react';
import { TOOL_ROUTES } from '@/lib/site';
import RouteIcon from '@/components/RouteIcon';

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
      className={`px-3 py-1.5 rounded-full text-sm transition-colors hover:bg-[var(--steel-800)] hover:text-[var(--text-1)] ${
        active
          ? 'bg-[var(--steel-800)] text-[var(--text-1)]'
          : 'text-[var(--text-2)]'
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
    <header className="border-b border-[var(--steel-800)] bg-[var(--steel-900)] print:hidden">
      <nav aria-label="Main" className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <Swords size={22} className="text-[var(--bronze)]" aria-hidden="true" />
            <span className="text-xl font-display">Encounterizer</span>
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
            className="md:hidden p-2 rounded-md text-[var(--text-2)] hover:text-[var(--text-1)] hover:bg-[var(--steel-800)]"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label="Toggle navigation menu"
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
          <div id="mobile-nav" className="md:hidden mt-2 pb-2 flex flex-col gap-1 animate-fade-in">
            {TOOL_ROUTES.map((route) => (
              <NavLink
                key={route.path}
                href={route.path}
                active={isActive(route.path)}
                onNavigate={() => setMenuOpen(false)}
              >
                <span className="flex items-center gap-2">
                  <RouteIcon
                    name={route.icon}
                    size={16}
                    className={isActive(route.path) ? 'text-[var(--bronze)]' : 'text-[var(--text-3)]'}
                  />
                  {route.label}
                </span>
              </NavLink>
            ))}
          </div>
        )}
      </nav>
    </header>
  );
}
