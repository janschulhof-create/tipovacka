'use client';

import { useEffect, useState } from 'react';
import { pointsBadgeClass } from '@/lib/points';
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
interface Form5Row { opponent: string; gf: number; ga: number; res: 'W' | 'D' | 'L' }
export interface InsightData {
  teams: { home: string; away: string };
  mutualMatches: MutualMatchRow[];
  form5: { home: Form5Row[]; away: Form5Row[] };
  prediction: Prediction | null;
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
    r === 'W' ? 'bg-pitch text-white' : r === 'L' ? 'bg-flag text-white' : 'bg-slate-600 text-white';
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

/** Záložka H2H: současná forma + maximálně šest vzájemných zápasů. */
export function H2HContent({ data, loading }: { data: InsightData | null; loading: boolean }) {
  if (loading) return <p className="text-xs text-slate-300/45">Načítám…</p>;
  if (!data) return <Empty text="Data se nepodařilo načíst." />;

  return (
    <div className="space-y-4">
      <TeamFormContent data={data} />

      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-300/60">
          Vzájemné zápasy
        </div>
        {data.mutualMatches.length === 0 ? (
          <Empty text="Pro tyto týmy zatím nemáme vzájemný zápas." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-terrain-700 bg-terrain-900/40">
            {data.mutualMatches.slice(0, 6).map((r, i) => {
              const hasTip = r.ph != null && r.pa != null;
              const meta = r.round != null
                ? `${r.round}. kolo${r.season ? ` · ${r.season}` : ''}`
                : r.date
                  ? fmtDate(r.date)
                  : r.season ?? '';
              return (
                <div key={`${r.round ?? r.date ?? i}-${i}`} className="border-b border-terrain-800/60 px-3 py-2.5 last:border-0">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-300/45">
                    <span>{meta}</span>
                    {hasTip && (
                      <span className={`rounded px-1.5 py-0.5 font-bold tabular-nums ${pointsBadgeClass(r.points ?? 0)}`}>
                        {r.points == null ? '—' : `${r.points} b`}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
                    <span className="min-w-0 flex-1 text-slate-100/80">{r.home} – {r.away}</span>
                    {hasTip && (
                      <span className="text-slate-300/55">tvůj tip <strong className="text-white">{r.ph}:{r.pa}</strong></span>
                    )}
                    <span className="text-slate-300/55">výsledek <strong className="text-white">{r.hs}:{r.as}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
