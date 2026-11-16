'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  editProposal,
  generateLessons,
  loadLessons,
  loadProposals,
  publishProposal,
  rejectProposal,
  retireLearning,
  type LessonProposal,
  type LessonsGroup,
  type LessonsOverview,
  type LessonsTrace,
} from './wa-api';

/**
 * Tab "Pelajaran AI" di WA Inbox.
 *
 * Fase 1: melihat pola kesalahan agent (eskalasi dikelompokkan, customer berulang, kualitas pelajaran
 * terbit, rekam jejak tool). Fase 2: usulan pelajaran yang disusun AI dari kasus nyata. Semua tombol yang
 * mengubah sesuatu hanya ditampilkan untuk owner, dan server menolak non-owner apa pun yang tampil di layar.
 * Tidak ada pelajaran yang masuk ke agent sebelum owner menyetujuinya.
 */

const STATUS_LABEL: Record<string, string> = {
  open: 'Belum dijawab',
  answered: 'Dijawab',
  closed: 'Ditutup',
};

const PROPOSAL_STATUS: Record<string, string> = {
  proposed: 'Menunggu keputusan',
  publishing: 'Sedang diterbitkan',
  published: 'Terbit',
  rejected: 'Ditolak',
  retired: 'Ditarik',
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

interface Notice {
  tone: 'ok' | 'err';
  text: string;
}

function GroupCard({
  group,
  open,
  onToggle,
  isOwner,
  busy,
  running,
  onGenerate,
}: {
  group: LessonsGroup;
  open: boolean;
  onToggle: () => void;
  isOwner: boolean;
  /** Ada aksi yang berjalan di mana saja: semua tombol nonaktif supaya tidak ada dua aksi serentak. */
  busy: boolean;
  /** Aksi yang berjalan adalah penyusunan untuk KARTU INI: hanya kartu ini yang berlabel "Menyusun…". */
  running: boolean;
  onGenerate: () => void;
}) {
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
      <div className="pl-actions">
        {group.examples.length ? (
          <button type="button" className="wl-toggle" aria-expanded={open} onClick={onToggle}>
            {open ? 'Sembunyikan contoh' : `Lihat contoh (${group.examples.length})`}
          </button>
        ) : null}
        {isOwner ? (
          <button type="button" className="btn sm" onClick={onGenerate} disabled={busy} data-testid={`susun-${group.key}`}>
            {running ? 'Menyusun…' : 'Susun usulan pelajaran'}
          </button>
        ) : null}
      </div>
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

function ProposalCard({
  proposal,
  isOwner,
  busy,
  confirm,
  onSave,
  onPublish,
  onReject,
}: {
  proposal: LessonProposal;
  isOwner: boolean;
  busy: boolean;
  /** Peringatan lunak dari server yang menunggu konfirmasi owner untuk usulan ini. */
  confirm: string[] | null;
  onSave: (id: string, text: string) => void;
  onPublish: (id: string, text: string, confirmSoft: boolean) => void;
  onReject: (id: string) => void;
}) {
  const [text, setText] = useState(proposal.lesson);
  const [showEvidence, setShowEvidence] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const waiting = proposal.status === 'proposed';
  const changed = text.trim() !== proposal.lesson.trim();
  const needsAnswer = waiting && !proposal.lesson;
  // Usulan menunggu milik owner tampil ringkas dulu; form baru terbuka saat "Tinjau" diklik.
  const compact = waiting && isOwner && !reviewing;
  // Setelah "Simpan perubahan" teks dari server masuk lagi tanpa menutup kartu yang sedang dibuka.
  useEffect(() => {
    setText(proposal.lesson);
  }, [proposal.lesson]);
  const rawPreview = needsAnswer ? proposal.question || '' : proposal.lesson;
  const preview = (needsAnswer ? 'Pertanyaan AI: ' : '') + (rawPreview.length > 180 ? `${rawPreview.slice(0, 177)}…` : rawPreview);
  const cancel = () => {
    setText(proposal.lesson);
    setReviewing(false);
  };
  return (
    <article className={`wl-card tone-${waiting ? 'info' : proposal.status === 'published' ? 'ok' : 'muted'}`} data-proposal={proposal.id}>
      <header className="wl-head">
        <b className="wl-who">{proposal.title}</b>
        <span className="wl-chip">{proposal.kindLabel}</span>
        <span className={`wl-chip${waiting ? ' tone-info' : proposal.status === 'published' ? ' tone-ok' : ''}`}>
          {PROPOSAL_STATUS[proposal.status] || proposal.status}
        </span>
        {needsAnswer ? <span className="wl-chip tone-warn">Perlu jawaban owner</span> : null}
        {proposal.source === 'rewrite' ? <span className="wl-chip tone-warn">Tulis ulang</span> : null}
        <span className="pl-stat">{proposal.cases} kasus</span>
      </header>

      {compact ? (
        <>
          <p className="pl-preview" data-testid="pl-preview">
            {preview}
          </p>
          <div className="pl-actions">
            <button type="button" className="btn sm p" onClick={() => setReviewing(true)} data-testid="pl-tinjau">
              Tinjau
            </button>
          </div>
        </>
      ) : (
        <>
          {proposal.question ? (
            <div className="pl-box" data-testid="pl-question">
              <b>Pertanyaan untuk owner</b>
              <span>{proposal.question}</span>
            </div>
          ) : null}
          {proposal.note ? (
            <div className="pl-box note">
              <b>Catatan AI</b>
              <span>{proposal.note}</span>
            </div>
          ) : null}

          {waiting && isOwner ? (
            <>
              <label className="pl-label" htmlFor={`pl-${proposal.id}`}>
                {needsAnswer ? 'Tulis aturan resmi (jawaban owner)' : 'Teks pelajaran'}
              </label>
              <textarea
                id={`pl-${proposal.id}`}
                className="pl-text"
                rows={3}
                value={text}
                onChange={(event) => setText(event.target.value)}
                maxLength={2000}
              />
              <div className="pl-count">{text.trim().length} karakter · saran maksimal 300, batas 600</div>
            </>
          ) : proposal.lesson ? (
            <p className="wl-headline" data-testid="pl-lesson-ro">
              {proposal.lesson}
            </p>
          ) : null}

          {proposal.flags.hard.length && proposal.lesson ? (
            <div className="pl-flags">
              {proposal.flags.hard.map((flag) => (
                <span className="pl-flag hard" key={flag}>
                  {flag}
                </span>
              ))}
            </div>
          ) : null}
          {proposal.flags.soft.length ? (
            <div className="pl-flags">
              {proposal.flags.soft.map((flag) => (
                <span className="pl-flag" key={flag}>
                  {flag}
                </span>
              ))}
            </div>
          ) : null}

          {confirm && confirm.length ? (
            <div className="pl-box warn" role="alert" data-testid="pl-confirm">
              <b>Pastikan dulu sebelum diterbitkan</b>
              <span>{confirm.join('; ')}</span>
              <button type="button" className="btn sm" disabled={busy} onClick={() => onPublish(proposal.id, text, true)}>
                Tetap terbitkan
              </button>
            </div>
          ) : null}

          {proposal.evidence.length ? (
            <>
              <button type="button" className="wl-toggle" aria-expanded={showEvidence} onClick={() => setShowEvidence((value) => !value)}>
                {showEvidence ? 'Sembunyikan bukti' : `Lihat bukti (${proposal.evidence.length})`}
              </button>
              {showEvidence ? (
                <ul className="pl-ex">
                  {proposal.evidence.map((item, index) => (
                    <li key={String(item.id ?? index)}>
                      <div className="pl-ex-head">
                        {item.when ? <span>{waktu(String(item.when))}</span> : null}
                        {item.who ? <span>{String(item.who)}</span> : null}
                        {item.status ? <span>{STATUS_LABEL[String(item.status)] || String(item.status)}</span> : null}
                      </div>
                      {item.reason || item.topic ? <b>{String(item.reason ?? item.topic)}</b> : null}
                      {item.summary ? <div>{String(item.summary)}</div> : null}
                      {item.answer ? <div className="pl-answer">Jawaban admin: {String(item.answer)}</div> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}

          {waiting && isOwner ? (
            <div className="pl-actions">
              <button type="button" className="btn sm p" disabled={busy || !text.trim()} onClick={() => onPublish(proposal.id, text, false)}>
                Setujui dan terbitkan
              </button>
              <button type="button" className="btn sm" disabled={busy || !changed} onClick={() => onSave(proposal.id, text)}>
                Simpan perubahan
              </button>
              <button type="button" className="btn sm" disabled={busy} onClick={cancel} data-testid="pl-batal">
                Batal
              </button>
              <button type="button" className="btn danger sm" disabled={busy} onClick={() => onReject(proposal.id)}>
                Tolak
              </button>
            </div>
          ) : null}
        </>
      )}
      {waiting && !isOwner ? <p className="pl-sub">Hanya owner yang bisa menyetujui atau menolak.</p> : null}
      {proposal.status === 'rejected' && proposal.rejectReason ? <p className="pl-sub">Alasan ditolak: {proposal.rejectReason}</p> : null}
      {proposal.stuck ? <p className="pl-sub">Status menggantung. Muat ulang; kalau masih begitu, hubungi pengembang.</p> : null}
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

export function LessonsView({ isOwner = false }: { isOwner?: boolean }) {
  const [overview, setOverview] = useState<LessonsOverview | null>(null);
  const [trace, setTrace] = useState<LessonsTrace | null>(null);
  const [proposals, setProposals] = useState<LessonProposal[]>([]);
  const [softLimit, setSoftLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Record<string, string[]>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [jump, setJump] = useState(false);
  const proposalsRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [res, props] = await Promise.all([loadLessons(), loadProposals()]);
    setLoading(false);
    if (res.ok && res.data) {
      setError('');
      setOverview(res.data.overview);
      setTrace(res.data.trace);
    } else {
      setError(res.error || 'Gagal memuat Pelajaran AI.');
    }
    // Usulan opsional: kalau tabelnya belum bisa dibaca, bagian lain tab tetap tampil.
    if (props.ok && props.data) {
      setProposals(props.data.proposals);
      setSoftLimit(props.data.publishedSoftLimit || 20);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Setelah penyusunan berhasil, gulir ke daftar usulan supaya hasilnya langsung kelihatan.
  useEffect(() => {
    if (!jump) return;
    setJump(false);
    proposalsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [jump]);

  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  /** Jalankan aksi owner: satu aksi pada satu waktu, hasilnya jadi pesan, lalu muat ulang data. */
  async function run<T>(
    key: string,
    action: () => Promise<{ ok: boolean; error?: string; code?: string; soft?: string[]; data?: T }>,
    onOk: (data: T) => string,
    afterLoad?: (data: T) => void,
  ) {
    if (busy) return;
    setBusy(key);
    setNotice(null);
    const res = await action();
    setBusy(null);
    if (res.ok && res.data !== undefined) {
      setNotice({ tone: 'ok', text: onOk(res.data) });
      await load();
      afterLoad?.(res.data);
      return;
    }
    if (res.code === 'needs_confirm' && res.soft?.length) {
      const id = key.replace(/^publish:/, '');
      setConfirm((current) => ({ ...current, [id]: res.soft || [] }));
      return;
    }
    setNotice({ tone: 'err', text: res.error || 'Aksi gagal.' });
  }

  const onGenerateGroup = (group: LessonsGroup) =>
    void run(`gen:${group.key}`, () => generateLessons({ groupKey: group.key }), (data) => data.message, (data) => setJump(data.created > 0));
  const onGenerateRewrite = (learningId: string) =>
    void run(`rew:${learningId}`, () => generateLessons({ learningId }), (data) => data.message, (data) => setJump(data.created > 0));
  const onSave = (id: string, text: string) => void run(`save:${id}`, () => editProposal(id, text), () => 'Perubahan disimpan.');
  const onPublish = (id: string, text: string, confirmSoft: boolean) =>
    void run(
      `publish:${id}`,
      () => publishProposal(id, text, confirmSoft),
      (data) => {
        setConfirm((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        return ['Pelajaran diterbitkan: agent akan memakainya pada pesan berikutnya.', ...(data.warnings || [])].join(' ');
      },
    );
  const onReject = (id: string) => {
    const reason = typeof window !== 'undefined' ? window.prompt('Alasan menolak (opsional):', '') : '';
    if (reason === null) return;
    void run(`reject:${id}`, () => rejectProposal(id, reason || undefined), () => 'Usulan ditolak.');
  };
  const onRetire = (learningId: string, topic: string) => {
    if (typeof window !== 'undefined' && !window.confirm(`Tarik pelajaran "${topic}"? Agent berhenti memakainya (tidak dihapus, bisa dilacak).`)) return;
    void run(`retire:${learningId}`, () => retireLearning(learningId), () => 'Pelajaran ditarik.');
  };

  const totals = overview?.totals;
  const waiting = proposals.filter((item) => item.status === 'proposed' || item.status === 'publishing');
  const history = proposals.filter((item) => item.status !== 'proposed' && item.status !== 'publishing');
  const published = overview?.learnings.length ?? 0;

  return (
    <div className="wl pl" data-testid="pelajaran-ai">
      <div className="pl-intro">
        <b>Pelajaran AI</b>
        <span>
          Belajar dari kesalahan agent. AI menyusun usulan dari kasus eskalasi; hanya owner yang bisa menyetujui, dan tidak ada yang berubah di agent sebelum disetujui.
        </span>
        <button type="button" className="btn ghost sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Memuat…' : 'Muat ulang'}
        </button>
      </div>

      {error ? <div className="wa-error-inline" role="alert">{error}</div> : null}
      {notice ? (
        <div className={`pl-notice ${notice.tone}`} role={notice.tone === 'err' ? 'alert' : 'status'} data-testid="pl-notice">
          {notice.text}
        </div>
      ) : null}

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

          <h3 className="pl-h" ref={proposalsRef}>
            Usulan pelajaran <em className="pl-em">{waiting.length}</em>
          </h3>
          <p className="pl-sub">
            Disusun AI dari kasus nyata. Baca teks dan buktinya, ubah kalau perlu, lalu setujui. Teks yang memuat nomor, rekening, atau data satu kasus akan ditolak otomatis.
          </p>
          {waiting.length === 0 ? (
            <div className="empty" data-testid="pl-usulan-kosong">
              {isOwner ? 'Belum ada usulan. Pakai "Susun usulan pelajaran" di salah satu kelompok di bawah.' : 'Belum ada usulan.'}
            </div>
          ) : (
            <div className="wl-list">
              {waiting.map((proposal) => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  isOwner={isOwner}
                  busy={busy !== null}
                  confirm={confirm[proposal.id] || null}
                  onSave={onSave}
                  onPublish={onPublish}
                  onReject={onReject}
                />
              ))}
            </div>
          )}
          {history.length ? (
            <>
              <button type="button" className="wl-toggle" aria-expanded={showHistory} onClick={() => setShowHistory((value) => !value)} data-testid="pl-riwayat-toggle">
                {showHistory ? 'Sembunyikan riwayat' : `Riwayat usulan (${history.length})`}
              </button>
              {showHistory ? (
                <div className="wl-list" data-testid="pl-riwayat">
                  {history.map((proposal) => (
                    <ProposalCard
                      key={proposal.id}
                      proposal={proposal}
                      isOwner={false}
                      busy
                      confirm={null}
                      onSave={onSave}
                      onPublish={onPublish}
                      onReject={onReject}
                    />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          <h3 className="pl-h">Kelompok kesalahan</h3>
          <p className="pl-sub">Pengelompokan kasar berdasarkan kata kunci, untuk melihat pola. Urut dari yang paling banyak belum dijawab.</p>
          {overview.groups.length === 0 ? (
            <div className="empty">Belum ada eskalasi.</div>
          ) : (
            <div className="wl-list">
              {overview.groups.map((group) => (
                <GroupCard
                  key={group.key}
                  group={group}
                  open={open.has(group.key)}
                  onToggle={() => toggle(group.key)}
                  isOwner={isOwner}
                  busy={busy !== null}
                  running={busy === `gen:${group.key}`}
                  onGenerate={() => onGenerateGroup(group)}
                />
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

          <h3 className="pl-h">
            Pelajaran yang sudah terbit <em className={`pl-em${published > softLimit ? ' warn' : ''}`}>{published}</em>
          </h3>
          <p className="pl-sub">
            Setiap pelajaran global dikirim ke agent pada setiap pesan (saran maksimal {softLimit}). Yang ditandai berisi data satu kasus atau terlalu panjang, jadi sebaiknya ditulis ulang atau ditarik.
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
                  {isOwner ? (
                    <span className="pl-row-actions">
                      {learning.flags.length ? (
                        <button type="button" className="btn sm" disabled={busy !== null} onClick={() => onGenerateRewrite(learning.id)}>
                          {busy === `rew:${learning.id}` ? 'Menyusun…' : 'Susun tulis ulang'}
                        </button>
                      ) : null}
                      <button type="button" className="btn ghost sm" disabled={busy !== null} onClick={() => onRetire(learning.id, learning.topic)}>
                        Tarik
                      </button>
                    </span>
                  ) : null}
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
