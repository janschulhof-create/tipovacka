'use server';

import { redirect } from 'next/navigation';
import { createServerAuthClient } from '@/lib/supabase/server';

export async function signOutAction() {
  const sb = await createServerAuthClient();
  await sb.auth.signOut();
  redirect('/prihlaseni');
}

export type PwState = { error?: string; ok?: boolean };

export async function changePasswordAction(_prev: PwState, formData: FormData): Promise<PwState> {
  const password = String(formData.get('password') ?? '');
  const password2 = String(formData.get('password2') ?? '');
  if (password.length < 8) return { error: 'Heslo musí mít aspoň 8 znaků.' };
  if (password !== password2) return { error: 'Hesla se neshodují.' };

  const sb = await createServerAuthClient();
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { error: 'Změna se nepovedla — zkus se odhlásit a znovu přihlásit.' };
  return { ok: true };
}
