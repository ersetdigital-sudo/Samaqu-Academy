'use client';

import { Icon } from '@/components/ui/Icon';
import type { BeforeAfter } from '@/lib/types';

interface BeforeAfterGuidanceProps {
  item: BeforeAfter;
}

/** "Hindari" + "Prinsip" blocks shown above the Before/After comparison. */
export function BeforeAfterGuidance({ item }: BeforeAfterGuidanceProps) {
  const mistake = item.mistakeToAvoid?.trim();
  const principles = (item.principles ?? []).map((entry) => entry.trim()).filter(Boolean);

  if (!mistake && !principles.length) return null;

  return (
    <div className="ba-guide mt">
      {mistake ? (
        <div className="avoid">
          <div className="lbl">
            <Icon name="shield-alert" />
            Hindari
          </div>
          <p>{mistake}</p>
        </div>
      ) : null}
      {principles.length ? (
        <div className="principles">
          <div className="lbl">Prinsip</div>
          <ol>
            {principles.map((principle, index) => (
              <li key={`${index}-${principle}`}>{principle}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
