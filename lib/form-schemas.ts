import type { RecordField } from '@/components/ui/RecordForm';
import {
  CASE_MARKS,
  MATERIAL_CATEGORIES,
  PROBLEM_GROUPS,
  QUIZ_TYPES,
  SCENARIO_LEVELS,
  SCRIPT_CATEGORIES,
  SEVERITIES,
} from './constants';
import type { ContentCollections } from './types';

export const MATERIAL_FIELDS: RecordField[] = [
  { key: 'title', label: 'Judul Materi', required: true },
  {
    key: 'category',
    label: 'Kategori',
    type: 'select',
    required: true,
    options: MATERIAL_CATEGORIES,
  },
  {
    key: 'sortOrder',
    label: 'Urutan',
    type: 'number',
    required: true,
    min: 1,
    hint: 'Urutan materi di Learning Center. Materi baru otomatis dapat nomor terakhir.',
  },
  {
    key: 'durationMinutes',
    label: 'Estimasi Waktu (menit)',
    type: 'number',
    required: true,
    min: 1,
  },
  {
    key: 'description',
    label: 'Deskripsi Singkat',
    type: 'textarea',
    required: true,
    rows: 2,
    full: true,
  },
  {
    key: 'videoUrl',
    label: 'Link Video YouTube',
    placeholder: 'https://youtu.be/…',
    hint: 'Opsional. Video tampil sebagai thumbnail yang bisa diputar di halaman materi.',
    full: true,
  },
  {
    key: 'videoDuration',
    label: 'Durasi Video',
    placeholder: '8:12',
    hint: 'Opsional. Tampil sebagai badge durasi di pojok thumbnail.',
    full: true,
  },
  {
    key: 'objectives',
    label: 'Tujuan Pembelajaran',
    type: 'lines',
    full: true,
    hint: 'Satu tujuan per baris.',
  },
  {
    key: 'body',
    label: 'Isi Materi',
    type: 'textarea',
    required: true,
    rows: 10,
    full: true,
    hint: 'Format sederhana: "## Judul bagian", "- poin", **tebal**. Baris kosong = paragraf baru.',
  },
];

export function flowFields(problems: ContentCollections['problems']): RecordField[] {
  return [
    { key: 'no', label: 'Urutan', type: 'number', required: true, min: 1, max: 20, section: 'Tahapan' },
    { key: 'title', label: 'Nama Tahap', required: true, section: 'Tahapan' },
    { key: 'description', label: 'Deskripsi', type: 'textarea', required: true, rows: 2, full: true, section: 'Tahapan' },
    { key: 'goal', label: 'Tujuan Tahapan', type: 'textarea', required: true, rows: 2, full: true, section: 'Tahapan' },
    { key: 'whenToUse', label: 'Kapan Tahapan Digunakan', type: 'textarea', required: true, rows: 2, full: true, section: 'Tahapan' },
    { key: 'info', label: 'Informasi yang Harus Digali', type: 'lines', required: true, full: true, section: 'Panduan' },
    { key: 'steps', label: 'Langkah Admin', type: 'lines', required: true, full: true, section: 'Panduan' },
    { key: 'example', label: 'Contoh Percakapan', type: 'chat', required: true, full: true, section: 'Panduan', hint: 'Satu pesan per baris. Awali "C:" untuk customer dan "A:" untuk admin.' },
    { key: 'avoid', label: 'Kesalahan yang Harus Dihindari', type: 'lines', required: true, full: true, section: 'Panduan' },
    { key: 'nextStep', label: 'Langkah Berikutnya', required: true, full: true, section: 'Referensi' },
    { key: 'scriptCategories', label: 'Kategori Script Terkait', type: 'multi', options: SCRIPT_CATEGORIES, full: true, section: 'Referensi' },
    {
      key: 'problemIds',
      label: 'Problem Solving Terkait',
      type: 'multi',
      options: problems.map((problem) => ({ value: problem.id, label: problem.title })),
      full: true,
      section: 'Referensi',
    },
    {
      key: 'special',
      label: 'Jalur khusus',
      type: 'check',
      full: true,
      section: 'Referensi',
      placeholder: 'Tampilkan sebagai jalur khusus (bukan bagian urutan utama)',
    },
  ];
}

