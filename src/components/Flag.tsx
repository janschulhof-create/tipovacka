import { flagCode } from '@/lib/teamFlags';

/** Malá vlajka týmu (z flagcdn.com). Když tým neznáme, nevykreslí nic. */
export function Flag({ team, className = '' }: { team: string; className?: string }) {
  const code = flagCode(team);
  if (!code) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://flagcdn.com/${code}.svg`}
      alt=""
      aria-hidden
      loading="lazy"
      width={20}
      height={14}
      className={`inline-block h-3.5 w-5 shrink-0 rounded-[2px] object-cover ring-1 ring-black/25 ${className}`}
    />
  );
}
