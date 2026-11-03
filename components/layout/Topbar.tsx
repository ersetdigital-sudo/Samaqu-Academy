'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { NAV_GROUPS } from '@/lib/constants';

interface TopbarProps {
  onMenu: () => void;
}

function currentLabel(pathname: string): string {
  const items = NAV_GROUPS.flatMap((group) => group.items);
  const match = items.find((item) =>
    item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
  return match?.label ?? 'Samaqu CS Academy';
}

export function Topbar({ onMenu }: TopbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState('');

  const submit = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setQuery('');
    router.push(`/assistant?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <header className="top">
      <button className="icb menu" onClick={onMenu} aria-label="Buka menu">
        <Icon name="menu" />
      </button>
      <div className="crumb">{currentLabel(pathname)}</div>
      <div className="gs">
        <Icon name="search" />
        <input
          value={query}
          placeholder="Tanya Knowledge Assistant… (Enter)"
          aria-label="Tanya Knowledge Assistant"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
      </div>
    </header>
  );
}
