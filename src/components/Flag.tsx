'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import {
  clubLogoId,
  clubLogoSearchName,
  clubSpriteIndex,
  flagCode,
  flagSpriteIndex,
} from '@/lib/teamFlags';

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
const STORAGE_PREFIX = 'tipovacka-club-badge-v1:';
const SPRITE_COLUMNS = 8;
const SPRITE_ROWS = 8;

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

function readStoredBadge(key: string): string | null | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const value = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (value === null) return undefined;
    return value === '-' ? null : value;
  } catch {
    return undefined;
  }
}

function storeBadge(key: string, value: string | null) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, value ?? '-');
  } catch {
    // Safari může úložiště v soukromém režimu odmítnout; logo funguje i bez něj.
  }
}

async function lookupBadge(searchName: string): Promise<string | null> {
  const key = normalized(searchName);
  if (!key) return null;
  if (badgeCache.has(key)) return badgeCache.get(key) ?? null;

  const stored = readStoredBadge(key);
  if (stored !== undefined) {
    badgeCache.set(key, stored);
    return stored;
  }

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
  storeBadge(key, result);
  return result;
}

function SpriteIcon({
  index,
  team,
  className,
}: {
  index: number;
  team: string;
  className: string;
}) {
  const column = index % SPRITE_COLUMNS;
  const row = Math.floor(index / SPRITE_COLUMNS);
  return (
    <span
      role="img"
      aria-label={`Logo nebo vlajka ${team}`}
      className={`inline-block h-6 w-6 shrink-0 bg-no-repeat lg:h-7 lg:w-7 ${className}`}
      style={{
        backgroundImage: 'url(/team-sprite-v1.webp)',
        // Procentuální výřez se přizpůsobí skutečné velikosti prvku. Díky tomu
        // logo zůstane správně oříznuté i při h-8/w-8 nebo h-9/w-9 a neukáže
        // sousední znaky ze sprite obrázku.
        backgroundSize: `${SPRITE_COLUMNS * 100}% ${SPRITE_ROWS * 100}%`,
        backgroundPosition: `${column === 0 ? 0 : (column / (SPRITE_COLUMNS - 1)) * 100}% ${row === 0 ? 0 : (row / (SPRITE_ROWS - 1)) * 100}%`,
      }}
    />
  );
}

function RemoteClubLogo({ team, className }: { team: string; className: string }) {
  const searchName = useMemo(() => clubLogoSearchName(team), [team]);
  const cacheKey = normalized(searchName);
  const [badge, setBadge] = useState<string | null | undefined>(() =>
    badgeCache.has(cacheKey) ? badgeCache.get(cacheKey) : undefined,
  );

  useEffect(() => {
    let cancelled = false;
    const stored = badgeCache.has(cacheKey) ? badgeCache.get(cacheKey) : readStoredBadge(cacheKey);
    if (stored !== undefined) {
      badgeCache.set(cacheKey, stored);
      setBadge(stored);
      return () => {
        cancelled = true;
      };
    }
    setBadge(undefined);
    lookupBadge(searchName).then((url) => {
      if (!cancelled) setBadge(url);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, searchName]);

  if (badge) {
    return (
      <Image
        src={badge}
        alt={`Logo ${team}`}
        width={48}
        height={48}
        sizes="(min-width: 1024px) 28px, 24px"
        quality={82}
        loading="lazy"
        className={`inline-block h-6 w-6 shrink-0 object-contain lg:h-7 lg:w-7 ${className}`}
        onError={() => {
          badgeCache.set(cacheKey, null);
          storeBadge(cacheKey, null);
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
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-600/70 bg-slate-800 text-[8px] font-bold text-slate-300 lg:h-7 lg:w-7 lg:text-[9px] ${className}`}
    >
      {initials || 'FC'}
    </span>
  );
}

/** Lokální komprimovaná ikona nebo automaticky dohledaný znak evropského klubu. */
export function Flag({ team, className = '' }: { team: string; className?: string }) {
  const clubId = clubLogoId(team);
  if (clubId) {
    const index = clubSpriteIndex(clubId);
    if (index != null) return <SpriteIcon index={index} team={team} className={className} />;
  }

  const code = flagCode(team);
  if (code) {
    const index = flagSpriteIndex(code);
    if (index != null) return <SpriteIcon index={index} team={team} className={className} />;
  }

  return <RemoteClubLogo team={team} className={className} />;
}
