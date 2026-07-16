import type { Metadata } from 'next';
import Link from 'next/link';
import { TOOL_ROUTES } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Page Not Found',
};

export default function NotFound() {
  return (
    <div className="animate-fade-in max-w-2xl mx-auto text-center py-16">
      <div className="text-6xl mb-4" aria-hidden="true">🎲</div>
      <h1 className="text-4xl font-bold text-[var(--bronze)] mb-3">
        404 — You rolled a natural 1
      </h1>
      <p className="text-[var(--text-2)] mb-8">
        This corridor leads nowhere. The map was a mimic all along.
      </p>

      <div className="card text-left">
        <h2 className="text-lg font-bold text-[var(--bronze)] mb-3">
          Retrace your steps
        </h2>
        <ul className="grid sm:grid-cols-2 gap-2 text-sm">
          <li>
            <Link href="/" className="text-[var(--bronze)] underline hover:text-[var(--bronze-light)]">
              ← Back to the entrance
            </Link>
          </li>
          {TOOL_ROUTES.map((route) => (
            <li key={route.path}>
              <Link
                href={route.path}
                className="text-[var(--text-1)] underline hover:text-[var(--bronze)]"
              >
                <span aria-hidden="true" className="mr-1">{route.icon}</span>
                {route.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
