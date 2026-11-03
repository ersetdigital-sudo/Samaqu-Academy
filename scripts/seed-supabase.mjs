import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const seed = JSON.parse(
  fs.readFileSync(new URL('../lib/data/seed/legacy-seed.json', import.meta.url), 'utf8'),
);

const collections = [
  ['materials', 'material'],
  ['scripts', 'script'],
  ['cases', 'case'],
  ['beforeAfter', 'before_after'],
  ['flow', 'flow'],
  ['guides', 'guide'],
  ['problems', 'problem'],
  ['scenarios', 'scenario'],
  ['quiz', 'quiz'],
  ['products', 'product'],
];

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const rows = [];
for (const [key, type] of collections) {
  const items = seed.content[key] ?? [];
  items.forEach((item, index) => {
    const { id, ...data } = item;
    rows.push({
      id,
      type,
      sort_order: type === 'flow' || type === 'guide' ? Number(data.no ?? index + 1) : index,
      data,
    });
  });
}

const { error } = await supabase
  .from('content_items')
  .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
if (error) throw error;

console.log(`Seeded ${rows.length} content items (existing rows left untouched).`);
for (const [, type] of collections) {
  console.log(`  ${type}: ${rows.filter((row) => row.type === type).length}`);
}
