import { scoreColor } from '@/lib/utils/format';
import { ProgressBar } from './ProgressBar';

interface ScoreBarsProps {
  items: { name: string; value: number | null; note: string }[];
}

export function ScoreBars({ items }: ScoreBarsProps) {
  return (
    <>
      {items.map((item) => (
        <div className="mt" key={item.name}>
          <div className="row sp sm">
            <span style={{ fontWeight: 500 }}>{item.name}</span>
            {item.value == null ? (
              <span className="tag">Tidak relevan</span>
            ) : (
              <b>{Math.round(item.value)}</b>
            )}
          </div>
          {item.value == null ? null : (
            <ProgressBar
              value={item.value}
              className="mt1"
              color={scoreColor(item.value)}
            />
          )}
          {item.note ? (
            <div className="xs muted" style={{ marginTop: 4 }}>
              {item.note}
            </div>
          ) : null}
        </div>
      ))}
    </>
  );
}
