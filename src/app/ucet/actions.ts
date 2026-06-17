'use server';

import { redirect } from 'next/navigation';
import { createServerAuthClient, createAdminClient } from '@/lib/supabase/server';

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


export type EmailState = { error?: string; ok?: boolean };

export async function updateEmailAction(_prev: EmailState, formData: FormData): Promise<EmailState> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Zadej platný email.' };

  const authSb = await createServerAuthClient();
  const {
    data: { user },
  } = await authSb.auth.getUser();
  if (!user) return { error: 'Nejsi přihlášený.' };

  // service role: nastaví email rovnou jako potvrzený (bez nutnosti potvrzovacího mailu)
  const admin = createAdminClient();
  const { error: e1 } = await admin.auth.admin.updateUserById(user.id, { email, email_confirm: true });
  if (e1) {
    const taken = /already|registered|exists/i.test(e1.message);
    return { error: taken ? 'Tento email už někdo používá.' : 'Email se nepovedlo uložit.' };
  }
  await admin.from('players').update({ email }).eq('auth_user_id', user.id);
  return { ok: true };
}
