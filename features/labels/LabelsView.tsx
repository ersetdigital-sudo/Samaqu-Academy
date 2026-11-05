'use client';

import { AppLink as Link } from '@/components/ui/AppLink';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { useState } from 'react';
import { LABEL_RULES, LABEL_STAGES, PLACEMENT, WHATSAPP_STEPS } from './label-stages';

export function LabelsView() {
  const [activeId, setActiveId] = useState(LABEL_STAGES[0].id);
  const active = LABEL_STAGES.find((stage) => stage.id === activeId) ?? LABEL_STAGES[0];
  const index = LABEL_STAGES.findIndex((stage) => stage.id === active.id);

  return (
    <>
      <PageHeader
        eyebrow="Learning & Service"
        title="Label Chat Customer"
        subtitle="Satu label per chat customer, diganti setiap ada progres. Posisi semua customer langsung terlihat dari daftar label tanpa membuka chat satu per satu."
        actions={<span className="tag gr">{LABEL_STAGES.length} tahap wajib</span>}
      />

      <div className="card" style={{ padding: '22px 18px' }}>
        <div className="row sp wrap" style={{ marginBottom: 10 }}>
          <h3>Alur label</h3>
          <span className="xs muted">Klik label untuk melihat kriteria dan tindakannya</span>
        </div>
        <div className="journey j5">
          {LABEL_STAGES.map((stage, stageIndex) => (
            <button
              key={stage.id}
              className={`jstep${stage.id === active.id ? ' on' : ''}`}
              onClick={() => setActiveId(stage.id)}
              aria-pressed={stage.id === active.id}
            >
              <div className="jn">{String(stageIndex + 1).padStart(2, '0')}</div>
              <b>{stage.name}</b>
              <small>{stage.step}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="mt">
        <div className="split">
          <div className="card" style={{ padding: 28 }}>
            <div className="eyebrow">
              Label {index + 1} dari {LABEL_STAGES.length}
            </div>
            <h1 style={{ fontSize: 24 }}>{active.name}</h1>
            <p className="lead mt1">{active.definition}</p>

            <div className="grid g2 mt2">
              <div className="card soft">
                <div className="kh">
                  <Icon name="circle-check-big" />
                  <h3>Pasang label ini kalau</h3>
                </div>
                <ul className="dots">
                  {active.criteria.map((item) => (
                    <li key={item}>
                      <Icon name="check" style={{ color: 'var(--g)' }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card soft">
                <div className="kh">
                  <Icon name="list-checks" />
                  <h3>Yang dikerjakan CS</h3>
                </div>
                <ol className="steps">
                  {active.actions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </div>
            </div>

            {active.followUps?.length ? (
              <div className="note gn mt2">
                <Icon name="heart-handshake" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>Tiga tindak lanjut wajib di tahap Selesai</b>
                  <ul className="dots mt1" style={{ marginBottom: 0 }}>
                    {active.followUps.map((item) => (
                      <li key={item.title}>
                        <Icon name="arrow-right" style={{ color: 'var(--g)' }} />
                        <span>
                          <b>{item.title}</b>
                          <span className="sm muted" style={{ display: 'block' }}>
                            {item.detail}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            <div className="card soft mt2">
              <div className="kh">
                <Icon name="ban" style={{ color: 'var(--red)' }} />
                <h3>Kesalahan yang harus dihindari</h3>
              </div>
              <ul className="dots">
                {active.mistakes.map((item) => (
                  <li key={item}>
                    <Icon name="x" style={{ color: 'var(--red)' }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <div className="card">
              <div className="kh">
                <Icon name="clipboard-list" />
                <h3>Aturan main pelabelan</h3>
              </div>
              <ol className="steps">
                {LABEL_RULES.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ol>
            </div>

            <div className="card mt">
              <div className="kh">
                <Icon name="tag" />
                <h3>Pasang di WhatsApp</h3>
              </div>
              <ol className="steps">
                {WHATSAPP_STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>

            <div className="card mt">
              <div className="kh">
                <Icon name="git-branch" />
                <h3>SOP atau Job Desk?</h3>
              </div>
              <p className="sm muted">
                Keduanya dipakai, tapi beda peran: SOP menyimpan aturannya, Job Desk menjadikannya
                kewajiban harian yang dicek.
              </p>
              {PLACEMENT.map((item) => (
                <Link className="ref mt1" href={item.href} key={item.href}>
                  <Icon name="file-text" />
                  <span style={{ flex: 1 }}>
                    {item.title}
                    <span className="xs muted" style={{ display: 'block' }}>
                      {item.detail}
                    </span>
                  </span>
                  <Icon name="chevron-right" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
