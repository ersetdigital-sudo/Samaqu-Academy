'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadLessons, type LessonsGroup, type LessonsOverview, type LessonsTrace } from './wa-api';

/**
 * Tab "Pelajaran AI" di WA Inbox. FASE 1: BACA SAJA.
 *
 * Menunjukkan di mana agent paling sering tidak bisa menjawab (eskalasi ke admin), customer yang
 * berulang kali dieskalasi, kualitas pelajaran yang sudah terbit, dan apakah rekam jejak tool berjalan.
 * Tidak ada tombol yang mengubah data atau perilaku agent. Persetujuan pelajaran (khusus owner) baru
 * hadir di fase berikutnya.
 */

const STATUS_LABEL: Record<string, string> = {
  open: 'Belum dijawab',
  answered: 'Dijawab',
  closed: 'Ditutup',
};

const NATURE_TONE: Record<string, string> = {
  pengetahuan: 'ok',
  tool: 'warn',
  keputusan_owner: 'info',
  alur_kerja: 'warn',
  aksi_admin: 'muted',
  perlu_dicek: 'muted',
};

function waktu(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  const day = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', timeZone: 'Asia/Jakarta' }).format(date);
  const time = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' })
    .format(date)
    .replace(':', '.');
  return `${day}, ${time}`;
}

