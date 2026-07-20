'use client';

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu, Moon, Sun, Swords, X } from 'lucide-react';
import {
  TOOL_SECTIONS,
  type RouteInfo,
  type ToolSectionId,
} from '@/lib/site';
import RouteIcon from '@/components/RouteIcon';
import { getTheme, setTheme, subscribeTheme } from '@/lib/theme';

interface NavigationState {
  pathname: string;
  mobileOpen: boolean;
  desktopSection: ToolSectionId | null;
}

function NavLink({
  route,
  active,
  onNavigate,
  compact = false,
}: {
  route: RouteInfo;
  active: boolean;
  onNavigate: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Link
        href={route.path}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
        className={`group relative inline-flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
          active
            ? 'border-[var(--steel-700)] bg-[var(--steel-800)] text-[var(--text-1)] shadow-sm'
            : 'border-transparent text-[var(--text-2)] hover:border-[var(--steel-800)] hover:bg-[var(--steel-800)] hover:text-[var(--text-1)]'
        }`}
      >
        <RouteIcon
          name={route.icon}
          size={19}
          className={active
            ? 'text-[var(--bronze)]'
            : 'text-[var(--text-3)] transition-colors group-hover:text-[var(--bronze)]'}
        />
        <span>{route.label}</span>
        {active && (
          <span
            className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--bronze)]"
            aria-hidden="true"
          />
        )}
      </Link>
    );
  }

  return (
    <Link
      href={route.path}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={`group flex h-full min-h-24 w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
        active
          ? 'border-[var(--bronze)] bg-[var(--steel-800)] text-[var(--text-1)] shadow-sm'
          : 'border-[var(--steel-800)] bg-[var(--steel-950)] text-[var(--text-2)] hover:border-[var(--steel-700)] hover:bg-[var(--steel-800)] hover:text-[var(--text-1)]'
      }`}
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--steel-700)] bg-[var(--steel-900)]">
        <RouteIcon
          name={route.icon}
          size={20}
          className={active
            ? 'text-[var(--bronze-light)]'
            : 'text-[var(--text-3)] transition-colors group-hover:text-[var(--bronze)]'}
        />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-[var(--text-1)]">{route.label}</span>
        <span className="mt-1 block text-xs leading-relaxed text-[var(--text-3)]">
          {route.description}
        </span>
      </span>
    </Link>
  );
}

export default function NavBar() {
  const pathname = usePathname();

  // The player screen is a handout, not a tool page — no site chrome.
  // trailingSlash: true means usePathname() reports the slashed form.
  if (pathname === '/noncombat/player' || pathname.startsWith('/noncombat/player/')) return null;

  // Remounting the interactive shell on navigation permanently clears transient
  // disclosure state, including when browser history later returns to a route.
  return <NavigationBar key={pathname} pathname={pathname} />;
}

