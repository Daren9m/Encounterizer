'use client';

import type { BattleReport } from '@/lib/battle-sim-types';
import { buildAssessment } from '@/lib/battle-sim';

const LABEL_COLORS: Record<BattleReport['simLabel'], string> = {
  Trivial: '#4caf50',
  Low: '#2e7d32',
  Moderate: '#f0c040',
  High: '#d84315',
  Deadly: '#b71c1c',
  Lethal: '#7b1fa2',
};

function WinRateDonut({ winRate, label }: { winRate: number; label: BattleReport['simLabel'] }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const color = winRate >= 0.9 ? '#4caf50' : winRate >= 0.65 ? '#f0c040' : winRate >= 0.35 ? '#d84315' : '#b71c1c';
  return (
    <svg viewBox="0 0 140 140" className="w-32 h-32" role="img" aria-label={`Party wins ${Math.round(winRate * 100)}% of simulated battles`}>
      <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--dungeon-dark)" strokeWidth="12" />
      <circle
        cx="70" cy="70" r={radius} fill="none"
        stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${winRate * circumference} ${circumference}`}
        transform="rotate(-90 70 70)"
      />
      <text x="70" y="66" textAnchor="middle" fill="var(--parchment)" fontSize="26" fontWeight="bold">
        {Math.round(winRate * 100)}%
      </text>
      <text x="70" y="86" textAnchor="middle" fill="var(--parchment-dark)" fontSize="11">
        win rate
      </text>
      <text x="70" y="102" textAnchor="middle" fill={LABEL_COLORS[label]} fontSize="12" fontWeight="bold">
        {label}
      </text>
    </svg>
  );
}

function HpCurve({ curve, maxRounds }: { curve: BattleReport['hpCurve']; maxRounds: number }) {
  if (curve.length === 0) return null;
  const width = 320;
  const height = 130;
  const padLeft = 8;
  const padBottom = 18;
  const plotW = width - padLeft - 8;
  const plotH = height - padBottom - 8;

  const x = (i: number) => padLeft + (curve.length === 1 ? 0 : (i / (curve.length - 1)) * plotW);
  const y = (pct: number) => 8 + (1 - Math.max(0, Math.min(1, pct))) * plotH;

  const partyPoints = curve.map((p, i) => `${x(i)},${y(p.partyPct)}`).join(' ');
  const monsterPoints = curve.map((p, i) => `${x(i)},${y(p.monsterPct)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full max-w-md"
      role="img"
      aria-label="Average hit points per round: party versus monsters"
    >
      {[0.25, 0.5, 0.75].map((line) => (
        <line key={line} x1={padLeft} x2={padLeft + plotW} y1={y(line)} y2={y(line)} stroke="var(--dungeon-accent)" strokeWidth="0.5" />
      ))}
      <polyline points={partyPoints} fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinejoin="round" />
      <polyline points={monsterPoints} fill="none" stroke="var(--dragon-red)" strokeWidth="2.5" strokeLinejoin="round" />
      {curve.map((p, i) => (
        (curve.length <= 10 || i % Math.ceil(curve.length / 10) === 0) && (
          <text key={p.round} x={x(i)} y={height - 4} textAnchor="middle" fontSize="9" fill="var(--parchment-dark)">
            {p.round}
          </text>
        )
      ))}
      <g fontSize="10">
        <rect x={padLeft} y={0} width="10" height="3" fill="var(--gold)" />
        <text x={padLeft + 14} y={4} fill="var(--parchment-dark)">Party HP</text>
        <rect x={padLeft + 74} y={0} width="10" height="3" fill="var(--dragon-red)" />
        <text x={padLeft + 88} y={4} fill="var(--parchment-dark)">Monster HP</text>
        <text x={width - 8} y={height - 4} textAnchor="end" fontSize="9" fill="var(--parchment-dark)">
          round{curve.length >= maxRounds ? ` (capped at ${maxRounds})` : ''}
        </text>
      </g>
    </svg>
  );
}

