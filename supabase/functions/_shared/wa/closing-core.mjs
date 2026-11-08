export function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("62")) return `0${digits.slice(2)}`;
  if (digits.startsWith("0")) return digits;
  return `0${digits}`;
}

export function rupiahClosing(value) {
  return "Rp" + Number(value || 0).toLocaleString("id-ID");
}

export function missingClosingFields(input) {
  const required = [
    ["nama", "nama"],
    ["nomor", "nomor HP"],
    ["alamat", "alamat"],
    ["kecamatan", "kecamatan"],
    ["kota", "kota/kabupaten"],
    ["provinsi", "provinsi"],
    ["kode_pos", "kode pos"],
    ["pesanan", "pesanan"],
  ];
  return required.filter(([key]) => !String(input?.[key] || "").trim()).map(([, label]) => label);
}

/** Satu baris alamat, format yang dikenali "Tempel alamat lengkap, isi otomatis". */
export function buildClosingAddress(input) {
  const nama = String(input?.nama || "").trim();
  const nomor = normalizePhone(input?.nomor);
  const alamat = String(input?.alamat || "").trim();
  const kelurahan = String(input?.kelurahan || "").trim();
  const kecamatan = String(input?.kecamatan || "").trim();
  const kota = String(input?.kota || "").trim();
  const provinsi = String(input?.provinsi || "").trim();
  const kodePos = String(input?.kode_pos || "").trim();

  const who = [nama, nomor].filter(Boolean).join(" · ");
  const parts = [who, alamat];
  if (kelurahan) parts.push(`Kel. ${kelurahan}`);
  if (kecamatan) parts.push(`Kec. ${kecamatan}`);
  if (kota) parts.push(kota);
  if (provinsi) parts.push(provinsi);
  if (kodePos) parts.push(kodePos);
  return parts.filter(Boolean).join(", ");
}

export function buildClosingAdminMessage(input) {
  const address = buildClosingAddress(input);
  const lines = [
    "Halo admin, ada closing baru nih. Nanti tolong diinput ya.",
    "",
    "TEMPEL ALAMAT:",
    address,
    "",
    "PESANAN:",
    String(input?.pesanan || "").trim() || "-",
  ];
  const kurir = String(input?.kurir || "").trim();
  const ongkir = Number(input?.ongkir) || 0;
  // Baris kosong setelah daftar pesanan supaya rekap lebih enak dibaca.
  lines.push("");
  if (kurir || ongkir) {
    lines.push(`${kurir || "Kurir"}${ongkir ? ` — ${rupiahClosing(ongkir)}` : ""}`);
  }
  lines.push(`Total transfer: ${rupiahClosing(input?.nominal)}`);
  if (input?.proof_url) lines.push(`Bukti: ${String(input.proof_url).trim()}`);
  return lines.join("\n");
}
