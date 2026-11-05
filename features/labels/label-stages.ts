/** Tahapan label chat customer — satu sumber kebenaran untuk halaman /labels. */
export interface LabelFollowUp {
  title: string;
  detail: string;
}

export interface LabelStage {
  id: string;
  name: string;
  /** Keterangan pendek di bawah nama label pada alur. */
  step: string;
  definition: string;
  criteria: string[];
  actions: string[];
  mistakes: string[];
  followUps?: LabelFollowUp[];
}

export const LABEL_STAGES: LabelStage[] = [
  {
    id: 'leads-baru',
    name: 'Leads Baru',
    step: 'Chat pertama masuk',
    definition: 'Customer baru chat dan datanya belum ada sama sekali.',
    criteria: [
      'Chat pertama masuk, belum pernah dilayani admin mana pun',
      'Nama, ukuran, alamat, atau nomor WhatsApp belum lengkap',
      'Belum ada form atau invoice yang dikirim',
    ],
    actions: [
      'Balas maksimal 5 menit dan tanya kebutuhannya (produk, ukuran, warna)',
      'Lengkapi data customer: nama, ukuran, alamat, nomor WhatsApp',
      'Rekomendasikan produk dan ukuran, lalu kirim form atau invoice',
    ],
    mistakes: [
      'Chat dibiarkan tanpa balasan sampai customer hilang',
      'Form atau invoice sudah terkirim tapi label masih Leads Baru',
    ],
  },
  {
    id: 'proses',
    name: 'Proses',
    step: 'Form/invoice terkirim',
    definition: 'Form atau invoice sudah dikirim, tapi customer belum transfer.',
    criteria: [
      'Form atau invoice sudah terkirim ke customer',
      'Customer masih menimbang, tanya-tanya, atau minta diskon',
      'Belum ada bukti transfer masuk',
    ],
    actions: [
      'Follow up H+1, H+2, H+3 dengan informasi baru (stok, jadwal produksi)',
      'Bantu pilih ukuran atau bahan kalau customer masih ragu',
      'Jangan chat tiap hari tanpa isi baru',
    ],
    mistakes: [
      'Label masih Proses padahal customer sudah transfer',
      'Menagih terus tanpa memberi informasi baru',
    ],
  },
  {
    id: 'closing',
    name: 'Closing',
    step: 'Transfer masuk + input dashboard admin',
    definition: 'Customer sudah transfer dan transaksinya sudah diinput di dashboard admin.',
    criteria: [
      'Bukti transfer masuk dan nominalnya sesuai invoice',
      'Transaksi sudah diinput di dashboard admin',
      'Nomor transaksi sudah tercatat di chat',
    ],
    actions: [
      'Konfirmasi pembayaran diterima dan ucapkan terima kasih',
      'Kirim estimasi produksi dan pengiriman',
      'Simpan nomor transaksi di chat supaya mudah dicari',
    ],
    mistakes: [
      'Transfer masuk tapi transaksi belum diinput di dashboard admin',
      'Label Closing dipasang sebelum nominal transfer dicek',
    ],
  },
  {
    id: 'dikirim',
    name: 'Dikirim',
    step: 'Resi sudah diinfokan',
    definition: 'Resi sudah dikirim ke customer dan paket dalam perjalanan.',
    criteria: [
      'Resi dan nama ekspedisi sudah diinfokan ke customer',
      'Paket sudah diserahkan ke ekspedisi',
      'Customer belum konfirmasi paket diterima',
    ],
    actions: [
      'Kirim nomor resi beserta cara cek posisi paket',
      'Pantau posisi paket dan kabari customer kalau ada kendala ekspedisi',
      'Ingatkan estimasi tiba dan minta foto atau video saat paket dibuka',
    ],
    mistakes: [
      'Label Dikirim dipasang padahal produksi belum selesai',
      'Label Selesai dipasang padahal customer belum konfirmasi terima',
    ],
  },
  {
    id: 'selesai',
    name: 'Selesai',
    step: 'Paket sampai + 3 tindak lanjut',
    definition: 'Paket sudah sampai ke customer dan kondisinya sudah dicek.',
    criteria: [
      'Customer sudah konfirmasi paket diterima',
      'Paket sudah dibuka dan dicek customer',
      'Tidak ada komplain yang masih menggantung',
    ],
    actions: [
      'Jalankan tiga tindak lanjut wajib di bawah ini',
      'Tutup dengan ucapan terima kasih dan tawaran bantuan ukuran',
      'Chat tetap disimpan (tidak diarsip) untuk riwayat repeat order',
    ],
    mistakes: [
      'Selesai dipasang hanya karena paket sudah keluar dari gudang',
      'Tiga tindak lanjut dilewat, jadi testimoni dan repeat order hilang',
    ],
    followUps: [
      {
        title: 'Minta testimoni',
        detail:
          'Minta foto atau video customer memakai produknya, lalu tanyakan izin pemakaian untuk katalog dan konten.',
      },
      {
        title: 'Cek ukuran pas',
        detail:
          'Tanya kenyamanan dan kecocokan ukurannya. Kalau tidak pas, arahkan ke prosedur tukar ukuran, jangan dibiarkan.',
      },
      {
        title: 'Kirim promo repeat order',
        detail:
          'Kirim voucher atau diskon repeat order plus 1–2 rekomendasi produk lanjutan yang cocok dengan pembelian sebelumnya.',
      },
    ],
  },
];

export const LABEL_RULES: string[] = [
  'Label dipasang di chat pertama, maksimal 5 menit setelah balasan pertama dikirim.',
  'Nama label baku: Leads Baru, Proses, Closing, Dikirim, Selesai. Jangan buat varian seperti "Leads", "Prospek", atau "Done".',
  'Satu customer hanya punya satu label aktif. Pindah tahap = ganti label, bukan menumpuk beberapa label.',
  'Pindah label hanya kalau kriteria tahap itu benar-benar sudah terpenuhi, bukan karena perkiraan.',
  'Repeat order mulai lagi dari Proses (form/invoice baru), tidak kembali ke Leads Baru.',
  'Label menempel di chat, bukan di nama kontak atau di grup.',
  'Akhir shift: cek chat tanpa label dan chat yang labelnya tidak berubah lebih dari 3 hari.',
];

export const WHATSAPP_STEPS: string[] = [
  'Buka WhatsApp Business → Setelan → Label → Tambah label.',
  'Buat 5 label dengan nama persis seperti daftar di halaman ini, di setiap HP admin.',
  'Pasang label dari daftar chat: tekan lama chat atau buka menu chat → Label.',
];

export const PLACEMENT = [
  {
    title: 'SOP — aturan dan langkahnya',
    detail: 'Definisi tiap tahap, kriteria pindah label, dan urutan tindak lanjut.',
    href: '/sop',
  },
  {
    title: 'Job Desk — kewajiban hariannya',
    detail: 'Siapa yang wajib mengisi label dan siapa yang mengecek label tiap akhir shift.',
    href: '/jobdesk',
  },
] as const;