function NavigationBar({ pathname }: { pathname: string }) {
  const [navigation, setNavigation] = useState<NavigationState>({
    pathname,
    mobileOpen: false,
    desktopSection: null,
  });
  const desktopDisclosureRef = useRef<HTMLDivElement>(null);
  const desktopOwnerRef = useRef<HTMLButtonElement>(null);
  const homeLinkRef = useRef<HTMLAnchorElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => 'dark');

  // Tying open state to the route makes browser back/forward and client-side
  // navigation close transient UI immediately, without moving keyboard focus.
  const stateIsCurrent = navigation.pathname === pathname;
  const menuOpen = stateIsCurrent && navigation.mobileOpen;
  const openDesktopSection = stateIsCurrent ? navigation.desktopSection : null;

  const closeNavigation = () => {
    setNavigation({ pathname, mobileOpen: false, desktopSection: null });
  };

  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(`${path}/`);

  const toggleDesktopSection = (
    sectionId: ToolSectionId,
    trigger: HTMLButtonElement,
  ) => {
    desktopOwnerRef.current = trigger;
    setNavigation((current) => ({
      pathname,
      mobileOpen: false,
      desktopSection:
        current.pathname === pathname && current.desktopSection === sectionId
          ? null
          : sectionId,
    }));
  };

  const focusFirstDesktopLink = (sectionId: ToolSectionId) => {
    window.requestAnimationFrame(() => {
      document
        .getElementById(`desktop-nav-panel-${sectionId}`)
        ?.querySelector<HTMLAnchorElement>('a')
        ?.focus();
    });
  };

  const handleDesktopTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    sectionId: ToolSectionId,
  ) => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    desktopOwnerRef.current = event.currentTarget;
    setNavigation({ pathname, mobileOpen: false, desktopSection: sectionId });
    focusFirstDesktopLink(sectionId);
  };

  // Put keyboard users directly into the mobile panel after its trigger opens.
  useEffect(() => {
    if (!menuOpen) return;
    const focusFrame = window.requestAnimationFrame(() => {
      mobileMenuRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [menuOpen]);

  // Escape is the one dismissal that restores focus. Pointer, focus, route,
  // and breakpoint dismissals intentionally leave focus where the user put it.
  useEffect(() => {
    if (!menuOpen && openDesktopSection === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();

      const owner = menuOpen ? menuButtonRef.current : desktopOwnerRef.current;
      setNavigation({ pathname, mobileOpen: false, desktopSection: null });
      window.requestAnimationFrame(() => owner?.focus());
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (
        openDesktopSection !== null
        && !desktopDisclosureRef.current?.contains(target)
      ) {
        setNavigation((current) => ({ ...current, desktopSection: null }));
      }

      const withinMobileNavigation =
        mobileMenuRef.current?.contains(target)
        || menuButtonRef.current?.contains(target);
      if (menuOpen && !withinMobileNavigation) {
        setNavigation((current) => ({ ...current, mobileOpen: false }));
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (
        openDesktopSection !== null
        && !desktopDisclosureRef.current?.contains(target)
      ) {
        setNavigation((current) => ({ ...current, desktopSection: null }));
      }

      const withinMobileNavigation =
        mobileMenuRef.current?.contains(target)
        || menuButtonRef.current?.contains(target);
      if (menuOpen && !withinMobileNavigation) {
        setNavigation((current) => ({ ...current, mobileOpen: false }));
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [menuOpen, openDesktopSection, pathname]);

  // A control from one navigation mode should never remain open after the
  // viewport crosses the desktop breakpoint.
  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1024px)');
    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      const activeElement = document.activeElement;
      const focusIsLeavingWithMode = event.matches
        ? Boolean(
            activeElement
            && (mobileMenuRef.current?.contains(activeElement)
              || menuButtonRef.current?.contains(activeElement)),
          )
        : Boolean(activeElement && desktopDisclosureRef.current?.contains(activeElement));

      setNavigation((current) => ({
        ...current,
        mobileOpen: false,
        desktopSection: null,
      }));

      if (focusIsLeavingWithMode) {
        window.requestAnimationFrame(() => {
          if (!event.matches) {
            menuButtonRef.current?.focus();
            return;
          }

          const activeSection = TOOL_SECTIONS.find((section) =>
            section.routes.some((route) =>
              pathname === route.path || pathname.startsWith(`${route.path}/`),
            ),
          );
          const destination = activeSection
            ? document.getElementById(`desktop-nav-trigger-${activeSection.id}`)
            : homeLinkRef.current;
          destination?.focus();
        });
      }
    };

    desktopQuery.addEventListener('change', handleBreakpointChange);
    return () => desktopQuery.removeEventListener('change', handleBreakpointChange);
  }, [pathname]);

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
        <div className="flex items-center justify-between gap-3">
          <Link
            ref={homeLinkRef}
            href="/"
            aria-current={pathname === '/' ? 'page' : undefined}
            onClick={closeNavigation}
            className="group inline-flex min-h-11 min-w-0 items-center gap-3 rounded-lg"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--steel-700)] bg-[var(--steel-950)] shadow-sm transition-colors group-hover:border-[var(--bronze)]">
              <Swords size={20} className="text-[var(--bronze)]" aria-hidden="true" />
            </span>
            <span className="min-w-0 leading-none">
              <span className="block truncate text-lg font-display sm:text-xl">Encounterizer</span>
              <span className="mt-1 hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-3)] sm:block">
                Dungeon Master Toolkit
              </span>
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-1">
            {/* Desktop section disclosures */}
            <div ref={desktopDisclosureRef} className="hidden lg:block">
              <div className="flex items-center gap-1">
                {TOOL_SECTIONS.map((section) => {
                  const expanded = openDesktopSection === section.id;
                  const activeRoute = section.routes.find((route) => isActive(route.path));
                  const sectionActive = Boolean(activeRoute);
                  return (
                    <Fragment key={section.id}>
                      <button
                        id={`desktop-nav-trigger-${section.id}`}
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={expanded ? `desktop-nav-panel-${section.id}` : undefined}
                        onClick={(event) => toggleDesktopSection(section.id, event.currentTarget)}
                        onKeyDown={(event) => handleDesktopTriggerKeyDown(event, section.id)}
                        className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                          expanded
                            ? 'border-[var(--bronze)] bg-[var(--steel-800)] text-[var(--text-1)]'
                            : sectionActive
                              ? 'border-[var(--steel-700)] bg-[var(--steel-800)] text-[var(--text-1)]'
                              : 'border-transparent text-[var(--text-2)] hover:border-[var(--steel-800)] hover:bg-[var(--steel-800)] hover:text-[var(--text-1)]'
                        }`}
                      >
                        {section.label}
                        {sectionActive && (
                          <>
                            <span
                              className="h-1.5 w-1.5 rounded-full bg-[var(--bronze)]"
                              aria-hidden="true"
                            />
                            <span className="sr-only">, contains current page: {activeRoute?.label}</span>
                          </>
                        )}
                        <ChevronDown
                          size={16}
                          className={`transition-transform ${expanded ? 'rotate-180 text-[var(--bronze)]' : 'text-[var(--text-3)]'}`}
                          aria-hidden="true"
                        />
                      </button>

                      {expanded && (
                        <div
                          id={`desktop-nav-panel-${section.id}`}
                          role="region"
                          aria-labelledby={`desktop-nav-trigger-${section.id}`}
                          className="absolute inset-x-8 top-full mt-2 rounded-2xl border border-[var(--steel-700)] bg-[var(--steel-900)] p-4 shadow-[0_22px_55px_rgba(0,0,0,0.38)]"
                        >
                          <div className="mb-3 flex items-end justify-between gap-6 px-1">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--bronze-light)]">
                                {section.label}
                              </p>
                              <p className="mt-1 text-sm text-[var(--text-3)]">{section.description}</p>
                            </div>
                            <span className="shrink-0 text-xs font-semibold text-[var(--text-3)]">
                              {section.routes.length} {section.routes.length === 1 ? 'tool' : 'tools'}
                            </span>
                          </div>
                          <ul
                            className={section.routes.length === 2
                              ? 'grid grid-cols-2 gap-2'
                              : 'grid grid-cols-3 gap-2'}
                          >
                            {section.routes.map((route) => (
                              <li key={route.path}>
                                <NavLink
                                  route={route}
                                  active={isActive(route.path)}
                                  onNavigate={closeNavigation}
                                />
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--steel-800)] text-[var(--text-2)] transition-colors hover:border-[var(--steel-700)] hover:bg-[var(--steel-800)] hover:text-[var(--bronze)]"
              onClick={() => {
                closeNavigation();
                setTheme(theme === 'light' ? 'dark' : 'light');
              }}
              aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            >
              {theme === 'light'
                ? <Moon size={19} aria-hidden="true" />
                : <Sun size={19} aria-hidden="true" />}
            </button>

            {/* Mobile hamburger */}
            <button
              ref={menuButtonRef}
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--steel-800)] text-[var(--text-2)] transition-colors hover:border-[var(--steel-700)] hover:bg-[var(--steel-800)] hover:text-[var(--text-1)] lg:hidden"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? 'mobile-nav' : undefined}
              aria-label={menuOpen ? 'Close main navigation' : 'Open main navigation'}
              onClick={() => {
                setNavigation((current) => ({
                  pathname,
                  mobileOpen: current.pathname === pathname ? !current.mobileOpen : true,
                  desktopSection: null,
                }));
              }}
            >
              {menuOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {/* Mobile panel: groups remain visible together so the topology is learnable. */}
        {menuOpen && (
          <div
            id="mobile-nav"
            ref={mobileMenuRef}
            className="absolute inset-x-4 top-full mt-2 max-h-[calc(100dvh-5.5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--steel-700)] bg-[var(--steel-900)] p-3 shadow-[0_22px_55px_rgba(0,0,0,0.38)] sm:inset-x-6 lg:hidden"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div className="space-y-5">
              {TOOL_SECTIONS.map((section) => (
                <section key={section.id} aria-labelledby={`mobile-nav-${section.id}`}>
                  <div className="px-2 pb-1.5">
                    <h2
                      id={`mobile-nav-${section.id}`}
                      className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--bronze-light)]"
                    >
                      {section.label}
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--text-3)]">
                      {section.description}
                    </p>
                  </div>
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {section.routes.map((route) => (
                      <li key={route.path}>
                        <NavLink
                          route={route}
                          active={isActive(route.path)}
                          onNavigate={closeNavigation}
                          compact
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
