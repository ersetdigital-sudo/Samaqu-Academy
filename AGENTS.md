# AGENTS.md — Samaqu CS Academy

Read this before changing code. This is an internal customer-service academy for Samaqu.

## Project snapshot

- Live app: https://academy.samaqu.id
- GitHub: https://github.com/ersetdigital-sudo/Samaqu-Academy (public repo — no secrets or PII in tracked files)
- Stack: Next.js 16 (App Router), React 19, TypeScript, Supabase Auth/Postgres/Storage/Edge Functions
- Deployment: Vercel, **fully static export** (`output: 'export'`)
- Supabase project ref: `rbjxjdgqtcwwbvuwtlpg`
- Owner login: Google OAuth is enabled; the owner Gmail is in Supabase `allowed_emails` and the local gitignored `.owner-credentials.txt` (fallback password). Do not put the owner email or password in this repo.
- Legacy reference app: `legacy/index.html` (do not serve it; kept as reference)

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build      # static export -> out/
npm run preview    # serves out/ at http://localhost:4173
npm run audit      # JS/CSS/font bundle audit
```

`.env.local` is required for dev/build:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Vercel needs exactly those two variables. `.env.vercel` is the local import file and is gitignored. Do not add the service-role key, MiMo API key, `AI_SETTINGS_ENCRYPTION_KEY`, or Google client secret to Vercel/client env. AI secrets belong to Supabase Edge Functions only.

## Architecture

```
app/
  layout.tsx                 root layout + AuthProvider + fonts + global CSS
  login/                     static login page (Google + email/password)
  (academy)/                 protected shell, all app routes
  (academy)/*/page.tsx       server page -> client feature view
components/
  providers/                 Auth, Role, Data, Session, Modal, Toast
  layout/                    AppShell, Sidebar, Topbar, GateScreen
  ui/                        Icon, AppLink, RecordForm, etc.
features/                    one folder per domain view
lib/
  supabase/client.ts         browser Supabase singleton
  data/                      repository interface + Supabase/local adapters + seed
  ai/                        remote Edge Function client + local fallback logic
  types.ts, constants.ts, training.ts, product-schema.ts, form-schemas.ts
styles/                      tokens, base, layout, components, pages
supabase/migrations/         applied schema/RLS/allowlist/AI
supabase/functions/ai/       authenticated assistant/reviewer/simulator proxy
supabase/functions/ai-admin/ owner-only provider/model/behavior/usage API
supabase/functions/_shared/  MiMo client, encryption, prompts, retrieval, settings
scripts/                     seed, owner creation, bundle audit, static preview
fonts/                       original Inter TTFs (archive only)
app/fonts/                   subset WOFF2 actually used at runtime
```

### Provider order (important)

Root: `AuthProvider`.

Inside `(academy)`:

`ToastProvider -> AuthGate -> RoleProvider -> DataProvider -> SessionProvider -> ModalProvider -> AppShell`

- `ModalProvider` **must stay inside** Auth/Role/Data providers: modal content uses `useData`/`useRole`/`useAuth`.
- `AuthGate` blocks the app until the Supabase session is known, and redirects unauthenticated users to `/login`.
- `DataProvider` loads the user-scoped Supabase snapshot and gates children with a loading/error screen. Do not render data-dependent children before `hydrated`.
- Progress writes are guarded by `hydrated` to prevent the initial seed snapshot from overwriting stored progress.

### Data flow

- Auth: Supabase email/password + Google OAuth. Session persists in the browser; no middleware/proxy (static export).
- Data: one Supabase repository (`lib/data/supabase-repository.ts`) loads content, progress, activity, assessment attempts, settings, and product image URLs once after login.
- Mutations go through the `AcademyRepository` interface. Keep UI code independent of Supabase; a local adapter remains for reference/offline but is **not active**.
- Content tables use JSONB (`content_items.type/data`), so a new content field usually needs only TS types/forms, not a DB migration.
- Query-param routes are client-side (`/learning?id=...`, `/scripts?tab=case&open=...`, `/training?tab=assessment`). Keep them static.

## Supabase

### Schema

Applied migrations:

- `supabase/migrations/0001_init.sql` — content_items, progress, activity_history, assessment_attempts, assessment_settings, profiles, RLS, storage bucket/policies, triggers.
- `supabase/migrations/0002_allowed_emails.sql` — `allowed_emails` + signup allowlist trigger.
- `supabase/migrations/0003_ai.sql` — ai_settings (service-role only), ai_usage_logs, ai_conversations, ai_messages, memory_items, RLS.
- `supabase/migrations/0004_ai_pricing.sql` — optional pricing + per-user `ai_user_settings` retention.

Key rules:

- Content read: any authenticated user.
- Content write/settings write: owner only via `public.is_owner()` (JWT `app_metadata.role = 'owner'`).
- Progress/activity/attempts: only the owning user (`auth.uid()`).
- Product photos: private `product-images` bucket, signed URLs (24h), owner-only writes.
- `allowed_emails` restricts new auth users. Existing users are unaffected.
- `disable_signup` is true. Do not open public signup without an explicit request and an allowlist review.
- `content_items.sort_order` is **bigint** (new unprefixed items use negative timestamps). Do not change it back to integer.
- Authorization role source: `app_metadata.role` for RLS; `profiles.role` for UI. Keep them in sync when promoting an owner.

### Seeding / owners

```bash
# Requires service-role key in the shell only (never in client env):
SUPABASE_SERVICE_ROLE_KEY=... npm run seed:supabase
OWNER_EMAIL=... SUPABASE_SERVICE_ROLE_KEY=... npm run owner:create
```

- Seed is idempotent (`ignoreDuplicates`); it will not overwrite edited content.
- `owner:create` upserts `allowed_emails`, creates/promotes the user, and writes local `.owner-credentials.txt`. Back up that file first if it contains older credentials.
- Never run destructive SQL against live content/progress without a unique test row and a rollback plan.

### Samaqu AI Brain

- Provider: Xiaomi MiMo, OpenAI-compatible base `https://api.xiaomimimo.com/v1` (`/chat/completions`, `/models`). Token Plan/custom base URLs are supported.
- All MiMo calls run in Supabase Edge Functions. Never call MiMo from the browser and never expose the API key to client code.
- API key storage: AES-GCM encrypted in `ai_settings` (service-role only). Encryption secret is the server-only `AI_SETTINGS_ENCRYPTION_KEY` (32 random bytes, base64).
- `ai-admin` is owner-only (`app_metadata.role = 'owner'`). `ai` is available to authenticated users; `verify_jwt = false` only because both functions validate the bearer token themselves so CORS preflight works.
- Knowledge retrieval: `content_items` with `data.knowledgeStatus = 'draft' | 'archived'` excluded; seed/sample content is flagged `[DATA CONTOH]`. Only `memory_items.status = 'published'` is used as organizational memory.
- Conversations/messages persist in `ai_conversations` / `ai_messages` (own-row RLS). The browser reads/writes them directly; the AI function persists successful exchanges.
- Fallbacks: assistant/reviewer/simulator keep local heuristic fallback when MiMo is not configured or unavailable. The UI labels fallback explicitly; do not claim MiMo integration when in fallback.
- Prompt defaults live in `supabase/functions/_shared/prompts.ts`; behavior overrides are stored centrally in `ai_settings.behavior`. Do not scatter system prompts across the app.
- Rate limits are per user/feature via recent `ai_usage_logs`; usage logs never contain API keys or message content.

Deploy AI functions (requires `SUPABASE_ACCESS_TOKEN` in the shell):

```bash
npx supabase secrets set AI_SETTINGS_ENCRYPTION_KEY="<32-byte-base64>" --remote=rbjxjdgqtcwwbvuwtlpg --yes
npx supabase functions deploy ai ai-admin --use-api --no-verify-jwt --remote=rbjxjdgqtcwwbvuwtlpg --yes
```

Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` into functions; the code prefers `AI_SERVICE_ROLE_KEY` if set, then falls back to the injected service role.

### Google OAuth

- Provider is enabled in Supabase; Client ID/Secret live in Supabase Dashboard, not in Vercel/env.
- Supabase callback URL: `https://rbjxjdgqtcwwbvuwtlpg.supabase.co/auth/v1/callback`
- Supabase Site URL: `https://academy.samaqu.id`
- Redirect allow-list: `http://localhost:3000/**`, `http://localhost:4173/**`, `https://academy.samaqu.id/**`.
- App calls `supabase.auth.signInWithOAuth({ provider: 'google', redirectTo: window.location.origin + '/' })`; `detectSessionInUrl` handles the callback.
- Google Cloud consent screen must include the owner Gmail as a test user while the app is in Testing; or publish the app.
- New Google users must be in `allowed_emails`. Existing allowed users auto-link by verified email.

## UI conventions

- Preserve the existing flat, warm design. Do not add gradients, Tailwind, CDN scripts, or a second UI library.
- CSS is split by concern in `styles/`; use existing variables/classes and `components/ui` primitives.
- **UI/navigation links have no underline in any state.** The global rule in `styles/base.css` removes underlines from all `a` elements; `.content a` deliberately restores them for real article links. Do not reintroduce underlines on nav/breadcrumb/buttons/cards.
- Hover must change background/color, not underline.
- Use `AppLink` (prefetch disabled) for internal links to avoid pulling every route chunk from the CDN.
- Icons: import individually in `components/ui/Icon.tsx`. Never import the whole Lucide library or use a CDN.
- Fonts: use `next/font/local` + the 4 subset WOFF2 files in `app/fonts`; the `fonts/` TTFs are source archive only.
- Keep heavy features route-split. Assistant logic is dynamically imported on first question; do not import it into the app shell.
- Product images are compressed to WebP/JPEG (max 1200px) and stored in Supabase Storage; never put base64 images in localStorage.

## Vercel / resource constraints

- Keep `output: 'export'`; the app must stay fully static.
- **Do not add** API routes, Route Handlers, Server Actions, middleware/proxy, ISR, or dynamic server rendering unless the user explicitly accepts the Vercel Hobby impact.
- Auth/data requests go directly from the browser to Supabase. Avoid per-navigation server requests; data is loaded once per session.
- Prefetch is intentionally off. Do not enable it globally.
- Run `npm run audit` after UI/dependency changes and compare route JS/CSS/font sizes.
- Google OAuth needs no extra Vercel env; its config belongs in Supabase.
- After changing env vars on Vercel, redeploy (NEXT_PUBLIC_* is build-time).

## Testing checklist

Before calling work done:

```bash
npm run typecheck
npm run build         # all routes must be ○ Static
npm run audit
```

Browser checks:

- Login page works at `/login`; Google button redirects to Google; error state is readable.
- Owner login loads Supabase data; sidebar shows the owner role.
- Nav links have no underline (default, hover, active); article links still underline.
- Owner can CRUD content; CS role is read-only (RLS enforced).
- Material progress persists across reload.
- Product image upload goes to Storage and survives reload.
- Assessment attempt/activity persists.
- Owner can open `/settings/ai`: save/replace/delete API key, masked last4 only, test connection, load models, test model, save per-feature models, save/reset/preview behavior, view usage logs.
- CS role cannot open `/settings/ai` or `/settings/memory`; direct API calls to `ai-admin` return 403.
- Assistant: conversation persists across refresh/login, new/delete/resume works, retention deletes old history, fallback is labeled.
- Memory: owner CRUD + search + status; Draft/Archived never appear as official AI knowledge.
- Mobile 390px has no horizontal overflow.
- No new console errors (expected provider-test failures appear as HTTP errors in the console).

If testing against live Supabase, use unique test IDs and remove only the rows you created.

## Do not break

- `ModalProvider` placement inside Auth/Role/Data providers.
- `DataProvider` hydration guards and error/loading gate.
- Static export and zero Vercel Functions/ISR.
- RLS and the `allowed_emails` signup restriction.
- Google OAuth redirect config (Supabase Site URL/allow-list + Google Cloud callback).
- Nav underline reset and `.content` article underline exception.
- Subset fonts and explicit icon imports.
- Private Storage bucket + signed URLs.
- AI key encryption, owner-only `ai-admin`, server-side MiMo calls, and the `AI_SETTINGS_ENCRYPTION_KEY` secret.
- Draft knowledge exclusion and Published-only organizational memory.
- Static export plus Supabase Edge Functions (do not move AI to Vercel Functions).

## Useful files

- `next.config.ts` — static export + Turbopack root.
- `components/providers/AuthProvider.tsx` — session/profile/sign-in/sign-out.
- `components/providers/DataProvider.tsx` — Supabase snapshot + mutations.
- `lib/data/supabase-repository.ts` — DB/Storage adapter.
- `features/auth/LoginView.tsx` — Google + email login UI.
- `components/layout/Sidebar.tsx` — nav/role/logout.
- `components/providers/SessionProvider.tsx` — AI conversation state, persistence, retention, local fallback.
- `lib/ai/remote.ts` — `functions.invoke` client and response envelopes.
- `features/ai-admin/` — AI settings tabs + organizational memory UI (`MemoryView` orchestrates; `MemoryCard`, `MemoryForm`, `memory-repository`, `memory-labels` split by concern).
- `supabase/functions/_shared/prompts.ts` — central system prompts and behavior schema.
- `supabase/functions/_shared/knowledge.ts` — `buildAiContext` orchestrator (published-only retrieval + org memory).
- `supabase/functions/_shared/knowledge-documents.ts` — row → document/source mapping and field labels.
- `supabase/functions/_shared/knowledge-ranking.ts` — tokenizer, synonyms, scoring/ranking.
- `supabase/functions/_shared/knowledge-conversations.ts` — older-conversation context retrieval.
- `styles/base.css` — global link/underline rules.
- `supabase/migrations/` — schema/RLS/allowlist/AI source of truth.
- `scripts/` — seed/owner/audit/preview tooling.
