'use client';

import { Monster } from '@/lib/types';

function abilityMod(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function formatSpeed(speed: Monster['speed']): string {
  const parts: string[] = [];
  if (speed.walk) parts.push(`${speed.walk} ft.`);
  if (speed.fly) parts.push(`fly ${speed.fly} ft.${speed.hover ? ' (hover)' : ''}`);
  if (speed.swim) parts.push(`swim ${speed.swim} ft.`);
  if (speed.burrow) parts.push(`burrow ${speed.burrow} ft.`);
  if (speed.climb) parts.push(`climb ${speed.climb} ft.`);
  return parts.join(', ') || '0 ft.';
}

function crDisplay(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return cr.toString();
}

export default function MonsterStatBlock({ monster }: { monster: Monster }) {
  return (
    <div className="stat-block rounded-lg animate-fade-in">
      {/* Header */}
      <h3 className="text-xl font-bold">{monster.name}</h3>
      <p className="text-sm italic mb-3">
        {monster.size} {monster.type}
        {monster.subtype ? ` (${monster.subtype})` : ''}, {monster.alignment}
      </p>

      <hr className="border-[var(--dragon-red)] mb-2" />

      {/* Core Stats */}
      <div className="text-sm space-y-1">
        <p><span className="stat-label">Armor Class</span> {monster.armor.ac}{monster.armor.source ? ` (${monster.armor.source})` : ''}</p>
        <p><span className="stat-label">Hit Points</span> {monster.hitPoints} ({monster.hitDice})</p>
        <p><span className="stat-label">Speed</span> {formatSpeed(monster.speed)}</p>
      </div>

      <hr className="border-[var(--dragon-red)] my-2" />

      {/* Ability Scores */}
      <div className="grid grid-cols-6 gap-1 text-center text-sm mb-2">
        {(['str', 'dex', 'con', 'int', 'wis', 'cha'] as const).map(ab => (
          <div key={ab}>
            <div className="font-bold text-[var(--dragon-red)] uppercase text-xs">{ab}</div>
            <div>{monster.abilities[ab]} ({abilityMod(monster.abilities[ab])})</div>
          </div>
        ))}
      </div>

      <hr className="border-[var(--dragon-red)] my-2" />

      {/* Details */}
      <div className="text-sm space-y-1">
        {monster.savingThrows && Object.keys(monster.savingThrows).length > 0 && (
          <p>
            <span className="stat-label">Saving Throws </span>
            {Object.entries(monster.savingThrows)
              .filter(([, v]) => v != null)
              .map(([k, v]) => `${k.charAt(0).toUpperCase() + k.slice(1)} +${v}`)
              .join(', ')}
          </p>
        )}
        {monster.skills && Object.keys(monster.skills).length > 0 && (
          <p>
            <span className="stat-label">Skills </span>
            {Object.entries(monster.skills).map(([k, v]) => `${k} +${v}`).join(', ')}
          </p>
        )}
        {monster.damageVulnerabilities.length > 0 && (
          <p><span className="stat-label">Damage Vulnerabilities </span>{monster.damageVulnerabilities.join(', ')}</p>
        )}
        {monster.damageResistances.length > 0 && (
          <p>
            <span className="stat-label">Damage Resistances </span>
            {monster.damageResistances.join(', ')}
            {monster.damageResistanceNotes ? ` (${monster.damageResistanceNotes})` : ''}
          </p>
        )}
        {monster.damageImmunities.length > 0 && (
          <p>
            <span className="stat-label">Damage Immunities </span>
            {monster.damageImmunities.join(', ')}
            {monster.damageImmunityNotes ? ` (${monster.damageImmunityNotes})` : ''}
          </p>
        )}
        {monster.conditionImmunities.length > 0 && (
          <p><span className="stat-label">Condition Immunities </span>{monster.conditionImmunities.join(', ')}</p>
        )}
        {monster.senses.length > 0 && (
          <p><span className="stat-label">Senses </span>{monster.senses.join(', ')}</p>
        )}
        {monster.languages.length > 0 && (
          <p><span className="stat-label">Languages </span>{monster.languages.join(', ')}</p>
        )}
        <p>
          <span className="stat-label">Challenge </span>
          {crDisplay(monster.challengeRating)} ({monster.xp.toLocaleString()} XP)
          <span className="ml-2 text-xs opacity-70">Prof. Bonus +{monster.proficiencyBonus}</span>
        </p>
      </div>

      {/* Special Abilities */}
      {monster.specialAbilities && monster.specialAbilities.length > 0 && (
        <>
          <hr className="border-[var(--dragon-red)] my-2" />
          {monster.specialAbilities.map((a, i) => (
            <div key={i} className="text-sm mb-2">
              <span className="stat-label italic">{a.name}. </span>
              <span>{a.description}</span>
            </div>
          ))}
        </>
      )}

      {/* Actions */}
      {monster.actions.length > 0 && (
        <>
          <hr className="border-[var(--dragon-red)] my-2" />
          <h4 className="text-base font-bold text-[var(--dragon-red)] mb-1">Actions</h4>
          {monster.actions.map((a, i) => (
            <div key={i} className="text-sm mb-2">
              <span className="stat-label italic">{a.name}. </span>
              <span>{a.description}</span>
            </div>
          ))}
        </>
      )}

      {/* Bonus Actions */}
      {monster.bonusActions && monster.bonusActions.length > 0 && (
        <>
          <hr className="border-[var(--dragon-red)] my-2" />
          <h4 className="text-base font-bold text-[var(--dragon-red)] mb-1">Bonus Actions</h4>
          {monster.bonusActions.map((a, i) => (
            <div key={i} className="text-sm mb-2">
              <span className="stat-label italic">{a.name}. </span>
              <span>{a.description}</span>
            </div>
          ))}
        </>
      )}

      {/* Reactions */}
      {monster.reactions && monster.reactions.length > 0 && (
        <>
          <hr className="border-[var(--dragon-red)] my-2" />
          <h4 className="text-base font-bold text-[var(--dragon-red)] mb-1">Reactions</h4>
          {monster.reactions.map((a, i) => (
            <div key={i} className="text-sm mb-2">
              <span className="stat-label italic">{a.name}. </span>
              <span>{a.description}</span>
            </div>
          ))}
        </>
      )}

      {/* Legendary Actions */}
      {monster.legendary && (
        <>
          <hr className="border-[var(--dragon-red)] my-2" />
          <h4 className="text-base font-bold text-[var(--dragon-red)] mb-1">Legendary Actions</h4>
          <p className="text-sm mb-2 italic">{monster.legendary.description}</p>
          {monster.legendary.actions.map((a, i) => (
            <div key={i} className="text-sm mb-2">
              <span className="stat-label italic">{a.name}. </span>
              <span>{a.description}</span>
            </div>
          ))}
        </>
      )}

      {/* Tags */}
      {monster.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {monster.tags.map(tag => (
            <span key={tag} className="text-xs bg-[var(--dragon-red)] text-white px-2 py-0.5 rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
