'use client';

import { useEffect, useMemo, useState } from 'react';
import { clubLogoId, clubLogoSearchName, flagCode } from '@/lib/teamFlags';

type SportsDbTeam = {
  strTeam?: string | null;
  strTeamAlternate?: string | null;
  strSport?: string | null;
  strBadge?: string | null;
  strTeamBadge?: string | null;
};

type SportsDbResponse = {
  teams?: SportsDbTeam[] | null;
};

const badgeCache = new Map<string, string | null>();
const badgeRequests = new Map<string, Promise<string | null>>();

function normalized(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function alternativeNames(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/[,;/|]/)
    .map((part) => normalized(part))
    .filter(Boolean);
}

async function lookupBadge(searchName: string): Promise<string | null> {
  const key = normalized(searchName);
  if (!key) return null;
  if (badgeCache.has(key)) return badgeCache.get(key) ?? null;

  const active = badgeRequests.get(key);
  if (active) return active;

  const request = (async () => {
    try {
      const response = await fetch(
        `https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=${encodeURIComponent(searchName)}`,
        { cache: 'force-cache' },
      );
      if (!response.ok) return null;
      const data = (await response.json()) as SportsDbResponse;
      const soccerTeams = (data.teams ?? []).filter(
        (team) => !team.strSport || normalized(team.strSport) === 'soccer',
      );
      const exact = soccerTeams.find((team) => {
        const primary = normalized(team.strTeam ?? '');
        return primary === key || alternativeNames(team.strTeamAlternate).includes(key);
      });
      const team = exact ?? soccerTeams[0];
      return team?.strBadge ?? team?.strTeamBadge ?? null;
    } catch {
      return null;
    }
  })();

  badgeRequests.set(key, request);
  const result = await request;
  badgeRequests.delete(key);
  badgeCache.set(key, result);
  return result;
}

function RemoteClubLogo({ team, className }: { team: string; className: string }) {
  const searchName = useMemo(() => clubLogoSearchName(team), [team]);
  const cacheKey = normalized(searchName);
  const [badge, setBadge] = useState<string | null | undefined>(() =>
    badgeCache.has(cacheKey) ? badgeCache.get(cacheKey) : undefined,
  );

  useEffect(() => {
    let cancelled = false;
    setBadge(badgeCache.has(cacheKey) ? badgeCache.get(cacheKey) : undefined);
    lookupBadge(searchName).then((url) => {
      if (!cancelled) setBadge(url);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, searchName]);

  if (badge) {
    return (
      // TheSportsDB vrací přímo transparentní klubové badge. Plain img je zde
      // záměrně: seznam klubů se mění s losem a nelze jej předem uvést v
      // next/image remotePatterns.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={badge}
        alt={`Logo ${team}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`inline-block h-6 w-6 shrink-0 object-contain ${className}`}
        onError={() => {
          badgeCache.set(cacheKey, null);
          setBadge(null);
        }}
      />
    );
  }

  const initials = team
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join('');

  return (
    <span
      aria-label={`Klub ${team}`}
      title={badge === null ? `Logo ${team} se nepodařilo načíst` : `Načítám logo ${team}`}
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-600/70 bg-slate-800 text-[8px] font-bold text-slate-300 ${className}`}
    >
      {initials || 'FC'}
    </span>
  );
}

/**
 * Lokální logo českého klubu, vlajka reprezentace nebo automaticky dohledaný
 * znak evropského klubu z bezplatného TheSportsDB API.
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
  if (code) {
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

  return <RemoteClubLogo team={team} className={className} />;
}
