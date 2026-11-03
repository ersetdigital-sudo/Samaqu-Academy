import type { CSSProperties } from 'react';

interface ProgressBarProps {
  value: number;
  className?: string;
  style?: CSSProperties;
  color?: string;
}

export function ProgressBar({ value, className = '', style, color }: ProgressBarProps) {
  return (
    <div className={`bar ${className}`.trim()} style={style}>
      <i
        style={{
          width: `${Math.max(0, Math.min(100, value))}%`,
          background: color,
        }}
      />
    </div>
  );
}
