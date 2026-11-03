'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="app">
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className={`ov${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <main className="main">
        <Topbar onMenu={() => setOpen(true)} />
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
