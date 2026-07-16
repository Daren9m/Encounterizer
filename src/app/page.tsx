import Link from 'next/link';
import { ALL_MONSTERS } from '@/data';
import { SRD_SPELLS } from '@/data/spells';
import RouteIcon from '@/components/RouteIcon';
import { TOOL_ROUTES, type RouteIconName } from '@/lib/site';

export default function HomePage() {
  const creatureTypes = new Set(ALL_MONSTERS.map((m) => m.type)).size;

  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="text-center py-12">
        <h1 className="text-4xl md:text-5xl font-bold text-[var(--bronze)] mb-4">
          Encounterizer
        </h1>
        <p className="text-xl text-[var(--text-2)] max-w-2xl mx-auto mb-8">
          Build balanced encounters, forecast the battle, and run the whole session —
          monsters, maps, puzzles, and spells in one free DM toolkit for D&amp;D 5.5e.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/encounters" className="btn-primary text-lg px-8 py-3 inline-block rounded">
            Build an Encounter
          </Link>
          <Link href="/monsters" className="btn-secondary text-lg px-8 py-3 inline-block rounded">
            Browse the Bestiary
          </Link>
        </div>
      </section>

      {/* Feature Cards — all six tools */}
      <section className="grid sm:grid-cols-2 md:grid-cols-3 gap-6 mt-8" aria-label="Tools">
        {TOOL_ROUTES.map((route) => (
          <FeatureCard
            key={route.path}
            href={route.path}
            icon={route.icon}
            title={route.title}
            description={route.description}
          />
        ))}
      </section>

      {/* Quick Stats — computed from the data modules, so they never drift */}
      <section className="mt-16 text-center">
        <h2 className="text-2xl font-bold text-[var(--bronze)] mb-6">Powered by the Rules</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatBox value={String(ALL_MONSTERS.length)} label="SRD Monsters" />
          <StatBox value={String(SRD_SPELLS.length)} label="Spells" />
          <StatBox value={String(creatureTypes)} label="Creature Types" />
          <StatBox value="2024" label="Rules Edition" />
          <StatBox value="∞" label="Unique Maps" />
        </div>
        <p className="mt-6 text-sm text-[var(--text-2)] max-w-xl mx-auto">
          Everything runs in your browser — no accounts, no server, no tracking.
          Encounters are shareable by link, and your data never leaves your device.
        </p>
      </section>
    </div>
  );
}

function FeatureCard({
  href, icon, title, description,
}: {
  href: string; icon: RouteIconName; title: string; description: string;
}) {
  return (
    <Link href={href} className="card block group">
      <div className="mb-3">
        <RouteIcon name={icon} size={28} className="text-[var(--bronze)]" />
      </div>
      <h3 className="text-lg font-bold text-[var(--bronze)] group-hover:text-[var(--bronze-light)] mb-2">
        {title}
      </h3>
      <p className="text-sm text-[var(--text-2)]">{description}</p>
    </Link>
  );
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="card text-center">
      <div className="text-2xl font-bold text-[var(--bronze)]">{value}</div>
      <div className="text-sm text-[var(--text-2)]">{label}</div>
    </div>
  );
}
