import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Dices } from 'lucide-react';
import RouteIcon from '@/components/RouteIcon';
import { TOOL_SECTIONS } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Page Not Found',
};

export default function NotFound() {
  return (
    <div className="animate-fade-in mx-auto max-w-4xl py-16 text-center">
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
        <div className="flex flex-col gap-3 border-b border-[var(--steel-800)] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg">Choose another route</h2>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-[var(--bronze)] underline underline-offset-4 hover:text-[var(--bronze-light)]"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to the entrance
          </Link>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          {TOOL_SECTIONS.map((section) => (
            <section key={section.id} aria-labelledby={`not-found-${section.id}`}>
              <h3 id={`not-found-${section.id}`} className="micro-label">
                {section.label}
              </h3>
              <ul className="mt-2 space-y-1 text-sm">
                {section.routes.map((route) => (
                  <li key={route.path}>
                    <Link
                      href={route.path}
                      className="group inline-flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-[var(--text-1)] hover:bg-[var(--steel-900)] hover:text-[var(--bronze)]"
                    >
                      <RouteIcon name={route.icon} size={16} className="text-[var(--text-3)] group-hover:text-[var(--bronze)]" />
                      {route.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
