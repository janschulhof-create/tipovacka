'use client';

import { useRouter } from 'next/navigation';

export function H2HPicker({
  others,
  current,
  basePath,
}: {
  others: { id: number; name: string }[];
  current: number | null;
  basePath: string;
}) {
  const router = useRouter();
  return (
    <select
      value={current ?? ''}
      onChange={(e) => {
        const v = e.target.value;
        router.push(v ? `${basePath}?vs=${v}` : basePath);
      }}
      className="w-full rounded-xl border border-terrain-600 bg-terrain-900 px-3 py-2.5 text-sm text-white outline-none focus:border-flag"
    >
      <option value="">— vyber soupeře pro porovnání —</option>
      {others.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
