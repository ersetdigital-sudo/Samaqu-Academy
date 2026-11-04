'use client';

import { AppLink as Link } from '@/components/ui/AppLink';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { SeverityTag } from '@/components/ui/badges';
import { HEARD_FRAMEWORK, PROBLEM_GROUPS } from '@/lib/constants';
import { PROBLEM_FIELDS } from '@/lib/form-schemas';
import { problemsSeenCount } from '@/lib/stats';
import type { Problem, Severity } from '@/lib/types';
import { newId } from '@/lib/utils/id';

export function ProblemsView() {
  const { snapshot, upsertContent, deleteContent, markProblemSeen } = useData();
  const { canManage } = useRole();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const openId = searchParams.get('id');
  const [group, setGroup] = useState('Semua');
  const [query, setQuery] = useState('');
  const openedRef = useRef<string | null>(null);
  const openDetailRef = useRef<(id: string) => boolean>(() => false);

  const problems = snapshot.content.problems;
  const seen = problemsSeenCount(problems, snapshot.progress);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return problems.filter((problem) => {
      if (group !== 'Semua' && problem.group !== group) return false;
      if (!search) return true;
      return [problem.title, problem.situation, problem.concern, problem.understand]
        .join(' ')
        .toLowerCase()
        .includes(search);
    });
  }, [group, problems, query]);

  const openProblemDetail = (problem: Problem) => {
    void markProblemSeen(problem.id);
    const scripts = snapshot.content.scripts.filter((script) =>
      problem.scriptCategories.includes(script.category),
    );
    const cases = snapshot.content.cases.filter((caseStudy) =>
      problem.scriptCategories.includes(caseStudy.category),
    );

    const Section = ({ icon, title, children }: { icon: string; title: string; children: ReactNode }) => (
      <div className="mt2">
        <div className="kh">
          <Icon name={icon} />
          <h3>{title}</h3>
        </div>
        {children}
      </div>
    );

    openModal(
      <>
        <div className="row sp" style={{ alignItems: 'flex-start' }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <span className="tag">{problem.group}</span>
            <SeverityTag severity={problem.severity} />
          </div>
          <button className="icb" onClick={closeModal} aria-label="Tutup">
            <Icon name="x" />
          </button>
        </div>
        <h1 className="mt" style={{ fontSize: 23 }}>
          {problem.title}
        </h1>
        <p className="lead mt1">{problem.situation}</p>

        <div className="grid g2 mt">
          <div className="card soft">
            <div className="kh">
              <Icon name="message-circle-warning" />
              <h3>Kekhawatiran Customer</h3>
            </div>
            <p className="sm">{problem.concern}</p>
          </div>
          <div className="card soft">
            <div className="kh">
              <Icon name="lightbulb" />
              <h3>Yang Perlu Dipahami Admin</h3>
            </div>
            <p className="sm">{problem.understand}</p>
          </div>
        </div>

        <div className="grid g2">
          <div>
            <Section icon="clipboard-list" title="Informasi yang Dikumpulkan">
              <ul className="dots">
                {problem.collect.map((item) => (
                  <li key={item}>
                    <Icon name="circle-dot" />
                    {item}
                  </li>
                ))}
              </ul>
            </Section>
          </div>
          <div>
            <Section icon="search" title="Cek Secara Internal">
              {problem.checks.length ? (
                <ul className="dots">
                  {problem.checks.map((item) => (
                    <li key={item}>
                      <Icon name="circle-dot" />
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="sm muted">—</p>
              )}
            </Section>
          </div>
        </div>

        <Section icon="list-checks" title="Proses Penanganan">
          <ol className="steps">
            {problem.process.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </Section>

        {problem.example ? (
          <Section icon="message-circle" title="Contoh Percakapan">
            <div className="convo">
              <ChatBubbles text={problem.example} />
            </div>
          </Section>
        ) : null}

        <Section icon="ban" title="Yang Harus Dihindari">
          <ul className="dots">
            {problem.avoid.map((item) => (
              <li key={item}>
                <Icon name="x" style={{ color: 'var(--red)' }} />
                {item}
              </li>
            ))}
          </ul>
        </Section>

        <div className="grid g2 mt2">
          <div className="note nt">
            <Icon name="arrow-up-right" />
            <div>
              <b>Eskalasi</b>
              <div>{problem.escalation}</div>
            </div>
          </div>
          {problem.sop ? (
            <div className="note gn">
              <Icon name="shield-check" />
              <div>
                <b>Referensi SOP</b>
                <div>{problem.sop}</div>
              </div>
            </div>
          ) : (
            <div className="note">
              <Icon name="shield-alert" />
              <div>
                <b>Kebijakan belum dikonfigurasi</b>
                <div>
                  Jangan menjanjikan refund, tukar, ongkir, atau garansi. Verifikasi ke supervisor
                  sebelum memberi solusi.
                </div>
              </div>
            </div>
          )}
        </div>

        <Section icon="link" title="Referensi Terkait">
          <div className="grid g2">
            {scripts.map((script) => (
              <Link
                className="ref"
                href={`/scripts?tab=script&open=${encodeURIComponent(script.id)}`}
                key={script.id}
              >
                <Icon name="file-text" />
                <span style={{ flex: 1 }}>
                  {script.title}
                  <span className="xs muted" style={{ display: 'block' }}>
                    Script · {script.category}
                  </span>
                </span>
              </Link>
            ))}
            {cases.map((caseStudy) => (
              <Link
                className="ref"
                href={`/scripts?tab=case&open=${encodeURIComponent(caseStudy.id)}`}
                key={caseStudy.id}
              >
                <Icon name="briefcase" />
                <span style={{ flex: 1 }}>
                  {caseStudy.title}
                  <span className="xs muted" style={{ display: 'block' }}>
                    Studi kasus · {caseStudy.category}
                  </span>
                </span>
              </Link>
            ))}
          </div>
          {!scripts.length && !cases.length ? <p className="sm muted">Belum ada referensi.</p> : null}
        </Section>

        {canManage ? (
          <div className="mfoot">
            <button className="btn" onClick={() => openProblemForm(problem)}>
              <Icon name="pencil" />
              Edit
            </button>
            <button
              className="btn p"
              style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
              onClick={() => confirmDelete(problem)}
            >
              <Icon name="trash-2" />
              Hapus
            </button>
          </div>
        ) : null}
      </>,
      { large: true },
    );
  };

  const openProblemForm = (current?: Problem, defaults?: Partial<Problem>) => {
    openModal(
      <RecordForm
        key={current?.id ?? 'new-problem'}
        title={current ? 'Edit Kasus Problem Solving' : 'Tambah Kasus Problem Solving'}
        subtitle="Kolom bertanda * wajib diisi."
        fields={PROBLEM_FIELDS}
        initial={current ?? defaults ?? {}}
        defaults={{
          group: group !== 'Semua' ? group : PROBLEM_GROUPS[0],
          severity: 'Sedang' as Severity,
        }}
        submitLabel={current ? 'Simpan Perubahan' : 'Tambahkan'}
        onSubmit={async (values) => {
          const item: Problem = {
            id: current?.id ?? newId('prb'),
            title: String(values.title),
            group: String(values.group),
            severity: values.severity as Severity,
            situation: String(values.situation),
            concern: String(values.concern),
            understand: String(values.understand),
            collect: Array.isArray(values.collect) ? values.collect : [],
            process: Array.isArray(values.process) ? values.process : [],
            checks: Array.isArray(values.checks) ? values.checks : [],
            example: String(values.example),
            avoid: Array.isArray(values.avoid) ? values.avoid : [],
            escalation: String(values.escalation),
            sop: String(values.sop),
            scriptCategories: Array.isArray(values.scriptCategories) ? values.scriptCategories : [],
            sample: false,
            updatedAt: Date.now(),
          };
          await upsertContent('problems', item);
          closeModal();
          showToast(current ? 'Perubahan berhasil disimpan' : 'Kasus berhasil ditambahkan');
        }}
        onCancel={closeModal}
      />,
      { large: true },
    );
  };

  const confirmDelete = (problem: Problem) => {
    openModal(
      <ConfirmDialog
        title="Hapus kasus ini?"
        message={`"${problem.title}" akan dihapus. Tindakan ini tidak dapat dibatalkan.`}
        onCancel={closeModal}
        onConfirm={async () => {
          await deleteContent('problems', problem.id);
          closeModal();
          showToast('Kasus berhasil dihapus');
        }}
      />,
    );
  };

  openDetailRef.current = (id: string) => {
    const problem = problems.find((entry) => entry.id === id);
    if (!problem) return false;
    openProblemDetail(problem);
    return true;
  };

  useEffect(() => {
    if (!openId || openedRef.current === openId) return;
    if (openDetailRef.current(openId)) openedRef.current = openId;
  }, [openId, problems]);

  return (
    <>
      <PageHeader
        eyebrow="Learning & Service"
        title="Problem Solving"
        subtitle="Pusat penanganan masalah customer. Pelajari cara berpikirnya: pahami situasi, kumpulkan informasi, cek SOP, lalu beri solusi."
        actions={
          <>
            <span className="tag gr">
              {seen}/{problems.length} dipelajari
            </span>
            {canManage ? (
              <button className="btn p" onClick={() => openProblemForm()}>
                <Icon name="plus" />
                Tambah Kasus
              </button>
            ) : null}
          </>
        }
      />

      <div className="card flat" style={{ padding: '16px 18px', marginBottom: 18 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <b className="sm" style={{ marginRight: 6 }}>
            Kerangka HEARD
          </b>
          {HEARD_FRAMEWORK.map(([letter, name, description]) => (
            <span
              className="row"
              style={{
                gap: 8,
                padding: '6px 12px 6px 6px',
                border: '1px solid var(--b)',
                borderRadius: 99,
                background: 'var(--gl2)',
              }}
              key={letter}
            >
              <span
                className="tdot"
                style={{
                  width: 24,
                  height: 24,
                  fontSize: 11,
                  borderWidth: 0,
                  background: 'var(--g)',
                  color: '#fff',
                }}
              >
                {letter}
              </span>
              <span className="xs">
                <b>{name}</b> · <span className="muted">{description}</span>
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="toolbar">
        <div className="search">
          <Icon name="search" />
          <input
            className="inp"
            placeholder="Cari masalah…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Cari masalah"
          />
        </div>
        <div className="seg" aria-label="Filter kelompok masalah">
          {['Semua', ...PROBLEM_GROUPS].map((value) => (
            <button
              key={value}
              className={group === value ? 'on' : ''}
              onClick={() => setGroup(value)}
            >
              {value}{' '}
              <span className="n">
                {value === 'Semua'
                  ? problems.length
                  : problems.filter((problem) => problem.group === value).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length ? (
        <div className="grid g3">
          {filtered.map((problem) => (
            <div
              className="card ck"
              key={problem.id}
              style={{ display: 'flex', flexDirection: 'column' }}
              role="link"
              tabIndex={0}
              onClick={() => openProblemDetail(problem)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openProblemDetail(problem);
                }
              }}
            >
              <div className="row sp" style={{ gap: 6 }}>
                <span className="tag">{problem.group}</span>
                <span className="row" style={{ gap: 4 }}>
                  {snapshot.progress.problems[problem.id] ? (
                    <span className="tag gr">
                      <Icon name="check" size={12} />
                      Dipelajari
                    </span>
                  ) : null}
                  <SeverityTag severity={problem.severity} />
                </span>
              </div>
              <h3 className="mt" style={{ fontSize: 15.5 }}>
                {problem.title}
              </h3>
              <p className="sm muted mt1" style={{ flex: 1 }}>
                {problem.concern}
              </p>
              {problem.sop ? null : (
                <div className="xs mt1" style={{ color: 'var(--warn)' }}>
                  <Icon name="shield-alert" size={13} style={{ verticalAlign: -2 }} /> SOP belum
                  dikonfigurasi
                </div>
              )}
              <div className="row mt wrap">
                <button
                  className="btn sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    openProblemDetail(problem);
                  }}
                >
                  <Icon name="book-open" />
                  Pelajari
                </button>
                {canManage ? (
                  <>
                    <button
                      className="btn sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        openProblemForm(problem);
                      }}
                    >
                      <Icon name="pencil" />
                      Edit
                    </button>
                    <button
                      className="btn sm danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        confirmDelete(problem);
                      }}
                    >
                      <Icon name="trash-2" />
                      Hapus
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={query ? 'search-x' : 'life-buoy'}
          title={query ? 'Tidak ada hasil' : 'Belum ada kasus'}
          subtitle={query ? 'Coba kata kunci lain.' : 'Tambahkan kasus pertama.'}
          action={
            canManage ? (
              <button className="btn sm" onClick={() => openProblemForm()}>
                <Icon name="plus" />
                Tambah Kasus
              </button>
            ) : null
          }
        />
      )}
    </>
  );
}
