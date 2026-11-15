import type { ToolCallRecord } from './redact.ts';

/**
 * Pelajaran AI Fase 1: pencatatan tambahan di luar log run utama.
 *
 * Dipisah dari index.ts dan memakai tipe klien minimal supaya bisa diuji dengan klien palsu.
 * Aturan keras: fungsi ini TIDAK PERNAH melempar error dan dipanggil SESUDAH log utama tersimpan,
 * jadi kegagalannya (tabel/kolom belum ada, jaringan, dll.) tidak boleh mengganggu run bot.
 */

interface QueryResult {
  error: { message: string } | null;
}

/** Bagian klien Supabase yang dipakai di sini. */
export interface ExtrasClient {
  from(table: string): {
    update(values: Record<string, unknown>): { eq(column: string, value: unknown): PromiseLike<QueryResult> };
    insert(values: Record<string, unknown>[]): PromiseLike<QueryResult>;
  };
}

/** Run yang dicatat: hanya run nyata (live) dan yang berakhir error. Mode uji (test/dry) dilewati. */
export function shouldRecord(mode: string): boolean {
  return mode === 'live' || mode === 'error';
}

export async function recordRunExtras(
  service: ExtrasClient,
  id: number | null,
  mode: string,
  inboxIds?: string[],
  toolCalls?: ToolCallRecord[],
  log: (message: string) => void = (message) => console.error(message),
): Promise<void> {
  if (!id || !shouldRecord(mode)) return;
  try {
    const ids = (inboxIds || []).map((value) => String(value)).filter(Boolean).slice(0, 50);
    if (ids.length) {
      const { error } = await service.from('wa_agent_runs').update({ inbox_ids: ids }).eq('id', id);
      if (error) log(`catat inbox_ids gagal: ${error.message}`);
    }
    if (toolCalls?.length) {
      const rows = toolCalls.map((call) => ({ run_id: id, ...call }));
      const { error } = await service.from('wa_tool_calls').insert(rows);
      if (error) log(`catat wa_tool_calls gagal: ${error.message}`);
    }
  } catch (error) {
    log(`catat jejak tool gagal: ${error instanceof Error ? error.message : String(error)}`);
  }
}