export const GUIDE_FIELDS: RecordField[] = [
  { key: 'no', label: 'Urutan', type: 'number', required: true, min: 1, section: 'Bagian' },
  { key: 'title', label: 'Judul Bagian', required: true, section: 'Bagian' },
  { key: 'summary', label: 'Ringkasan', type: 'textarea', required: true, rows: 2, full: true, section: 'Bagian' },
  { key: 'points', label: 'Poin Utama', type: 'lines', full: true, section: 'Materi', hint: 'Format: "Judul: penjelasan", satu per baris.' },
  { key: 'dos', label: 'Do (contoh yang disarankan)', type: 'lines', full: true, section: 'Materi' },
  { key: 'donts', label: "Don't (contoh yang dihindari)", type: 'lines', full: true, section: 'Materi' },
  { key: 'pairs', label: 'Contoh Kesalahan & Perbaikan', type: 'lines', full: true, section: 'Materi', hint: 'Format: Respons kurang tepat || Lebih baik || Alasan' },
  { key: 'example', label: 'Contoh Percakapan', type: 'chat', full: true, section: 'Materi' },
  { key: 'takeaway', label: 'Key Takeaway', type: 'textarea', required: true, rows: 2, full: true, section: 'Materi' },
  {
    key: 'kind',
    label: 'Tipe Konten',
    type: 'select',
    options: [
      { value: '', label: 'Materi biasa' },
      { value: 'ba', label: 'Tampilkan data Before & After dari Script Library' },
    ],
    full: true,
    section: 'Materi',
  },
];

export const PROBLEM_FIELDS: RecordField[] = [
  { key: 'title', label: 'Judul Masalah', required: true, full: true, section: 'Situasi' },
  { key: 'group', label: 'Kelompok', type: 'select', required: true, options: PROBLEM_GROUPS, section: 'Situasi' },
  { key: 'severity', label: 'Tingkat Urgensi', type: 'select', required: true, options: SEVERITIES, section: 'Situasi' },
  { key: 'situation', label: 'Situasi', type: 'textarea', required: true, rows: 2, full: true, section: 'Situasi' },
  { key: 'concern', label: 'Kekhawatiran Customer', type: 'textarea', required: true, rows: 2, full: true, section: 'Situasi' },
  { key: 'understand', label: 'Yang Perlu Dipahami Admin', type: 'textarea', required: true, rows: 2, full: true, section: 'Situasi' },
  { key: 'collect', label: 'Informasi yang Dikumpulkan', type: 'lines', required: true, full: true, section: 'Penanganan' },
  { key: 'process', label: 'Proses Penanganan', type: 'lines', required: true, full: true, section: 'Penanganan' },
  { key: 'checks', label: 'Yang Dicek Secara Internal', type: 'lines', full: true, section: 'Penanganan' },
  { key: 'example', label: 'Contoh Percakapan', type: 'chat', full: true, section: 'Penanganan' },
  { key: 'avoid', label: 'Yang Harus Dihindari', type: 'lines', required: true, full: true, section: 'Penanganan' },
  { key: 'escalation', label: 'Instruksi Eskalasi', type: 'textarea', required: true, rows: 2, full: true, section: 'Kebijakan & Referensi' },
  {
    key: 'sop',
    label: 'Referensi SOP Resmi',
    type: 'textarea',
    rows: 2,
    full: true,
    section: 'Kebijakan & Referensi',
    hint: 'Isi hanya dengan kebijakan resmi yang sudah diverifikasi. Kosongkan bila belum ada.',
  },
  {
    key: 'scriptCategories',
    label: 'Kategori Script & Studi Kasus Terkait',
    type: 'multi',
    options: SCRIPT_CATEGORIES,
    full: true,
    section: 'Kebijakan & Referensi',
  },
];

export function scenarioFields(
  materials: ContentCollections['materials'],
): RecordField[] {
  return [
    { key: 'title', label: 'Judul Skenario', required: true, full: true },
    { key: 'category', label: 'Kategori', type: 'select', required: true, options: SCRIPT_CATEGORIES },
    { key: 'level', label: 'Tingkat Kesulitan', type: 'select', required: true, options: SCENARIO_LEVELS },
    { key: 'situation', label: 'Situasi Customer', type: 'textarea', required: true, rows: 2, full: true },
    { key: 'objective', label: 'Tujuan Pembelajaran', type: 'textarea', required: true, rows: 2, full: true },
    {
      key: 'messages',
      label: 'Alur Pesan Customer',
      type: 'lines',
      required: true,
      rows: 5,
      full: true,
      hint: 'Baris pertama = pesan pembuka customer. Baris berikutnya dikirim setelah setiap balasan admin.',
    },
    {
      key: 'materialId',
      label: 'Materi Terkait',
      type: 'select',
      options: [
        { value: '', label: '—' },
        ...materials.map((material) => ({ value: material.id, label: material.title })),
      ],
    },
  ];
}

