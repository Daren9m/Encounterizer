import Image from 'next/image';

import { getMonsterImage } from '@/data/monster-visual-index';

export default function MonsterPortrait({
  monsterId,
  sizes,
  className = '',
}: {
  monsterId: string;
  sizes: string;
  className?: string;
}) {
  const image = getMonsterImage(monsterId);
  if (!image) return null;

  return (
    <div
      className={`relative overflow-hidden bg-[var(--steel-950)] ${className}`}
      data-testid="monster-portrait"
    >
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes={sizes}
        className="object-cover object-top"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10"
      />
    </div>
  );
}
