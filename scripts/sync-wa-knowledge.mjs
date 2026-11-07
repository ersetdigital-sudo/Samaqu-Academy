#!/usr/bin/env node
/**
 * Sync sumber tunggal WA ke database Academy.
 *
 * Sumber:
 *   supabase/functions/_shared/wa/persona.md
 *   supabase/functions/_shared/wa/memory.md
 *
 * Target:
 *   ai_settings.behavior.systemInstructions  (field yang dibaca server)
 *   memory_items
 *
 * Jalankan manual setelah edit file:
 *   node scripts/sync-wa-knowledge.mjs
 *
 * Env salah satu:
 *   SUPABASE_MANAGEMENT_TOKEN + SUPABASE_PROJECT_REF
 *   atau NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const waDir = path.join(root, "supabase", "functions", "_shared", "wa");
const persona = fs.readFileSync(path.join(waDir, "persona.md"), "utf8");
const memory = fs.readFileSync(path.join(waDir, "memory.md"), "utf8");

const dryRun = process.argv.includes("--dry-run");
const projectRef = process.env.SUPABASE_PROJECT_REF || "rbjxjdgqtcwwbvuwtlpg";
const managementToken = process.env.SUPABASE_MANAGEMENT_TOKEN || "";
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function sections(text) {
  const parts = text.split(/^##\s+/m).slice(1);
  return parts
    .map((part) => {
      const [rawHead, ...rest] = part.split(/\r?\n/);
      const head = rawHead.trim();
      const category = (head.match(/\(([^)]+)\)\s*$/) || [])[1] || "Produk";
      const title = head.replace(/\s*\([^)]*\)\s*$/, "").trim();
      const content = rest.join("\n").trim();
      return title && content ? { title, category, content } : null;
    })
    .filter(Boolean);
}

const memSections = sections(memory);

function sqlQuote(value) {
  return String(value).replaceAll("'", "''");
}

async function query(sql) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${managementToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function rest(pathname, init = {}) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase REST ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function syncViaManagement() {
  if (dryRun) {
    console.log(`[dry] behavior.systemInstructions ← persona.md (${persona.length} karakter)`);
    for (const section of memSections) console.log(`[dry] memory: ${section.title} (${section.content.length} karakter)`);
    return;
  }
  const ptag = persona.includes("$wa_persona$") ? "$wa_persona2$" : "$wa_persona$";
  await query(
    `update public.ai_settings set behavior = jsonb_set(behavior, '{systemInstructions}', to_jsonb(${ptag}${persona}${ptag}::text), true), updated_at = now() where id = 1;`,
  );
  console.log("✓ behavior.systemInstructions");

  const existing = await query("select id, title from public.memory_items;");
  const byTitle = new Map((existing || []).map((row) => [row.title, row.id]));

  for (const section of memSections) {
    const tag = section.content.includes("$wa_mem$") ? "$wa_mem2$" : "$wa_mem$";
    const id = byTitle.get(section.title);
    if (id) {
      await query(
        `update public.memory_items set content = ${tag}${section.content}${tag}, version = version + 1, updated_at = now() where id = '${sqlQuote(id)}';`,
      );
      console.log(`✓ memory: ${section.title}`);
    } else {
      const newId = `mem_${randomUUID()}`;
      await query(
        `insert into public.memory_items (id, title, category, content, source, status, version, created_at, updated_at) values ('${sqlQuote(newId)}', '${sqlQuote(section.title)}', '${sqlQuote(section.category)}', ${tag}${section.content}${tag}, 'sync', 'published', 1, now(), now());`,
      );
      console.log(`+ memory: ${section.title}`);
    }
  }
}

async function syncViaRest() {
  if (dryRun) {
    console.log(`[dry] behavior.systemInstructions ← persona.md (${persona.length} karakter)`);
    for (const section of memSections) console.log(`[dry] memory: ${section.title} (${section.content.length} karakter)`);
    return;
  }
  const row = await rest("ai_settings?id=eq.1&select=behavior");
  const behavior = row?.[0]?.behavior || {};
  behavior.systemInstructions = persona;
  await rest("ai_settings?id=eq.1", {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ behavior }),
  });
  console.log("✓ behavior.systemInstructions");

  const existing = await rest("memory_items?select=id,title,version");
  const byTitle = new Map((existing || []).map((item) => [item.title, item]));

  for (const section of memSections) {
    const current = byTitle.get(section.title);
    const id = current?.id;
    if (id) {
      await rest(`memory_items?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          content: section.content,
          version: Number(current.version || 0) + 1,
          updated_at: new Date().toISOString(),
        }),
      });
      console.log(`✓ memory: ${section.title}`);
    } else {
      await rest("memory_items", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          id: `mem_${randomUUID()}`,
          title: section.title,
          category: section.category,
          content: section.content,
          source: "sync",
          status: "published",
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      console.log(`+ memory: ${section.title}`);
    }
  }
}

if (managementToken) {
  await syncViaManagement();
} else if (supabaseUrl && serviceKey) {
  await syncViaRest();
} else {
  throw new Error(
    "Isi SUPABASE_MANAGEMENT_TOKEN + SUPABASE_PROJECT_REF, atau NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
  );
}
console.log(`Selesai. ${memSections.length} bagian memory.`);
