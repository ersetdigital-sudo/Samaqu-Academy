'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { useRole } from '@/components/providers/RoleProvider';
import { AppLink as Link } from '@/components/ui/AppLink';
import { Icon } from '@/components/ui/Icon';
import { NAV_GROUPS, ROLES } from '@/lib/constants';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  open: boolean;
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

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { role, profile, signOut } = useRole();
  const { user } = useAuth();
  const name = profile?.fullName || user?.email?.split('@')[0] || 'User';

  return (
    <aside className={`sb${open ? ' open' : ''}`} id="sb">
      <Link
        href="/"
        className="brand"
        onClick={onClose}
        style={{ textDecoration: 'none', color: 'inherit' }}
      >
        <div className="logo">S</div>
        <div>
          <b>Samaqu CS Academy</b>
          <small>Internal Learning Platform</small>
        </div>
      </Link>

      <nav className="nav" id="nav" aria-label="Navigasi utama">
        {NAV_GROUPS.filter((group) => !group.ownerOnly || role === 'owner').map((group) => (
          <div key={group.label}>
            <div className="ng">{group.label}</div>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`ni${active ? ' on' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={onClose}
                >
                  <Icon name={item.icon} size={17} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="prof">
        <div className="av">{initialsOf(name)}</div>
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
