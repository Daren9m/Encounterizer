import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="animate-fade-in">
      {/* Hero */}
      <section className="text-center py-12">
        <h1 className="text-4xl md:text-5xl font-bold text-[var(--gold)] mb-4">
          Encounterizer
        </h1>
        <p className="text-xl text-[var(--parchment-dark)] max-w-2xl mx-auto mb-8">
          Generate balanced encounters, browse monsters, and create battle maps
          for your D&amp;D 5.5e campaigns — all in one tool.
        </p>
        <Link href="/encounters" className="btn-gold text-lg px-8 py-3 inline-block rounded">
          Build an Encounter
        </Link>
      </section>

      {/* Feature Cards */}
      <section className="grid md:grid-cols-3 gap-6 mt-8">
        <FeatureCard
          href="/encounters"
          icon="⚔️"
          title="Encounter Generator"
          description="Set your party size, level, and desired difficulty — get a balanced encounter with monsters, scenario hook, tactics, and treasure in one click."
        />
        <FeatureCard
          href="/monsters"
          icon="🐉"
          title="Monster Bestiary"
          description="Browse 80+ monsters with rich filtering: search by CR, type, movement mode, damage types, resistances, and more."
        />
        <FeatureCard
          href="/maps"
          icon="🗺️"
          title="Map Generator"
          description="Procedurally generated battle maps — dungeons, caves, forests, and more. Each map is unique and tailored to the environment."
        />
      </section>

      {/* Quick Stats */}
      <section className="mt-16 text-center">
        <h2 className="text-2xl font-bold text-[var(--gold)] mb-6">Powered by the Rules</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBox value="80+" label="Monsters" />
          <StatBox value="5.5e" label="2024 Rules" />
          <StatBox value="14" label="Creature Types" />
          <StatBox value="∞" label="Unique Maps" />
        </div>
      </section>
    </div>
  );
}

function FeatureCard({
  href, icon, title, description,
}: {
  href: string; icon: string; title: string; description: string;
}) {
  return (
    <Link href={href} className="card block group">
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-bold text-[var(--gold)] group-hover:text-[var(--gold-light)] mb-2">
        {title}
      </h3>
      <p className="text-sm text-[var(--parchment-dark)]">{description}</p>
    </Link>
  );
}

function StatBox({ value, label }: { value: string; label: string }) {
  return (
    <div className="card text-center">
      <div className="text-2xl font-bold text-[var(--gold)]">{value}</div>
      <div className="text-sm text-[var(--parchment-dark)]">{label}</div>
    </div>
  );
}