export default function BattleReportCard({
  report,
  xpLabel,
  stale,
  onRerun,
  onEditParty,
}: {
  report: BattleReport;
  xpLabel: string;
  stale: boolean;
  onRerun: () => void;
  onEditParty: () => void;
}) {
  return (
    <div className="card space-y-4">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xl font-bold text-[var(--gold)]">Battle Forecast</h3>
          <span className="text-xs text-[var(--parchment-dark)]">
            {report.iterations.toLocaleString()} simulated battles · seed {report.seed}
          </span>
        </div>
        <p className="text-xs text-[var(--parchment-dark)] italic">
          A Monte Carlo estimate — like a weather forecast, directionally useful, not a promise.
        </p>
      </div>

      {stale && (
        <div className="text-sm rounded border border-yellow-600 bg-yellow-900/30 px-3 py-2" role="status">
          The encounter changed since this forecast ran — re-run it for current numbers.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-6">
        <WinRateDonut winRate={report.partyWinRate} label={report.simLabel} />

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm flex-1 min-w-[12rem]">
          <div>
            <div className="text-[var(--gold)] font-bold text-lg">
              {report.avgRounds >= report.maxRounds ? `${report.maxRounds}+` : report.avgRounds.toFixed(1)}
            </div>
            <div className="text-xs text-[var(--parchment-dark)]">avg rounds</div>
          </div>
          <div>
            <div className="text-[var(--gold)] font-bold text-lg">
              {Math.round(report.avgPartyHpRemainingPct * 100)}%
            </div>
            <div className="text-xs text-[var(--parchment-dark)]">party HP left</div>
          </div>
          <div>
            <div className="text-[var(--gold)] font-bold text-lg">
              {Math.round(report.monsterHitRate * 100)}%
            </div>
            <div className="text-xs text-[var(--parchment-dark)]">monster hit rate</div>
          </div>
          {report.stalemateRate > 0 && (
            <div>
              <div className="text-[var(--gold)] font-bold text-lg">
                {Math.round(report.stalemateRate * 100)}%
              </div>
              <div className="text-xs text-[var(--parchment-dark)]">stalemates</div>
            </div>
          )}
          {report.deadliestMonster && (
            <div className="col-span-2">
              <div className="font-bold text-[var(--dragon-red)]">{report.deadliestMonster.name}</div>
              <div className="text-xs text-[var(--parchment-dark)]">
                deadliest — {Math.round(report.deadliestMonster.share * 100)}% of monster damage
              </div>
            </div>
          )}
        </div>
      </div>

      <HpCurve curve={report.hpCurve} maxRounds={report.maxRounds} />

      {report.dropRanking.some((d) => d.dropRate > 0) && (
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-[var(--gold)]">Most likely to drop</h4>
          {report.dropRanking.filter((d) => d.dropRate > 0).slice(0, 6).map((d) => (
            <div key={d.playerId} className="flex items-center gap-2 text-xs">
              <span className="w-24 truncate">{d.name}</span>
              <div className="flex-1 h-2.5 bg-[var(--dungeon-dark)] rounded overflow-hidden">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${Math.max(2, d.dropRate * 100)}%`,
                    background: d.dropRate > 0.5 ? '#b71c1c' : d.dropRate > 0.25 ? '#d84315' : '#f0c040',
                  }}
                />
              </div>
              <span className="w-10 text-right text-[var(--parchment-dark)]">
                {Math.round(d.dropRate * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-sm italic border-l-2 border-[var(--gold)] pl-3 text-[var(--parchment)]">
        {buildAssessment(report, xpLabel)}
      </p>

      {report.approximationNotes.length > 0 && (
        <details className="text-xs text-[var(--parchment-dark)]">
          <summary className="cursor-pointer">
            {report.approximationNotes.length} approximation{report.approximationNotes.length > 1 ? 's' : ''} in this forecast
          </summary>
          <ul className="mt-1 space-y-0.5 list-disc list-inside opacity-80">
            {report.approximationNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-3 print:hidden">
        <button type="button" className="btn-gold text-sm" onClick={onRerun}>
          Run Again
        </button>
        <button type="button" className="btn-secondary text-sm" onClick={onEditParty}>
          Edit Party
        </button>
      </div>
    </div>
  );
}
