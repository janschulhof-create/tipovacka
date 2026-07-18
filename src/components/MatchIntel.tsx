'use client';

import { useEffect, useId, useState } from 'react';
import { pointsBadgeClass, qualityColor, qualitySoftClass } from '@/lib/points';
import { Flag } from './Flag';

interface MutualMatchRow {
  round: number | null;
  date: string | null;
  home: string;
  away: string;
  hs: number;
  as: number;
  ph: number | null;
  pa: number | null;
  points: number | null;
  season: string | null;
}
interface Prediction {
  lambdaHome: number; lambdaAway: number;
  pHome: number; pDraw: number; pAway: number;
  topScores: { h: number; a: number; p: number }[];
  bestTip: { h: number; a: number; ev: number };
  sample: number;
  formSample: number;
  h2hSample: number;
  basis: 'form+h2h' | 'form' | 'h2h';
}
interface XbFactor {
  key: 'h2h' | 'home' | 'away' | 'overall' | 'season' | 'context' | 'tip';
  label: string;
  value: number;
  sample: number;
  weight: number;
  description: string;
}
interface XbPrediction {
  value: number;
  low: number;
  high: number;
  confidence: number;
  factors: XbFactor[];
  trend: { index: number; value: number; actual: number }[];
  explanation: string;
  hasTip: boolean;
}
interface Form5Row { opponent: string; gf: number; ga: number; res: 'W' | 'D' | 'L' }
export interface InsightData {
  teams: { home: string; away: string };
  mutualMatches: MutualMatchRow[];
  form5: { home: Form5Row[]; away: Form5Row[] };
  prediction: Prediction | null;
  xb: XbPrediction | null;
  loggedIn: boolean;
}

