import crypto from 'node:crypto';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const email = process.env.OWNER_EMAIL;
if (!email) {
  throw new Error('OWNER_EMAIL is required (and SUPABASE_SERVICE_ROLE_KEY in the shell).');
}
const password = crypto.randomBytes(18).toString('base64url');
const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const users = await supabase.auth.admin.listUsers({ page: 1, perPage: 100 });
if (users.error) throw users.error;
const existing = users.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());

let userId;
let created = false;
if (existing) {
  userId = existing.id;
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { ...existing.app_metadata, role: 'owner' },
    user_metadata: { ...existing.user_metadata, full_name: existing.user_metadata?.full_name || 'Owner Samaqu' },
  });
  if (error) throw error;
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'owner' },
    user_metadata: { full_name: 'Owner Samaqu' },
  });
  if (error) throw error;
  userId = data.user.id;
  created = true;
}

const { error: profileError } = await supabase.from('profiles').upsert(
  {
    id: userId,
    full_name: 'Owner Samaqu',
    role: 'owner',
  },
  { onConflict: 'id' },
);
if (profileError) throw profileError;

const credentialsPath = new URL('../.owner-credentials.txt', import.meta.url);
fs.writeFileSync(
  credentialsPath,
  [
    'SAMAQU CS ACADEMY — OWNER ACCOUNT',
    `Email: ${email}`,
    created ? `Password: ${password}` : 'Password: (akun sudah ada; password tidak diubah)',
    '',
    'Segera ganti password lewat Supabase Dashboard → Authentication → Users.',
    'Hapus file ini setelah kredensial disimpan.',
  ].join('\n'),
  { mode: 0o600 },
);

console.log(created ? 'Owner user created.' : 'Owner user already existed; role ensured.');
console.log(`Email: ${email}`);
console.log('Credentials written to .owner-credentials.txt (not printed).');
