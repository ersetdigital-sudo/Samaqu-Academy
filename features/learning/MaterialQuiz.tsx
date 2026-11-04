'use client';

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { MaterialQuizQuestion } from '@/lib/types';

interface MaterialQuizProps {
  questions: MaterialQuizQuestion[];
  passMark: number;
  bestScore: number | null;
  attemptCount: number;
  onSubmitted: (score: number, answers: Record<string, number>) => Promise<void>;
}

/** Kuis pilihan ganda di akhir halaman materi. Boleh diulang. */
export function MaterialQuiz({
  questions,
  passMark,
  bestScore,
  attemptCount,
  onSubmitted,
}: MaterialQuizProps) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; answers: Record<string, number> } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  const answered = useMemo(
    () => questions.filter((question) => answers[question.id] != null).length,
    [answers, questions],
  );

  if (!questions.length) return null;

  const submit = async () => {
    if (saving || answered < questions.length) return;
    const correct = questions.filter(
      (question) => answers[question.id] === question.correctIndex,
    ).length;
    const score = Math.round((correct / questions.length) * 100);
    setSaving(true);
    try {
      await onSubmitted(score, answers);
      setResult({ score, answers });
    } finally {
      setSaving(false);
    }
  };

  const retake = () => {
    setAnswers({});
    setResult(null);
  };

  const passed = result ? result.score >= passMark : false;

  return (
    <div className="card mt" id="kuis-materi">
      <div className="row sp wrap">
        <div>
          <div className="eyebrow">Kuis materi</div>
          <h3>Uji pemahaman</h3>
        </div>
        <span className="tag gr">Lulus ≥ {passMark}%</span>
      </div>
      <p className="sm muted mt1">
        {questions.length} soal pilihan ganda dari isi materi ini. Boleh diulang sampai lulus.
        {bestScore != null ? ` Skor terbaik ${bestScore}% dari ${attemptCount} percobaan.` : ''}
      </p>

      {!result ? (
        <>
          {questions.map((question, index) => (
            <div className="quiz-q" key={question.id}>
              <p className="quiz-q-text">
                <b>{index + 1}.</b> {question.question}
              </p>
              <div className="quiz-opts">
                {question.options.map((option, optionIndex) => (
                  <button
                    type="button"
                    key={option}
                    className={`quiz-opt${answers[question.id] === optionIndex ? ' on' : ''}`}
                    onClick={() =>
                      setAnswers((current) => ({ ...current, [question.id]: optionIndex }))
                    }
                    aria-pressed={answers[question.id] === optionIndex}
                  >
                    <span className="quiz-letter">{String.fromCharCode(65 + optionIndex)}</span>
                    <span>{option}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="row wrap mt">
            <button
              className="btn p"
              onClick={submit}
              disabled={saving || answered < questions.length}
            >
              <Icon name="check" />
              Kirim jawaban
            </button>
            <span className="sm muted">
              {answered}/{questions.length} soal terjawab
            </span>
          </div>
        </>
      ) : (
        <>
          <div className={`quiz-score ${passed ? 'pass' : 'fail'}`}>
            <b>{result.score}%</b>
            <span>
              {passed
                ? 'Lulus — materi ditandai selesai.'
                : `Belum lulus. Minimal ${passMark}%, silakan pelajari lagi lalu ulangi.`}
            </span>
          </div>

          <div className="quiz-review">
            {questions.map((question, index) => {
              const chosen = result.answers[question.id];
              const isCorrect = chosen === question.correctIndex;
              return (
                <div className={`quiz-item ${isCorrect ? 'ok' : 'no'}`} key={question.id}>
                  <p className="quiz-q-text">
                    <b>{index + 1}.</b> {question.question}
                  </p>
                  <p className="sm">
                    <Icon name={isCorrect ? 'check-circle-2' : 'x'} size={14} />
                    Jawabanmu: {question.options[chosen] ?? '—'}
                  </p>
                  {!isCorrect ? (
                    <p className="sm">
                      <Icon name="check-circle-2" size={14} />
                      Jawaban benar: {question.options[question.correctIndex]}
                    </p>
                  ) : null}
                  <p className="sm muted">Pembahasan: {question.explanation}</p>
                </div>
              );
            })}
          </div>

          <button className="btn mt" onClick={retake}>
            <Icon name="rotate-ccw" />
            Ulangi kuis
          </button>
        </>
      )}
    </div>
  );
}