/** Načte data jednou a nasdílí je oběma záložkám (H2H i Predikce). */
export function useInsight(matchId: number, enabled: boolean) {
  const [data, setData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || data || loading) return;
    setLoading(true);
    fetch(`/api/match-insight?match=${matchId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [enabled, matchId, data, loading]);

  return { data, loading };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('cs-CZ', { month: 'numeric', year: 'numeric' });
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-terrain-700 bg-terrain-900/40 px-3 py-4 text-center text-[13px] text-slate-300/50">{text}</p>;
}
function Score({ hs, as }: { hs: number; as: number }) {
  const hc = hs > as ? 'text-green-400' : hs < as ? 'text-slate-400' : 'text-slate-200';
  const ac = as > hs ? 'text-green-400' : as < hs ? 'text-slate-400' : 'text-slate-200';
  return (
    <span className="shrink-0 rounded-md bg-terrain-800 px-1.5 py-0.5 font-display text-[12.5px] font-bold tabular-nums">
      <span className={hc}>{hs}</span><span className="text-slate-500">:</span><span className={ac}>{as}</span>
    </span>
  );
}

/** Řetízek posledních výsledků (W/D/L) + skóre. */
function FormChain({ rows }: { rows: Form5Row[] }) {
  if (!rows.length) return <span className="text-[11px] text-slate-300/40">zatím nehrál</span>;
  const cls = (r: 'W' | 'D' | 'L') =>
    r === 'W' ? 'bg-violet-500 text-white' : r === 'L' ? 'bg-state-danger text-white' : 'bg-state-info text-white';
  return (
    <span className="flex flex-wrap items-center gap-1">
      {rows.map((r, i) => (
        <span
          key={i}
          title={`${r.res === 'W' ? 'výhra' : r.res === 'L' ? 'prohra' : 'remíza'} ${r.gf}:${r.ga} s ${r.opponent}`}
          className={`flex h-5 min-w-[1.25rem] items-center justify-center rounded px-1 text-[10px] font-bold ${cls(r.res)}`}
        >
          {r.res}
        </span>
      ))}
      <span className="ml-1 text-[11px] text-slate-300/45">
        {rows.map((r) => `${r.gf}:${r.ga}`).join(' · ')}
      </span>
    </span>
  );
}

/** Forma obou týmů na turnaji (posledních 5). */
export function TeamFormContent({ data }: { data: InsightData }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300/60">
        Současná forma (posledních 5 zápasů)
      </div>
      {(['home', 'away'] as const).map((side) => (
        <div key={side} className="flex flex-wrap items-center gap-2 rounded-xl border border-terrain-700 bg-terrain-900/40 px-3 py-2">
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-slate-100/80">
            <Flag team={data.teams[side]} /> <span className="truncate">{data.teams[side]}</span>
          </span>
          <span className="ml-auto"><FormChain rows={data.form5?.[side] ?? []} /></span>
        </div>
      ))}
    </div>
  );
}

/**
 * BAROKO — jak moc se tvůj tip liší od průměru party.
 * Kladné = tipuješ víc gólů / odvážněji než ostatní.
 */
export function Baroko({
  seed,
  myTip,
  preds,
  home,
  away,
}: {
  /** ID zápasu – hlášky jsou pak u každého zápasu jiné, ale stálé (nemění se při renderu). */
  seed: number;
  myTip?: { h: number; a: number };
  preds: { name: string; predicted_home: number; predicted_away: number }[];
  home: string;
  away: string;
}) {
  const others = preds.filter((p) => p.predicted_home != null);
  if (!myTip || others.length < 2) return null;

  const avgH = others.reduce((s, p) => s + p.predicted_home, 0) / others.length;
  const avgA = others.reduce((s, p) => s + p.predicted_away, 0) / others.length;

  // zaokrouhlený "tip party" – čte se líp než desetinná čísla
  const partaH = Math.round(avgH);
  const partaA = Math.round(avgA);

  const dGoals = myTip.h + myTip.a - (avgH + avgA); // víc/míň gólů než parta
  const dLean = myTip.h - myTip.a - (avgH - avgA); // komu víc věříš

  const same = others.filter((p) => p.predicted_home === myTip.h && p.predicted_away === myTip.a);
  const myWin = Math.sign(myTip.h - myTip.a);
  const partyWin = Math.sign(avgH - avgA);

  // ── slovní verdikt, žádná matematika ──
  // Deterministický výběr hlášky podle ID zápasu: u každého zápasu jiná,
  // ale při každém otevření stejná (nepřeskakuje pod rukama).
  let rs = (seed * 2654435761 + 97) % 2147483647;
  if (rs <= 0) rs += 2147483646;
  const rnd = () => (rs = (rs * 48271) % 2147483647) / 2147483647;
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];

  const mine = myWin > 0 ? home : myWin < 0 ? away : null;
  const theirs = partyWin > 0 ? home : partyWin < 0 ? away : null;

  let title: string;
  let note: string;

  if (Math.abs(dLean) < 0.5 && Math.abs(dGoals) < 0.5) {
    [title, note] = pick([
      ['Jedeš s davem', 'Tipuješ přesně to co ostatní. Bezpečné. Nudné. Nikoho nepředběhneš, ale ani se neztrapníš — což je celkem tvůj styl, ne?'],
      ['Ovce', 'Naprostá shoda s partou. Buď máte všichni pravdu, nebo se všichni společně sesypete. Sázím na to druhé.'],
      ['Bez fantazie', 'Ani o gól vedle davu. Tipuješ jako by ti někdo opisoval přes rameno. Nebo ty jemu?'],
      ['Kopie party', 'Naprosto stejný tip jako ostatní. Když to vyjde, nikdo si tě nevšimne. Když ne, aspoň v tom nejsi sám.'],
    ]);
  } else if (myWin !== partyWin && partyWin !== 0 && myWin !== 0) {
    [title, note] = pick([
      ['Jdeš proti partě', `Ostatní sázejí na ${theirs}, ty věříš ${mine}. Buď jsi génius, nebo tě v hodnocení rozcupují. Historie napovídá…`],
      ['Rebel, nebo blázen?', `Celá parta vidí ${theirs}. Ty jediný ${mine}. Tenhle tip tě buď vystřelí nahoru, nebo si na tebe budeme ukazovat.`],
      ['Sám proti všem', `Parta má jasno: ${theirs}. Ty máš taky jasno — a je to jinak. Doufám, že víš něco, co my ne.`],
      ['Odvaha na hraně', `Vsadit na ${mine}, když všichni ostatní věří ${theirs}? Buď hrdina, nebo Blamáž kola. Mezitím nic.`],
    ]);
  } else if (myWin === 0 && partyWin !== 0) {
    [title, note] = pick([
      ['Ty čekáš plichtu, parta ne', 'Ostatní vidí vítěze, ty dělbu bodů. Opatrnický tip pro opatrného člověka. Nebo prorok? Uvidíme.'],
      ['Alibista', `Parta tipuje ${theirs}, ty nechceš urazit ani jednoho. Remíza je tip pro ty, co se bojí rozhodnout.`],
      ['Diplomat', 'Ostatní si troufli na vítěze, ty rozdáváš body na obě strany. Bezpečné? To se ještě uvidí.'],
    ]);
  } else if (partyWin === 0 && myWin !== 0) {
    [title, note] = pick([
      ['Parta betonuje, ty útočíš', `Ostatní čekají plichtu, ty tvrdíš, že ${mine} to urve. Odvaha se cení — pokud vyjde.`],
      ['Jediný s názorem', `Celá parta zaparkovala na remíze. Ty jako jediný věříš, že ${mine} má na to vyhrát. Troufalé.`],
      ['Vsadils na vítěze', `Ostatní se schovali za remízu. Ty jsi ukázal prstem na ${mine}. Buď frajer, nebo za chvíli terč.`],
    ]);
  } else if (Math.abs(dLean) >= 0.8) {
    const t = dLean > 0 ? home : away;
    [title, note] = pick([
      [`Věříš ${t} víc než ostatní`, 'Stejný vítěz jako parta, ale ty čekáš jasnou záležitost. Sebevědomí ti nechybí. Body snad taky ne.'],
      ['Přehnané sebevědomí?', `Parta na ${t} taky sází, ale opatrněji. Ty čekáš výprask. Fotbal takové drzosti nemá rád.`],
      [`Sázíš na debakl ${t === home ? away : home}`, 'Ostatní jsou zdrženlivější. Ty už máš v hlavě kanonádu. Pozor, ať to není kanonáda do tvého tipu.'],
    ]);
  } else if (dGoals >= 0.8) {
    [title, note] = pick([
      ['Čekáš přestřelku', 'Ostatní tipují opatrně, ty věříš, že se bude pálit. Když to vyjde, budeš král. Když ne, budeš terč.'],
      ['Kanonýr', 'Nasypal jsi tam víc gólů než parta. Buď víš o dírách v obraně, nebo prostě rád riskuješ.'],
      ['Optimista', 'Parta čeká šachy, ty čekáš divočinu. Fotbal ale bývá nudnější, než bychom chtěli.'],
    ]);
  } else if (dGoals <= -0.8) {
    [title, note] = pick([
      ['Betonuješ', 'Parta čeká góly, ty vsázíš na nudu a čisté konto. Řemeslo, ne romantika.'],
      ['Pesimista', 'Míň gólů než všichni ostatní. Buď to máš přečtené, nebo prostě nevěříš, že někdo dá gól. Ani jeden.'],
      ['Antifotbal', 'Zatímco parta čeká zábavu, ty tipuješ zabetonovanou nudu. Fanoušci ti neděkují. Body možná ano.'],
    ]);
  } else {
    [title, note] = pick([
      ['Trochu mimo dav', 'Nejsi úplně s ostatními, ale ani rebel. Prostě průměrný tip průměrného tipéra.'],
      ['Vlažný rebel', 'Lišíš se od party. Ale tak nepatrně, že si toho stejně nikdo nevšimne.'],
      ['Nerozhodný', 'Ani s davem, ani proti němu. Jako bys tipoval jednou nohou.'],
    ]);
  }

  const company =
    same.length === 0
      ? pick([
          'S tímhle tipem jsi na to úplně sám. Sláva, nebo ostuda — o obojí se dělit nebudeš.',
          'Tenhle tip nemá nikdo jiný. Buď jsi napřed, nebo úplně mimo.',
          'Jsi s tím sám. Což je buď známka geniality, nebo varovný signál.',
        ])
      : same.length === 1
        ? pick([
            'Stejný tip má ještě 1 další. Aspoň nebudeš za blbce sám.',
            'Ještě jeden má stejný tip. Sdílená ostuda, poloviční ostuda.',
          ])
        : `Stejný tip má ještě ${same.length} ${same.length < 5 ? 'další' : 'dalších'}. ${pick(['Buď máte pravdu, nebo padnete společně.', 'Stádo se mýlí svorně, ale mýlí se rádo.'])}`;

  return (
    <div className="rounded-xl border border-terrain-700 bg-terrain-900/40 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300/60">
        🎭 Baroko — jak moc jsi mimo partu
      </div>

      <div className="mt-2 flex items-center gap-3 text-[13px]">
        <span className="rounded-lg bg-terrain-800 px-2 py-1">
          <span className="text-slate-300/50">ty </span>
          <b className="tabular-nums text-white">{myTip.h}:{myTip.a}</b>
        </span>
        <span className="text-slate-300/35">vs</span>
        <span className="rounded-lg bg-terrain-800 px-2 py-1">
          <span className="text-slate-300/50">parta spíš </span>
          <b className="tabular-nums text-slate-100/80">{partaH}:{partaA}</b>
        </span>
      </div>

      <p className="mt-2 text-sm font-semibold text-flag">{title}</p>
      <p className="mt-0.5 text-[12.5px] leading-snug text-slate-100/70">{note}</p>
      <p className="mt-1 text-[11px] text-slate-300/45">{company}</p>
    </div>
  );
}

function MutualMatchesContent({
  data,
  integrated = false,
}: {
  data: InsightData;
  integrated?: boolean;
}) {
  return (
    <div>
      <div className="mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-copy-secondary">
          {integrated ? 'Vzájemné zápasy · vstup do xB' : 'Vzájemné zápasy'}
        </div>
        {integrated && (
          <p className="mt-1 text-[11px] leading-relaxed text-copy-muted">
            Z těchto zápasů model čte, jak ti konkrétní dvojice soupeřů seděla. Zobrazuje nejvýše šest posledních duelů z našich dat.
          </p>
        )}
      </div>
      {data.mutualMatches.length === 0 ? (
        <Empty text="Pro tyto týmy zatím nemáme vzájemný zápas." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line-subtle bg-surface-1/70">
          {data.mutualMatches.slice(0, 6).map((r, i) => {
            const hasTip = r.ph != null && r.pa != null;
            const meta = r.round != null
              ? `${r.round}. kolo${r.season ? ` · ${r.season}` : ''}`
              : r.date
                ? fmtDate(r.date)
                : r.season ?? '';
            return (
              <div key={`${r.round ?? r.date ?? i}-${i}`} className="border-b border-line-subtle/70 px-3 py-3 last:border-0">
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[10.5px] text-copy-muted">
                  <span>{meta}</span>
                  {hasTip && (
                    <span className={`rounded-full px-2 py-0.5 font-bold tabular-nums ${pointsBadgeClass(r.points ?? 0)}`}>
                      {r.points == null ? '—' : `${r.points} b`}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px]">
                  <span className="min-w-0 flex-1 font-medium text-copy-primary">{r.home} – {r.away}</span>
                  {hasTip && (
                    <span className="text-copy-muted">tvůj tip <strong className="tabular-nums text-copy-primary">{r.ph}:{r.pa}</strong></span>
                  )}
                  <span className="text-copy-muted">výsledek <strong className="tabular-nums text-copy-primary">{r.hs}:{r.as}</strong></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Záložka H2H pro ostatní soutěže. V Chance lize je začleněná přímo do xB. */
export function H2HContent({ data, loading }: { data: InsightData | null; loading: boolean }) {
  if (loading) return <p className="text-xs text-copy-muted">Načítám…</p>;
  if (!data) return <Empty text="Data se nepodařilo načíst." />;

  return (
    <div className="space-y-4">
      <TeamFormContent data={data} />
      <MutualMatchesContent data={data} />
    </div>
  );
}

function QualityLegend() {
  return (
    <div className="rounded-xl border border-line-subtle bg-app-deep/45 px-3 py-2.5">
      <div className="h-1.5 rounded-full quality-gradient" />
      <div className="mt-1.5 grid grid-cols-5 gap-1 text-center text-[9px] font-semibold uppercase tracking-wide">
        <span className="text-state-danger">nejhorší</span>
        <span className="text-state-warning">slabší</span>
        <span className="text-state-info">střed</span>
        <span className="text-state-success">dobré</span>
        <span className="text-violet-300">nejlepší</span>
      </div>
    </div>
  );
}

function XbTrendChart({ rows }: { rows: XbPrediction['trend'] }) {
  const rawId = useId();
  const gradientId = `xb-trend-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  if (!rows?.length) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-line-subtle bg-app-deep/30 px-3 text-center text-[11px] text-copy-muted">
        Vývoj xB se objeví po prvních vyhodnocených tipech.
      </div>
    );
  }

  const width = 286;
  const height = 126;
  const padX = 22;
  const padTop = 12;
  const padBottom = 22;
  const innerW = width - padX * 2;
  const innerH = height - padTop - padBottom;
  const x = (index: number) => padX + (rows.length === 1 ? innerW / 2 : (index / (rows.length - 1)) * innerW);
  const y = (value: number) => padTop + innerH - (Math.max(0, Math.min(10, value)) / 10) * innerH;
  const line = rows.map((row, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(row.value).toFixed(1)}`).join(' ');
  const area = `${line} L ${x(rows.length - 1).toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`;

  return (
    <div className="rounded-2xl border border-line-subtle bg-app-deep/35 p-3">
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-copy-secondary">
        Tvoje xB v posledních {rows.length} zápasech
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[126px] w-full overflow-visible" role="img" aria-label="Graf vývoje osobního xB">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#49A8FF" />
            <stop offset="55%" stopColor="#8B4EEB" />
            <stop offset="100%" stopColor="#BE94FF" />
          </linearGradient>
        </defs>
        {[0, 5, 10].map((tick) => (
          <g key={tick}>
            <line x1={padX} x2={width - padX} y1={y(tick)} y2={y(tick)} stroke="rgba(180,192,212,.12)" strokeWidth="1" />
            <text x="2" y={y(tick) + 3} fill="rgba(180,192,212,.52)" fontSize="9" className="tabular-nums">{tick}</text>
          </g>
        ))}
        <path d={area} fill={`url(#${gradientId})`} opacity="0.10" />
        <path d={line} fill="none" stroke={`url(#${gradientId})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {rows.map((row, index) => (
          <g key={`${row.index}-${index}`}>
            <circle cx={x(index)} cy={y(row.value)} r="4" fill="#A46AF7" stroke="#07101D" strokeWidth="2">
              <title>{`xB ${row.value.toFixed(1)} · skutečně ${row.actual} b`}</title>
            </circle>
            <text x={x(index)} y={height - 5} textAnchor="middle" fill="rgba(180,192,212,.50)" fontSize="8">
              {rows.length - index}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-1 text-[9.5px] leading-snug text-copy-muted">
        Průběžný osobní odhad dopočítaný z tehdejší formy. Bod ukazuje xB; po najetí také skutečný zisk.
      </p>
    </div>
  );
}

/** Personalizovaná xB predikce + forma a H2H pro zápas Chance ligy. */
export function XbContent({ data, loading }: { data: InsightData | null; loading: boolean }) {
  if (loading) return <p className="text-xs text-copy-muted">Počítám xB predikci…</p>;
  if (!data) return <Empty text="Data se nepodařilo načíst." />;

  const xb = data.xb;
  const factorIcon: Record<XbFactor['key'], string> = {
    h2h: '🎯', home: '👕', away: '🛡️', overall: '📈', season: '🔥', context: '⭐', tip: '🧠',
  };

  const label = !xb
    ? ''
    : xb.value >= 8
      ? 'Výborný bodový potenciál'
      : xb.value >= 6
        ? 'Dobrý bodový potenciál'
        : xb.value >= 4
          ? 'Středně čitelný zápas'
          : xb.value >= 2
            ? 'Slabší vyhlídky'
            : 'Rizikový zápas';
  const degrees = xb ? Math.round((xb.value / 10) * 360) : 0;
  const mainColor = xb ? qualityColor(xb.value) : '#7888a3';

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-violet-400/20 bg-violet-500/5 px-3 py-2.5 text-[11px] leading-relaxed text-copy-secondary">
        <b className="text-violet-200">Co je xB?</b> Očekávané body z tohoto zápasu v našem bodování 0–10. Není to procento ani slib výsledku; model odhaduje, jak dobře by právě tobě měl zápas sedět.
      </div>

      {!data.loggedIn ? (
        <Empty text="Osobní xB se zobrazí po přihlášení tipera. H2H a forma týmů zůstávají níže." />
      ) : !xb ? (
        <Empty text="Pro tento zápas zatím nelze osobní xB spočítat." />
      ) : (
        <>
          <div className="panel-premium p-4">
            <div className="grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center lg:grid-cols-[9rem_minmax(0,1fr)_18rem]">
              <div
                className="relative mx-auto flex h-36 w-36 shrink-0 items-center justify-center rounded-full p-[9px] sm:mx-0"
                style={{ background: `conic-gradient(${mainColor} ${degrees}deg, rgb(23 42 71) ${degrees}deg)` }}
                aria-label={`Očekávané body ${xb.value} z 10`}
              >
                <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-app-deep shadow-inner">
                  <span className="font-display text-4xl font-bold tabular-nums text-white">{xb.value.toFixed(1)}</span>
                  <span className="text-xs text-copy-muted">/ 10</span>
                  <span className="mt-1 text-[10px] uppercase tracking-wide text-copy-muted">očekávané body</span>
                </div>
              </div>

              <div className="min-w-0 flex-1 text-center sm:text-left">
                <div className="text-[11px] font-bold uppercase tracking-[0.13em] text-violet-300">xB predikce</div>
                <h4 className="mt-1 font-display text-xl font-bold" style={{ color: mainColor }}>{label}</h4>
                <p className="mt-2 text-[12.5px] leading-relaxed text-copy-secondary">
                  Podle tvé historie model očekává v tomto zápase přibližně <b className="tabular-nums text-copy-primary">{xb.value.toFixed(1)} bodu</b>.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${qualitySoftClass(xb.value)}`}>
                    interval {xb.low.toFixed(1)}–{xb.high.toFixed(1)} b
                  </span>
                  <span className="rounded-full border border-line-strong bg-surface-2 px-3 py-1 text-xs text-copy-secondary">
                    jistota {xb.confidence} %
                  </span>
                </div>
                {!xb.hasTip && (
                  <p className="mt-2 text-[11px] text-copy-muted">Po uložení konkrétního tipu se odhad ještě zpřesní.</p>
                )}
              </div>

              <div className="hidden lg:block">
                <XbTrendChart rows={xb.trend ?? []} />
              </div>
            </div>
          </div>

          <div className="lg:hidden">
            <XbTrendChart rows={xb.trend ?? []} />
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-copy-secondary">Faktory ovlivňující xB</div>
              <p className="mt-1 text-[11px] leading-relaxed text-copy-muted">
                Hodnota říká, kolik bodů ti daný faktor historicky naznačuje. „Vliv“ ukazuje, jak silně je započtený do výsledku.
              </p>
            </div>
            <QualityLegend />
            <div className="grid gap-2.5 sm:grid-cols-2">
              {xb.factors.map((factor) => {
                const color = qualityColor(factor.value);
                return (
                  <div
                    key={factor.key}
                    className="rounded-2xl border bg-surface-1/70 p-3"
                    style={{ borderColor: qualityColor(factor.value, 0, 10, false, 0.28) }}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-base">{factorIcon[factor.key]}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[12px] font-semibold leading-tight text-copy-primary">{factor.label}</span>
                          <span className="font-display text-xl font-bold tabular-nums" style={{ color }}>{factor.value.toFixed(1)}</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
                          <div className="h-full rounded-full" style={{ width: `${Math.max(3, factor.value * 10)}%`, backgroundColor: color }} />
                        </div>
                        <p className="mt-2 text-[10.5px] leading-relaxed text-copy-muted">{factor.description}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[9.5px] font-semibold uppercase tracking-wide text-copy-muted">
                          <span className="rounded-full border border-line-subtle px-2 py-0.5">vliv {Math.round(factor.weight * 100)} %</span>
                          <span className="rounded-full border border-line-subtle px-2 py-0.5">
                            {factor.key === 'tip' ? `${factor.sample} vstupů modelu` : `${factor.sample} tipů`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-violet-400/20 bg-gradient-to-r from-violet-500/10 to-state-info/5 p-3.5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-300">🤖 AI komentář xB</div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-copy-secondary">{xb.explanation}</p>
          </div>
        </>
      )}

      <div className="space-y-4 border-t border-line-subtle pt-5">
        <TeamFormContent data={data} />
        <MutualMatchesContent data={data} integrated />
      </div>

      <p className="text-[10.5px] leading-snug text-copy-muted">
        xB se během sezony průběžně přepočítává. Přípravné zápasy se do dlouhodobého hodnocení nezahrnují.
      </p>
    </div>
  );
}

/** Záložka Predikce: pravděpodobnosti + doporučený tip dle očekávaných bodů. */
export function PredictionContent({
  data,
  loading,
  home,
  away,
}: {
  data: InsightData | null;
  loading: boolean;
  home: string;
  away: string;
}) {
  if (loading) return <p className="text-xs text-slate-300/45">Počítám…</p>;
  const p = data?.prediction;
  if (!p) return <Empty text="Na predikci zatím nejsou dostupná data o formě ani vzájemných zápasech." />;

  const pct = (x: number) => `${Math.round(x * 100)} %`;
  const bars: { label: string; val: number; cls: string }[] = [
    { label: `${home}`, val: p.pHome, cls: 'bg-pitch' },
    { label: 'Remíza', val: p.pDraw, cls: 'bg-slate-500' },
    { label: `${away}`, val: p.pAway, cls: 'bg-flag' },
  ];

  return (
    <div className="space-y-4">
      {/* doporučený tip */}
      <div className="rounded-xl border border-pitch/40 bg-pitch/5 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-pitch-light">
          🎲 Doporučený tip
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="font-display text-2xl font-bold text-white tabular-nums">
            {p.bestTip.h}:{p.bestTip.a}
          </span>
          <span className="text-xs text-slate-100/50">
            očekávaný zisk ~{p.bestTip.ev.toFixed(1)} b
          </span>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-slate-300/50">
          Nejde o nejpravděpodobnější výsledek, ale o skóre, které podle modelu vynese
          nejvíc bodů v našem bodování.
        </p>
      </div>

      {/* pravděpodobnosti */}
      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300/60">
          Pravděpodobnost výsledku
        </div>
        <div className="space-y-1.5">
          {bars.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate text-[12.5px] text-slate-100/75">{b.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-terrain-800">
                <div className={`h-full rounded-full ${b.cls}`} style={{ width: `${Math.max(2, b.val * 100)}%` }} />
              </div>
              <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-slate-100/70">{pct(b.val)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* očekávané góly + nejpravděpodobnější skóre */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-terrain-700 bg-terrain-900/40 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-300/50">Očekávané góly</div>
          <div className="mt-1 font-display text-lg font-bold tabular-nums text-white">
            {p.lambdaHome.toFixed(1)} : {p.lambdaAway.toFixed(1)}
          </div>
        </div>
        <div className="rounded-xl border border-terrain-700 bg-terrain-900/40 p-3">
          <div className="text-[11px] uppercase tracking-wide text-slate-300/50">Nejčastější skóre</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {p.topScores.map((s) => (
              <span key={`${s.h}-${s.a}`} className="rounded-md bg-terrain-800 px-1.5 py-0.5 text-[12px] font-bold tabular-nums text-slate-100/80">
                {s.h}:{s.a}
                <span className="ml-1 text-[10px] font-normal text-slate-300/45">{pct(s.p)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-snug text-slate-300/40">
        {p.basis === 'form+h2h'
          ? `Model kombinuje ${p.formSample} zápasů současné formy a ${p.h2hSample} vzájemných zápasů.`
          : p.basis === 'h2h'
            ? `Současná forma ještě není k dispozici. Model proto vychází pouze z ${p.h2hSample} vzájemných zápasů.`
            : `Vzájemná historie není k dispozici. Model vychází z ${p.formSample} zápasů současné formy.`}
        {p.sample < 6 ? ' Zatím jde o malý vzorek, ber predikci s rezervou.' : ''} Fotbal si stejně udělá, co chce. ⚽
      </p>
    </div>
  );
}
