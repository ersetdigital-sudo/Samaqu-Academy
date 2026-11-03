import type { ReactNode } from 'react';

interface GateScreenProps {
  title: string;
  subtitle?: string;
  loading?: boolean;
  action?: ReactNode;
}

export function GateScreen({ title, subtitle, loading = false, action }: GateScreenProps) {
  return (
    <div className="gate-screen">
      <div>
        <div className="logo gate-logo">S</div>
        {loading ? <div className="spinner" /> : null}
        <h1 style={{ fontSize: 22 }}>{title}</h1>
        {subtitle ? <p className="sub" style={{ maxWidth: 440 }}>{subtitle}</p> : null}
        {action ? <div className="mt">{action}</div> : null}
      </div>
    </div>
  );
}
