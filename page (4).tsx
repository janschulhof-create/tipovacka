import { NextRequest, NextResponse } from 'next/server';
import { getSessionPlayer } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PushSubscriptionPayload = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

const defaultPreferences = {
  notify24h: true,
  notify3h: true,
  notifyResults: true,
};

function pushConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
  const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return {
    publicKey,
    hasServiceRole,
    configured: Boolean(publicKey && hasServiceRole),
    setupIssue: !publicKey
      ? 'Na Vercelu chybí proměnná NEXT_PUBLIC_VAPID_PUBLIC_KEY.'
      : !hasServiceRole
        ? 'Na Vercelu chybí proměnná SUPABASE_SERVICE_ROLE_KEY.'
        : '',
  };
}

function statusResponse(config: ReturnType<typeof pushConfig>, extra?: Record<string, unknown>) {
  return NextResponse.json({
    authenticated: true,
    configured: config.configured,
    publicKey: config.publicKey,
    subscribed: false,
    preferences: defaultPreferences,
    ...(config.setupIssue ? { setupIssue: config.setupIssue } : {}),
    ...extra,
  });
}

export async function GET(request: NextRequest) {
  const player = await getSessionPlayer();
  if (!player) return NextResponse.json({ authenticated: false }, { status: 401 });

  const config = pushConfig();
  if (!config.configured) return statusResponse(config);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('push_subscriptions')
      .select('endpoint, notify_24h, notify_3h, notify_results, active')
      .eq('player_id', player.id)
      .eq('active', true)
      .order('updated_at', { ascending: false });

    if (error?.code === '42P01') {
      return statusResponse(
        { ...config, configured: false },
        { setupIssue: 'V Supabase chybí tabulka push_subscriptions. Spusť část WEB PUSH NOTIFIKACE ze schema.sql.' },
      );
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const first = data?.[0];
    const endpoint = request.nextUrl.searchParams.get('endpoint') || '';
    const currentDeviceSubscribed = endpoint
      ? Boolean(data?.some((row) => row.active && row.endpoint === endpoint))
      : false;

    return statusResponse(config, {
      subscribed: currentDeviceSubscribed,
      preferences: {
        notify24h: first?.notify_24h ?? true,
        notify3h: first?.notify_3h ?? true,
        notifyResults: first?.notify_results ?? true,
      },
    });
  } catch (error) {
    console.error('push status failed', error);
    return NextResponse.json(
      { error: 'Server nedokázal načíst nastavení upozornění. Zkontroluj Supabase proměnné ve Vercelu.' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const player = await getSessionPlayer();
  if (!player) return NextResponse.json({ error: 'Nejsi přihlášený.' }, { status: 401 });

  const config = pushConfig();
  if (!config.configured) {
    return NextResponse.json({ error: config.setupIssue || 'Push notifikace nejsou nakonfigurované.' }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || '');

  try {
    const admin = createAdminClient();

    if (action === 'subscribe') {
      const subscription = (body?.subscription || {}) as PushSubscriptionPayload;
      if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        return NextResponse.json({ error: 'Neplatná push subscription.' }, { status: 400 });
      }
      const { error } = await admin.from('push_subscriptions').upsert({
        player_id: player.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: request.headers.get('user-agent') || '',
        notify_24h: body?.notify24h !== false,
        notify_3h: body?.notify3h !== false,
        notify_results: body?.notifyResults !== false,
        active: true,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (error?.code === '42P01') return NextResponse.json({ error: 'V Supabase chybí tabulka push_subscriptions.' }, { status: 503 });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'preferences') {
      const { error } = await admin.from('push_subscriptions').update({
        notify_24h: body?.notify24h !== false,
        notify_3h: body?.notify3h !== false,
        notify_results: body?.notifyResults !== false,
        updated_at: new Date().toISOString(),
      }).eq('player_id', player.id).eq('active', true);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (action === 'unsubscribe') {
      const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : '';
      let query = admin.from('push_subscriptions').update({
        active: false,
        updated_at: new Date().toISOString(),
      }).eq('player_id', player.id);
      if (endpoint) query = query.eq('endpoint', endpoint);
      const { error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Neznámá akce.' }, { status: 400 });
  } catch (error) {
    console.error('push action failed', error);
    return NextResponse.json({ error: 'Server nedokázal dokončit práci s upozorněním.' }, { status: 500 });
  }
}
