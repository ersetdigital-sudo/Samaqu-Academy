/**
 * Susun teks rekap pesanan untuk customer WhatsApp.
 *
 * Fungsi murni (tanpa fetch) supaya bisa diuji terpisah. Semua angka datang dari
 * `rekap_pesanan` (database), jadi model cukup menyalin hasilnya — tidak menghitung,
 * tidak memutuskan bonus sendiri.
 */

export interface RekapLine {
  label: string; // mis. "Thobe Broken White Nahawand (kain B-01) M"
  quantity: number;
  amount: number; // harga x jumlah
}

export interface RekapService {
  name: string; // mis. "EZ"
  cost: number;
  etd?: string;
}

export interface RekapInput {
  lines: RekapLine[];
  services: RekapService[];
  /** Layanan yang sudah dipilih customer (dicocokkan ke `services`). Kosong = belum. */
  chosenService?: string;
  /** Nama cover kalau customer berhak bonus (sudah dicek stok + customer baru). */
  bonus?: string | null;
  potongPanjang?: { label: string; amount: number } | null;
  /** "Nama, alamat lengkap" — ditulis sekali supaya customer bisa cek salah ketik. */
  shipTo?: string;
}

export interface RekapOutput {
  /** Teks siap kirim ke customer (sudah termasuk pertanyaan penutup). */
  customerText: string;
  /** Status untuk model, bukan untuk customer. */
  final: boolean;
}

export const rupiah = (value: unknown) => 'Rp' + Number(value || 0).toLocaleString('id-ID');

/** Cocokkan pilihan customer ("ez", "J&T EZ", "reguler") ke salah satu layanan. */
export function pickService(services: RekapService[], chosen?: string): RekapService | null {
  if (services.length === 1) return services[0];
  const wanted = String(chosen || '').trim().toLowerCase().replace(/j&t|jnt/g, '').trim();
  if (!wanted) return null;
  return (
    services.find((s) => s.name.toLowerCase() === wanted) ||
    services.find((s) => s.name.toLowerCase().includes(wanted) || wanted.includes(s.name.toLowerCase())) ||
    null
  );
}

export function buildRekap(input: RekapInput): RekapOutput {
  const subtotal =
    input.lines.reduce((sum, line) => sum + line.amount, 0) + (input.potongPanjang?.amount || 0);
  const items = input.lines.map((line) => `${line.label} x${line.quantity} - ${rupiah(line.amount)}`);
  if (input.potongPanjang) {
    items.push(`Potong panjang ${input.potongPanjang.label} - ${rupiah(input.potongPanjang.amount)}`);
  }
  if (input.bonus) items.push(`Bonus ${input.bonus} (gratis)`);

  const shipTo = input.shipTo ? `Dikirim ke ${input.shipTo.replace(/\s+/g, ' ').trim().replace(/\.$/, '')}.` : '';
  const service = pickService(input.services, input.chosenService);

  // Belum ada layanan yang jelas: tampilkan pilihan + total masing-masing, tanya pilih.
  if (!service) {
    const options = input.services.map(
      (s) => `J&T ${s.name} ${rupiah(s.cost)}${s.etd ? ` (${s.etd})` : ''}, total ${rupiah(subtotal + s.cost)}`,
    );
    return {
      final: false,
      customerText: [items.join('\n'), `Untuk alamat Kakak ada ${options.length} pilihan:\n${options.join('\n')}`, 'Kakak pilih yang mana Ka?']
        .join('\n\n'),
    };
  }

  const blocks = [
    'Siap Ka, ini rekap pesanannya:',
    [
      ...items,
      `Ongkir J&T ${service.name}${service.etd ? ` (${service.etd})` : ''} ${rupiah(service.cost)}`,
      `Total ${rupiah(subtotal + service.cost)}`,
    ].join('\n'),
  ];
  if (shipTo) blocks.push(shipTo);
  blocks.push('Sudah benar semua Ka?');
  return { final: true, customerText: blocks.join('\n\n') };
}
