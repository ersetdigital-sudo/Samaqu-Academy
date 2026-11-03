'use client';

import { AppLink as Link } from '@/components/ui/AppLink';
import { useEffect, useRef, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useModal } from '@/components/providers/ModalProvider';
import { useRole } from '@/components/providers/RoleProvider';
import { useSession } from '@/components/providers/SessionProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { RecordForm } from '@/components/ui/RecordForm';
import { ScoreBars } from '@/components/ui/ScoreBars';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { Note } from '@/components/ui/Note';
import { LevelTag } from '@/components/ui/badges';
import { analyzeConversation } from '@/lib/ai/reviewer';
import {
  invokeAi,
  type ReviewerRemoteResult,
  type SimulatorRemoteResult,
} from '@/lib/ai/remote';
import { nextCustomerMessage } from '@/lib/ai/simulator';
import { SCENARIO_ICONS, SCENARIO_LEVELS } from '@/lib/constants';
import { scenarioFields } from '@/lib/form-schemas';
import { scenarioAttempts } from '@/lib/stats';
import type { Scenario } from '@/lib/types';
import { newId } from '@/lib/utils/id';

const EVAL_DIMENSIONS = [
  'Pemahaman konteks',
  'Kejelasan',
  'Naturalitas',
  'Empati',
  'Proaktif',
  'Manajemen ekspektasi',
  'Closing',
];

