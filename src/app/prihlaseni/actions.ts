'use server';

import { redirect } from 'next/navigation';
import { createServerAuthClient } from '@/lib/supabase/server';

export type SignInState = { error?: string };

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const playerId = Number(formData.get('playerId'));
  const password = String(formData.get('password') ?? '');
  if (!playerId || !password) return { error: 'Vyber jméno a zadej heslo.' };

  const sb = await createServerAuthClient();
  const { data: pl } = await sb.from('players').select('email').eq('id', playerId).single();
  if (!pl?.email) return { error: 'Tento hráč zatím nemá vytvořený účet.' };

  const { error } = await sb.auth.signInWithPassword({ email: pl.email, password });
  if (error) return { error: 'Špatné heslo.' };

  redirect('/');
}
