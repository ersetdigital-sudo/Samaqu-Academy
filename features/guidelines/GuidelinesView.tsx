'use client';

import { AppLink as Link } from '@/components/ui/AppLink';
import { useRouter, useSearchParams } from 'next/navigation';
import { useData } from '@/components/providers/DataProvider';
import { useModal } from '@/components/providers/ModalProvider';
import { useRole } from '@/components/providers/RoleProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ChatBubbles } from '@/components/ui/ChatBubbles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RecordForm } from '@/components/ui/RecordForm';
import { GUIDE_FIELDS } from '@/lib/form-schemas';
import { guideDoneCount } from '@/lib/stats';
import type { GuideSection } from '@/lib/types';
import { copyToClipboard } from '@/lib/utils/clipboard';
import { newId } from '@/lib/utils/id';

export function GuidelinesView() {
  const { snapshot, upsertContent, deleteContent, setGuideDone } = useData();
  const { canManage } = useRole();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const guides = snapshot.content.guides;
  const sectionId = searchParams.get('section');
  const index = Math.max(
    0,
    guides.findIndex((guide) => guide.id === sectionId),
  );
  const guide = guides[index];
  const done = guideDoneCount(guides, snapshot.progress);
  const pct = guides.length ? Math.round((done / guides.length) * 100) : 0;

  const select = (id: string) => {
    router.replace(`/guidelines?section=${encodeURIComponent(id)}`, { scroll: false });
  };

  const openGuideForm = (current?: GuideSection, defaults?: Partial<GuideSection>) => {
    openModal(
      <RecordForm
        key={current?.id ?? 'new-guide'}
        title={current ? 'Edit Bagian Guideline' : 'Tambah Bagian Guideline'}
        subtitle="Kolom bertanda * wajib diisi."
        fields={GUIDE_FIELDS}
        initial={current ?? defaults ?? {}}
        defaults={{ no: guides.length + 1, kind: '' }}
        submitLabel={current ? 'Simpan Perubahan' : 'Tambahkan'}
        onSubmit={async (values) => {
          const item: GuideSection = {
            id: current?.id ?? newId('gd'),
            no: Number(values.no),
            title: String(values.title),
            summary: String(values.summary),
            points: Array.isArray(values.points) ? values.points : [],
            dos: Array.isArray(values.dos) ? values.dos : [],
            donts: Array.isArray(values.donts) ? values.donts : [],
            pairs: Array.isArray(values.pairs) ? values.pairs : [],
            example: String(values.example),
            takeaway: String(values.takeaway),
            kind: (values.kind === 'ba' ? 'ba' : '') as GuideSection['kind'],
            sample: false,
            updatedAt: Date.now(),
          };
          await upsertContent('guides', item);
          closeModal();
          showToast(current ? 'Perubahan berhasil disimpan' : 'Bagian berhasil ditambahkan');
        }}
        onCancel={closeModal}
      />,
      { large: true },
    );
  };

  if (!guide) {
    return (
      <>
        <PageHeader
          eyebrow="Learning & Service"
          title="Communication Guidelines"
          subtitle="Standar komunikasi Samaqu untuk kerja sehari-hari: natural, ramah, profesional, dan ringkas."
          actions={
            canManage ? (
              <button className="btn" onClick={() => openGuideForm()}>
                <Icon name="plus" />
                Tambah Bagian
              </button>
            ) : null
          }
        />
        <EmptyState
          icon="book-heart"
          title="Belum ada bagian"
          subtitle="Tambahkan bagian guideline pertama."
          action={
            canManage ? (
              <button className="btn" onClick={() => openGuideForm()}>
                <Icon name="plus" />
                Tambah Bagian
              </button>
            ) : null
          }
        />
      </>
    );
  }

  const confirmDelete = (current: GuideSection) => {
    openModal(
      <ConfirmDialog
        title="Hapus bagian ini?"
        message={`"${current.title}" akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
        onCancel={closeModal}
        onConfirm={async () => {
          await deleteContent('guides', current.id);
          closeModal();
          showToast('Bagian berhasil dihapus');
          if (current.id === guide.id) router.replace('/guidelines');
        }}
      />,
    );
  };

  const toggleDone = async () => {
    const willMark = !snapshot.progress.guides[guide.id];
    await setGuideDone(guide.id, willMark);
    if (willMark) {
      showToast('Bagian ditandai sudah dipahami ✓');
      const next = guides[index + 1];
      if (next) select(next.id);
    } else {
      showToast('Bagian ditandai belum dipahami');
    }
  };

  const copyAfter = async (text: string) => {
    const ok = await copyToClipboard(text);
    showToast(ok ? 'Berhasil disalin ke clipboard' : 'Gagal menyalin', ok ? 'ok' : 'err');
  };

  return (
    <>
      <PageHeader
        eyebrow="Learning & Service"
        title="Communication Guidelines"
        subtitle="Standar komunikasi Samaqu untuk kerja sehari-hari: natural, ramah, profesional, dan ringkas."
        actions={
          canManage ? (
            <button className="btn" onClick={() => openGuideForm(undefined, { no: guides.length + 1 })}>
              <Icon name="plus" />
              Tambah Bagian
            </button>
          ) : null
        }
      />

      <div className="lib">
        <div className="rail">
          <div className="card flat" style={{ padding: 14, marginBottom: 10 }}>
            <div className="row sp xs">
              <b>Progress</b>
              <span className="muted">
                {done}/{guides.length} dipahami
              </span>
            </div>
            <ProgressBar value={pct} className="mt1" />
          </div>
          <div className="rt">Bagian</div>
          {guides.map((item, itemIndex) => (
            <button
              key={item.id}
              className={item.id === guide.id ? 'on' : ''}
              onClick={() => select(item.id)}
            >
              <span className="row" style={{ gap: 8, minWidth: 0 }}>
                <span className="gnum">{String(itemIndex + 1).padStart(2, '0')}</span>
                <span style={{ whiteSpace: 'normal', lineHeight: 1.35 }}>{item.title}</span>
              </span>
              {snapshot.progress.guides[item.id] ? (
                <Icon
                  name="check-circle-2"
                  size={15}
                  style={{ color: 'var(--acc)', flexShrink: 0 }}
                />
              ) : null}
            </button>
          ))}
        </div>

        <div style={{ minWidth: 0 }}>
          <div className="rail-sel" style={{ marginBottom: 14 }}>
            <div className="row sp xs" style={{ marginBottom: 6 }}>
              <b>
                Progress {done}/{guides.length}
              </b>
            </div>
            <ProgressBar value={pct} style={{ marginBottom: 10 }} />
            <select
              className="inp"
              value={guide.id}
              onChange={(event) => select(event.target.value)}
              aria-label="Pilih bagian guideline"
            >
              {guides.map((item, itemIndex) => (
                <option key={item.id} value={item.id}>
                  {String(itemIndex + 1).padStart(2, '0')}. {item.title}
                  {snapshot.progress.guides[item.id] ? ' ✓' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="card" style={{ padding: 32 }}>
            <div className="row sp wrap" style={{ alignItems: 'flex-start' }}>
              <div>
                <div className="eyebrow">
                  Bagian {String(index + 1).padStart(2, '0')} dari{' '}
                  {String(guides.length).padStart(2, '0')}
                </div>
                <h1>{guide.title}</h1>
              </div>
              {canManage ? (
                <div className="row">
                  <button className="btn sm" onClick={() => openGuideForm(guide)}>
                    <Icon name="pencil" />
                    Edit
                  </button>
                  <button className="btn sm danger" onClick={() => confirmDelete(guide)}>
                    <Icon name="trash-2" />
                    Hapus
                  </button>
                </div>
              ) : null}
            </div>
            <p className="lead mt1">{guide.summary}</p>

            {guide.points.length ? (
              <div className="mt2">
                {guide.points.map((point, pointIndex) => {
                  const separator = point.indexOf(':');
                  const title = separator > 0 ? point.slice(0, separator) : point;
                  const body = separator > 0 ? point.slice(separator + 1).trim() : '';
                  return (
                    <div className="point" key={`${pointIndex}-${point}`}>
                      <span className="pn">{pointIndex + 1}</span>
                      <div>
                        <b>{title}</b>
                        {body ? <div className="sm muted">{body}</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {guide.dos.length || guide.donts.length ? (
              <div className="mt2">
                <div className="kh">
                  <Icon name="scale" />
                  <h3>Do &amp; Don&apos;t</h3>
                </div>
                <div className="dd">
                  <div className="do">
                    <div className="lbl">Do</div>
                    {guide.dos.map((item) => (
                      <div style={{ marginTop: 4 }} key={item}>
                        “{item}”
                      </div>
                    ))}
                  </div>
                  <div className="dont">
                    <div className="lbl">Don&apos;t</div>
                    {guide.donts.map((item) => (
                      <div style={{ marginTop: 4 }} key={item}>
                        “{item}”
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {guide.pairs.length ? (
              <div className="mt2">
                <div className="kh">
                  <Icon name="repeat" />
                  <h3>Contoh Praktis</h3>
                </div>
                {guide.pairs.map((pair, pairIndex) => {
                  const [bad, good, reason] = pair.split('||').map((part) => (part || '').trim());
                  return (
                    <div className="card flat mt" style={{ padding: 16 }} key={pairIndex}>
                      <div className="dd">
                        <div className="dont">
                          <div className="lbl">Kurang tepat</div>
                          {bad}
                        </div>
                        <div className="do">
                          <div className="lbl">Lebih baik</div>
                          {good}
                        </div>
                      </div>
                      {reason ? (
                        <p className="sm muted mt1">
                          <Icon name="info" size={14} style={{ verticalAlign: -2 }} /> {reason}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {guide.kind === 'ba' ? (
              <div className="mt2">
                <div className="kh">
                  <Icon name="repeat" />
                  <h3>Before &amp; After dari Script Library</h3>
                </div>
                {snapshot.content.beforeAfter.length ? (
                  snapshot.content.beforeAfter.map((item) => (
                    <div className="card flat mt" style={{ padding: 16 }} key={item.id}>
                      <div className="row sp wrap">
                        <b>{item.title}</b>
                        <span className="tag gr">{item.category}</span>
                      </div>
                      <div className="dd mt1">
                        <div className="dont">
                          <div className="lbl">Before</div>"{item.before}"
                        </div>
                        <div className="do">
                          <div className="lbl">After</div>"{item.after}"
                        </div>
                      </div>
                      <p className="sm muted mt1">
                        <b>Kenapa lebih baik:</b> {item.why}
                      </p>
                      <div className="row mt1">
                        <button className="btn sm" onClick={() => copyAfter(item.after)}>
                          <Icon name="copy" />
                          Copy After
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="sm muted mt">Belum ada data Before &amp; After.</p>
                )}
                <Link className="btn mt" href="/scripts?tab=ba">
                  <Icon name="external-link" />
                  Kelola di Script Library
                </Link>
              </div>
            ) : null}

            {guide.example ? (
              <div className="mt2">
                <div className="kh">
                  <Icon name="message-circle" />
                  <h3>Contoh Percakapan</h3>
                </div>
                <div className="convo">
                  <ChatBubbles text={guide.example} />
                </div>
              </div>
            ) : null}

            <div className="take mt2">
              <Icon name="sparkles" />
              <div>
                <div className="lbl" style={{ color: '#C9DCCF' }}>
                  Key Takeaway
                </div>
                {guide.takeaway}
              </div>
            </div>

            <div
              className="row sp mt2 wrap"
              style={{ borderTop: '1px solid var(--b)', paddingTop: 18 }}
            >
              {index > 0 ? (
                <button className="btn" onClick={() => select(guides[index - 1].id)}>
                  <Icon name="chevron-left" />
                  Sebelumnya
                </button>
              ) : (
                <button className="btn" disabled>
                  <Icon name="chevron-left" />
                  Sebelumnya
                </button>
              )}
              <button
                className={`btn ${snapshot.progress.guides[guide.id] ? '' : 'p'}`}
                onClick={toggleDone}
              >
                <Icon name={snapshot.progress.guides[guide.id] ? 'rotate-ccw' : 'check'} />
                {snapshot.progress.guides[guide.id]
                  ? 'Tandai belum dipahami'
                  : 'Tandai sudah dipahami'}
              </button>
              {index < guides.length - 1 ? (
                <button className="btn" onClick={() => select(guides[index + 1].id)}>
                  Berikutnya
                  <Icon name="chevron-right" />
                </button>
              ) : (
                <button className="btn" disabled>
                  Berikutnya
                  <Icon name="chevron-right" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
