import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Dices } from 'lucide-react';
import RouteIcon from '@/components/RouteIcon';
import { TOOL_ROUTES } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Page Not Found',
};

export default function NotFound() {
  return (
    <div className="animate-fade-in max-w-2xl mx-auto text-center py-16">
      <div className="mb-4 flex justify-center" aria-hidden="true">
        <Dices size={48} className="text-[var(--bronze)]" />
      </div>
      <h1 className="text-4xl mb-3">
        404 — You rolled a natural 1
      </h1>
      <p className="text-[var(--text-2)] mb-8">
        This corridor leads nowhere. The map was a mimic all along.
      </p>

      <div className="card text-left">
        <h2 className="text-lg mb-3">
          Retrace your steps
        </h2>
        <ul className="grid sm:grid-cols-2 gap-2 text-sm">
          <li>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-[var(--bronze)] underline hover:text-[var(--bronze-light)]"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back to the entrance
            </Link>
          </li>
          {TOOL_ROUTES.map((route) => (
            <li key={route.path}>
              <Link
                href={route.path}
                className="inline-flex items-center gap-1.5 text-[var(--text-1)] underline hover:text-[var(--bronze)]"
              >
                <RouteIcon name={route.icon} size={16} className="text-[var(--text-3)]" />
                {route.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
