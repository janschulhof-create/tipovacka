'use client';

import { useActionState } from 'react';
import { changePasswordAction, type PwState } from '@/app/ucet/actions';

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<PwState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="space-y-3">
      <input
        name="password"
        type="password"
        required
        autoComplete="new-password"
        placeholder="Nové heslo (min. 8 znaků)"
        className="w-full rounded-xl border border-terrain-600 bg-terrain-900 px-4 py-2.5 text-base text-white outline-none focus:border-pitch"
      />
      <input
        name="password2"
        type="password"
        required
        autoComplete="new-password"
        placeholder="Nové heslo znovu"
        className="w-full rounded-xl border border-terrain-600 bg-terrain-900 px-4 py-2.5 text-base text-white outline-none focus:border-pitch"
      />
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state.ok && <p className="text-sm text-pitch-light">Heslo změněno ✓</p>}
      <button type="submit" disabled={pending} className="btn-pitch w-full justify-center disabled:opacity-60">
        {pending ? 'Měním…' : 'Změnit heslo'}
      </button>
    </form>
  );
}
