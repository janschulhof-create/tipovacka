'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type PushStatus = {
  authenticated: boolean;
  configured: boolean;
  publicKey: string;
  subscribed: boolean;
  preferences: { notify24h: boolean; notify3h: boolean; notifyResults: boolean };
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

async function fetchPushStatus(): Promise<PushStatus | null> {
  let endpoint = '';
  try {
    endpoint = (await currentSubscription())?.endpoint || '';
  } catch {
    endpoint = '';
  }
  const query = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : '';
  const response = await fetch(`/api/push${query}`, { cache: 'no-store' });
  if (!response.ok) return null;
  return response.json();
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

async function subscribeToPush(publicKey: string) {
  const registration = await navigator.serviceWorker.ready;
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

/** Registrace service workeru a jednorázová nenásilná nabídka upozornění. */
export function ServiceWorkerRegister() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

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
      const current = await fetchPushStatus();
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

  if (!visible) return null;

  return (
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
  );
}

export function NotificationSettings() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const supported = useMemo(() => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window, []);

  useEffect(() => {
    if (!supported) return;
    fetchPushStatus().then(setStatus);
  }, [supported]);

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
  if (!status) return <p className="text-xs text-slate-300/55">Načítám nastavení upozornění…</p>;
  if (!status.configured) return <p className="text-xs text-amber-300/75">Push notifikace ještě nejsou dokončené na serveru.</p>;

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
