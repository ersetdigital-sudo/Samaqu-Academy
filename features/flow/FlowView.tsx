'use client';

import { AppLink as Link } from '@/components/ui/AppLink';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useModal } from '@/components/providers/ModalProvider';
import { useRole } from '@/components/providers/RoleProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ChatBubbles } from '@/components/ui/ChatBubbles';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { RecordForm } from '@/components/ui/RecordForm';
import { flowFields } from '@/lib/form-schemas';
import type { FlowStage } from '@/lib/types';
import { newId } from '@/lib/utils/id';

export function FlowView() {
  const { snapshot, hydrated, upsertContent, deleteContent, markFlowSeen } = useData();
  const { canManage } = useRole();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const detailRef = useRef<HTMLDivElement>(null);

  const main = snapshot.content.flow.filter((stage) => !stage.special).sort((a, b) => a.no - b.no);
  const special = snapshot.content.flow
    .filter((stage) => stage.special)
    .sort((a, b) => a.no - b.no);
  const all = [...main, ...special];
  const stageId = searchParams.get('stage');
  const selected = all.find((stage) => stage.id === stageId) ?? main[0] ?? special[0];
  const selectedId = selected?.id;
  const seen = snapshot.content.flow.filter((stage) => snapshot.progress.flow[stage.id]).length;

  useEffect(() => {
    if (hydrated && selectedId) void markFlowSeen(selectedId);
  }, [hydrated, markFlowSeen, selectedId]);

  const select = (id: string) => {
    router.replace(`/flow?stage=${encodeURIComponent(id)}`, { scroll: false });
    if (typeof window !== 'undefined' && window.innerWidth < 900) {
      window.setTimeout(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    }
  };

  const openFlowForm = (current?: FlowStage, defaults?: Partial<FlowStage>) => {
    openModal(
      <RecordForm
        key={current?.id ?? 'new-flow'}
        title={current ? 'Edit Tahap Chat Flow' : 'Tambah Tahap Chat Flow'}
        subtitle="Kolom bertanda * wajib diisi."
        fields={flowFields(snapshot.content.problems)}
        initial={current ?? defaults ?? {}}
        defaults={{ no: snapshot.content.flow.length + 1, special: false }}
        submitLabel={current ? 'Simpan Perubahan' : 'Tambahkan'}
        onSubmit={async (values) => {
          const item: FlowStage = {
            id: current?.id ?? newId('flow'),
            no: Number(values.no),
            title: String(values.title),
            description: String(values.description),
            goal: String(values.goal),
            whenToUse: String(values.whenToUse),
            info: Array.isArray(values.info) ? values.info : [],
            steps: Array.isArray(values.steps) ? values.steps : [],
            example: String(values.example),
            avoid: Array.isArray(values.avoid) ? values.avoid : [],
            nextStep: String(values.nextStep),
            scriptCategories: Array.isArray(values.scriptCategories) ? values.scriptCategories : [],
            problemIds: Array.isArray(values.problemIds) ? values.problemIds : [],
            special: Boolean(values.special),
            sample: false,
            updatedAt: Date.now(),
          };
          await upsertContent('flow', item);
          closeModal();
          showToast(current ? 'Perubahan berhasil disimpan' : 'Tahap berhasil ditambahkan');
          router.replace(`/flow?stage=${encodeURIComponent(item.id)}`, { scroll: false });
        }}
        onCancel={closeModal}
      />,
      { large: true },
    );
  };

  if (!selected) {
    return (
      <>
        <PageHeader
          eyebrow="Learning & Service"
          title="Chat Flow"
          subtitle="Perjalanan customer dari chat pertama sampai purna jual. Klik setiap tahap untuk mempelajari apa yang harus dilakukan, kenapa, dan bagaimana."
          actions={
            canManage ? (
              <button className="btn" onClick={() => openFlowForm()}>
                <Icon name="plus" />
                Tambah Tahap
              </button>
            ) : null
          }
        />
        <EmptyState
          icon="route"
          title="Belum ada tahap"
          subtitle="Tambahkan tahap pertama untuk Chat Flow."
          action={
            canManage ? (
              <button className="btn" onClick={() => openFlowForm()}>
                <Icon name="plus" />
                Tambah Tahap
              </button>
            ) : null
          }
        />
      </>
    );
  }

  const index = all.findIndex((stage) => stage.id === selected.id);
  const previous = index > 0 ? all[index - 1] : null;
  const next = index < all.length - 1 ? all[index + 1] : null;
  const relatedScripts = snapshot.content.scripts
    .filter((script) => selected.scriptCategories.includes(script.category))
    .slice(0, 4);
  const relatedProblems = selected.problemIds
    .map((problemId) => snapshot.content.problems.find((problem) => problem.id === problemId))
    .filter(Boolean);
  const position = selected.special
    ? 'Jalur khusus'
    : `Tahap ${main.findIndex((stage) => stage.id === selected.id) + 1} dari ${main.length}`;

  const confirmDelete = () => {
    openModal(
      <ConfirmDialog
        title="Hapus tahap ini?"
        message={`"${selected.title}" akan dihapus dari Chat Flow.`}
        onCancel={closeModal}
        onConfirm={async () => {
          await deleteContent('flow', selected.id);
          closeModal();
          showToast('Tahap berhasil dihapus');
          router.replace('/flow');
        }}
      />,
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Learning & Service"
        title="Chat Flow"
        subtitle="Perjalanan customer dari chat pertama sampai purna jual. Klik setiap tahap untuk mempelajari apa yang harus dilakukan, kenapa, dan bagaimana."
        actions={
          <>
            <span className="tag gr">
              {Math.min(seen, snapshot.content.flow.length)}/{snapshot.content.flow.length} tahap
              dipelajari
            </span>
            {canManage ? (
              <button className="btn" onClick={() => openFlowForm(undefined, { no: all.length + 1 })}>
                <Icon name="plus" />
                Tambah Tahap
              </button>
            ) : null}
          </>
        }
      />

      <div className="card" style={{ padding: '22px 18px' }}>
        <div className="row sp wrap" style={{ marginBottom: 10 }}>
          <h3>Customer Journey</h3>
          <span className="xs muted">{main.length} tahap utama</span>
        </div>
        <div className="journey">
          {main.map((stage, stageIndex) => (
            <button
              key={stage.id}
              className={`jstep ${selected.id === stage.id ? 'on' : ''} ${
                snapshot.progress.flow[stage.id] ? 'seen' : ''
              }`}
              onClick={() => select(stage.id)}
            >
              <div className="jn">{String(stageIndex + 1).padStart(2, '0')}</div>
              <b>{stage.title}</b>
              <small>
                {snapshot.progress.flow[stage.id] ? 'Sudah dipelajari' : `Tahap ${stageIndex + 1}`}
              </small>
            </button>
          ))}
        </div>
        <div>
          {special.map((stage) => (
            <button
              key={stage.id}
              className={`branch ${selected.id === stage.id ? 'on' : ''}`}
              onClick={() => select(stage.id)}
            >
              <span
                className="sic"
                style={{ background: 'var(--redl)', color: 'var(--red)' }}
              >
                <Icon name="git-branch" />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <b>{stage.title}</b>
                  <span className="tag rd">Jalur Khusus</span>
                  {snapshot.progress.flow[stage.id] ? (
                    <span className="tag gr">Sudah dipelajari</span>
                  ) : null}
                </div>
                <div className="xs muted" style={{ marginTop: 2 }}>
                  {stage.description}
                </div>
              </div>
              <Icon name="chevron-right" size={18} style={{ color: 'var(--t3)' }} />
            </button>
          ))}
        </div>
      </div>

      <div className="mt" ref={detailRef}>
        <div className="split">
          <div className="card" style={{ padding: 28 }}>
            <div className="row sp wrap" style={{ alignItems: 'flex-start' }}>
              <div>
                <div className="eyebrow" style={selected.special ? { color: 'var(--red)' } : undefined}>
                  {position}
                </div>
                <h1 style={{ fontSize: 24 }}>{selected.title}</h1>
                <p className="lead mt1">{selected.description}</p>
              </div>
              {canManage ? (
                <div className="row">
                  <button className="btn sm" onClick={() => openFlowForm(selected)}>
                    <Icon name="pencil" />
                    Edit tahap
                  </button>
                  <button className="btn sm danger" onClick={confirmDelete}>
                    <Icon name="trash-2" />
                    Hapus
                  </button>
                </div>
              ) : null}
            </div>

            <div className="grid g2 mt2">
              <div className="card soft">
                <div className="kh">
                  <Icon name="target" />
                  <h3>1. Tujuan Tahapan</h3>
                </div>
                <p className="sm">{selected.goal}</p>
              </div>
              <div className="card soft">
                <div className="kh">
                  <Icon name="clock" />
                  <h3>2. Kapan Digunakan</h3>
                </div>
                <p className="sm">{selected.whenToUse}</p>
              </div>
            </div>

            <div className="mt2">
              <div className="kh">
                <Icon name="search" />
                <h3>3. Informasi yang Harus Digali</h3>
              </div>
              <div className="chips">
                {selected.info.map((item) => (
                  <span className="tag" style={{ fontSize: 12.5, padding: '5px 11px' }} key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt2">
              <div className="kh">
                <Icon name="list-checks" />
                <h3>4. Langkah yang Harus Dilakukan Admin</h3>
              </div>
              <ol className="steps">
                {selected.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>

            <div className="mt2">
              <div className="kh">
                <Icon name="message-circle" />
                <h3>5. Contoh Percakapan</h3>
              </div>
              <div className="convo">
                <ChatBubbles text={selected.example} />
              </div>
            </div>

            <div
              className="row sp mt2 wrap"
              style={{ borderTop: '1px solid var(--b)', paddingTop: 16 }}
            >
              {previous ? (
                <button className="btn" onClick={() => select(previous.id)}>
                  <Icon name="chevron-left" />
                  Sebelumnya
                </button>
              ) : (
                <button className="btn" disabled>
                  <Icon name="chevron-left" />
                  Sebelumnya
                </button>
              )}
              {next ? (
                <button className="btn p" onClick={() => select(next.id)}>
                  Tahap berikutnya
                  <Icon name="chevron-right" />
                </button>
              ) : (
                <button className="btn p" disabled>
                  Tahap berikutnya
                  <Icon name="chevron-right" />
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="card">
              <div className="kh">
                <Icon name="ban" style={{ color: 'var(--red)' }} />
                <h3>6. Kesalahan yang Harus Dihindari</h3>
              </div>
              <ul className="dots">
                {selected.avoid.map((item) => (
                  <li key={item}>
                    <Icon name="x" style={{ color: 'var(--red)' }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="card mt">
              <div className="kh">
                <Icon name="corner-down-right" />
                <h3>7. Langkah Berikutnya</h3>
              </div>
              <p className="sm" style={{ fontWeight: 500 }}>
                {selected.nextStep}
              </p>
            </div>
            <div className="card mt">
              <div className="kh">
                <Icon name="message-square-text" />
                <h3>8. Script Terkait</h3>
              </div>
              {relatedScripts.length ? (
                relatedScripts.map((script) => (
                  <Link
                    className="ref"
                    href={`/scripts?tab=script&open=${encodeURIComponent(script.id)}`}
                    key={script.id}
                  >
                    <Icon name="file-text" />
                    <span style={{ flex: 1 }}>
                      {script.title}
                      <span className="xs muted" style={{ display: 'block' }}>
                        {script.category}
                      </span>
                    </span>
                    <Icon name="chevron-right" />
                  </Link>
                ))
              ) : (
                <p className="sm muted">Belum ada script di kategori terkait.</p>
              )}
              {selected.scriptCategories.length ? (
                <Link
                  className="btn sm ghost mt1"
                  href={`/scripts?tab=script&cat=${encodeURIComponent(selected.scriptCategories[0])}`}
                >
                  Buka Script Library
                  <Icon name="arrow-right" />
                </Link>
              ) : null}
            </div>
            <div className="card mt">
              <div className="kh">
                <Icon name="life-buoy" />
                <h3>9. Problem Solving Terkait</h3>
              </div>
              {relatedProblems.length ? (
                relatedProblems.map((problem) =>
                  problem ? (
                    <Link className="ref" href={`/problems?id=${encodeURIComponent(problem.id)}`} key={problem.id}>
                      <Icon name="alert-circle" />
                      <span style={{ flex: 1 }}>{problem.title}</span>
                      <Icon name="chevron-right" />
                    </Link>
                  ) : null,
                )
              ) : (
                <p className="sm muted">Tidak ada kasus khusus untuk tahap ini.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
