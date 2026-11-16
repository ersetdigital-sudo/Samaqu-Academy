/**
 * Pelajaran AI, Fase 2: aksi usulan pelajaran (susun, edit, tolak, terbit, tarik).
 *
 * Database dan model dipasang dari luar (`LessonsDeps`) supaya semua aturan di sini bisa diuji dengan
 * database palsu. wa-admin yang memasang yang asli.
 *
 * Aturan yang ditegakkan di sini, bukan di layar:
 *  - semua aksi yang mengubah sesuatu HANYA untuk owner;
 *  - teks pelajaran diperiksa ulang (pengaman keras) tepat sebelum terbit, apa pun yang dikirim layar;
 *  - terbit memakai klaim atomik (status proposed -> publishing) supaya klik ganda tidak menerbitkan dua kali;
 *  - menerbitkan = menulis satu baris `wa_learnings` di SAMAQU (jalur yang sudah dipakai agent); menarik =
 *    status 'archived' (tidak ada yang dihapus) dan keduanya tercatat di wa_lesson_events.
 */

import { KINDS, NATURE_LABEL, type EscalationRow } from './lessons-analysis.ts';
import {
  MAX_CASES,
  buildCases,
  buildPrompt,
  buildRewritePrompt,
  dedupeKey,
  lintLesson,
  parseModelLessons,
  scrub,
  type LessonCase,
  type LessonLint,
  type PromptMessage,
} from './lessons-core.ts';

