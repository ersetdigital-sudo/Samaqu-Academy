'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const COLLAPSED_KEY = 'samaqu:sidebar-collapsed';

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === '1');
    } catch {
      // localStorage can be unavailable in private mode; keep the default.
    }
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Ignore persistence failures; the toggle still works this session.
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={`app${collapsed ? ' sb-collapsed' : ''}`}>
      <Sidebar open={open} collapsed={collapsed} onClose={() => setOpen(false)} />
      <div className={`ov${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <main className="main">
        <Topbar
          onMenu={() => setOpen(true)}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
        />
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
