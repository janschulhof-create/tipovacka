import { flagCode } from '@/lib/teamFlags';

/** Malá vlajka týmu z jednoho sprite souboru (/flags.svg) – spolehlivé, cachované service workerem. */
export function Flag({ team, className = '' }: { team: string; className?: string }) {
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
