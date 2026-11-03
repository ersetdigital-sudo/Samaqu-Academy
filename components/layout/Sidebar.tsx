'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { useRole } from '@/components/providers/RoleProvider';
import { AppLink as Link } from '@/components/ui/AppLink';
import { Icon } from '@/components/ui/Icon';
import { NAV_GROUPS, ROLES } from '@/lib/constants';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'S';
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function Sidebar({ open, collapsed, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { role, profile, signOut } = useRole();
  const { user } = useAuth();
  const name = profile?.fullName || user?.email?.split('@')[0] || 'User';

  return (
    <aside className={`sb${open ? ' open' : ''}${collapsed ? ' min' : ''}`} id="sb">
      <div className="brand">
        <Link href="/" className="brand-id" onClick={onClose} title="Samaqu CS Academy">
          <div className="logo">S</div>
          <div className="brand-tx">
            <b>Samaqu CS Academy</b>
            <small>Internal Learning Platform</small>
          </div>
        </Link>
        <button
          className="icb sb-burger"
          onClick={onClose}
          aria-label="Tutup menu"
          type="button"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <nav className="nav" id="nav" aria-label="Navigasi utama">
        {NAV_GROUPS.filter((group) => !group.ownerOnly || role === 'owner').map((group) => (
          <div key={group.label} className="nav-group">
            <div className="ng">{group.label}</div>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`ni${active ? ' on' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  title={item.label}
                  onClick={onClose}
                >
                  <Icon name={item.icon} size={17} />
                  <span className="ni-lb">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="prof">
        <div className="av" title={name}>
          {initialsOf(name)}
        </div>
        <div className="in">
          <b>{name}</b>
          <div className="xs muted" style={{ fontSize: 11.5 }}>
            {ROLES[role].label}
          </div>
        </div>
        <button
          className="icb logout"
          title="Keluar"
          aria-label="Keluar dari akun"
          onClick={() => void signOut()}
        >
          <Icon name="log-out" size={16} />
        </button>
      </div>
    </aside>
  );
}
