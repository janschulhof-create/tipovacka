import { clubLogoId, flagCode } from '@/lib/teamFlags';

/**
 * Logo klubu Chance ligy nebo vlajka reprezentace z jednoho lokálního sprite
 * souboru (/flags.svg). Neprovádí žádný požadavek na cizí server.
 */
export function Flag({ team, className = '' }: { team: string; className?: string }) {
  const clubId = clubLogoId(team);

  if (clubId) {
    return (
      <svg
        viewBox="0 0 96 96"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Logo ${team}`}
        className={`inline-block h-6 w-6 shrink-0 overflow-visible ${className}`}
      >
        <use href={`/flags.svg#c-${clubId}`} />
      </svg>
    );
  }

  const code = flagCode(team);
  if (!code) return null;

  return (
    <svg
      viewBox="0 0 640 480"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      className={`inline-block h-3.5 w-5 shrink-0 overflow-hidden rounded-[2px] ring-1 ring-black/25 ${className}`}
    >
      <use href={`/flags.svg#f-${code}`} />
    </svg>
  );
}
