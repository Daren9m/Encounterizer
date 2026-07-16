import { Drama, Map, Puzzle, Skull, Sparkles, Swords, type LucideIcon } from 'lucide-react';
import type { RouteIconName } from '@/lib/site';

const ICONS: Record<RouteIconName, LucideIcon> = {
  swords: Swords,
  skull: Skull,
  map: Map,
  puzzle: Puzzle,
  drama: Drama,
  sparkles: Sparkles,
};

/** Renders a route's Lucide icon by name. Works in both server and client components. */
export default function RouteIcon({
  name,
  size = 20,
  className,
}: {
  name: RouteIconName;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[name];
  return <Icon size={size} className={className} aria-hidden="true" />;
}
