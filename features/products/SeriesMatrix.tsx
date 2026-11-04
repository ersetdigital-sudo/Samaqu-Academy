'use client';

import { Icon } from '@/components/ui/Icon';
import { SERIES_COLLARS, SERIES_PLACKETS } from '@/lib/product-schema';
import type { Product } from '@/lib/types';
import { rupiah } from '@/lib/utils/format';

interface SeriesMatrixProps {
  series: Product[];
  images: Record<string, string>;
  onOpen: (product: Product) => void;
}

export function SeriesMatrix({ series, images, onOpen }: SeriesMatrixProps) {
  const placed = series.filter((item) => item.collar && item.placket);
  if (!placed.length) return null;

  return (
    <div className="card series-map mt">
      <div className="row sp wrap">
        <div>
          <div className="eyebrow">Product Knowledge</div>
          <h3>Peta Series Thobe</h3>
          <p className="sm muted">Bandingkan seri berdasarkan kerah dan placket sekaligus.</p>
        </div>
        <span className="tag">{placed.length} seri</span>
      </div>

      <div className="tw mt">
        <table className="series-matrix">
          <thead>
            <tr>
              <th scope="col" className="series-matrix-corner">
                Kerah \ Placket
              </th>
              {SERIES_PLACKETS.map((placket) => (
                <th key={placket} scope="col">
                  {placket}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SERIES_COLLARS.map((collar) => (
              <tr key={collar}>
                <th scope="row">{collar}</th>
                {SERIES_PLACKETS.map((placket) => {
                  const matches = placed.filter(
                    (item) => item.collar === collar && item.placket === placket,
                  );
                  return (
                    <td key={placket}>
                      {matches.length ? (
                        matches.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="series-cell"
                            onClick={() => onOpen(item)}
                          >
                            <span className="series-cell-thumb">
                              {images[item.id] ? (
                                <img src={images[item.id]} alt="" />
                              ) : (
                                <Icon name="library" size={16} />
                              )}
                            </span>
                            <span className="series-cell-name">
                              <b>{item.name}</b>
                              <span className="sm muted">{item.code}</span>
                              {item.price ? (
                                <span className="xs muted">mulai {rupiah(item.price)}</span>
                              ) : null}
                            </span>
                          </button>
                        ))
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="sm muted mt">
        Tanya dulu: mau kerah tegak atau kerah kemeja? Lalu pilih placket polos atau variasi.
      </p>
    </div>
  );
}
