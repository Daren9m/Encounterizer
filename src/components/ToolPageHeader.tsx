import type { ReactNode } from 'react';
import RouteIcon from '@/components/RouteIcon';
import { TOOL_ROUTES } from '@/lib/site';

export default function ToolPageHeader({
  path,
  title,
  description,
  actions,
}: {
  path: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  const route = TOOL_ROUTES.find((item) => item.path === path);

  if (!route) return null;

  return (
    <header className="page-header print:hidden">
      <div className="page-header-copy">
        <div className="eyebrow mb-2">
          <RouteIcon name={route.icon} size={14} />
          DM toolkit
        </div>
        <h1 className="text-3xl leading-tight sm:text-4xl">{title ?? route.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-2)] sm:text-base">
          {description ?? route.description}
        </p>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </header>
  );
}
