import Link from 'next/link';
import { signOutAction } from '@/app/ucet/actions';
import type { SessionPlayer } from '@/lib/auth';

export function AuthStatus({ player, className = '' }: { player: SessionPlayer | null; className?: string }) {
  if (!player) {
    return (
      <Link
        href="/prihlaseni"
        className={`rounded-lg bg-terrain-800 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-terrain-700 ${className}`}
      >
        Přihlásit
      </Link>
    );
  }
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Link href="/profil" className="flex items-center gap-1.5 rounded-lg bg-terrain-800 px-3 py-1.5 text-sm text-white transition hover:bg-terrain-700">
        <span className="h-1.5 w-1.5 rounded-full bg-pitch" />
        {player.name}
      </Link>
      <form action={signOutAction}>
        <button type="submit" className="rounded-lg px-2 py-1.5 text-xs text-slate-300/60 transition hover:text-white" title="Odhlásit se">
          Odhlásit
        </button>
      </form>
    </div>
  );
}
