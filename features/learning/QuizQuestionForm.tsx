'use client';

import { useState, type FormEvent } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Icon } from '@/components/ui/Icon';
import type { MaterialQuizQuestion } from '@/lib/types';
import { newId } from '@/lib/utils/id';

interface QuizQuestionFormProps {
  materialId: string;
  materialTitle: string;
  /** Soal yang sedang diubah; kosong = soal baru. */
  question?: MaterialQuizQuestion;
  /** Urutan soal baru (soal terakhir + 1). */
  nextSortOrder: number;
  onSubmit: (question: MaterialQuizQuestion) => Promise<void>;
  onCancel: () => void;
}

const labelStyle = { display: 'block', fontWeight: 600, marginBottom: 5, fontSize: 12.5 } as const;

/** Form tambah/ubah satu soal kuis, termasuk penanda jawaban benar dan pembahasan. */
export function QuizQuestionForm({
  materialId,
  materialTitle,
  question,
  nextSortOrder,
  onSubmit,
  onCancel,
}: QuizQuestionFormProps) {
  const { showToast } = useToast();
  const [text, setText] = useState(question?.question ?? '');
  const [options, setOptions] = useState<string[]>(
    question?.options?.length ? [...question.options] : ['', '', '', ''],
  );
  const [correct, setCorrect] = useState(question?.correctIndex ?? 0);
  const [explanation, setExplanation] = useState(question?.explanation ?? '');
  const [saving, setSaving] = useState(false);

  const updateOption = (index: number, value: string) =>
    setOptions((previous) => previous.map((entry, position) => (position === index ? value : entry)));

  const addOption = () => setOptions((previous) => [...previous, '']);

  const removeOption = (index: number) => {
    if (options.length <= 2) {
      showToast('Soal minimal punya 2 pilihan jawaban', 'err');
      return;
    }
    setOptions((previous) => previous.filter((_, position) => position !== index));
    setCorrect((previous) => (previous === index ? 0 : previous > index ? previous - 1 : previous));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = options.map((option) => option.trim());
    if (!text.trim()) {
      showToast('Pertanyaan wajib diisi', 'err');
      return;
    }
    if (trimmed.length < 2) {
      showToast('Soal minimal punya 2 pilihan jawaban', 'err');
      return;
    }
    if (trimmed.some((option) => !option)) {
      showToast('Lengkapi semua pilihan jawaban atau hapus baris yang kosong', 'err');
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        id: question?.id ?? newId('qz'),
        materialId,
        question: text.trim(),
        options: trimmed,
        correctIndex: Math.min(correct, trimmed.length - 1),
        explanation: explanation.trim(),
        sortOrder: question?.sortOrder ?? nextSortOrder,
      });
      showToast(question ? 'Soal berhasil diperbarui' : 'Soal berhasil ditambahkan');
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : 'Gagal menyimpan soal', 'err');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="row sp" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2>{question ? 'Edit Soal' : 'Tambah Soal'}</h2>
          <p className="sm muted">{materialTitle}</p>
        </div>
        <button className="icb" type="button" onClick={onCancel} aria-label="Tutup">
          <Icon name="x" />
        </button>
      </div>

      <div className="mt">
        <label className="sm" htmlFor="qz_question" style={labelStyle}>
          Pertanyaan<span style={{ color: 'var(--red)' }}> *</span>
        </label>
        <textarea
          id="qz_question"
          className="inp"
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          autoFocus
        />
      </div>

      <div className="mt">
        <label className="sm" style={labelStyle}>
          Pilihan jawaban — tandai yang benar
        </label>
        <div className="qz-opt-list">
          {options.map((option, index) => (
            <div className="qz-opt-row" key={index}>
              <label className="qz-opt-pick">
                <input
                  type="radio"
                  name="qz_correct"
                  checked={correct === index}
                  onChange={() => setCorrect(index)}
                  aria-label={`Jawaban benar pilihan ${String.fromCharCode(65 + index)}`}
                />
                <span className="quiz-letter">{String.fromCharCode(65 + index)}</span>
              </label>
              <input
                className="inp"
                value={option}
                placeholder={`Pilihan ${String.fromCharCode(65 + index)}`}
                onChange={(event) => updateOption(index, event.target.value)}
              />
              <button
                className="icb"
                type="button"
                aria-label="Hapus pilihan"
                onClick={() => removeOption(index)}
              >
                <Icon name="trash-2" />
              </button>
            </div>
          ))}
        </div>
        <button className="btn sm mt1" type="button" onClick={addOption}>
          <Icon name="plus" />
          Tambah pilihan
        </button>
      </div>

      <div className="mt">
        <label className="sm" htmlFor="qz_explanation" style={labelStyle}>
          Pembahasan
        </label>
        <textarea
          id="qz_explanation"
          className="inp"
          rows={2}
          value={explanation}
          placeholder="Alasan jawaban benar, dikutip dari isi materi."
          onChange={(event) => setExplanation(event.target.value)}
        />
      </div>

      <div className="mfoot">
        <button className="btn" type="button" onClick={onCancel}>
          Batal
        </button>
        <button className="btn p" type="submit" disabled={saving}>
          <Icon name="check" />
          {saving ? 'Menyimpan…' : 'Simpan Soal'}
        </button>
      </div>
    </form>
  );
}
