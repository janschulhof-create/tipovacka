'use client';

import { useActionState } from 'react';
import { signInAction, type SignInState } from '@/app/prihlaseni/actions';

export function LoginForm({ players }: { players: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, {});
  return (
    <form action={action} className="space-y-3">
      <div>
        <label className="mb-1 block text-[12px] uppercase tracking-wider text-slate-300/55">Jméno</label>
        <select
          name="playerId"
          required
          defaultValue=""
          className="w-full rounded-xl border border-terrain-600 bg-terrain-900 px-4 py-2.5 text-base text-white outline-none focus:border-pitch"
        >
          <option value="" disabled>— vyber jméno —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[12px] uppercase tracking-wider text-slate-300/55">Heslo</label>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="tři-slova-heslo"
          className="w-full rounded-xl border border-terrain-600 bg-terrain-900 px-4 py-2.5 text-base text-white outline-none focus:border-pitch"
        />
      </div>
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-pitch w-full justify-center disabled:opacity-60">
        {pending ? 'Přihlašuji…' : 'Přihlásit se'}
      </button>
    </form>
  );
}
