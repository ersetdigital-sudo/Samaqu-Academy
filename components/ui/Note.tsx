import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface NoteProps {
  children: ReactNode;
  variant?: 'warn' | 'green' | 'neutral' | 'red';
  icon?: string;
  className?: string;
}

export function Note({ children, variant = 'warn', icon, className = '' }: NoteProps) {
  const classes = ['note', variant === 'green' ? 'gn' : '', variant === 'neutral' ? 'nt' : '', variant === 'red' ? 'rd' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes}>
      <Icon name={icon ?? (variant === 'green' ? 'lightbulb' : variant === 'red' ? 'shield-alert' : 'info')} />
      <div>{children}</div>
    </div>
  );
}

export function DemoBadge({ label = 'Simulasi lokal' }: { label?: string }) {
  return (
    <span className="tag demo">
      <Icon name="flask-conical" />
      {label}
    </span>
  );
}
