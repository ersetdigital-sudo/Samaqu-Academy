import { scoreColor } from '@/lib/utils/format';

interface ScoreRingProps {
  value: number | null;
  label?: string;
  small?: boolean;
}

export function ScoreRing({ value, label = 'Overall', small = false }: ScoreRingProps) {
  const hasValue = value != null && !Number.isNaN(value);
  const fixedLabels = ['Training', 'Selesai', 'Materi'];
  const color = hasValue
    ? fixedLabels.includes(label)
      ? '#3E6A54'
      : scoreColor(value)
    : '#ccc';
  return (
    <div
      className={`score${small ? ' sm2' : ''}`}
      style={{
        background: `conic-gradient(${color} ${hasValue ? value * 3.6 : 0}deg,#EFEDE7 0)`,
      }}
    >
      <div>
        <span>
          <b>{hasValue ? Math.round(value) : '—'}</b>
          <small>{label}</small>
        </span>
      </div>
    </div>
  );
}
