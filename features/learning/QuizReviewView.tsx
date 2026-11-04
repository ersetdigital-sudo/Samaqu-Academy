'use client';

import { AppLink as Link } from '@/components/ui/AppLink';
import { useData } from '@/components/providers/DataProvider';
import { useModal } from '@/components/providers/ModalProvider';
import { useRole } from '@/components/providers/RoleProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Icon } from '@/components/ui/Icon';
import { PageHeader } from '@/components/ui/PageHeader';
import { quizFor } from '@/lib/learning';
import type { Material, MaterialQuizQuestion } from '@/lib/types';
import { QuizQuestionForm } from './QuizQuestionForm';

/**
 * Halaman cek manual bank soal kuis materi (khusus owner/leader).
 * Semua soal tampil per materi bersama jawaban benar dan pembahasannya, dan bisa
 * langsung diperbaiki dari sini. Admin CS tidak bisa membuka halaman ini.
 */
export function QuizReviewView() {
  const { snapshot, saveQuizQuestion, deleteQuizQuestion } = useData();
  const { canManage, hydrated } = useRole();
  const { openModal, closeModal } = useModal();
  const { showToast } = useToast();

  if (hydrated && !canManage) {
    return (
      <div className="card ai-denied">
        <div
          className="sic"
          style={{
            margin: '0 auto',
            width: 46,
            height: 46,
            background: 'var(--redl)',
            color: 'var(--red)',
          }}
        >
          <Icon name="lock" size={20} />
        </div>
        <h2 className="mt">Akses terbatas</h2>
        <p className="sm muted mt1">
          Review bank soal hanya dapat dibuka oleh Owner / Leader. Hubungi Owner bila ada soal
          yang perlu diperbaiki.
        </p>
        <Link className="btn mt2" href="/learning">
          <Icon name="arrow-left" />
          Kembali ke Learning Center
        </Link>
      </div>
    );
  }

  const materials = snapshot.content.materials;
  const total = materials.reduce(
    (sum, material) => sum + quizFor(snapshot.materialQuizzes, material.id).length,
    0,
  );

  const openQuestionForm = (material: Material, question?: MaterialQuizQuestion) => {
    const questions = quizFor(snapshot.materialQuizzes, material.id);
    const nextSortOrder = questions.reduce((max, entry) => Math.max(max, entry.sortOrder), 0) + 1;
    openModal(
      <QuizQuestionForm
        materialId={material.id}
        materialTitle={material.title}
        question={question}
        nextSortOrder={nextSortOrder}
        onSubmit={async (next) => {
          await saveQuizQuestion(next);
          closeModal();
        }}
        onCancel={closeModal}
      />,
      { large: true },
    );
  };

  const confirmDelete = (material: Material, question: MaterialQuizQuestion) => {
    openModal(
      <ConfirmDialog
        title="Hapus soal ini?"
        message={`"${question.question}" akan dihapus dari kuis materi "${material.title}".`}
        onCancel={closeModal}
        onConfirm={async () => {
          try {
            await deleteQuizQuestion(material.id, question.id);
            closeModal();
            showToast('Soal berhasil dihapus');
          } catch (cause) {
            showToast(cause instanceof Error ? cause.message : 'Gagal menghapus soal', 'err');
          }
        }}
      />,
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="Learning & Service"
        title="Review Bank Soal"
        subtitle="Cek manual semua soal kuis per materi: jawaban benar dan pembahasannya. Soal bisa diperbaiki langsung dari halaman ini."
        actions={
          <>
            <span className="tag gr">{total} soal</span>
            <Link className="btn" href="/learning">
              <Icon name="arrow-left" />
              Learning Center
            </Link>
          </>
        }
      />

      {total === 0 ? (
        <div className="card">
          <p className="sm muted">Belum ada soal kuis. Tambahkan soal dari materi di bawah.</p>
        </div>
      ) : null}

      <div className="qz-review-mat">
        {materials.map((material) => {
          const questions = quizFor(snapshot.materialQuizzes, material.id);
          return (
            <section className="card" key={material.id}>
              <div className="row sp wrap" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div className="eyebrow">
                    {material.category} · Level {material.levelId ?? '—'}
                  </div>
                  <h3>{material.title}</h3>
                  <p className="sm muted mt1">
                    {questions.length ? `${questions.length} soal` : 'Belum ada soal'}
                  </p>
                </div>
                <div className="row wrap">
                  <Link className="btn sm" href={`/learning?id=${encodeURIComponent(material.id)}`}>
                    <Icon name="book-open" />
                    Buka materi
                  </Link>
                  <button className="btn sm p" onClick={() => openQuestionForm(material)}>
                    <Icon name="plus" />
                    Tambah Soal
                  </button>
                </div>
              </div>

              {questions.length ? (
                <div className="quiz-review">
                  {questions.map((question, index) => (
                    <div className="quiz-item" key={question.id}>
                      <p className="quiz-q-text">
                        <b>{index + 1}.</b> {question.question}
                      </p>
                      <ul className="qz-answer-list">
                        {question.options.map((option, optionIndex) => {
                          const isCorrect = optionIndex === question.correctIndex;
                          return (
                            <li key={option} className={isCorrect ? 'ok' : undefined}>
                              <span className="quiz-letter">
                                {String.fromCharCode(65 + optionIndex)}
                              </span>
                              <span>{option}</span>
                              {isCorrect ? (
                                <span className="tag gr">
                                  <Icon name="check" size={12} />
                                  Jawaban benar
                                </span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                      <p className="sm muted">
                        Pembahasan: {question.explanation || '— belum diisi —'}
                      </p>
                      <div className="row mt">
                        <button
                          className="btn sm"
                          onClick={() => openQuestionForm(material, question)}
                        >
                          <Icon name="pencil" />
                          Edit soal
                        </button>
                        <button
                          className="btn sm danger"
                          onClick={() => confirmDelete(material, question)}
                        >
                          <Icon name="trash-2" />
                          Hapus
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </>
  );
}
