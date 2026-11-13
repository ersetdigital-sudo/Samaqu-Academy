import {
  buildClosingAddress,
  buildClosingAdminMessage,
  missingClosingFields,
  normalizePhone,
  POTONG_PANJANG_LABEL,
} from '../_shared/wa/closing-core.mjs';
import { coverForCategory } from './cover-stock.ts';

/**
 * Satu langkah closing: catat closing → simpan draft Perlu Review → kabari admin.
 *
 * Dulu dua tool (`catat_closing` lalu `buat_draft_transaksi`). Admin dikabari "tolong
 * diinput" SEBELUM draft ada, dan kadang model lupa membuat draft — admin tidak tahu
 * harus input manual atau approve, dan pesanan bisa dobel. Sekarang pesan admin dikirim
 * SETELAH hasil draft diketahui, jadi isinya selalu sesuai kenyataan.
 */

export interface ClosingDeps {
  opsFetch: (pathname: string, init?: RequestInit) => Promise<any>;
  adminWa: string;
  decideBonus: (covers: Set<string>, nomor: string) => Promise<{ cover: string | null; reason: string }>;
  rupiah: (value: unknown) => string;
}

export interface ClosingContext {
  dry: boolean;
  service?: any;
}

type DraftResult = 'saved' | 'duplicate' | 'failed';

function draftItems(items: any[]) {
  return items.map((item: any) => ({
    product_id: String(item?.product_id || '').trim(),
    product_name: String(item?.product_name || '').trim() || undefined,
    color: String(item?.color || 'default'),
    size: String(item?.size || '').toUpperCase().replace(/^2XL$/, 'XXL'),
    quantity: Math.max(1, Number(item?.quantity) || 1),
    ...(Number(item?.price) > 0 ? { price: Number(item.price) } : {}),
  }));
}

/** Simpan draft transaksi di Perlu Review. Tidak membuat order, tidak memotong stok. */
async function saveDraft(
  args: Record<string, any>,
  nomor: string,
  proofUrl: string | null,
  deps: ClosingDeps,
): Promise<{ result: DraftResult; bonus: boolean; error?: string }> {
  const items = Array.isArray(args.items) ? args.items : [];
  let bonus = false;
  try {
    // Bonus diputuskan server (stok cover + customer baru), sama seperti rekap_pesanan.
    const products = await deps.opsFetch('/api/ops/products');
    const byId = new Map<string, any>((products?.items || []).map((p: any) => [String(p.id), p]));
    const covers = new Set<string>();
    for (const item of items) {
      const cover = coverForCategory(byId.get(String(item?.product_id || ''))?.category);
      if (cover) covers.add(cover);
    }
    bonus = Boolean((await deps.decideBonus(covers, nomor)).cover);
  } catch {
    bonus = false; // ragu = tanpa bonus
  }

  const potong = String(args.potong_panjang || '').trim();
  const payload = {
    free_cover_hanger: bonus,
    customer_name: String(args.nama || '').trim(),
    customer_whatsapp: nomor,
    source: 'whatsapp',
    created_at: new Date().toISOString(),
    shipping_cost: Math.max(0, Number(args.ongkir) || 0),
    shipping_method: String(args.kurir || '').trim(),
    discount: 0,
    payment_status: 'paid',
    notes: [
      potong ? `${POTONG_PANJANG_LABEL}: ${potong}` : '',
      bonus ? 'Bonus Free Cover Hanger (pembelian pertama) - harga normal, diskon Rp35.000 diisi admin' : '',
    ].filter(Boolean).join(' - '),
    potong_panjang: potong,
    shipping: {
      address: String(args.alamat || '').trim(),
      province: String(args.provinsi || '').trim(),
      city: String(args.kota || '').trim(),
      kecamatan: String(args.kecamatan || '').trim(),
      postal_code: String(args.kode_pos || '').trim(),
    },
    items: draftItems(items),
  };
  try {
    const saved = await deps.opsFetch('/api/ops/perlu-review', {
      method: 'POST',
      body: JSON.stringify({
        action: 'draft_create',
        source_inbox_id: String(args.inbox_id || '').trim() || null,
        payload,
        proof_url: proofUrl,
        ai_note: 'Draft dari chat WA',
      }),
    });
    return { result: saved?.duplicate ? 'duplicate' : 'saved', bonus };
  } catch (error: any) {
    return { result: 'failed', bonus, error: String(error?.message || error) };
  }
}

/** Kirim rekap ke admin; bukti transfer sebagai lampiran foto (fallback: link di teks). */
async function notifyAdmin(
  args: Record<string, any>,
  nomor: string,
  nominal: number,
  proofUrl: string | null,
  draft: DraftResult,
  deps: ClosingDeps,
): Promise<void> {
  const base = { ...args, nomor, nominal, draft: draft === 'failed' ? 'failed' : 'saved' };
  const attachment = proofUrl ? { url: proofUrl, filename: `bukti-transfer-${nomor}.jpg` } : {};
  try {
    await deps.opsFetch('/api/ops/wa-inbox', {
      method: 'POST',
      body: JSON.stringify({ target: deps.adminWa, message: buildClosingAdminMessage(base), ...attachment }),
    });
  } catch (error) {
    // Endpoint lama belum menerima URL R2 private -> kirim versi teks + link.
    if (!proofUrl) throw error;
    await deps.opsFetch('/api/ops/wa-inbox', {
      method: 'POST',
      body: JSON.stringify({
        target: deps.adminWa,
        message: buildClosingAdminMessage({ ...base, proof_url: proofUrl }),
      }),
    });
  }
}

