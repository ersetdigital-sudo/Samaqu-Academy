/**
 * Logika tool WA yang dipakai server (Deno) dan local (Node MCP).
 * File ini sengaja tanpa import runtime supaya aman di kedua sisi.
 */

export function rupiah(n) {
  return "Rp" + Number(n || 0).toLocaleString("id-ID");
}

export function buildAcademyProductMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const d = row?.data || {};
    if (!d.name) continue;
    const category = String(d.category || "").toLowerCase();
    if (["size chart", "fabric collection", "product series"].includes(category)) continue;
    const keys = [d.series, d.name, d.code]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    for (const key of keys) map.set(key, d);
  }
  return map;
}

function firstSentence(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const cut = clean.match(/^.*?[.!?](?:\s|$)/);
  return (cut ? cut[0] : clean).trim();
}

export function formatAcademyProductDetail(d) {
  if (!d) return "";
  const lines = [
    `${d.name || "-"}${d.series ? ` (${d.series})` : ""} — ${d.category || "-"}`,
    d.status ? `Status: ${d.status}` : "",
    d.fabric ? `Bahan: ${d.fabric}` : "",
    d.colors ? `Warna: ${d.colors}` : "",
    d.sizes ? `Ukuran: ${d.sizes}` : "",
    d.description ? `Deskripsi: ${d.description}` : "",
    d.advantages ? `Keunggulan:\n${String(d.advantages).split(/\r?\n/).map((line) => `- ${line}`).join("\n")}` : "",
    d.customerPitch ? `Cara jelaskan ke customer: ${d.customerPitch}` : "",
    d.characteristics ? `Karakteristik: ${d.characteristics}` : "",
    d.extra ? `Informasi tambahan:\n${String(d.extra).split(/\r?\n/).map((line) => `- ${line}`).join("\n")}` : "",
    d.videoUrl ? `Video: ${d.videoUrl}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

/* ─────────────────── peta media Product Knowledge ───────────────────
 * Aturan layer (jangan dibalik):
 * - Baris `Product Series` menyimpan media tingkat SERIES (`series|*`) dan menjadi
 *   default untuk semua warna di seri itu. Identitas seri ada di field `name`,
 *   karena baris ini tidak punya field `series`.
 * - Baris produk (Thobe/Kandora) menyimpan media tingkat WARNA (`series|warna`)
 *   yang menimpa default seri. Kalau warna itu belum punya media sendiri,
 *   pencarian jatuh ke `series|*`.
 * - Produk tanpa series (Kandora) memakai kategori sebagai nama seri.
 * Semua kunci memakai satu normalisasi: lowercase + trim.
 */

const MEDIA_EXCLUDED_CATEGORIES = ["size chart", "fabric collection"];

/** Satu bentuk kunci untuk pembuatan maupun pencarian. */
export function mediaKey(value) {
  return String(value || "").trim().toLowerCase();
}

/** Daftar kunci media yang dipakai satu baris `content_items`. */
function mediaKeys(row, seriesDefault) {
  const d = row?.data || {};
  const category = mediaKey(d.category);
  if (!category || MEDIA_EXCLUDED_CATEGORIES.includes(category)) return [];

  // Baris seri: identitas di `name`, bukan `series`. Media seri hanya dipakai sebagai
  // default FOTO. VIDEO seri khusus materi admin (Academy) dan tidak dikirim ke customer.
  if (category === "product series") {
    if (!seriesDefault) return [];
    const series = mediaKey(d.name);
    return series ? [`${series}|*`] : [];
  }

  const colors = String(d.colors || "")
    .split(/[,/]/)
    .map(mediaKey)
    .filter(Boolean);
  if (!colors.length) return [];

  const series = mediaKey(d.series);
  if (series) {
    // Berseira: hanya menimpa warnanya; default seri dipegang baris Product Series.
    return colors.map((color) => `${series}|${color}`);
  }

  // Tanpa series (mis. Kandora): kategori menjadi nama seri, termasuk defaultnya,
  // supaya perilaku lama tetap jalan.
  return [...colors.map((color) => `${category}|${color}`), `${category}|*`];
}

function buildMediaMap(rows, pick, seriesDefault) {
  const map = new Map();
  for (const row of rows || []) {
    const value = String(pick(row?.data || {}) || "").trim();
    if (!value) continue;
    for (const key of mediaKeys(row, seriesDefault)) {
      if (!map.has(key)) map.set(key, value);
    }
  }
  return map;
}

export function buildAcademyPhotoMap(rows) {
  return buildMediaMap(rows, (d) => d.image, true);
}

export function buildAcademyVideoMap(rows) {
  // Video tingkat seri tidak dipakai customer; hanya video per warna (baris produk).
  return buildMediaMap(rows, (d) => d.videoUrl, false);
}

/**
 * Cari media satu produk: warna dulu, lalu default seri.
 * Kosong kalau keduanya tidak ada (bot tidak mengirim media dan mengarahkan ke katalog).
 */
export function lookupMedia(map, series, color) {
  const seriesKey = mediaKey(series);
  if (!map || !seriesKey) return "";
  const colorKey = mediaKey(color);
  if (colorKey) {
    const exact = map.get(`${seriesKey}|${colorKey}`);
    if (exact) return exact;
  }
  return map.get(`${seriesKey}|*`) || "";
}
export function buildProductText({ produkJson, varianJson, cari, kategori, limit, academyPhotos, academyVideos, academyProducts }) {
  const q = String(cari || "").trim().toLowerCase();
  const kat = String(kategori || "").trim().toLowerCase();
  const max = Number(limit) || 5;

  const products = (produkJson?.items || []).filter((p) => {
    if (!p.is_published) return false;
    if (kat && String(p.category || "").toLowerCase() !== kat) return false;
    if (!q) return true;
    const hay = [p.name, p.series, p.category, p.jenis_kain?.name, p.colors]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  if (!products.length) return "Tidak ada produk yang cocok.";

  const byProduct = new Map();
  for (const v of varianJson?.items || []) {
    const key = String(v.product_id);
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key).push(v);
  }

  const allColors = [
    ...new Set(
      [...byProduct.values()]
        .flat()
        .map((v) => String(v.color || "").trim().toLowerCase())
        .filter((color) => color && color !== "default"),
    ),
  ];
  const requestedColor = allColors.find((color) => q.includes(color));

  const rows = products.slice(0, max).map((p) => {
    const variants = byProduct.get(String(p.id)) || [];
    const rawColors = Array.isArray(p.colors) ? p.colors : String(p.colors || "").split(/[,/]/);
    const productColors = [
      ...new Set(
        [...variants.map((v) => v.color), ...rawColors]
          .map((color) => String(color || "").trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    const colorForProduct = requestedColor && productColors.includes(requestedColor) ? requestedColor : "";
    // Produk tanpa series (mis. Kandora) memakai kategori sebagai kunci cadangan,
    // supaya foto dari Product Knowledge tetap ketemu.
    const seriesKey = mediaKey(p.series) || mediaKey(p.category);
    // Banyak produk menyebut warnanya di nama (mis. "Thobe Karim Broken White")
    // padahal variannya "default". Cocokkan warna dari nama supaya foto tidak
    // jatuh ke foto default series (yang bisa warna lain).
    let colorFromName = "";
    if (academyPhotos) {
      const name = String(p.name || "").toLowerCase();
      for (const key of academyPhotos.keys()) {
        const color = String(key).split("|")[1] || "";
        if (color && color !== "*" && name.includes(color)) { colorFromName = color; break; }
      }
    }
    const photoColor = colorForProduct || colorFromName;
    const academyPhoto = lookupMedia(academyPhotos, seriesKey, photoColor);
    const academyVideo = lookupMedia(academyVideos, seriesKey, photoColor);
    const academy = academyProducts?.get(seriesKey) || academyProducts?.get(String(p.name || "").toLowerCase());
    const academyInfo = academy?.customerPitch || firstSentence(academy?.description) || "";
    const colors = variants.map((v) => {
      const stock = v.stock_efektif || {};
      const weights = v.weights || {};
      const sizes = Object.entries(stock)
        .map(([size, n]) => `${size} ${Number(n) || 0}${Number(weights[size]) > 0 ? `/${Number(weights[size])}g` : ""}`)
        .join(" · ");
      return `  ${v.color || "default"}: ${sizes || "-"}`;
    });
    return (
      `• ${p.name}${p.series ? ` (${p.series})` : ""} — ${p.category || "-"} — kain ${p.jenis_kain?.name || p.kain || "-"} — ${rupiah(p.price)} — id:${p.id}` +
      `${Number(p.weight) > 0 ? ` — berat produk ${Number(p.weight)}g` : ""}` +
      `${academyPhoto ? ` — foto: ${academyPhoto}` : ""}` +
      `${academyVideo ? ` — video: ${academyVideo}` : ""}` +
      `${p.stock_efektif != null ? ` — total ${p.stock_efektif}` : ""}\n` +
      (colors.length ? colors.join("\n") : "  (tidak ada ukuran yang dijual)") +
      (academyInfo ? `\n  info: ${academyInfo}` : "")
    );
  });

  return (
    `${Math.min(products.length, max)} dari ${products.length} produk cocok` +
    `${q ? ` untuk "${cari}"` : ""} (stok = stok efektif):\n${rows.join("\n")}`
  );
}

export async function fetchJntStatus(baseUrl, awb) {
  const nomor = String(awb || "").trim().toUpperCase();
  if (!nomor) return "";
  try {
    const res = await fetch(
      `${String(baseUrl).replace(/\/+$/, "")}/api/jnt/track?awb=${encodeURIComponent(nomor)}&refresh=1`,
    );
    const json = await res.json().catch(() => null);
    const history = Array.isArray(json?.data?.history) ? json.data.history : [];
    if (!history.length) return "";
    const last = history[history.length - 1];
    return [last.status, last.city_name, last.date_time].filter(Boolean).join(" · ");
  } catch {
    return "";
  }
}

export function buildOngkirText({ rows, kota, kecamatan, berat_gram, configured }) {
  if (configured === false) return "J&T API belum dikonfigurasi di server SAMAQU.";
  if (!Array.isArray(rows) || !rows.length) {
    return `Tidak ada layanan J&T untuk ${kecamatan}, ${kota} (${berat_gram} g).`;
  }
  const lines = rows.map(
    (r) => `• ${r.service || r.serviceCode} — ${rupiah(r.cost)}${r.etd ? ` — ${r.etd}` : ""}`,
  );
  return `Ongkir J&T Depok → ${kecamatan}, ${kota} · ${berat_gram} g\n${lines.join("\n")}`;
}
