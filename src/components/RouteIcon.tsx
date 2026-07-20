import { BookOpen, LayoutDashboard, Map, Puzzle, Shield, Skull, Sparkles, Swords, Users, type LucideIcon } from 'lucide-react';
import type { RouteIconName } from '@/lib/site';

const ICONS: Record<RouteIconName, LucideIcon> = {
  swords: Swords,
  skull: Skull,
  map: Map,
  puzzle: Puzzle,
  sparkles: Sparkles,
  users: Users,
  screen: LayoutDashboard,
  battle: Shield,
  book: BookOpen,
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
