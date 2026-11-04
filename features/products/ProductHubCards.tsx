'use client';

import { Icon } from '@/components/ui/Icon';
import { PRODUCT_SECTIONS, SECTION_META, type ProductSection } from './product-sections';

interface ProductHubCardsProps {
  counts: Record<ProductSection, number>;
  onOpen: (section: ProductSection) => void;
}

/** Landing cards: one door per Product Knowledge section. */
export function ProductHubCards({ counts, onOpen }: ProductHubCardsProps) {
  return (
    <div className="grid g2 mt">
      {PRODUCT_SECTIONS.map((key) => {
        const meta = SECTION_META[key];
        return (
          <div
            className="card ck hub-card"
            key={key}
            role="link"
            tabIndex={0}
            onClick={() => onOpen(key)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen(key);
              }
            }}
          >
            <span className="hub-ic">
              <Icon name={meta.icon} size={22} />
            </span>
            <h3>{meta.label}</h3>
            <p className="sm muted" style={{ flex: 1 }}>
              {meta.blurb}
            </p>
            <div className="row sp mt">
              <span className="tag">{counts[key]} item</span>
              <Icon name="arrow-right" size={16} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