export class LessonsError extends Error {
  status: number;
  code?: string;
  extra?: Record<string, unknown>;
  constructor(message: string, status = 400, code?: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export interface Actor {
  email: string | null;
  isOwner: boolean;
}

export interface ModelResult {
  content: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export interface LessonsDeps {
  /** Klien Supabase service (Academy). Tipe longgar supaya bisa diganti klien palsu di tes. */
  // deno-lint-ignore no-explicit-any
  academy: any;
  /** REST service-role ke database SAMAQU (wa_escalations, wa_learnings). */
  // deno-lint-ignore no-explicit-any
  samaqu: (path: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<any>;
  model: (messages: PromptMessage[]) => Promise<ModelResult>;
  now?: () => Date;
  log?: (message: string) => void;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Saran: pelajaran global dikirim UTUH ke agent pada setiap pesan, jadi jumlahnya perlu dijaga. */
export const PUBLISHED_SOFT_LIMIT = 20;
/** Batas penyusunan per jam, penjaga biaya AI. */
export const GENERATE_PER_HOUR = 20;
const STUCK_MS = 5 * 60 * 1000;

function assertOwner(actor: Actor): void {
  if (!actor.isOwner) throw new LessonsError('Hanya owner yang bisa melakukan ini.', 403, 'owner_only');
}

const nowOf = (deps: LessonsDeps) => (deps.now ? deps.now() : new Date());
const iso = (deps: LessonsDeps) => nowOf(deps).toISOString();

export interface ProposalView {
  id: string;
  status: string;
  groupKey: string | null;
  kind: string;
  kindLabel: string;
  source: string;
  title: string;
  lesson: string;
  question: string | null;
  note: string | null;
  evidence: unknown[];
  cases: number;
  replacesLearningId: string | null;
  publishedLearningId: string | null;
  createdAt: string;
  createdBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  flags: LessonLint;
  stuck: boolean;
}

// deno-lint-ignore no-explicit-any
function toView(row: any, now: Date): ProposalView {
  const kind = String(row.kind || 'perlu_dicek');
  return {
    id: String(row.id),
    status: String(row.status),
    groupKey: row.group_key ?? null,
    kind,
    kindLabel: (NATURE_LABEL as Record<string, string>)[kind] || kind,
    source: String(row.source || 'ai'),
    title: String(row.title || ''),
    lesson: String(row.lesson_text || ''),
    question: row.question ?? null,
    note: row.note ?? null,
    evidence: Array.isArray(row.evidence) ? row.evidence : [],
    cases: Number(row.cases) || 0,
    replacesLearningId: row.replaces_learning_id ?? null,
    publishedLearningId: row.published_learning_id ?? null,
    createdAt: String(row.created_at || ''),
    createdBy: row.created_by ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    rejectReason: row.reject_reason ?? null,
    flags: lintLesson(row.lesson_text),
    stuck: row.status === 'publishing' && now.getTime() - Date.parse(String(row.updated_at || row.created_at)) > STUCK_MS,
  };
}

async function recordEvent(
  deps: LessonsDeps,
  event: { proposalId?: string | null; learningId?: string | null; actor: string | null; action: string; detail?: unknown },
): Promise<void> {
  try {
    await deps.academy.from('wa_lesson_events').insert({
      proposal_id: event.proposalId ?? null,
      learning_id: event.learningId ?? null,
      actor: event.actor,
      action: event.action,
      detail: event.detail ?? null,
    });
  } catch (error) {
    deps.log?.(`catat event gagal: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadProposal(deps: LessonsDeps, id: string) {
  const { data, error } = await deps.academy.from('wa_lesson_proposals').select('*').eq('id', id).maybeSingle();
  if (error) throw new LessonsError(`Gagal membaca usulan: ${error.message}`, 500);
  if (!data) throw new LessonsError('Usulan tidak ditemukan.', 404);
  return data;
}

/** Daftar usulan (terbaru dulu), lengkap dengan tanda pengaman per usulan. Boleh dibaca semua user login. */
export async function listProposals(deps: LessonsDeps): Promise<{ proposals: ProposalView[]; publishedSoftLimit: number }> {
  const { data, error } = await deps.academy
    .from('wa_lesson_proposals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new LessonsError(`Gagal membaca usulan: ${error.message}`, 500);
  const now = nowOf(deps);
  const rows = (Array.isArray(data) ? data : []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { proposals: rows.map((row) => toView(row, now)), publishedSoftLimit: PUBLISHED_SOFT_LIMIT };
}

const ESC_COLUMNS = 'id,inbox_id,sender,sender_name,reason,summary,customer_message,status,instruction,reply_text,created_at';

/**
 * Susun usulan dari satu kelompok kasus (`groupKey`) atau tulis ulang satu pelajaran lama (`learningId`).
 * Hanya owner. Satu panggilan model per permintaan.
 */
export async function generate(
  deps: LessonsDeps,
  actor: Actor,
  input: { groupKey?: string; learningId?: string },
): Promise<{ created: number; message: string; proposals: ProposalView[] }> {
  assertOwner(actor);

  // Penjaga biaya: batas penyusunan per jam.
  const since = new Date(nowOf(deps).getTime() - 3600_000).toISOString();
  const recent = await deps.academy.from('wa_lesson_events').select('id').eq('action', 'generated').gte('at', since).limit(200);
  if (!recent.error && Array.isArray(recent.data) && recent.data.length >= GENERATE_PER_HOUR) {
    throw new LessonsError('Terlalu sering menyusun usulan. Coba lagi sebentar lagi.', 429, 'rate_limited');
  }

  let messages: PromptMessage[];
  let groupKey: string | null = null;
  let nature = 'perlu_dicek';
  let cases: LessonCase[] = [];
  let baseKey: string;
  let source: 'ai' | 'rewrite' = 'ai';
  let replaces: string | null = null;
  // deno-lint-ignore no-explicit-any
  let learning: any = null;

  if (input.learningId) {
    if (!UUID.test(input.learningId)) throw new LessonsError('ID pelajaran tidak valid.', 400);
    const rows = await deps.samaqu(
      `wa_learnings?select=id,scope,topic,instruction,example_question,status&id=eq.${input.learningId}&limit=1`,
    );
    learning = Array.isArray(rows) ? rows[0] : null;
    if (!learning) throw new LessonsError('Pelajaran tidak ditemukan.', 404);
    if (learning.status !== 'published') throw new LessonsError('Hanya pelajaran yang sedang terbit yang bisa ditulis ulang.', 409);
    messages = buildRewritePrompt(learning);
    source = 'rewrite';
    replaces = String(learning.id);
    baseKey = `rewrite:${learning.id}`;
  } else {
    const kind = KINDS.find((entry) => entry.key === input.groupKey);
    if (!kind) throw new LessonsError('Kelompok kasus tidak dikenal.', 400);
    groupKey = kind.key;
    nature = kind.nature;
    const [rows, existing] = await Promise.all([
      deps.samaqu(`wa_escalations?select=${ESC_COLUMNS}&order=created_at.desc&limit=1000`),
      deps.samaqu('wa_learnings?select=topic,instruction&status=eq.published&order=created_at.desc&limit=50'),
    ]);
    cases = buildCases(Array.isArray(rows) ? (rows as EscalationRow[]) : [], kind.key, MAX_CASES);
    if (!cases.length) throw new LessonsError('Belum ada kasus di kelompok ini.', 404);
    messages = buildPrompt(kind, cases, Array.isArray(existing) ? existing : []);
    baseKey = dedupeKey(kind.key, cases.map((item) => item.id));
  }

  // Himpunan kasus yang sama sudah punya usulan aktif: jangan menyusun ulang (hemat biaya, tidak dobel).
  const slots = [0, 1, 2].map((i) => `${baseKey}#${i}`);
  const active = await deps.academy.from('wa_lesson_proposals').select('id,status,dedupe_key').in('dedupe_key', slots);
  if (!active.error && Array.isArray(active.data) && active.data.some((row: { status: string }) => ['proposed', 'publishing', 'published'].includes(row.status))) {
    throw new LessonsError('Kasus yang sama sudah punya usulan aktif. Tinjau atau tolak usulan itu dulu.', 409, 'already_active');
  }

  let result: ModelResult;
  try {
    result = await deps.model(messages);
  } catch (error) {
    if (error instanceof LessonsError) throw error;
    throw new LessonsError(error instanceof Error ? error.message : 'Gagal memanggil AI.', 502);
  }

  const parsed = parseModelLessons(result.content, cases.map((item) => item.id));
  if (!parsed.length) {
    await recordEvent(deps, { actor: actor.email, action: 'generated', detail: { baseKey, produced: 0, model: result.model } });
    return { created: 0, message: 'AI tidak menghasilkan usulan yang bisa dipakai. Coba lagi nanti.', proposals: [] };
  }

  const created: ProposalView[] = [];
  const now = nowOf(deps);
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    const chosen = item.caseIds.length ? cases.filter((c) => item.caseIds.includes(c.id)) : cases;
    const evidence = (source === 'rewrite'
      ? [{ type: 'pelajaran_lama', topic: scrub(learning?.topic, 120), id: String(learning?.id) }]
      : chosen.slice(0, 5).map((c) => ({
          id: c.id,
          inboxId: c.inboxId,
          when: c.when,
          who: c.display?.who ?? c.who,
          status: c.status,
          reason: c.display?.reason ?? c.reason,
          summary: c.display?.summary ?? c.summary,
          answer: (c.display?.answer ?? scrub(c.answer, 400)).slice(0, 400),
        })));
    const row = {
      status: 'proposed',
      group_key: groupKey,
      kind: nature,
      source,
      title: item.title,
      lesson_text: item.lesson,
      question: item.question || null,
      note: item.note || null,
      evidence,
      cases: source === 'rewrite' ? 1 : item.caseIds.length || chosen.length,
      replaces_learning_id: replaces,
      dedupe_key: `${baseKey}#${i}`,
      model: result.model,
      tokens_in: i === 0 ? result.promptTokens : null,
      tokens_out: i === 0 ? result.completionTokens : null,
      created_by: actor.email,
    };
    const { data, error } = await deps.academy.from('wa_lesson_proposals').insert(row).select().single();
    if (error) {
      deps.log?.(`simpan usulan gagal: ${error.message}`);
      continue;
    }
    await recordEvent(deps, { proposalId: String(data.id), actor: actor.email, action: 'generated', detail: { baseKey, source } });
    created.push(toView(data, now));
  }
  return {
    created: created.length,
    message: created.length ? `${created.length} usulan dibuat. Tinjau sebelum diterbitkan.` : 'Usulan tidak bisa disimpan.',
    proposals: created,
  };
}

/** Ubah teks atau judul usulan yang masih menunggu. Hanya owner. */
export async function edit(
  deps: LessonsDeps,
  actor: Actor,
  input: { id: string; lessonText?: string; title?: string },
): Promise<ProposalView> {
  assertOwner(actor);
  const row = await loadProposal(deps, input.id);
  if (row.status !== 'proposed') throw new LessonsError('Hanya usulan yang masih menunggu yang bisa diedit.', 409);
  const patch: Record<string, unknown> = { updated_at: iso(deps) };
  if (typeof input.lessonText === 'string') patch.lesson_text = input.lessonText.replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (typeof input.title === 'string' && input.title.trim()) patch.title = input.title.trim().slice(0, 120);
  const { data, error } = await deps.academy
    .from('wa_lesson_proposals')
    .update(patch)
    .eq('id', input.id)
    .eq('status', 'proposed')
    .select();
  if (error) throw new LessonsError(`Gagal menyimpan: ${error.message}`, 500);
  if (!Array.isArray(data) || !data.length) throw new LessonsError('Usulan sudah berubah. Muat ulang.', 409);
  await recordEvent(deps, {
    proposalId: input.id,
    actor: actor.email,
    action: 'edited',
    detail: { before: row.lesson_text, after: patch.lesson_text ?? row.lesson_text },
  });
  return toView(data[0], nowOf(deps));
}

/** Tolak usulan. Hanya owner. */
export async function reject(deps: LessonsDeps, actor: Actor, input: { id: string; reason?: string }): Promise<ProposalView> {
  assertOwner(actor);
  const row = await loadProposal(deps, input.id);
  if (row.status !== 'proposed') throw new LessonsError('Hanya usulan yang masih menunggu yang bisa ditolak.', 409);
  const now = iso(deps);
  const { data, error } = await deps.academy
    .from('wa_lesson_proposals')
    .update({
      status: 'rejected',
      reject_reason: scrub(input.reason, 300) || null,
      reviewed_by: actor.email,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('id', input.id)
    .eq('status', 'proposed')
    .select();
  if (error) throw new LessonsError(`Gagal menolak: ${error.message}`, 500);
  if (!Array.isArray(data) || !data.length) throw new LessonsError('Usulan sudah berubah. Muat ulang.', 409);
  await recordEvent(deps, { proposalId: input.id, actor: actor.email, action: 'rejected', detail: { reason: input.reason ?? null } });
  return toView(data[0], nowOf(deps));
}

export interface PublishResult {
  proposal: ProposalView;
  learningId: string;
  publishedCount: number;
  warnings: string[];
}

/**
 * Terbitkan usulan menjadi pelajaran yang dibaca agent. Hanya owner. Pengaman keras diperiksa ulang di
 * sini; peringatan lunak butuh `confirmSoft`. Kalau usulan menggantikan pelajaran lama, yang lama diarsipkan.
 */
export async function publish(
  deps: LessonsDeps,
  actor: Actor,
  input: { id: string; lessonText?: string; confirmSoft?: boolean },
): Promise<PublishResult> {
  assertOwner(actor);
  const row = await loadProposal(deps, input.id);
  if (row.status !== 'proposed') throw new LessonsError('Usulan ini sudah diproses.', 409, 'already_processed');

  const text = (typeof input.lessonText === 'string' ? input.lessonText : String(row.lesson_text || '')).replace(/\s+/g, ' ').trim();
  const lint = lintLesson(text);
  if (lint.hard.length) {
    throw new LessonsError(`Teks belum bisa diterbitkan: ${lint.hard.join('; ')}.`, 422, 'lint_hard', { hard: lint.hard });
  }
  if (lint.soft.length && !input.confirmSoft) {
    throw new LessonsError('Ada hal yang perlu dipastikan dulu.', 409, 'needs_confirm', { soft: lint.soft });
  }

  // Klaim atomik: hanya satu permintaan yang boleh menerbitkan usulan ini.
  const claimedAt = iso(deps);
  const claim = await deps.academy
    .from('wa_lesson_proposals')
    .update({ status: 'publishing', updated_at: claimedAt })
    .eq('id', input.id)
    .eq('status', 'proposed')
    .select();
  if (claim.error) throw new LessonsError(`Gagal memproses: ${claim.error.message}`, 500);
  if (!Array.isArray(claim.data) || !claim.data.length) throw new LessonsError('Usulan ini sudah diproses.', 409, 'already_processed');

  const revert = async () => {
    try {
      await deps.academy.from('wa_lesson_proposals').update({ status: 'proposed', updated_at: iso(deps) }).eq('id', input.id).eq('status', 'publishing');
    } catch {
      // status 'publishing' yang menggantung ditandai di daftar (stuck)
    }
  };

  const evidence = Array.isArray(row.evidence) ? row.evidence : [];
  const firstEvidence = evidence[0] as { id?: string; summary?: string } | undefined;
  const sourceEscalation = firstEvidence?.id && UUID.test(String(firstEvidence.id)) ? String(firstEvidence.id) : null;
  let learningId = '';
  try {
    const created = await deps.samaqu('wa_learnings', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        scope: 'global',
        sender: null,
        topic: String(row.title || 'Pelajaran').slice(0, 120),
        instruction: text,
        example_question: firstEvidence?.summary ? scrub(firstEvidence.summary, 300) : null,
        source_escalation_id: sourceEscalation,
        status: 'published',
        created_by: actor.email,
      }),
    });
    learningId = String(Array.isArray(created) ? created[0]?.id : created?.id || '');
    if (!learningId) throw new Error('SAMAQU tidak mengembalikan id pelajaran.');
  } catch (error) {
    await revert();
    throw new LessonsError(`Gagal menerbitkan ke agent: ${error instanceof Error ? error.message : String(error)}`, 502, 'publish_failed');
  }

  const warnings: string[] = [];
  if (row.replaces_learning_id && UUID.test(String(row.replaces_learning_id))) {
    try {
      await deps.samaqu(`wa_learnings?id=eq.${row.replaces_learning_id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'archived', updated_at: iso(deps) }),
      });
      await recordEvent(deps, {
        proposalId: input.id,
        learningId: String(row.replaces_learning_id),
        actor: actor.email,
        action: 'retired',
        detail: { reason: 'digantikan usulan ini' },
      });
    } catch (error) {
      warnings.push(`Pelajaran lama belum berhasil diarsipkan: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const reviewedAt = iso(deps);
  const done = await deps.academy
    .from('wa_lesson_proposals')
    .update({
      status: 'published',
      lesson_text: text,
      published_learning_id: learningId,
      reviewed_by: actor.email,
      reviewed_at: reviewedAt,
      updated_at: reviewedAt,
    })
    .eq('id', input.id)
    .select();
  if (done.error || !Array.isArray(done.data) || !done.data.length) {
    // Pelajaran SUDAH terbit; hanya pencatatan status yang gagal. Jangan diulang, beri id-nya.
    warnings.push(`Pelajaran sudah terbit (id ${learningId}) tetapi status usulan belum tersimpan.`);
  }
  await recordEvent(deps, {
    proposalId: input.id,
    learningId,
    actor: actor.email,
    action: 'published',
    detail: { text, softConfirmed: Boolean(input.confirmSoft) },
  });

  let publishedCount = 0;
  try {
    const rows = await deps.samaqu('wa_learnings?select=id&status=eq.published&scope=eq.global&limit=500');
    publishedCount = Array.isArray(rows) ? rows.length : 0;
  } catch {
    // hanya untuk peringatan jumlah
  }
  if (publishedCount > PUBLISHED_SOFT_LIMIT) {
    warnings.push(`Pelajaran global yang terbit sudah ${publishedCount} (saran maksimal ${PUBLISHED_SOFT_LIMIT}): semuanya dikirim ke agent pada setiap pesan.`);
  }

  const view = toView(done.data?.[0] ?? { ...row, status: 'published', lesson_text: text, published_learning_id: learningId }, nowOf(deps));
  return { proposal: view, learningId, publishedCount, warnings };
}

/** Tarik pelajaran yang sedang terbit (diarsipkan, bisa dilacak). Hanya owner. */
export async function retire(
  deps: LessonsDeps,
  actor: Actor,
  input: { learningId: string },
): Promise<{ learningId: string; proposalId: string | null }> {
  assertOwner(actor);
  if (!UUID.test(String(input.learningId || ''))) throw new LessonsError('ID pelajaran tidak valid.', 400);
  const rows = await deps.samaqu(`wa_learnings?select=id,scope,topic,instruction,status&id=eq.${input.learningId}&limit=1`);
  const learning = Array.isArray(rows) ? rows[0] : null;
  if (!learning) throw new LessonsError('Pelajaran tidak ditemukan.', 404);
  if (learning.status !== 'published') throw new LessonsError('Pelajaran ini sudah tidak terbit.', 409);

  await deps.samaqu(`wa_learnings?id=eq.${input.learningId}&status=eq.published`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'archived', updated_at: iso(deps) }),
  });

  let proposalId: string | null = null;
  try {
    const found = await deps.academy.from('wa_lesson_proposals').select('id').eq('published_learning_id', input.learningId).eq('status', 'published');
    const hit = Array.isArray(found.data) ? found.data[0] : null;
    if (hit) {
      proposalId = String(hit.id);
      await deps.academy.from('wa_lesson_proposals').update({ status: 'retired', updated_at: iso(deps) }).eq('id', proposalId);
    }
  } catch (error) {
    deps.log?.(`tandai usulan ditarik gagal: ${error instanceof Error ? error.message : String(error)}`);
  }
  await recordEvent(deps, {
    proposalId,
    learningId: input.learningId,
    actor: actor.email,
    action: 'retired',
    detail: { topic: learning.topic, instruction: learning.instruction, scope: learning.scope },
  });
  return { learningId: input.learningId, proposalId };
}
