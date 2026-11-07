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
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildAcademyPhotoMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const d = row?.data || {};
    const image = String(d.image || "").trim();
    if (!image) continue;
    const category = String(d.category || "").toLowerCase();
    if (!category || ["size chart", "fabric collection", "product series"].includes(category)) continue;
    const series = String(d.series || "").trim().toLowerCase();
    if (!series) continue;
    const colors = String(d.colors || "")
      .split(/[,/]/)
      .map((color) => color.trim().toLowerCase())
      .filter(Boolean);
    for (const color of colors) {
      if (!map.has(`${series}|${color}`)) map.set(`${series}|${color}`, image);
    }
    if (!map.has(`${series}|*`)) map.set(`${series}|*`, image);
  }
  return map;
}

export function buildProductText({ produkJson, varianJson, cari, kategori, limit, academyPhotos, academyProducts }) {
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
    const seriesKey = String(p.series || "").trim().toLowerCase();
    const academyPhoto =
      (colorForProduct && academyPhotos?.get(`${seriesKey}|${colorForProduct}`)) ||
      (!requestedColor && seriesKey && academyPhotos?.get(`${seriesKey}|*`)) ||
      "";
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
      `• ${p.name}${p.series ? ` (${p.series})` : ""} — ${p.category || "-"} — ${rupiah(p.price)} — id:${p.id}` +
      `${Number(p.weight) > 0 ? ` — berat produk ${Number(p.weight)}g` : ""}` +
      `${academyPhoto || p.photo ? ` — foto: ${academyPhoto || p.photo}` : ""}` +
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
