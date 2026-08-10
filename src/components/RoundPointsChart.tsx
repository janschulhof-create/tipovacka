'use client';

import { useState } from 'react';

export interface RoundPointsData {
  rounds: number[];
  players: { name: string; cumulative: number[] }[];
}

/** Barvy čar — stejná paleta jako zbytek aplikace, stabilní podle pořadí. */
const BARVY = [
  '#a78bfa', '#34d399', '#f97316', '#38bdf8',
  '#fbbf24', '#f472b6', '#4ade80', '#94a3b8',
];

/**
 * Kompaktní graf kumulativních bodů po kolech.
 *
 * Zobrazuje se v tabulce pořadí místo záložky „Live“ ve chvíli, kdy se
 * nehraje. Klepnutím na jméno lze čáru skrýt.
 */
export function RoundPointsChart({ data, compact = false }: { data: RoundPointsData; compact?: boolean }) {
  const [skryti, setSkryti] = useState<Set<string>>(new Set());

  if (data.rounds.length < 2 || data.players.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[11px] text-copy-muted">
        Graf se objeví po druhém odehraném kole.
      </div>
    );
  }

  const viditelni = data.players.filter((p) => !skryti.has(p.name));
  const maxBody = Math.max(
    1,
    ...data.players.flatMap((p) => p.cumulative),
  );

  const sirka = 320;
  const vyska = compact ? 110 : 140;
  const okrajX = 6;
  const okrajY = 8;

  const x = (index: number) =>
    okrajX + (index / Math.max(1, data.rounds.length - 1)) * (sirka - okrajX * 2);
  const y = (body: number) =>
    vyska - okrajY - (body / maxBody) * (vyska - okrajY * 2);

  const cara = (hodnoty: number[]) =>
    hodnoty.map((body, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(body).toFixed(1)}`).join(' ');

  return (
    <div className={compact ? 'px-3 py-3' : 'px-4 py-4'}>
      <svg
        viewBox={`0 0 ${sirka} ${vyska}`}
        className="w-full"
        role="img"
        aria-label="Vývoj bodů po kolech"
      >
        {/* vodorovné vodicí čáry */}
        {[0, 0.5, 1].map((podil) => (
          <line
            key={podil}
            x1={okrajX}
            x2={sirka - okrajX}
            y1={y(maxBody * podil)}
            y2={y(maxBody * podil)}
            stroke="currentColor"
            strokeWidth="0.5"
            className="text-line-subtle"
          />
        ))}

        {data.players.map((hrac, index) => {
          if (skryti.has(hrac.name)) return null;
          return (
            <path
              key={hrac.name}
              d={cara(hrac.cumulative)}
              fill="none"
              stroke={BARVY[index % BARVY.length]}
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {/* osa kol */}
      <div className="mt-1 flex justify-between px-1 text-[9px] tabular-nums text-copy-muted">
        <span>{data.rounds[0]}. kolo</span>
        <span>{data.rounds.at(-1)}. kolo</span>
      </div>

      {/* legenda – klepnutím se čára skryje */}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {data.players.map((hrac, index) => {
          const skryty = skryti.has(hrac.name);
          return (
            <button
              key={hrac.name}
              onClick={() => {
                const dalsi = new Set(skryti);
                if (skryty) dalsi.delete(hrac.name);
                else dalsi.add(hrac.name);
                setSkryti(dalsi);
              }}
              className={`flex items-center gap-1 text-[10px] transition ${
                skryty ? 'text-copy-muted/45' : 'text-copy-primary'
              }`}
            >
              <span
                className="h-1.5 w-3 shrink-0 rounded-full"
                style={{ background: skryty ? 'currentColor' : BARVY[index % BARVY.length] }}
              />
              {hrac.name}
              <span className="tabular-nums text-copy-muted">{hrac.cumulative.at(-1)}</span>
            </button>
          );
        })}
      </div>

      {viditelni.length === 0 && (
        <p className="mt-2 text-center text-[10px] text-copy-muted">
          Všechny čáry jsou skryté — klepni na jméno.
        </p>
      )}
    </div>
  );
}
