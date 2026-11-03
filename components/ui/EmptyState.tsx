import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="card flat empty">
      <Icon name={icon} size={30} />
      <p className="mt1">
        <b style={{ color: 'var(--t)' }}>{title}</b>
      </p>
      <p className="sm">{subtitle}</p>
      {action ? <div className="mt">{action}</div> : null}
    </div>
  );
}
