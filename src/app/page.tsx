import Link from 'next/link';
import { BESTIARY_META } from '@/data/bestiary-meta';
import { SPELLS_META } from '@/data/spells-meta';
import { RULES_REFERENCE_ENTRIES } from '@/data/rules-reference';
import RouteIcon from '@/components/RouteIcon';
import { TOOL_SECTIONS, type ToolSection } from '@/lib/site';

export default function HomePage() {
  return (
    <div className="animate-fade-in space-y-16 pb-8 sm:space-y-20">
      <section
        aria-labelledby="home-hero-title"
        className="page-hero relative grid overflow-hidden lg:grid-cols-[minmax(0,1.12fr)_minmax(20rem,0.88fr)] lg:items-center"
      >
        <div className="relative z-10 max-w-3xl px-6 py-10 sm:px-10 sm:py-14 lg:py-16">
          <p className="eyebrow mb-4">The DM&apos;s command table</p>
          <h1
            id="home-hero-title"
            className="max-w-2xl text-4xl leading-[1.05] tracking-[-0.025em] sm:text-5xl lg:text-6xl"
          >
            Build the encounter. Know the odds. Run the room.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--text-2)] sm:text-xl">
            Turn a party level and a story idea into a balanced, table-ready encounter—complete
            with monsters, tactics, a battle map, and a 1,000-run battle forecast.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/encounters"
              className="btn-primary inline-flex min-h-12 items-center justify-center gap-2 px-6 text-base"
            >
              Build an Encounter
              <span aria-hidden="true">→</span>
            </Link>
            <Link
              href="/reference"
              className="btn-secondary inline-flex min-h-12 items-center justify-center px-6 text-base"
            >
              Open DM Reference
            </Link>
          </div>

          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--text-3)]">
            <span className="inline-flex items-center gap-2">
              <span className="status-dot" aria-hidden="true" />
              2024 encounter rules
            </span>
            <span>No account</span>
            <span>Runs entirely in your browser</span>
          </div>
        </div>

        <div className="relative z-10 px-4 pb-6 sm:px-8 sm:pb-8 lg:p-8 lg:pl-0">
          <EncounterReadinessPreview />
        </div>
      </section>

      <section aria-labelledby="toolkit-heading">
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow mb-2">One toolkit, one session</p>
            <h2 id="toolkit-heading" className="section-heading">
              Everything behind the screen
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--text-2)] sm:text-right">
            Move from session prep to live play, then find an answer without scanning a wall
            of unrelated tools.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {TOOL_SECTIONS.map((section, index) => (
            <ToolSectionCard key={section.id} section={section} step={index + 1} />
          ))}
        </div>
      </section>

      <section
        aria-labelledby="rules-heading"
        className="surface-inset grid gap-6 px-5 py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-7"
      >
        <div>
          <p className="eyebrow mb-2">Rules-ready by design</p>
          <h2 id="rules-heading" className="text-2xl">
            Built for fast decisions at the table
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-2)]">
            Searchable SRD rules, 2024 encounter budgets, printable handouts, and shareable
            encounters—without accounts or server-side storage.
          </p>
        </div>

        <dl className="grid grid-cols-3 gap-3 text-center sm:min-w-[22rem]">
          <Stat value={BESTIARY_META.count.toLocaleString()} label="Monsters" />
          <Stat value={SPELLS_META.count.toLocaleString()} label="Spells" />
          <Stat value={RULES_REFERENCE_ENTRIES.length.toLocaleString()} label="Rules references" />
        </dl>
      </section>
    </div>
  );
}

function EncounterReadinessPreview() {
  const checks = [
    { label: 'Party profile', value: '4 heroes · level 5' },
    { label: 'Encounter budget', value: 'Moderate · matched' },
    { label: 'Battlefield', value: 'Underdark · map ready' },
  ];

  return (
    <div className="rounded-xl border border-[var(--steel-700)] bg-[var(--steel-900)] p-4 shadow-[var(--shadow-card)] sm:p-5">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--steel-800)] pb-4">
        <div>
          <p className="micro-label">Encounter readiness</p>
          <h2 className="mt-1 text-xl">The Hollow Gate</h2>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(122,203,154,0.35)] bg-[rgba(122,203,154,0.1)] px-3 py-1 text-xs font-semibold text-[var(--difficulty-easy)]">
          <span className="status-dot" aria-hidden="true" />
          Ready to run
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        <PreviewMetric value="4" label="Creatures" />
        <PreviewMetric value="312" label="Monster HP" />
        <PreviewMetric value="1,000" label="Forecasts" />
      </dl>

      <div className="surface-inset mt-4 space-y-3 p-3">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden="true"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[rgba(122,203,154,0.14)] text-xs font-bold text-[var(--difficulty-easy)]"
            >
              ✓
            </span>
            <span className="min-w-0 flex-1 text-[var(--text-2)]">{check.label}</span>
            <span className="text-right font-medium text-[var(--text-1)]">{check.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="micro-label">Difficulty profile</span>
          <span className="font-semibold text-[var(--difficulty-medium)]">Moderate</span>
        </div>
        <div className="grid h-2 grid-cols-4 gap-1" aria-hidden="true">
          <span className="rounded-full bg-[var(--difficulty-easy)]" />
          <span className="rounded-full bg-[var(--difficulty-medium)]" />
          <span className="rounded-full bg-[var(--steel-800)]" />
          <span className="rounded-full bg-[var(--steel-800)]" />
        </div>
      </div>
    </div>
  );
}

function PreviewMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col rounded-lg border border-[var(--steel-800)] bg-[var(--steel-950)] px-2 py-3 text-center">
      <dt className="order-2 mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[var(--text-3)]">
        {label}
      </dt>
      <dd className="order-1 text-lg font-bold text-[var(--text-1)] sm:text-xl">{value}</dd>
    </div>
  );
}

function ToolSectionCard({ section, step }: { section: ToolSection; step: number }) {
  return (
    <article className="flex h-full flex-col rounded-xl border border-[var(--steel-800)] bg-[var(--steel-900)] p-5 shadow-[var(--shadow-card)] sm:p-6">
      <div className="flex items-start gap-3 border-b border-[var(--steel-800)] pb-4">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgba(230,156,85,0.35)] bg-[rgba(230,156,85,0.1)] text-sm font-bold text-[var(--bronze)]">
          {step}
        </span>
        <div>
          <h3 className="text-2xl">{section.label}</h3>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-2)]">{section.description}</p>
        </div>
      </div>

      <ul className="mt-3 space-y-1">
        {section.routes.map((route) => (
          <li key={route.path}>
            <Link
              href={route.path}
              className="group flex min-h-16 items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition-colors hover:border-[var(--steel-800)] hover:bg-[var(--steel-950)]"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--steel-800)]">
                <RouteIcon name={route.icon} size={18} className="text-[var(--bronze)]" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-[var(--text-1)]">{route.label}</strong>
                <span className="mt-0.5 block line-clamp-1 text-xs text-[var(--text-3)]">
                  {route.description}
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
    </article>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col border-l border-[var(--steel-800)] first:border-l-0">
      <dt className="order-2 mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--text-3)]">
        {label}
      </dt>
      <dd className="order-1 text-xl font-bold text-[var(--bronze)] sm:text-2xl">{value}</dd>
    </div>
  );
}
