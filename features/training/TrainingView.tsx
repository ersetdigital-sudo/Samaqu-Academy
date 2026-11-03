'use client';

import { AppLink as Link } from '@/components/ui/AppLink';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useData } from '@/components/providers/DataProvider';
import { useModal } from '@/components/providers/ModalProvider';
import { useRole } from '@/components/providers/RoleProvider';
import { useSession } from '@/components/providers/SessionProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RecordForm } from '@/components/ui/RecordForm';
import { ScoreRing } from '@/components/ui/ScoreRing';
import { QUIZ_FIELDS } from '@/lib/form-schemas';
import { bestScore } from '@/lib/stats';
import {
  TRAINING_STAGES,
  buildTrainingContext,
  getNextStep,
  getStageProgress,
  getTrainingProgress,
  type TrainingContext,
} from '@/lib/training';
import type {
  AcademySnapshot,
  AssessmentAttempt,
  QuizQuestion,
  QuizRuntime,
} from '@/lib/types';
import { formatDate, formatDateTime, scoreTagClass } from '@/lib/utils/format';
import { newId } from '@/lib/utils/id';

type Tab = 'path' | 'assessment' | 'results';

export function TrainingView() {
  const {
    snapshot,
    saveAttempt,
    logActivity,
    upsertContent,
    deleteContent,
    setPassMark,
  } = useData();
  const { canManage } = useRole();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();
  const { quiz, setQuiz } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const tab: Tab = tabParam === 'assessment' || tabParam === 'results' ? tabParam : 'path';
  const context = buildTrainingContext(snapshot);
  const trainingPct = getTrainingProgress(context);
  const next = getNextStep(context);
  const passMark = snapshot.settings.passMark;
  const questions = snapshot.content.quiz;
  const best = bestScore(snapshot.attempts);

  const setTab = (nextTab: Tab) => {
    router.replace(`/training?tab=${nextTab}`, { scroll: false });
  };

  const startQuiz = () => {
    const ids = questions.map((question) => question.id);
    if (!ids.length) {
      showToast('Belum ada soal. Tambahkan soal terlebih dahulu.', 'err');
      return;
    }
    setQuiz({ ids, index: 0, answers: {}, done: false });
    setTab('assessment');
  };

  const answerQuestion = (questionId: string, optionIndex: number) => {
    setQuiz((previous) =>
      previous
        ? { ...previous, answers: { ...previous.answers, [questionId]: optionIndex } }
        : previous,
    );
  };

  const moveQuiz = (delta: number) => {
    setQuiz((previous) =>
      previous
        ? {
            ...previous,
            index: Math.max(0, Math.min(previous.ids.length - 1, previous.index + delta)),
          }
        : previous,
    );
  };

  const cancelQuiz = () => {
    if (typeof window !== 'undefined' && !window.confirm('Batalkan kuis? Jawaban tidak disimpan.')) {
      return;
    }
    setQuiz(null);
    setTab('assessment');
  };

  const finishQuiz = async () => {
    if (!quiz) return;
    const selected = quiz.ids
      .map((id) => questions.find((question) => question.id === id))
      .filter(Boolean) as QuizQuestion[];
    const correct = selected.filter((question) => quiz.answers[question.id] === question.correct - 1);
    const score = selected.length ? Math.round((correct.length / selected.length) * 100) : 0;
    const attempt: AssessmentAttempt = {
      id: newId('att'),
      createdAt: Date.now(),
      score,
      correct: correct.length,
      total: selected.length,
      pass: score >= passMark,
      passMark,
      wrong: selected
        .filter((question) => quiz.answers[question.id] !== question.correct - 1)
        .map((question) => ({ questionId: question.id, category: question.category })),
      answers: { ...quiz.answers },
    };
    await saveAttempt(attempt);
    void logActivity(
      'assessment',
      `Assessment (${correct.length}/${selected.length} benar)`,
      score,
      attempt.id,
    );
    setQuiz({ ...quiz, done: true, attemptId: attempt.id, attempt });
  };

  const openQuestionForm = (current?: QuizQuestion) => {
    openModal(
      <RecordForm
        key={current?.id ?? 'new-question'}
        title={current ? 'Edit Soal' : 'Tambah Soal'}
        subtitle="Kolom bertanda * wajib diisi."
        fields={QUIZ_FIELDS}
        initial={current ?? {}}
        defaults={{ type: 'Multiple choice', category: 'Customer Service Fundamentals', correct: 1 }}
        submitLabel={current ? 'Simpan Perubahan' : 'Tambahkan'}
        validate={(values) => {
          const options = Array.isArray(values.options) ? values.options : [];
          if (options.length < 2 || options.length > 6) {
            return 'Pilihan jawaban harus 2 sampai 6';
          }
          const correct = Number(values.correct);
          if (!Number.isFinite(correct) || correct < 1 || correct > options.length) {
            return `Nomor jawaban benar harus antara 1 dan ${options.length}`;
          }
          return null;
        }}
        onSubmit={async (values) => {
          const options = Array.isArray(values.options) ? values.options : [];
          const correct = Number(values.correct);
          if (options.length < 2 || options.length > 6) {
            throw new Error('Pilihan jawaban harus 2 sampai 6');
          }
          if (correct < 1 || correct > options.length) {
            throw new Error(`Nomor jawaban benar harus antara 1 dan ${options.length}`);
          }
          const item: QuizQuestion = {
            id: current?.id ?? newId('q'),
            type: String(values.type),
            category: String(values.category),
            question: String(values.question),
            options,
            correct,
            explanation: String(values.explanation),
            sample: false,
            updatedAt: Date.now(),
          };
          await upsertContent('quiz', item);
          closeModal();
          showToast(current ? 'Perubahan berhasil disimpan' : 'Soal berhasil ditambahkan');
        }}
        onCancel={closeModal}
      />,
      { large: true },
    );
  };

  const confirmDeleteQuestion = (question: QuizQuestion) => {
    openModal(
      <ConfirmDialog
        title="Hapus soal ini?"
        message={`Soal "${question.question}" akan dihapus.`}
        onCancel={closeModal}
        onConfirm={async () => {
          await deleteContent('quiz', question.id);
          closeModal();
          showToast('Soal berhasil dihapus');
        }}
      />,
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Development"
        title="Training & Assessment"
        subtitle="Jalur belajar terstruktur untuk admin CS baru: pelajari, latih, lalu uji pemahamanmu."
      />

      <div className="seg" style={{ marginBottom: 20 }}>
        {(
          [
            ['path', 'Training Path', 'route'],
            ['assessment', 'Assessment', 'clipboard-check'],
            ['results', 'Results & Certification', 'award'],
          ] as [Tab, string, string][]
        ).map(([value, label, icon]) => (
          <button key={value} className={tab === value ? 'on' : ''} onClick={() => setTab(value)}>
            <Icon name={icon} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'path' ? (
        <PathView context={context} trainingPct={trainingPct} next={next} />
      ) : tab === 'assessment' ? (
        <AssessmentView
          quiz={quiz}
          questions={questions}
          attempts={snapshot.attempts}
          passMark={passMark}
          best={best}
          canManage={canManage}
          onStart={startQuiz}
          onAnswer={answerQuestion}
          onMove={moveQuiz}
          onFinish={finishQuiz}
          onCancel={cancelQuiz}
          onAdd={() => openQuestionForm()}
          onEdit={openQuestionForm}
          onDelete={confirmDeleteQuestion}
          onSavePass={(value) => void setPassMark(value)}
          onResults={() => {
            setQuiz(null);
            setTab('results');
          }}
        />
      ) : (
        <ResultsView context={context} snapshot={snapshot} trainingPct={trainingPct} />
      )}
    </>
  );
}

function PathView({
  context,
  trainingPct,
  next,
}: {
  context: TrainingContext;
  trainingPct: number;
  next: { label: string; href: string };
}) {
  const completed = TRAINING_STAGES.filter(
    (stage) => getStageProgress(stage, context).pct === 100,
  ).length;

  return (
    <>
      <div className="card row wrap" style={{ gap: 20, marginBottom: 18 }}>
        <ScoreRing value={trainingPct} label="Selesai" />
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2>Progress Training</h2>
          <p className="sm muted">
            {completed} dari {TRAINING_STAGES.length} tahap selesai. Ikuti urutan tahap agar
            pemahaman terbangun bertahap.
          </p>
        </div>
        <Link className="btn p" href={next.href}>
          <Icon name="play" />
          {next.label}
        </Link>
      </div>

      {TRAINING_STAGES.map((stage, index) => {
        const progress = getStageProgress(stage, context);
        const status =
          progress.pct === 100 ? 'Selesai' : progress.done > 0 ? 'Berjalan' : 'Belum mulai';
        return (
          <div className="tstage" key={stage.id}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className={`tdot ${progress.pct === 100 ? 'done' : progress.done ? 'run' : ''}`}>
                {progress.pct === 100 ? <Icon name="check" size={16} /> : index + 1}
              </div>
              {index < TRAINING_STAGES.length - 1 ? <div className="tline" /> : null}
            </div>
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="row sp wrap">
                <div>
                  <div className="eyebrow">Tahap {index + 1}</div>
                  <h2>{stage.title}</h2>
                </div>
                <div className="row">
                  <span className={`tag ${progress.pct === 100 ? 'gr' : progress.done ? 'yl' : ''}`}>
                    {status}
                  </span>
                  <span className="tag">
                    <Icon name="clock" size={12} />±{progress.minutes} menit
                  </span>
                </div>
              </div>
              <div className="row mt1" style={{ gap: 10 }}>
                <ProgressBar value={progress.pct} style={{ flex: 1 }} />
                <b className="sm">{progress.pct}%</b>
              </div>
              <div className="grid g2 mt">
                <div>
                  <div
                    className="xs muted"
                    style={{ fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase' }}
                  >
                    Tujuan
                  </div>
                  <ul className="dots mt1">
                    {stage.objectives.map((objective) => (
                      <li key={objective}>
                        <Icon name="target" style={{ color: 'var(--t3)' }} />
                        {objective}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div
                    className="xs muted"
                    style={{ fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase' }}
                  >
                    Materi &amp; Tugas
                  </div>
                  {progress.items.length ? (
                    progress.items.map((item, itemIndex) =>
                      item.kind === 'material' && item.material ? (
                        <Link
                          className="ref"
                          href={`/learning?id=${encodeURIComponent(item.material.id)}`}
                          key={`${item.material.id}-${itemIndex}`}
                        >
                          {item.done ? (
                            <Icon name="check-circle-2" style={{ color: 'var(--acc)' }} />
                          ) : (
                            <Icon name="book-open" />
                          )}
                          <span style={{ flex: 1 }}>
                            {item.material.title}
                            <span className="xs muted" style={{ display: 'block' }}>
                              Materi · {item.material.durationMinutes} menit
                            </span>
                          </span>
                        </Link>
                      ) : item.task ? (
                        <Link className="ref" href={item.task.href} key={`${item.task.label}-${itemIndex}`}>
                          {item.done ? (
                            <Icon name="check-circle-2" style={{ color: 'var(--acc)' }} />
                          ) : (
                            <Icon name="circle-dashed" />
                          )}
                          <span style={{ flex: 1 }}>
                            {item.task.label}
                            <span className="xs muted" style={{ display: 'block' }}>
                              Tugas · ±{item.task.minMinutes} menit
                            </span>
                          </span>
                        </Link>
                      ) : null,
                    )
                  ) : (
                    <p className="sm muted">Belum ada materi untuk tahap ini.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

interface AssessmentViewProps {
  quiz: QuizRuntime | null;
  questions: QuizQuestion[];
  attempts: AssessmentAttempt[];
  passMark: number;
  best: number | null;
  canManage: boolean;
  onStart: () => void;
  onAnswer: (questionId: string, optionIndex: number) => void;
  onMove: (delta: number) => void;
  onFinish: () => void;
  onCancel: () => void;
  onAdd: () => void;
  onEdit: (question: QuizQuestion) => void;
  onDelete: (question: QuizQuestion) => void;
  onSavePass: (value: number) => void;
  onResults: () => void;
}

function AssessmentView({
  quiz,
  questions,
  attempts,
  passMark,
  best,
  canManage,
  onStart,
  onAnswer,
  onMove,
  onFinish,
  onCancel,
  onAdd,
  onEdit,
  onDelete,
  onSavePass,
  onResults,
}: AssessmentViewProps) {
  if (quiz && !quiz.done) {
    const selected = quiz.ids
      .map((id) => questions.find((question) => question.id === id))
      .filter(Boolean) as QuizQuestion[];
    const question = selected[quiz.index];
    if (!question) {
      return (
        <div className="card" style={{ maxWidth: 780, margin: '0 auto', padding: 30 }}>
          <p className="sm muted">Soal tidak ditemukan. Mulai ulang assessment.</p>
          <button className="btn mt" onClick={onCancel}>
            Kembali
          </button>
        </div>
      );
    }
    return (
      <div className="card" style={{ maxWidth: 780, margin: '0 auto', padding: 30 }}>
        <div className="row sp">
          <span className="tag gr">{question.type}</span>
          <span className="xs muted">
            Soal {quiz.index + 1} dari {selected.length}
          </span>
        </div>
        <ProgressBar
          value={(quiz.index / selected.length) * 100}
          className="mt1"
        />
        <h2 className="mt" style={{ fontSize: 18, lineHeight: 1.5 }}>
          {question.question}
        </h2>
        {question.options.map((option, index) => (
          <button
            key={`${index}-${option}`}
            className={`opt ${quiz.answers[question.id] === index ? 'sel' : ''}`}
            onClick={() => onAnswer(question.id, index)}
          >
            <b style={{ marginRight: 8 }}>{'ABCDEF'[index]}.</b>
            {option}
          </button>
        ))}
        <div className="row sp mt2">
          <button className="btn" disabled={quiz.index === 0} onClick={() => onMove(-1)}>
            <Icon name="chevron-left" />
            Sebelumnya
          </button>
          {quiz.index < selected.length - 1 ? (
            <button
              className="btn p"
              disabled={quiz.answers[question.id] == null}
              onClick={() => onMove(1)}
            >
              Berikutnya
              <Icon name="chevron-right" />
            </button>
          ) : (
            <button
              className="btn p"
              disabled={quiz.answers[question.id] == null}
              onClick={onFinish}
            >
              <Icon name="check" />
              Selesai &amp; Lihat Skor
            </button>
          )}
        </div>
        <div className="row mt" style={{ justifyContent: 'center' }}>
          <button className="btn sm ghost" onClick={onCancel}>
            Batalkan kuis
          </button>
        </div>
      </div>
    );
  }

  if (quiz && quiz.done) {
    const attempt = quiz.attempt ?? attempts.find((entry) => entry.id === quiz.attemptId);
    if (!attempt) {
      return (
        <div className="card" style={{ maxWidth: 780, margin: '0 auto', padding: 30 }}>
          <p className="sm muted">Hasil assessment tidak ditemukan.</p>
          <button className="btn mt" onClick={onResults}>
            Lihat Results
          </button>
        </div>
      );
    }
    const selected = quiz.ids
      .map((id) => questions.find((question) => question.id === id))
      .filter(Boolean) as QuizQuestion[];
    return (
      <>
        <div className="card row wrap" style={{ gap: 22, padding: 26 }}>
          <ScoreRing value={attempt.score} label="Skor" />
          <div style={{ flex: 1, minWidth: 220 }}>
            <span className={`tag ${attempt.pass ? 'gr' : 'rd'}`}>
              {attempt.pass ? 'Lulus' : 'Belum lulus, coba lagi'}
            </span>
            <h2 className="mt1">
              {attempt.correct} dari {attempt.total} jawaban benar
            </h2>
            <p className="sm muted">
              Batas lulus {attempt.passMark}. Pelajari pembahasan di bawah untuk memperkuat
              pemahaman.
            </p>
          </div>
          <div className="row wrap">
            <button className="btn p" onClick={onStart}>
              <Icon name="rotate-ccw" />
              Ulangi
            </button>
            <button className="btn" onClick={onResults}>
              Lihat Results
            </button>
          </div>
        </div>
        <h2 className="mt2">Pembahasan</h2>
        {selected.map((question, index) => {
          const isCorrect = attempt.answers[question.id] === question.correct - 1;
          return (
            <div className="card mt" key={question.id}>
              <div className="row sp wrap">
                <div className="row" style={{ gap: 6 }}>
                  <span className="tag">{question.type}</span>
                  <span className="tag">{question.category}</span>
                </div>
                <span className={`tag ${isCorrect ? 'gr' : 'rd'}`}>
                  {isCorrect ? 'Benar' : 'Salah'}
                </span>
              </div>
              <h3 className="mt1">
                {index + 1}. {question.question}
              </h3>
              {question.options.map((option, optionIndex) => (
                <div
                  className={`opt ${
                    optionIndex === question.correct - 1
                      ? 'ok'
                      : attempt.answers[question.id] === optionIndex
                        ? 'no'
                        : ''
                  }`}
                  style={{ cursor: 'default' }}
                  key={`${optionIndex}-${option}`}
                >
                  {option}
                  {optionIndex === question.correct - 1 ? (
                    <b style={{ color: 'var(--acc)' }}> ✓</b>
                  ) : attempt.answers[question.id] === optionIndex ? (
                    <span style={{ color: 'var(--red)' }}> (jawabanmu)</span>
                  ) : null}
                </div>
              ))}
              <div className="note gn mt">
                <Icon name="lightbulb" />
                <div>{question.explanation}</div>
              </div>
            </div>
          );
        })}
      </>
    );
  }

  return (
    <>
      <div className="split">
        <div className="card" style={{ padding: 28 }}>
          <div className="eyebrow">Assessment</div>
          <h2 style={{ fontSize: 21 }}>Uji pemahaman standar pelayanan Samaqu</h2>
          <p className="sm muted mt1">
            Pilihan ganda, studi kasus percakapan, dan pemilihan respons terbaik. Setiap jawaban
            dilengkapi pembahasan.
          </p>
          <div className="grid g3 mt">
            {[
              ['Jumlah soal', questions.length],
              ['Batas lulus', passMark],
              ['Percobaan', attempts.length],
            ].map(([label, value]) => (
              <div className="card soft" style={{ padding: 14 }} key={String(label)}>
                <div className="xs muted">{label}</div>
                <b style={{ fontSize: 22 }}>{value}</b>
              </div>
            ))}
          </div>
          <div className="row mt2 wrap">
            <button className="btn p" disabled={!questions.length} onClick={onStart}>
              <Icon name="play" />
              {attempts.length ? 'Mulai Ulang Assessment' : 'Mulai Assessment'}
            </button>
            {best != null ? (
              <span className={`tag ${best >= passMark ? 'gr' : 'rd'}`}>
                Skor terbaik {best}
              </span>
            ) : null}
          </div>
        </div>
        <div className="card">
          <h3>Riwayat Percobaan</h3>
          {attempts.length ? (
            attempts.slice(0, 6).map((attempt) => (
              <div className="li sm" key={attempt.id}>
                <span style={{ flex: 1 }}>{formatDateTime(attempt.createdAt)}</span>
                <span className={`tag ${attempt.pass ? 'gr' : 'rd'}`}>
                  {attempt.pass ? 'Lulus' : 'Ulangi'}
                </span>
                <b>{attempt.score}</b>
              </div>
            ))
          ) : (
            <p className="sm muted mt1">Belum ada percobaan.</p>
          )}
        </div>
      </div>

      {canManage ? (
        <div className="card mt">
          <div className="row sp wrap">
            <div>
              <h2>Kelola Soal</h2>
              <p className="xs muted">Hanya Owner / Super Admin</p>
            </div>
            <div className="row wrap">
              <PassMarkControl value={passMark} onSave={onSavePass} />
              <button className="btn p sm" onClick={onAdd}>
                <Icon name="plus" />
                Tambah Soal
              </button>
            </div>
          </div>
          <div className="tw mt">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Pertanyaan</th>
                  <th>Jenis</th>
                  <th>Kategori</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {questions.map((question, index) => (
                  <tr key={question.id}>
                    <td>{index + 1}</td>
                    <td style={{ minWidth: 240 }}>
                      {question.question}
                      <div className="xs muted">
                        Jawaban: {question.options[question.correct - 1] || '-'}
                      </div>
                    </td>
                    <td>
                      <span className="tag">{question.type}</span>
                    </td>
                    <td className="xs">{question.category}</td>
                    <td>
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn sm" onClick={() => onEdit(question)}>
                          <Icon name="pencil" />
                          Edit
                        </button>
                        <button className="btn sm danger" onClick={() => onDelete(question)}>
                          <Icon name="trash-2" />
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {questions.length ? null : (
            <p className="sm muted mt">Belum ada soal. Tambahkan soal pertama.</p>
          )}
        </div>
      ) : null}
    </>
  );
}

function PassMarkControl({ value, onSave }: { value: number; onSave: (value: number) => void }) {
  const [input, setInput] = useState(String(value));
  useEffect(() => setInput(String(value)), [value]);
  return (
    <div className="row">
      <label className="row sm" style={{ gap: 6 }}>
        Batas lulus
        <input
          className="inp"
          type="number"
          min="1"
          max="100"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          style={{ width: 80 }}
        />
      </label>
      <button className="btn sm" onClick={() => onSave(Number(input))}>
        <Icon name="save" />
        Simpan
      </button>
    </div>
  );
}

function ResultsView({
  context,
  snapshot,
  trainingPct,
}: {
  context: TrainingContext;
  snapshot: AcademySnapshot;
  trainingPct: number;
}) {
  const last = snapshot.attempts[0];
  const best = bestScore(snapshot.attempts);
  const wrongCategories = last ? [...new Set(last.wrong.map((item) => item.category))] : [];
  const materials = snapshot.content.materials;
  const recommendations = materials
    .filter((material) => {
      const status = snapshot.progress.materials[material.id]?.status ?? 'todo';
      return wrongCategories.includes(material.category) || status !== 'done';
    })
    .slice(0, 4);
  const competency = TRAINING_STAGES.map((stage) => {
    const progress = getStageProgress(stage, context);
    const weak = stage.categories.some((category) => wrongCategories.includes(category));
    const status =
      progress.pct === 100 && !weak
        ? (['Kompeten', 'gr'] as const)
        : progress.pct > 0
          ? ([(weak ? 'Perlu penguatan' : 'Dalam proses'), 'yl'] as const)
          : (['Belum dimulai', ''] as const);
    return { stage, progress, status };
  });
  const allCompetent =
    competency.every((entry) => entry.status[0] === 'Kompeten') &&
    best != null &&
    best >= snapshot.settings.passMark;

  return (
    <>
      <div className="grid g4">
        {[
          ['Penyelesaian training', `${trainingPct}%`],
          ['Skor terbaik', best ?? '—'],
          ['Skor terakhir', last ? last.score : '—'],
          ['Jumlah percobaan', snapshot.attempts.length],
        ].map(([label, value]) => (
          <div className="card stat" key={String(label)}>
            <div className="l">{label}</div>
            <div className="v">{value}</div>
          </div>
        ))}
      </div>

      <div className="card mt" style={{ padding: 26 }}>
        <div className="row sp wrap">
          <div>
            <div className="eyebrow">Status Kompetensi Internal</div>
            <h2>
              {allCompetent
                ? 'Siap melayani dengan pengawasan minimal'
                : 'Masih dalam proses belajar'}
            </h2>
            <p className="sm muted mt1">
              Ringkasan internal untuk pemantauan belajar. <b>Bukan sertifikat atau sertifikasi resmi.</b>
            </p>
          </div>
          <span
            className={`tag ${allCompetent ? 'gr' : 'yl'}`}
            style={{ fontSize: 13, padding: '5px 12px' }}
          >
            {allCompetent ? 'Semua area kompeten' : 'Belum lengkap'}
          </span>
        </div>
        <div className="tw mt">
          <table>
            <thead>
              <tr>
                <th>Area</th>
                <th>Progress</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {competency.map((entry) => (
                <tr key={entry.stage.id}>
                  <td>{entry.stage.title}</td>
                  <td style={{ minWidth: 140 }}>
                    <div className="row">
                      <ProgressBar value={entry.progress.pct} style={{ flex: 1 }} />
                      <span className="xs">{entry.progress.pct}%</span>
                    </div>
                  </td>
                  <td>
                    <span className={`tag ${entry.status[1]}`}>{entry.status[0]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid g2 mt">
        <div className="card">
          <h3>Rekomendasi Materi</h3>
          {recommendations.length ? (
            recommendations.map((material) => (
              <Link
                className="ref"
                href={`/learning?id=${encodeURIComponent(material.id)}`}
                key={material.id}
              >
                <Icon name="book-open" />
                <span style={{ flex: 1 }}>
                  {material.title}
                  <span className="xs muted" style={{ display: 'block' }}>
                    {wrongCategories.includes(material.category)
                      ? 'Ada jawaban salah di kategori ini'
                      : 'Belum selesai'}
                  </span>
                </span>
                <Icon name="chevron-right" />
              </Link>
            ))
          ) : (
            <p className="sm muted mt1">Tidak ada rekomendasi. Pertahankan!</p>
          )}
        </div>
        <div className="card">
          <h3>Riwayat Belajar</h3>
          <div className="tw">
            <table className="mt1">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Aktivitas</th>
                  <th>Skor</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.activity.slice(0, 10).map((item) => (
                  <tr key={item.id}>
                    <td className="xs" style={{ whiteSpace: 'nowrap' }}>
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="sm">{item.title}</td>
                    <td>
                      {item.score != null ? (
                        <span className={`tag ${scoreTagClass(item.score)}`}>{item.score}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {snapshot.activity.length ? null : <p className="sm muted">Belum ada riwayat.</p>}
        </div>
      </div>
    </>
  );
}
