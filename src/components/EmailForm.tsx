'use client';

import { useActionState } from 'react';
import { updateEmailAction, type EmailState } from '@/app/ucet/actions';

export function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, action, pending] = useActionState<EmailState, FormData>(updateEmailAction, {});
  return (
    <form action={action} className="space-y-3">
      <input
        name="email"
        type="email"
        required
        defaultValue={currentEmail}
        autoComplete="email"
        placeholder="tvuj@email.cz"
        className="w-full rounded-xl border border-terrain-600 bg-terrain-900 px-4 py-2.5 text-base text-white outline-none focus:border-pitch"
      />
      {state.error && <p className="text-sm text-red-400">{state.error}</p>}
      {state.ok && <p className="text-sm text-pitch-light">Email uložen ✓</p>}
      <button type="submit" disabled={pending} className="btn-soft disabled:opacity-60">
        {pending ? 'Ukládám…' : 'Uložit email'}
      </button>
    </form>
  );
}