export function SimulatorView() {
  const { snapshot, upsertContent, deleteContent, logActivity } = useData();
  const { canManage } = useRole();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();
  const { simulator, setSimulator } = useSession();
  const [category, setCategory] = useState('Semua');
  const [level, setLevel] = useState('Semua');
  const [input, setInput] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [mode, setMode] = useState<'idle' | 'remote' | 'local'>('idle');
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scenarios = snapshot.content.scenarios;
  const scenario = simulator
    ? scenarios.find((entry) => entry.id === simulator.scenarioId) ?? null
    : null;
  const material = scenario?.materialId
    ? snapshot.content.materials.find((entry) => entry.id === scenario.materialId)
    : null;

  useEffect(() => {
    const element = chatRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [simulator?.log.length, simulator?.busy, simulator?.ended, evaluating]);

  useEffect(() => {
    if (simulator && !simulator.busy && !simulator.done && !simulator.ended) {
      inputRef.current?.focus();
    }
  }, [simulator]);

  const startSim = (current: Scenario) => {
    setSimulator({
      scenarioId: current.id,
      turn: 0,
      log: [['c', current.messages[0] ?? '']],
      ended: false,
      busy: false,
      done: false,
    });
    setMode('idle');
    setInput('');
  };

  const sendSim = async () => {
    if (!simulator || !scenario || simulator.busy || simulator.done || simulator.ended) return;
    const value = input.trim();
    if (!value) return;
    const current = simulator;
    const nextTurn = current.turn + 1;
    setSimulator({
      ...current,
      log: [...current.log, ['a', value]],
      turn: nextTurn,
      busy: true,
    });
    setInput('');
    const history = [...current.log, ['a', value] as ['c' | 'a', string]].map(([role, text]) => ({
      role,
      text,
    }));
    const remote = await invokeAi<SimulatorRemoteResult>('simulator', {
      scenario: {
        title: scenario.title,
        category: scenario.category,
        level: scenario.level,
        situation: scenario.situation,
        objective: scenario.objective,
      },
      history,
    });
    let nextMessage: string | null;
    if (remote.ok && remote.data) {
      setMode('remote');
      nextMessage = remote.data.done ? null : remote.data.message;
    } else {
      setMode('local');
      nextMessage = await nextCustomerMessage(scenario, nextTurn);
      console.warn('[simulator] remote gagal', remote.code, remote.error);
      if (remote.code !== 'not_configured') {
        showToast(
          remote.error || 'Mimo tidak tersedia. Memakai alur skenario lokal.',
          'err',
        );
      }
    }
    setSimulator((previous) => {
      if (!previous || previous.scenarioId !== scenario.id) return previous;
      const log = nextMessage
        ? [...previous.log, ['c', nextMessage] as ['c' | 'a', string]]
        : previous.log;
      return { ...previous, busy: false, done: !nextMessage, log };
    });
    if (!nextMessage) {
      showToast('Percakapan selesai. Klik "Akhiri & Evaluasi".');
    }
  };

  const endSim = async () => {
    if (!simulator || !scenario) return;
    if (!simulator.log.some(([role]) => role === 'a')) {
      showToast('Kirim minimal satu balasan sebelum evaluasi', 'err');
      return;
    }
    setEvaluating(true);
    const messages = simulator.log.map(([role, text]) => ({ role, text }));
    const remote = await invokeAi<ReviewerRemoteResult>('reviewer', { messages });
    let result;
    if (remote.ok && remote.data) {
      setMode('remote');
      result = remote.data.result;
    } else {
      setMode('local');
      result = await analyzeConversation(messages, {
        products: snapshot.content.products,
        scripts: snapshot.content.scripts,
        cases: snapshot.content.cases,
      });
      console.warn('[simulator] remote gagal', remote.code, remote.error);
      if (remote.code !== 'not_configured') {
        showToast(
          remote.error || 'Mimo tidak tersedia. Evaluasi memakai skor heuristik lokal.',
          'err',
        );
      }
    }
    setSimulator((previous) =>
      previous && previous.scenarioId === scenario.id
        ? { ...previous, ended: true, busy: false, done: true, result }
        : previous,
    );
    setEvaluating(false);
    void logActivity('scenario', scenario.title, result.overall, scenario.id);
  };

  const openPreview = (current: Scenario) => {
    const relatedMaterial = current.materialId
      ? snapshot.content.materials.find((entry) => entry.id === current.materialId)
      : null;
    openModal(
      <>
        <div className="row sp">
          <div className="row" style={{ gap: 6 }}>
            <span className="tag">{current.category}</span>
            <LevelTag level={current.level} />
          </div>
          <button className="icb" onClick={closeModal} aria-label="Tutup">
            <Icon name="x" />
          </button>
        </div>
        <h2 className="mt">{current.title}</h2>
        <div className="grid g2 mt">
          <div className="card soft">
            <div className="kh">
              <Icon name="user" />
              <h3>Situasi Customer</h3>
            </div>
            <p className="sm">{current.situation}</p>
          </div>
          <div className="card soft">
            <div className="kh">
              <Icon name="target" />
              <h3>Tujuan Pembelajaran</h3>
            </div>
            <p className="sm">{current.objective}</p>
          </div>
        </div>
        <div className="mt2">
          <div className="kh">
            <Icon name="messages-square" />
            <h3>Alur Pesan Customer</h3>
          </div>
          <div className="convo">
            {current.messages.map((message, index) => (
              <div key={`${index}-${message}`}>
                <div className="who">Putaran {index + 1}</div>
                <div className="bubble bc">{message}</div>
              </div>
            ))}
          </div>
        </div>
        {relatedMaterial ? (
          <Link
            className="ref mt"
            href={`/learning?id=${encodeURIComponent(relatedMaterial.id)}`}
          >
            <Icon name="book-open" />
            <span style={{ flex: 1 }}>Materi terkait: {relatedMaterial.title}</span>
            <Icon name="chevron-right" />
          </Link>
        ) : null}
        <div className="mfoot">
          <button className="btn" onClick={closeModal}>
            Tutup
          </button>
          <button
            className="btn p"
            onClick={() => {
              closeModal();
              startSim(current);
            }}
          >
            <Icon name="play" />
            Mulai Simulasi
          </button>
        </div>
      </>,
      { large: true },
    );
  };

  const openScenarioForm = (current?: Scenario) => {
    openModal(
      <RecordForm
        key={current?.id ?? 'new-scenario'}
        title={current ? 'Edit Skenario' : 'Tambah Skenario'}
        subtitle="Kolom bertanda * wajib diisi."
        fields={scenarioFields(snapshot.content.materials)}
        initial={current ?? {}}
        defaults={{
          category: category !== 'Semua' ? category : 'Greeting & Opening',
          level: 'Mudah',
        }}
        submitLabel={current ? 'Simpan Perubahan' : 'Tambahkan'}
        validate={(values) => {
          const messages = Array.isArray(values.messages) ? values.messages : [];
          return messages.length < 2 ? 'Alur pesan customer minimal 2 baris' : null;
        }}
        onSubmit={async (values) => {
          const messages = Array.isArray(values.messages) ? values.messages : [];
          if (messages.length < 2) throw new Error('Alur pesan customer minimal 2 baris');
          const item: Scenario = {
            id: current?.id ?? newId('scn'),
            title: String(values.title),
            category: String(values.category),
            level: values.level as Scenario['level'],
            situation: String(values.situation),
            objective: String(values.objective),
            messages,
            materialId: String(values.materialId),
            sample: false,
            updatedAt: Date.now(),
          };
          await upsertContent('scenarios', item);
          closeModal();
          showToast(current ? 'Perubahan berhasil disimpan' : 'Skenario berhasil ditambahkan');
        }}
        onCancel={closeModal}
      />,
      { large: true },
    );
  };

  const confirmDelete = (current: Scenario) => {
    openModal(
      <ConfirmDialog
        title="Hapus skenario ini?"
        message={`"${current.title}" akan dihapus.`}
        onCancel={closeModal}
        onConfirm={async () => {
          await deleteContent('scenarios', current.id);
          closeModal();
          showToast('Skenario berhasil dihapus');
        }}
      />,
    );
  };

  if (simulator && !scenario) {
    return (
      <EmptyState
        icon="messages-square"
        title="Skenario tidak ditemukan"
        subtitle="Skenario mungkin sudah dihapus. Mulai dari daftar skenario."
        action={
          <button className="btn" onClick={() => setSimulator(null)}>
            <Icon name="arrow-left" />
            Semua skenario
          </button>
        }
      />
    );
  }

  if (simulator && scenario) {
    const attempts = scenarioAttempts(snapshot.activity, scenario.id);
    return (
      <>
        <div className="row sp wrap" style={{ marginBottom: 18 }}>
          <button
            className="btn ghost"
            onClick={() => setSimulator(null)}
          >
            <Icon name="arrow-left" />
            Semua skenario
          </button>
          <div className="row">
            <span className={`tag ${mode === 'local' ? 'yl' : 'gr'}`}>
              <Icon name={mode === 'local' ? 'flask-conical' : 'bot'} />
              {mode === 'remote'
                ? 'Customer: Xiaomi MiMo'
                : mode === 'local'
                  ? 'Fallback skenario lokal'
                  : 'Xiaomi MiMo + fallback'}
            </span>
            {simulator.ended ? null : (
              <button className="btn" onClick={endSim} disabled={evaluating || simulator.busy}>
                <Icon name="square" />
                {evaluating ? 'Mengevaluasi…' : 'Akhiri & Evaluasi'}
              </button>
            )}
          </div>
        </div>

        <div className="split">
          <div className="card">
            <div className="row sp wrap">
              <div>
                <div className="eyebrow">{scenario.category}</div>
                <h2>{scenario.title}</h2>
              </div>
              <div className="row">
                <LevelTag level={scenario.level} />
                <span className="tag">
                  Putaran {Math.min(simulator.turn + 1, scenario.messages.length)}/
                  {scenario.messages.length}
                </span>
              </div>
            </div>

            <div className="chat mt" ref={chatRef}>
              {simulator.log.map(([role, text], index) => (
                <div
                  key={`${index}-${text}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: role === 'c' ? 'flex-start' : 'flex-end',
                  }}
                >
                  <div className="who">{role === 'c' ? 'Customer (simulasi)' : 'Kamu'}</div>
                  <div className={`bubble ${role === 'c' ? 'bc' : 'ba'}`}>{text}</div>
                </div>
              ))}
              {simulator.busy ? (
                <div className="bubble bc typing">
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}
              {simulator.done && !simulator.ended ? (
                <div className="xs muted" style={{ textAlign: 'center' }}>
                  Customer sudah selesai. Klik &quot;Akhiri &amp; Evaluasi&quot;.
                </div>
              ) : null}
            </div>

            {simulator.ended ? null : (
              <div className="cin">
                <input
                  ref={inputRef}
                  className="inp"
                  placeholder="Ketik balasan sebagai admin…"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void sendSim();
                  }}
                  disabled={simulator.busy || simulator.done}
                />
                <button
                  className="btn p"
                  onClick={() => void sendSim()}
                  disabled={simulator.busy || simulator.done}
                >
                  <Icon name="send" />
                </button>
              </div>
            )}
          </div>

          <div className="card">
            {simulator.ended && simulator.result ? (
              <>
                <div className="row" style={{ gap: 16 }}>
                  <ScoreRing value={simulator.result.overall} label="Skor" />
                  <div>
                    <h3>Evaluasi Simulasi</h3>
                    <p className="xs muted">
                      {simulator.result.adminCount} balasan ·{' '}
                      {mode === 'remote' ? 'dinilai Xiaomi MiMo' : 'skor heuristik lokal'}
                    </p>
                    {attempts.length ? (
                      <p className="xs muted">
                        {attempts.length}x latihan · skor terbaik{' '}
                        {Math.max(...attempts.map((item) => item.score ?? 0))}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div>
                  <ScoreBars
                    items={simulator.result.dims.filter((dimension) =>
                      EVAL_DIMENSIONS.includes(dimension.name),
                    )}
                  />
                </div>
                <h3 className="mt2">Saran Perbaikan</h3>
                <ul className="dots mt1">
                  {(simulator.result.improve.length
                    ? simulator.result.improve
                    : ['Pertahankan! Coba skenario dengan tingkat kesulitan lebih tinggi.']
                  )
                    .slice(0, 5)
                    .map((item) => (
                      <li key={item}>
                        <Icon name="arrow-right" style={{ color: 'var(--warn)' }} />
                        {item}
                      </li>
                    ))}
                </ul>
                {simulator.result.good.length ? (
                  <>
                    <h3 className="mt">Sudah Baik</h3>
                    <ul className="dots mt1">
                      {simulator.result.good.slice(0, 4).map((item) => (
                        <li key={item}>
                          <Icon name="check" style={{ color: 'var(--acc)' }} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
                {material ? (
                  <Link className="ref mt" href={`/learning?id=${encodeURIComponent(material.id)}`}>
                    <Icon name="book-open" />
                    <span style={{ flex: 1 }}>Pelajari: {material.title}</span>
                    <Icon name="chevron-right" />
                  </Link>
                ) : null}
                <div className="row mt wrap">
                  <button className="btn p" onClick={() => startSim(scenario)}>
                    <Icon name="rotate-ccw" />
                    Ulangi
                  </button>
                  <button className="btn" onClick={() => setSimulator(null)}>
                    Skenario lain
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="kh">
                  <Icon name="user" />
                  <h3>Situasi</h3>
                </div>
                <p className="sm">{scenario.situation}</p>
                <div className="kh mt">
                  <Icon name="target" />
                  <h3>Tujuan</h3>
                </div>
                <p className="sm">{scenario.objective}</p>
                <Note variant="green" className="mt">
                  Sapa dengan hangat, gali kebutuhan, beri informasi dari data resmi, lalu arahkan ke
                  langkah berikutnya.
                </Note>
                {material ? (
                  <Link className="ref mt" href={`/learning?id=${encodeURIComponent(material.id)}`}>
                    <Icon name="book-open" />
                    <span style={{ flex: 1 }}>{material.title}</span>
                    <Icon name="chevron-right" />
                  </Link>
                ) : null}
                <Link
                  className="ref"
                  href={`/scripts?tab=script&cat=${encodeURIComponent(scenario.category)}`}
                >
                  <Icon name="message-square-text" />
                  <span style={{ flex: 1 }}>Script {scenario.category}</span>
                  <Icon name="chevron-right" />
                </Link>
              </>
            )}
          </div>
        </div>
      </>
    );
  }

  const categories = [...new Set(scenarios.map((entry) => entry.category))];
  const filtered = scenarios.filter(
    (entry) =>
      (category === 'Semua' || entry.category === category) &&
      (level === 'Semua' || entry.level === level),
  );

  return (
    <>
      <PageHeader
        eyebrow="Learning & Service"
        title="Chat Scenario"
        subtitle="Latihan percakapan: customer dimainkan oleh Xiaomi MiMo atau alur skenario, kamu berperan sebagai admin."
        actions={
          <>
            <span className={`tag ${mode === 'local' ? 'yl' : 'gr'}`}>
              <Icon name="bot" />
              {mode === 'local' ? 'Fallback lokal' : 'Xiaomi MiMo + fallback'}
            </span>
            {canManage ? (
              <button className="btn p" onClick={() => openScenarioForm()}>
                <Icon name="plus" />
                Tambah Skenario
              </button>
            ) : null}
          </>
        }
      />

      <div style={{ marginBottom: 18 }}>
        <Note variant="neutral">
          Bila AI aktif, customer dimainkan oleh Xiaomi MiMo berdasarkan skenario dan evaluasi
          dilakukan oleh model. Bila layanan AI tidak tersedia, aplikasi memakai alur pesan skenario
          dan skor heuristik lokal sebagai fallback.
        </Note>
      </div>

      <div className="toolbar">
        <select
          className="inp auto"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Filter kategori skenario"
        >
          <option value="Semua">Semua kategori</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <div className="seg" aria-label="Filter tingkat kesulitan">
          {['Semua', ...SCENARIO_LEVELS].map((value) => (
            <button
              key={value}
              className={level === value ? 'on' : ''}
              onClick={() => setLevel(value)}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {filtered.length ? (
        <div className="grid g3">
          {filtered.map((entry) => {
            const attempts = scenarioAttempts(snapshot.activity, entry.id);
            const best = attempts.length
              ? Math.max(...attempts.map((item) => item.score ?? 0))
              : null;
            return (
              <div className="card" key={entry.id} style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="row sp">
                  <span className="sic">
                    <Icon name={SCENARIO_ICONS[entry.category] ?? 'messages-square'} />
                  </span>
                  <LevelTag level={entry.level} />
                </div>
                <h3 className="mt" style={{ fontSize: 15.5 }}>
                  {entry.title}
                </h3>
                <div className="xs muted">
                  {entry.category} · {entry.messages.length} putaran
                </div>
                <p className="sm muted mt1" style={{ flex: 1 }}>
                  {entry.situation}
                </p>
                {best != null ? (
                  <div className="xs mt1">
                    Skor terbaik: <b>{best}</b> · {attempts.length}x latihan
                  </div>
                ) : null}
                <div className="row mt wrap">
                  <button className="btn p sm" onClick={() => startSim(entry)}>
                    <Icon name="play" />
                    Mulai
                  </button>
                  <button className="btn sm" onClick={() => openPreview(entry)}>
                    <Icon name="eye" />
                    Preview
                  </button>
                  {canManage ? (
                    <>
                      <button className="btn sm" onClick={() => openScenarioForm(entry)}>
                        <Icon name="pencil" />
                        Edit
                      </button>
                      <button className="btn sm danger" onClick={() => confirmDelete(entry)}>
                        <Icon name="trash-2" />
                        Hapus
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon="messages-square"
          title="Tidak ada skenario"
          subtitle="Ubah filter atau tambahkan skenario baru."
        />
      )}
    </>
  );
}