export const QUIZ_FIELDS: RecordField[] = [
  { key: 'type', label: 'Jenis Soal', type: 'select', required: true, options: QUIZ_TYPES },
  { key: 'category', label: 'Kategori', type: 'select', required: true, options: MATERIAL_CATEGORIES },
  { key: 'question', label: 'Pertanyaan / Studi Kasus', type: 'textarea', required: true, rows: 3, full: true },
  { key: 'options', label: 'Pilihan Jawaban', type: 'lines', required: true, full: true, hint: '2–6 pilihan, satu per baris.' },
  { key: 'correct', label: 'Nomor Jawaban Benar', type: 'number', required: true, min: 1, max: 6 },
  { key: 'explanation', label: 'Pembahasan', type: 'textarea', required: true, rows: 3, full: true },
];

export const SCRIPT_FIELDS: RecordField[] = [
  { key: 'title', label: 'Judul Script', required: true, placeholder: 'Contoh: Menjawab pertanyaan stok' },
  { key: 'category', label: 'Kategori', type: 'select', required: true, options: SCRIPT_CATEGORIES },
  { key: 'situation', label: 'Situasi Penggunaan', type: 'textarea', required: true, full: true, placeholder: 'Kapan script ini dipakai?' },
  {
    key: 'response',
    label: 'Contoh Respons',
    type: 'textarea',
    required: true,
    full: true,
    rows: 4,
    hint: 'Tulis natural seperti chat biasa: ramah, ringkas, tidak kaku.',
  },
  {
    key: 'variants',
    label: 'Variasi Respons (opsional)',
    type: 'list',
    full: true,
    placeholder: 'Contoh: Baik Kak, untuk ukuran M masih ready ya.',
    hint: 'Satu variasi per baris. Tambah, hapus, atau urutkan dengan tombol di samping.',
  },
  {
    key: 'notes',
    label: 'Catatan Penggunaan',
    type: 'list',
    full: true,
    hint: 'Satu poin per baris — otomatis tampil sebagai bullet di detail script.',
  },
  { key: 'tags', label: 'Tag', type: 'tags', full: true, hint: 'Pisahkan dengan koma. Contoh: stok, ready' },
];

export const CASE_FIELDS: RecordField[] = [
  { key: 'title', label: 'Judul Kasus', required: true, full: true },
  { key: 'category', label: 'Kategori', type: 'select', required: true, options: SCRIPT_CATEGORIES },
  { key: 'mark', label: 'Tandai Sebagai', type: 'select', required: true, options: CASE_MARKS },
  { key: 'situation', label: 'Situasi Percakapan', type: 'textarea', required: true, full: true },
  {
    key: 'customerMessage',
    label: 'Pesan Customer',
    type: 'textarea',
    required: true,
    full: true,
    rows: 4,
    hint: 'Satu pesan per baris. Awali dengan "A:" bila ada balasan admin di tengah percakapan.',
  },
  { key: 'adminPrevious', label: 'Respons Admin Sebelumnya', type: 'textarea', full: true },
  { key: 'finding', label: 'Temuan / Masalah', type: 'textarea', required: true, full: true },
  { key: 'cause', label: 'Analisis Penyebab', type: 'textarea', full: true },
  {
    key: 'recommendation',
    label: 'Rekomendasi Respons',
    type: 'textarea',
    required: true,
    full: true,
    hint: 'Natural dan ramah, bukan kalimat baku.',
  },
  { key: 'lesson', label: 'Pelajaran Utama', type: 'textarea', required: true, full: true },
];

export const BEFORE_AFTER_FIELDS: RecordField[] = [
  { key: 'title', label: 'Judul Situasi', required: true },
  { key: 'category', label: 'Kategori', type: 'select', required: true, options: SCRIPT_CATEGORIES },
  {
    key: 'mark',
    label: 'Tanda',
    type: 'select',
    options: [{ value: '', label: 'Tanpa tanda' }, ...CASE_MARKS],
  },
  {
    key: 'mistakeToAvoid',
    label: 'Kesalahan yang perlu dihindari',
    type: 'textarea',
    rows: 2,
    full: true,
  },
  {
    key: 'principles',
    label: 'Prinsip',
    type: 'list',
    full: true,
    hint: 'Satu prinsip per baris. Urutan bisa diatur dengan panah.',
  },
  {
    key: 'before',
    label: 'Before: Respons Admin Sebelumnya',
    type: 'textarea',
    required: true,
    hint: 'Satu pesan per baris. Awali "C:" untuk customer dan "A:" untuk admin.',
  },
  {
    key: 'after',
    label: 'After: Respons yang Direkomendasikan',
    type: 'textarea',
    required: true,
    hint: 'Satu pesan per baris. Awali "C:" untuk customer dan "A:" untuk admin.',
  },
  { key: 'why', label: 'Alasan Respons Baru Lebih Baik', type: 'textarea', required: true, full: true },
  { key: 'notes', label: 'Catatan untuk Admin', type: 'textarea', full: true },
];