export async function runClosing(
  args: Record<string, any>,
  ctx: ClosingContext,
  deps: ClosingDeps,
): Promise<{ text: string; isError?: boolean }> {
  const { rupiah } = deps;
  if (ctx.dry) {
    return { text: `DRY: closing ${args.nomor} · ${rupiah(args.nominal)} tidak disimpan/dikirim.` };
  }
  const missing = missingClosingFields(args);
  const items = Array.isArray(args.items) ? args.items : [];
  if (!items.length) missing.push('items (product_id dari cari_produk)');
  if (missing.length) {
    return {
      isError: true,
      text: `Data closing belum lengkap: ${missing.join(', ')}. Tanya customer dulu, jangan kirim rekap admin.`,
    };
  }
  const missingId = items.find((item: any) => !String(item?.product_id || '').trim());
  if (missingId) {
    return {
      isError: true,
      text: `product_id kosong untuk "${missingId?.product_name || missingId?.size || 'item'}". Ambil id produk dari hasil cari_produk (bagian "id:..."), jangan dikarang.`,
    };
  }
  const nomor = normalizePhone(args.nomor);
  const nominal = Math.round(Number(args.nominal) || 0);
  const inboxId = String(args.inbox_id || '').trim();
  if (!nomor || nominal <= 0 || !inboxId) {
    return { isError: true, text: 'nomor, nominal (>0), dan inbox_id wajib diisi.' };
  }
  if (!ctx.service) return { isError: true, text: 'Database Academy tidak tersedia.' };
  if (!deps.adminWa) return { isError: true, text: 'Nomor admin belum diisi.' };

  // Link bukti dibuat server (bertanda tangan). Jangan pakai proof_url kiriman AI:
  // URL R2 private panjang dan sering terpotong di bagian ?X-Amz-... sehingga mati.
  let proofUrl: string | null = String(args.proof_url || '').trim() || null;
  try {
    const signed = await deps.opsFetch(`/api/ops/wa-media?inbox_id=${encodeURIComponent(inboxId)}`);
    if (signed?.url) proofUrl = String(signed.url);
  } catch {
    // endpoint gagal -> pakai URL apa adanya
  }

  const { data: existing, error: readError } = await ctx.service
    .from('wa_closings')
    .select('id,admin_notified_at')
    .eq('inbox_id', inboxId)
    .maybeSingle();
  if (readError) return { isError: true, text: `Gagal cek closing: ${readError.message}` };

  // Anti-dobel lintas pesan: foto bukti lalu menyusul "siap" = inbox_id beda, closing sama.
  // Nomor + nominal sama dalam 48 jam dianggap closing yang sama -> jangan lapor dua kali.
  const sinceIso = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: recentClosings } = await ctx.service
    .from('wa_closings')
    .select('id,inbox_id,proof_url')
    .eq('sender', nomor)
    .eq('nominal', nominal)
    .gte('created_at', sinceIso)
    .limit(5);
  const duplicate = (recentClosings || []).find((row: any) => String(row.inbox_id) !== inboxId);
  if (duplicate) {
    // Closing sudah tercatat tanpa bukti. Kalau bukti sekarang ada, tempel + kirim FOTO saja.
    if (proofUrl && !duplicate.proof_url) {
      await ctx.service.from('wa_closings').update({ proof_url: proofUrl }).eq('id', duplicate.id);
      try {
        await deps.opsFetch('/api/ops/wa-inbox', {
          method: 'POST',
          body: JSON.stringify({
            target: deps.adminWa,
            message: `Bukti transfer ${String(args.nama || '').trim() || nomor} - ${rupiah(nominal)}`,
            url: proofUrl,
            filename: `bukti-transfer-${nomor}.jpg`,
          }),
        });
      } catch {
        // foto gagal dikirim; bukti tetap tersimpan di database
      }
      return { text: `Closing ${nomor} sudah tercatat; bukti transfer ditambahkan ke admin.` };
    }
    return { text: `Closing ${nomor} - ${rupiah(nominal)} sudah tercatat dan admin sudah dikabari.` };
  }
  if (existing?.admin_notified_at) {
    return { text: `Closing ${nomor} sudah tercatat dan admin sudah dikabari.` };
  }

  const payload = {
    inbox_id: inboxId,
    sender: nomor,
    sender_name: String(args.nama || '').trim() || null,
    nominal,
    proof_url: proofUrl,
    address: buildClosingAddress(args),
    order_detail: String(args.pesanan || '').trim() || null,
    source: 'server',
  };
  const write = existing
    ? await ctx.service.from('wa_closings').update(payload).eq('id', existing.id)
    : await ctx.service.from('wa_closings').insert(payload);
  if (write.error) return { isError: true, text: `Gagal catat closing: ${write.error.message}` };

  const draft = await saveDraft(args, nomor, proofUrl, deps);
  await notifyAdmin(args, nomor, nominal, proofUrl, draft.result, deps);
  await ctx.service
    .from('wa_closings')
    .update({ admin_notified_at: new Date().toISOString() })
    .eq('inbox_id', inboxId);

  if (draft.result === 'failed') {
    return {
      text: `Closing tercatat, draft GAGAL (${draft.error}); admin diminta input manual. Jangan ulangi tool ini.`,
    };
  }
  return {
    text: `Closing tercatat, draft masuk Perlu Review${draft.bonus ? ' (dengan bonus cover)' : ''}, admin sudah dikabari: ${nomor} · ${rupiah(nominal)}.`,
  };
}