function GroupCard({ group, open, onToggle }: { group: LessonsGroup; open: boolean; onToggle: () => void }) {
  const tone = NATURE_TONE[group.nature] || 'muted';
  return (
    <article className={`wl-card tone-${tone}`} data-kind={group.key}>
      <header className="wl-head">
        <b className="wl-who">{group.label}</b>
        <span className={`wl-chip tone-${tone}`}>{group.natureLabel}</span>
        <span className="pl-stat">
          {group.cases} kasus · {group.open} belum dijawab ({group.uniqueOpen} customer) · {group.customers} customer
        </span>
      </header>
      <p className="wl-headline">{group.hint}</p>
      {group.examples.length ? (
        <button type="button" className="wl-toggle" aria-expanded={open} onClick={onToggle}>
          {open ? 'Sembunyikan contoh' : `Lihat contoh (${group.examples.length})`}
        </button>
      ) : null}
      {open ? (
        <ul className="pl-ex">
          {group.examples.map((example) => (
            <li key={example.id}>
              <div className="pl-ex-head">
                <span>{waktu(example.when)}</span>
                <span>{example.who}</span>
                <span className={`wl-chip${example.status === 'open' ? ' tone-warn' : ' tone-ok'}`}>
                  {STATUS_LABEL[example.status] || example.status}
                </span>
              </div>
              {example.reason ? <b>{example.reason}</b> : null}
              {example.summary ? <div>{example.summary}</div> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function TracePanel({ trace }: { trace: LessonsTrace }) {
  if (!trace.ready) {
    return (
      <div className="wl-idle" data-testid="trace-belum">
        Rekam jejak tool belum bisa dibaca. Kalau baru dipasang, tunggu sampai ada customer yang dibalas agent.
      </div>
    );
  }
  if (trace.total === 0) {
    return (
      <div className="wl-idle" data-testid="trace-kosong">
        Belum ada panggilan tool yang tercatat dalam 7 hari terakhir. Pencatatan berjalan otomatis pada setiap run yang membalas customer.
      </div>
    );
  }
  return (
    <>
      <div className="wl-metrics">
        <div className="wl-metric">
          <small>Panggilan tool (7 hari)</small>
          <b>{trace.total}</b>
        </div>
        <div className="wl-metric">
          <small>Tool gagal</small>
          <b className={trace.errors ? 'bad' : ''}>{trace.errors}</b>
        </div>
        <div className="wl-metric">
          <small>Run terhubung ke pesan</small>
          <b>{trace.runsWithInbox}</b>
        </div>
      </div>
      <div className="pl-tools">
        {trace.tools.map((tool) => (
          <span className="wl-tool-chip" key={tool.tool}>
            {tool.tool} · {tool.calls}× · rata-rata {tool.avgMs} ms{tool.errors ? ` · ${tool.errors} gagal` : ''}
          </span>
        ))}
      </div>
    </>
  );
}

export function LessonsView() {
  const [overview, setOverview] = useState<LessonsOverview | null>(null);
  const [trace, setTrace] = useState<LessonsTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadLessons();
    setLoading(false);
    if (res.ok && res.data) {
      setError('');
      setOverview(res.data.overview);
      setTrace(res.data.trace);
    } else {
      setError(res.error || 'Gagal memuat Pelajaran AI.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const totals = overview?.totals;

  return (
    <div className="wl pl" data-testid="pelajaran-ai">
      <div className="pl-intro">
        <b>Pelajaran AI</b>
        <span>
          Belajar dari kesalahan agent. Saat ini hanya untuk melihat pola: tidak ada yang berubah otomatis, dan pelajaran baru nanti tetap disetujui owner.
        </span>
        <button type="button" className="btn ghost sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Memuat…' : 'Muat ulang'}
        </button>
      </div>

      {error ? <div className="wa-error-inline" role="alert">{error}</div> : null}

      {!overview && loading ? <div className="empty">Memuat…</div> : null}

      {overview && totals ? (
        <>
          <div className="wl-metrics">
            <div className="wl-metric">
              <small>Eskalasi belum dijawab</small>
              <b className={totals.open ? 'warn' : ''}>{totals.open}</b>
            </div>
            <div className="wl-metric">
              <small>Kasus unik</small>
              <b>{totals.uniqueOpen}</b>
            </div>
            <div className="wl-metric">
              <small>Pelajaran terbit</small>
              <b>{totals.published}</b>
            </div>
            <div className="wl-metric">
              <small>Pelajaran perlu ditinjau</small>
              <b className={totals.needReview ? 'warn' : ''}>{totals.needReview}</b>
            </div>
          </div>
          {totals.duplicateOpen > 0 ? (
            <div className="wl-idle" data-testid="pl-kembar">
              {totals.duplicateOpen} eskalasi belum dijawab adalah kembaran: customer yang sama menanyakan hal yang sama lagi karena belum ada jawaban.
            </div>
          ) : null}

          <h3 className="pl-h">Kelompok kesalahan</h3>
          <p className="pl-sub">Pengelompokan kasar berdasarkan kata kunci, untuk melihat pola. Urut dari yang paling banyak belum dijawab.</p>
          {overview.groups.length === 0 ? (
            <div className="empty">Belum ada eskalasi.</div>
          ) : (
            <div className="wl-list">
              {overview.groups.map((group) => (
                <GroupCard key={group.key} group={group} open={open.has(group.key)} onToggle={() => toggle(group.key)} />
              ))}
            </div>
          )}

          {overview.repeats.length ? (
            <>
              <h3 className="pl-h">Customer yang berulang kali dieskalasi</h3>
              <p className="pl-sub">Tiga eskalasi atau lebih dari satu customer: tanda ada pertanyaan yang belum terjawab.</p>
              <div className="wl-list">
                {overview.repeats.map((repeat) => (
                  <div className="pl-row" key={repeat.who + repeat.firstAt}>
                    <b className="wl-who">{repeat.who}</b>
                    <span className="wl-chip tone-warn">{repeat.cases} eskalasi</span>
                    <span className="pl-stat">{repeat.open} belum dijawab · {repeat.kinds.join(', ')}</span>
                    <span className="pl-stat" style={{ marginLeft: 'auto' }}>
                      {waktu(repeat.firstAt)} sampai {waktu(repeat.lastAt)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <h3 className="pl-h">Pelajaran yang sudah terbit</h3>
          <p className="pl-sub">
            Setiap pelajaran global dikirim ke agent pada setiap pesan. Yang ditandai berisi data satu kasus atau terlalu panjang, jadi sebaiknya ditulis ulang.
          </p>
          {overview.learnings.length === 0 ? (
            <div className="empty">Belum ada pelajaran.</div>
          ) : (
            <div className="wl-list">
              {overview.learnings.map((learning) => (
                <div className="pl-row pl-learning" key={learning.id} data-flagged={learning.flags.length ? '1' : '0'}>
                  <b className="wl-who">{learning.topic}</b>
                  <span className="wl-chip">{learning.scope === 'global' ? 'Semua customer' : 'Satu customer'}</span>
                  <span className="pl-stat">{learning.chars} karakter · {waktu(learning.created_at)}</span>
                  {learning.flags.length ? (
                    <div className="pl-flags">
                      {learning.flags.map((flag) => (
                        <span className="pl-flag" key={flag}>
                          {flag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}

      {trace ? (
        <>
          <h3 className="pl-h">Rekam jejak tool</h3>
          <p className="pl-sub">
            Bahan untuk menilai keputusan agent. Argumen dan hasil disamarkan (nomor HP, rekening, alamat) dan disimpan 90 hari.
          </p>
          <TracePanel trace={trace} />
        </>
      ) : null}
    </div>
  );
}
