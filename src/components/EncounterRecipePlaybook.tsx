import { BookOpen, Check, Clock, Map, X } from 'lucide-react';
import { describeRecipeTrigger } from '@/lib/encounter-recipes';
import type { EncounterRecipePlan } from '@/lib/types';

export default function EncounterRecipePlaybook({
  plan,
  variant = 'full',
}: {
  plan: EncounterRecipePlan;
  variant?: 'full' | 'forecast';
}) {
  if (variant === 'forecast') {
    return (
      <section className="card player-handout-hidden print:hidden" aria-labelledby="recipe-forecast-heading">
        <div className="flex items-start gap-3">
          <span className="setup-group-icon" aria-hidden="true"><BookOpen size={18} /></span>
          <div>
            <p className="micro-label">Recipe forecast lens · {plan.recipeName}</p>
            <h3 id="recipe-forecast-heading" className="mt-1 text-xl">{plan.forecast.headline}</h3>
          </div>
        </div>
        <ul className="mt-4 grid gap-2 text-sm text-[var(--text-2)] md:grid-cols-2">
          {plan.forecast.guidance.map((guidance) => (
            <li key={guidance} className="surface-inset flex gap-2 p-3">
              <Check className="mt-0.5 shrink-0 text-[var(--bronze)]" size={15} aria-hidden="true" />
              <span>{guidance}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-wash)] px-3 py-2 text-xs text-[var(--text-2)]">
          <strong className="text-[var(--text-1)]">Model boundary:</strong> {plan.forecast.caveat}
        </p>
      </section>
    );
  }

  return (
    <section className="card player-handout-hidden" aria-labelledby="recipe-playbook-heading">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="setup-group-icon" aria-hidden="true"><BookOpen size={18} /></span>
          <div>
            <p className="micro-label">DM playbook · {plan.recipeName}</p>
            <h2 id="recipe-playbook-heading" className="mt-1 text-xl">{plan.objective.title}</h2>
            <p className="mt-1 max-w-3xl text-sm text-[var(--text-2)]">{plan.objective.summary}</p>
          </div>
        </div>
        <span className="status-readout status-readout-warning text-xs">
          <span className="status-readout-dot" aria-hidden="true" />{plan.beats.length} live cues
        </span>
      </header>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-[var(--status-success)] bg-[var(--status-success-wash)] p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-[var(--text-1)]"><Check size={16} aria-hidden="true" /> Success</p>
          <p className="mt-1 text-[var(--text-2)]">{plan.objective.success}</p>
        </div>
        <div className="rounded-lg border border-[var(--accent-danger)] bg-[var(--status-danger-wash)] p-3 text-sm">
          <p className="flex items-center gap-2 font-semibold text-[var(--text-1)]"><X size={16} aria-hidden="true" /> Failure</p>
          <p className="mt-1 text-[var(--text-2)]">{plan.objective.failure}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-1)]">Before initiative</h3>
          <ul className="mt-2 space-y-2 text-sm text-[var(--text-2)]">
            {plan.setup.map((note) => <li key={note} className="surface-inset p-3">{note}</li>)}
          </ul>
          <p className="mt-3 flex gap-2 text-xs text-[var(--text-3)]">
            <Map className="mt-0.5 shrink-0 text-[var(--bronze)]" size={14} aria-hidden="true" />
            <span><strong className="text-[var(--text-2)]">Staging:</strong> {plan.terrain}</span>
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-[var(--text-1)]">Battle beats</h3>
          <ol className="mt-2 space-y-2">
            {plan.beats.map((beat) => (
              <li key={beat.id} className="surface-inset p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm text-[var(--text-1)]">{beat.title}</strong>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[var(--bronze)]">
                    <Clock size={12} aria-hidden="true" /> {describeRecipeTrigger(beat.trigger)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--text-2)]">{beat.guidance}</p>
                <p className="mt-2 text-xs text-[var(--text-3)]"><strong>At the table:</strong> {beat.effect}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <p className="mt-4 border-t border-[var(--line-subtle)] pt-3 text-sm text-[var(--text-2)]">
        <strong className="text-[var(--text-1)]">Aftermath:</strong> {plan.closing}
      </p>
    </section>
  );
}
