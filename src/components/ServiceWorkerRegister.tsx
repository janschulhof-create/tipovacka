'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Flag } from './Flag';

type PushStatus = {
  authenticated: boolean;
  configured: boolean;
  publicKey: string;
  subscribed: boolean;
  setupIssue?: string;
  preferences: { notify24h: boolean; notify3h: boolean; notifyResults: boolean };
};


type ResultModalMatch = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  predictedHome: number | null;
  predictedAway: number | null;
  points: number;
  hadPrediction: boolean;
};

type ResultModalData = {
  kind: 'result';
  round: number;
  blockKey: string;
  title: string;
  summary: string;
  notificationText: string;
  matches: ResultModalMatch[];
};

const SNOOZE_KEY = 'tipovacka-push-snooze-until';
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

async function getExistingServiceWorkerRegistration() {
  return navigator.serviceWorker.getRegistration('/');
}

async function ensureReadyServiceWorker() {
  let registration = await getExistingServiceWorkerRegistration();
  if (!registration) registration = await navigator.serviceWorker.register('/sw.js');
  if (registration.active) return registration;
  return withTimeout(
    navigator.serviceWorker.ready,
    10_000,
    'Service worker se nepodařilo připravit. Obnov stránku a zkus to znovu.',
  );
}

async function currentSubscription() {
  const registration = await getExistingServiceWorkerRegistration();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

async function fetchPushStatus(): Promise<PushStatus> {
  let endpoint = '';
  try {
    endpoint = (await currentSubscription())?.endpoint || '';
  } catch {
    endpoint = '';
  }
  const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`/api/push${query}`, { cache: 'no-store', signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'Nastavení upozornění se nepodařilo načíst.');
    return data as PushStatus;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Načítání upozornění trvalo příliš dlouho. Zkus stránku obnovit.');
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

async function subscribeToPush(publicKey: string) {
  const registration = await ensureReadyServiceWorker();
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
}

async function postPush(body: Record<string, unknown>) {
  const response = await fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Akci se nepodařilo dokončit.');
  return data;
}

function resultPointsClass(points: number) {
  if (points === 10) return 'border-violet-400/35 bg-violet-500/15 text-violet-200';
  if (points >= 4) return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200';
  if (points > 0) return 'border-amber-400/30 bg-amber-500/10 text-amber-200';
  return 'border-rose-400/30 bg-rose-500/10 text-rose-200';
}

function ResultNotificationModal({
  data,
  loading,
  error,
  onClose,
}: {
  data: ResultModalData | null;
  loading: boolean;
  error: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#030712]/75 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-result-title"
        className="relative max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-[24px] border border-violet-400/25 bg-[#0d1830] shadow-[0_28px_90px_rgba(0,0,0,.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Zavřít vyhodnocení"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-slate-500/25 bg-[#091326]/85 text-xl leading-none text-slate-200/80 transition hover:border-violet-300/50 hover:text-white"
        >
          ×
        </button>

        <div className="border-b border-terrain-700/80 bg-gradient-to-br from-violet-500/10 via-transparent to-indigo-500/5 px-5 pb-5 pt-5 sm:px-6 sm:pb-6 sm:pt-6">
          <div className="eyebrow pr-12"><span className="flag-chip" /> Vyhodnocení tipu</div>
          {loading ? (
            <div className="mt-5 space-y-3">
              <div className="h-7 w-3/4 animate-pulse rounded-lg bg-slate-500/15" />
              <div className="h-4 w-1/2 animate-pulse rounded-lg bg-slate-500/10" />
            </div>
          ) : error ? (
            <div className="mt-5 pr-10">
              <h2 id="push-result-title" className="font-display text-xl font-bold text-white">Vyhodnocení se nepodařilo otevřít</h2>
              <p className="mt-2 text-sm leading-relaxed text-rose-200/75">{error}</p>
            </div>
          ) : data ? (
            <div className="mt-4 pr-10">
              <h2 id="push-result-title" className="font-display text-xl font-bold leading-tight text-white sm:text-2xl">{data.title}</h2>
              <p className="mt-2 text-sm font-semibold text-violet-200/85">{data.summary}</p>
            </div>
          ) : null}
        </div>

        {!loading && data && (
          <div className="space-y-4 p-4 sm:p-6">
            <div className="space-y-2">
              {data.matches.map((match) => (
                <a
                  key={match.id}
                  href={`/?soutez=liga&kolo=${data.round}&zapas=${match.id}`}
                  aria-label={`Otevřít detail zápasu ${match.homeTeam} – ${match.awayTeam}`}
                  className="group block rounded-2xl border border-terrain-700 bg-terrain-900/45 p-3.5 transition hover:border-violet-400/45 hover:bg-violet-500/10 focus:outline-none focus-visible:border-violet-300 focus-visible:ring-2 focus-visible:ring-violet-400/40 sm:p-4"
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
                    <div className="min-w-0 text-center">
                      <Flag team={match.homeTeam} className="mx-auto h-8 w-8" />
                      <div className="mt-1.5 truncate text-xs font-semibold text-white sm:text-sm">{match.homeTeam}</div>
                    </div>
                    <div className="rounded-xl border border-slate-500/20 bg-[#071225] px-3 py-2 font-display text-2xl font-bold tabular-nums text-white sm:px-4 sm:text-3xl">
                      {match.homeScore}:{match.awayScore}
                    </div>
                    <div className="min-w-0 text-center">
                      <Flag team={match.awayTeam} className="mx-auto h-8 w-8" />
                      <div className="mt-1.5 truncate text-xs font-semibold text-white sm:text-sm">{match.awayTeam}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-terrain-700/70 pt-3 text-xs">
                    <span className="text-slate-300/60">
                      {match.hadPrediction && match.predictedHome != null && match.predictedAway != null
                        ? <>Tvůj tip <strong className="font-display text-white">{match.predictedHome}:{match.predictedAway}</strong></>
                        : 'Bez uloženého tipu'}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-1 font-bold tabular-nums ${resultPointsClass(match.points)}`}>
                        {match.points} b
                      </span>
                      <span className="text-base text-violet-300/55 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-200" aria-hidden>›</span>
                    </span>
                  </div>
                  <div className="mt-2 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-300/45 transition group-hover:text-violet-200/75">
                    Detail zápasu
                  </div>
                </a>
              ))}
            </div>

            <div className="rounded-2xl border border-violet-400/25 bg-gradient-to-br from-violet-500/12 to-indigo-500/5 p-4 sm:p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300/65">Celé hodnocení</div>
              <p className="mt-2 font-display text-base font-semibold leading-relaxed text-violet-100 sm:text-lg">{data.notificationText}</p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="mx-auto block rounded-xl border border-terrain-600 bg-terrain-900/60 px-5 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-violet-400/50 hover:text-white"
            >
              Zavřít
            </button>
          </div>
        )}

        {!loading && error && (
          <div className="p-5 sm:p-6">
            <button type="button" onClick={onClose} className="rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-5 py-2.5 text-xs font-bold text-white">Zavřít</button>
          </div>
        )}
      </section>
    </div>
  );
}

/** Registrace service workeru, jednorázová nabídka upozornění a výsledkový modal. */
export function ServiceWorkerRegister() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [resultModal, setResultModal] = useState<ResultModalData | null>(null);
  const [resultLoading, setResultLoading] = useState(false);
  const [resultError, setResultError] = useState('');
  const [resultOpen, setResultOpen] = useState(false);
  const activeResultRequest = useRef('');

  const closeResultModal = useCallback(() => {
    setResultOpen(false);
    setResultModal(null);
    setResultError('');
    setResultLoading(false);
    activeResultRequest.current = '';
    const url = new URL(window.location.href);
    url.searchParams.delete('push');
    url.searchParams.delete('season');
    url.searchParams.delete('round');
    url.searchParams.delete('block');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const loadResultFromUrl = useCallback(async (sourceUrl?: string) => {
    let url: URL;
    try {
      url = sourceUrl ? new URL(sourceUrl, window.location.origin) : new URL(window.location.href);
    } catch {
      return false;
    }

    const params = url.searchParams;
    if (params.get('push') !== 'result') return false;
    const season = params.get('season') || '';
    const round = params.get('round') || params.get('kolo') || '';
    const block = params.get('block') || '';
    const requestKey = `${season}|${round}|${block}`;

    // Kliknutí může přijít současně přes URL i zprávu ze service workeru.
    // Stejný modal proto nenačítáme dvakrát.
    if (activeResultRequest.current === requestKey) {
      setResultOpen(true);
      return true;
    }
    activeResultRequest.current = requestKey;

    setResultOpen(true);
    setResultLoading(true);
    setResultError('');
    setResultModal(null);
    try {
      const query = new URLSearchParams({ view: 'result', season, round, block });
      const response = await fetch(`/api/push?${query.toString()}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Vyhodnocení se nepodařilo načíst.');
      setResultModal(data as ResultModalData);
    } catch (error) {
      setResultError(error instanceof Error ? error.message : 'Vyhodnocení se nepodařilo načíst.');
    } finally {
      setResultLoading(false);
    }
    return true;
  }, []);

  useEffect(() => {
    const openFromCurrentUrl = () => { void loadResultFromUrl(); };
    const onServiceWorkerMessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; url?: string } | null;
      if (message?.type !== 'TIPOVACKA_OPEN_NOTIFICATION' || !message.url) return;

      let opensResultModal = false;
      try {
        opensResultModal = new URL(message.url, window.location.origin).searchParams.get('push') === 'result';
      } catch {
        opensResultModal = false;
      }

      // Běžné upomínky se dál navigují na příslušné kolo. Přímé předání
      // zachytáváme pouze u výsledkové notifikace, která otevírá modal.
      if (!opensResultModal) {
        event.ports?.[0]?.postMessage({ handled: false });
        event.ports?.[0]?.close();
        return;
      }

      // Odpověď service workeru odešleme hned. Modal se otevře synchronně
      // ještě před dokončením síťového načtení jeho obsahu.
      void loadResultFromUrl(message.url);
      event.ports?.[0]?.postMessage({ handled: true });
      event.ports?.[0]?.close();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') openFromCurrentUrl();
    };

    openFromCurrentUrl();
    window.addEventListener('popstate', openFromCurrentUrl);
    window.addEventListener('pageshow', openFromCurrentUrl);
    window.addEventListener('focus', openFromCurrentUrl);
    document.addEventListener('visibilitychange', onVisibilityChange);
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);
    return () => {
      window.removeEventListener('popstate', openFromCurrentUrl);
      window.removeEventListener('pageshow', openFromCurrentUrl);
      window.removeEventListener('focus', openFromCurrentUrl);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
    };
  }, [loadResultFromUrl]);

  useEffect(() => {
    if (!resultOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeResultModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeResultModal, resultOpen]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const register = () => navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    if (window.location.pathname === '/prihlaseni') return;
    const timer = window.setTimeout(async () => {
      const current = await fetchPushStatus().catch(() => null);
      setStatus(current);
      if (!current?.authenticated || !current.configured || current.subscribed || Notification.permission === 'denied') return;
      const snoozeUntil = Number(localStorage.getItem(SNOOZE_KEY) || 0);
      if (Date.now() < snoozeUntil) return;
      setVisible(true);
    }, 1800);
    return () => window.clearTimeout(timer);
  }, []);

  const enable = useCallback(async () => {
    if (!status?.publicKey) return;
    if (isIos() && !isStandalone()) {
      setMessage('Na iPhonu nejprve otevři Sdílet → Přidat na plochu a spusť Tipovačku z ikony.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setMessage('Oznámení nebyla povolena. Zapnout je můžeš později v nastavení prohlížeče.');
        return;
      }
      const subscription = await subscribeToPush(status.publicKey);
      await postPush({ action: 'subscribe', subscription: subscription.toJSON(), notify24h: true, notify3h: true, notifyResults: true });
      localStorage.removeItem(SNOOZE_KEY);
      setVisible(false);
      setStatus({ ...status, subscribed: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upozornění se nepodařilo zapnout.');
    } finally {
      setBusy(false);
    }
  }, [status]);

  return (
    <>
      {resultOpen && (
        <ResultNotificationModal
          data={resultModal}
          loading={resultLoading}
          error={resultError}
          onClose={closeResultModal}
        />
      )}

      {visible && (
        <aside className="fixed bottom-[76px] left-3 right-3 z-50 mx-auto max-w-md rounded-2xl border border-violet-400/30 bg-[#101a31]/95 p-4 shadow-2xl backdrop-blur lg:bottom-5 lg:left-auto lg:right-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-xl">🔔</div>
            <div className="min-w-0 flex-1">
              <div className="font-display text-sm font-bold text-white">Nezapomeň na tipy</div>
              <p className="mt-1 text-xs leading-relaxed text-slate-300/65">Upozorníme tě před kolem a po dohrání ti pošleme i stručné vyhodnocení tipů.</p>
              {message && <p className="mt-2 text-xs text-amber-300/85">{message}</p>}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={enable} disabled={busy} className="rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                  {busy ? 'Zapínám…' : 'Zapnout upozornění'}
                </button>
                <button type="button" onClick={() => { localStorage.setItem(SNOOZE_KEY, String(Date.now() + THIRTY_DAYS)); setVisible(false); }} className="rounded-xl border border-slate-600/60 px-3 py-2 text-xs text-slate-300/70">
                  Teď ne
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}
    </>
  );
}

export function NotificationSettings() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const supported = useMemo(() => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window, []);

  const loadStatus = useCallback(async () => {
    if (!supported) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      setStatus(await fetchPushStatus());
    } catch (error) {
      setStatus(null);
      setLoadError(error instanceof Error ? error.message : 'Nastavení upozornění se nepodařilo načíst.');
    } finally {
      setLoading(false);
    }
  }, [supported]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const enable = async () => {
    if (!status?.publicKey) return;
    if (isIos() && !isStandalone()) {
      setMessage('Na iPhonu nejprve zvol Sdílet → Přidat na plochu a spusť Tipovačku z nové ikony.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Oznámení nejsou povolena v nastavení zařízení nebo prohlížeče.');
      const subscription = await subscribeToPush(status.publicKey);
      await postPush({ action: 'subscribe', subscription: subscription.toJSON(), notify24h: status.preferences.notify24h, notify3h: status.preferences.notify3h, notifyResults: status.preferences.notifyResults });
      localStorage.removeItem(SNOOZE_KEY);
      setStatus({ ...status, subscribed: true });
      setMessage('Upozornění jsou zapnutá.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upozornění se nepodařilo zapnout.');
    } finally {
      setBusy(false);
    }
  };

  const updatePreference = async (key: 'notify24h' | 'notify3h' | 'notifyResults', value: boolean) => {
    if (!status) return;
    const preferences = { ...status.preferences, [key]: value };
    setStatus({ ...status, preferences });
    if (!status.subscribed) return;
    setBusy(true);
    try {
      await postPush({ action: 'preferences', ...preferences });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Nastavení se nepodařilo uložit.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage('');
    try {
      const subscription = await currentSubscription();
      await postPush({ action: 'unsubscribe', endpoint: subscription?.endpoint || '' });
      await subscription?.unsubscribe();
      if (status) setStatus({ ...status, subscribed: false });
      setMessage('Upozornění jsou vypnutá pro toto zařízení.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upozornění se nepodařilo vypnout.');
    } finally {
      setBusy(false);
    }
  };

  if (!supported) return <p className="text-xs text-slate-300/55">Tento prohlížeč webová upozornění nepodporuje.</p>;
  if (loading) return <p className="text-xs text-slate-300/55">Načítám nastavení upozornění…</p>;
  if (loadError || !status) {
    return (
      <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4">
        <div className="text-xs font-semibold text-amber-200">Nastavení upozornění se nenačetlo</div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-300/60">{loadError || 'Zkus načtení zopakovat.'}</p>
        <button type="button" onClick={() => void loadStatus()} className="mt-3 rounded-xl border border-amber-300/30 px-3 py-2 text-xs font-semibold text-amber-100">Zkusit znovu</button>
      </div>
    );
  }
  if (!status.configured) {
    return (
      <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4 text-xs text-amber-200/85">
        {status.setupIssue || 'Push notifikace ještě nejsou dokončené na serveru.'}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-terrain-700 bg-terrain-900/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-display text-sm font-bold text-white">Upozornění na tipování</div>
          <div className={`mt-1 text-xs ${status.subscribed ? 'text-emerald-300/85' : 'text-slate-300/55'}`}>{status.subscribed ? 'Oznámení jsou zapnutá ✓' : 'Na tomto zařízení jsou vypnutá'}</div>
        </div>
        {status.subscribed ? (
          <button type="button" disabled={busy} onClick={disable} className="rounded-xl border border-terrain-600 px-3 py-2 text-xs text-slate-300/75 disabled:opacity-50">Vypnout</button>
        ) : (
          <button type="button" disabled={busy} onClick={enable} className="rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Zapínám…' : 'Zapnout'}</button>
        )}
      </div>

      <div className="mt-4 space-y-2 border-t border-terrain-700 pt-4">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-terrain-900/50 px-3 py-2.5">
          <span><span className="block text-xs font-semibold text-white">24 hodin před začátkem kola</span><span className="text-[11px] text-slate-300/50">Připomenutí přijde i při kompletních tipech.</span></span>
          <input type="checkbox" checked={status.preferences.notify24h} onChange={(event) => updatePreference('notify24h', event.target.checked)} className="h-4 w-4 accent-violet-500" />
        </label>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-terrain-900/50 px-3 py-2.5">
          <span><span className="block text-xs font-semibold text-white">3 hodiny před uzávěrkou</span><span className="text-[11px] text-slate-300/50">Jen pokud ti chybí alespoň jeden tip.</span></span>
          <input type="checkbox" checked={status.preferences.notify3h} onChange={(event) => updatePreference('notify3h', event.target.checked)} className="h-4 w-4 accent-violet-500" />
        </label>
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-terrain-900/50 px-3 py-2.5">
          <span><span className="block text-xs font-semibold text-white">Vyhodnocení po skončení zápasu</span><span className="text-[11px] text-slate-300/50">Současně hrané zápasy přijdou v jednom souhrnu.</span></span>
          <input type="checkbox" checked={status.preferences.notifyResults} onChange={(event) => updatePreference('notifyResults', event.target.checked)} className="h-4 w-4 accent-violet-500" />
        </label>
      </div>
      {message && <p className="mt-3 text-xs text-violet-200/80">{message}</p>}
    </div>
  );
}
