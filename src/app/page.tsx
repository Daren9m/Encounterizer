import Link from 'next/link';
import RouteIcon from '@/components/RouteIcon';
import { TOOL_SECTIONS, type ToolSection } from '@/lib/site';

const QUICK_ACTIONS = [
  {
    href: '/encounters',
    label: 'Build an encounter',
    icon: 'swords' as const,
    primary: true,
  },
  {
    href: '/battle',
    label: 'Track a battle',
    icon: 'battle' as const,
    primary: false,
  },
  {
    href: '/reference',
    label: 'Look up a rule',
    icon: 'book' as const,
    primary: false,
  },
];

export default function HomePage() {
  return (
    <div className="animate-fade-in space-y-10 pb-8 sm:space-y-12">
      <section
        aria-labelledby="home-hero-title"
        className="page-hero relative overflow-hidden"
      >
        <div className="relative z-10 max-w-4xl px-6 py-9 sm:px-10 sm:py-11">
          <p className="eyebrow mb-3">The DM&apos;s command table</p>
          <h1
            id="home-hero-title"
            className="max-w-3xl text-4xl leading-[1.05] tracking-[-0.025em] sm:text-5xl"
          >
            Build what you need. Keep the game moving.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--text-2)] sm:text-lg">
            Prepare encounters and scenes, manage combat, or settle a rules question—all in one
            focused toolkit for the table.
          </p>

          <nav aria-label="Quick actions" className="mt-7 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className={`${action.primary ? 'btn-primary' : 'btn-secondary'} inline-flex min-h-12 items-center justify-center gap-2 px-5 text-sm sm:text-base`}
              >
                <RouteIcon name={action.icon} size={17} />
                {action.label}
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <section aria-labelledby="toolkit-heading">
        <div className="mb-5">
          <p className="eyebrow mb-2">All tools</p>
          <h2 id="toolkit-heading" className="text-3xl sm:text-4xl">
            Choose what you need now
          </h2>
        </div>

        <div className="grid divide-y divide-[var(--line-subtle)] border-y border-[var(--line-subtle)] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {TOOL_SECTIONS.map((section) => (
            <ToolDirectorySection key={section.id} section={section} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ToolDirectorySection({ section }: { section: ToolSection }) {
  return (
    <section className="py-6 lg:px-6 lg:first:pl-0 lg:last:pr-0" aria-labelledby={`home-tools-${section.id}`}>
      <h3 id={`home-tools-${section.id}`} className="text-xl">
        {section.label}
      </h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-[var(--text-3)]">
        {section.description}
      </p>

      <ul className="mt-4 divide-y divide-[var(--line-subtle)]">
        {section.routes.map((route) => (
          <li key={route.path}>
            <Link
              href={route.path}
              className="group -mx-2 flex min-h-16 items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-[var(--surface-inset)]"
            >
              <RouteIcon
                name={route.icon}
                size={18}
                className="shrink-0 text-[var(--bronze)]"
              />
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-[var(--text-1)]">{route.navLabel}</strong>
                <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-3)]">
                  {route.navDescription}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="text-[var(--text-3)] transition-all group-hover:translate-x-0.5 group-hover:text-[var(--bronze)]"
              >
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
