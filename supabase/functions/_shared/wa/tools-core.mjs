/**
 * Logika tool WA yang dipakai server (Deno) dan local (Node MCP).
 * File ini sengaja tanpa import runtime supaya aman di kedua sisi.
 */

export function rupiah(n) {
  return "Rp" + Number(n || 0).toLocaleString("id-ID");
}

export function buildProductText({ produkJson, varianJson, cari, kategori, limit }) {
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

  const rows = products.slice(0, max).map((p) => {
    const variants = byProduct.get(String(p.id)) || [];
    const colors = variants.map((v) => {
      const stock = v.stock_efektif || {};
      const weights = v.weights || {};
      const sizes = Object.entries(stock)
        .map(([size, n]) => `${size} ${Number(n) || 0}${Number(weights[size]) > 0 ? `/${Number(weights[size])}g` : ""}`)
        .join(" · ");
      return `  ${v.color || "default"}: ${sizes || "-"}`;
    });
    return (
      `• ${p.name}${p.series ? ` (${p.series})` : ""} — ${p.category || "-"} — ${rupiah(p.price)}` +
      `${Number(p.weight) > 0 ? ` — berat produk ${Number(p.weight)}g` : ""}` +
      `${p.photo ? ` — foto: ${p.photo}` : ""}` +
      `${p.stock_efektif != null ? ` — total ${p.stock_efektif}` : ""}\n` +
      (colors.length ? colors.join("\n") : "  (tidak ada ukuran yang dijual)")
    );
  });

  return (
    `${Math.min(products.length, max)} dari ${products.length} produk cocok` +
    `${q ? ` untuk "${cari}"` : ""} (stok = stok efektif):\n${rows.join("\n")}`
  );
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
