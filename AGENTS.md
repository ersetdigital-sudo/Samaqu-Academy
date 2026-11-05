# AGENTS.md — Samaqu CS Academy

Read this before changing code. This is an internal customer-service academy for Samaqu.

## Rules of engagement (owner's standing instructions)

These are durable working rules. Follow them without re-asking.

1. **Definition of done → auto-commit.** When `npm run typecheck` passes with 0 errors *and*
   the requested tests pass, commit and push immediately. Do not ask for permission.
2. **Stop conditions.** Halt and report instead of improvising when:
   - a check fails (typecheck, build, migration, live test), or
   - the work would touch the **production database** (writes, DDL, deletes), or
   - a deploy is needed but was not explicitly authorized.
3. **Never read or reuse secrets from disk.** `.owner-credentials.txt` holds a real production
   owner password. Do not use it to log in unless the owner explicitly authorizes it for that
   run. Never print, commit, or copy secret values.
4. **Report cap: 10–15 lines.** Prefer one small text diagram over prose.
5. **No unrequested actions.** Do not deploy, do not build frontend, do not `git commit` outside
   rule 1, and do not run destructive SQL as a shortcut.
6. **Verify before claiming.** Reproduce bugs (browser/CLI) before fixing; show the evidence.
   If a diagnosis turns out wrong, say so plainly and correct it.
7. **Modular by default.** Split by concern (see `features/ai-admin` and `_shared/knowledge-*`);
   keep orchestrator files thin.
8. **Admit uncertainty.** State assumptions explicitly; when the owner corrects a diagnosis,
   verify the correction against the code before proceeding.

## Project snapshot

- Live app: https://academy.samaqu.id
- GitHub: https://github.com/ersetdigital-sudo/Samaqu-Academy (public repo — no secrets or PII in tracked files)
- Stack: Next.js 16 (App Router), React 19, TypeScript, Supabase Auth/Postgres/Storage/Edge Functions
- Deployment: Vercel, **fully static export** (`output: 'export'`)
- Vercel account: `oosshop01-2847` → project `academy`. The `ersetdigital-sudo` Vercel account
  does **not** contain this project — checking the wrong account gives false "not found" results.
- Supabase project ref: `rbjxjdgqtcwwbvuwtlpg`
- Owner login: Google OAuth is enabled; the owner Gmail is in Supabase `allowed_emails` and the local gitignored `.owner-credentials.txt` (fallback password). Do not put the owner email or password in this repo.
- Legacy reference app: `legacy/index.html` (do not serve it; kept as reference)
- HTML mockup source of truth for UI: outside this repo. Do not copy it into the project root —
  a stray `pages/` folder collides with the App Router and breaks `next build`.

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
- `supabase/migrations/0006_learning_path.sql` — `learning_levels`, `content_items.level_id`/`is_required`, `quiz_questions`, `quiz_attempts` + RLS.

Key rules:

- Content read: any authenticated user.
- Content write/settings write: owner only via `public.is_owner()` (JWT `app_metadata.role = 'owner'`).
- Progress/activity/attempts: only the owning user (`auth.uid()`).
- Product photos: no Storage usage; the owner pastes a Cloudinary URL into the product form (`data.image`).
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
- Product photos are Cloudinary URLs typed into the form and stored in the product's `image` field; the app never uploads files and never puts base64 images in localStorage.

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
- A product photo URL saved in the form renders on the card, the detail modal, and the series matrix after reload.
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
- Product photos stay URLs (`Product.image`); there is no Storage upload path any more.
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

## Work log

Durable record of what has been built and fixed. Append new entries; do not rewrite history.

### 2026-11-03 — Samaqu AI brain (MiMo)

- Added `ai` and `ai-admin` Edge Functions with MiMo (OpenAI-compatible) proxy, rate limits,
  usage logging, and graceful `not_configured` responses.
- Owner-only `/settings/ai` (provider, models, behavior, usage) and `/settings/memory`
  (organizational memory). Schema in `0003_ai.sql`, `0004_ai_pricing.sql`.
- Split knowledge retrieval into `_shared/knowledge-{labels,documents,ranking,conversations}.ts`
  with `knowledge.ts` as a thin orchestrator.
- Split `features/ai-admin` memory UI into `MemoryView` (orchestrator), `MemoryCard`,
  `MemoryForm`, `memory-repository`, `memory-labels`.
- Encryption key set in Supabase function secrets (value never stored in the repo).

### 2026-11-03 — MiMo parameter corrections (verified against official docs)

Docs contradicted the original assumptions. Authoritative findings:

| Topic | Correct per docs |
|---|---|
| Output limit | `max_completion_tokens` (not `max_tokens`) on `/v1/chat/completions` |
| Thinking | `thinking: {type: 'enabled' \| 'disabled'}`; **on by default** for all v2.6 models |
| Reasoning | separate `message.reasoning_content` — never `<think>` tags in `content` |
| Valid model IDs | `mimo-v2.6-pro`, `mimo-v2.6-flash`, `mimo-v2.6-pro-ultraspeed` (no bare `mimo-v2.6`) |
| Retired IDs | `mimo-v2.5`, `mimo-v2.5-pro` — dead since 21 Oct 2026 |
| Auth | both `Authorization: Bearer` and `api-key` accepted |

- `_shared/mimo.ts`: sends `max_completion_tokens`, `thinking` (default `disabled`), returns
  `reasoningContent` and `finishReason`, and raises a clear error on empty content when
  `finish_reason === 'length'`.
- Per-feature thinking: `ai_settings.feature_thinking` (migration `0005`), `resolveThinking()`
  defaults to `disabled`. `save_models` tolerates the column being absent.
- Migration `0005_ai_thinking.sql` is atomic (`begin…commit`) and idempotent. Note: `CASE`
  branches must share one type — wrap text literals with `to_jsonb(...)` when the other branch
  is `jsonb`, otherwise Postgres raises `22P02`.

### 2026-11-03 — Simulator role fix

- Symptom: simulated customer sometimes replied like CS ("Ukuran M ready ya kak?").
- Root cause: prompt injected `Tujuan pelatihan admin` (the CS goal), so the model adopted the
  admin viewpoint when the trainee's reply was thin. Message role mapping was correct.
- Fix: prompt now carries only persona + situation + what the customer wants, plus an explicit
  ban on offering products or asking sizing questions. Completion marker changed from `DONE`
  to `[[SELESAI_SIMULASI]]` (`SIMULATOR_DONE` in `prompts.ts`).

### 2026-11-03 — Guidelines page crash

- Symptom: `/guidelines` rendered "This page couldn't load" for any guide row whose
  `points`/`dos`/`donts`/`pairs` were `NULL`.
- Root cause: migration regression. Both `legacy/index.html` and the HTML mockup guard with
  `(g.points || [])`; the React rewrite dropped the guard and read `.length` on `null`.
- Fix: `GuideSection` fields are optional/nullable in `lib/types.ts`; `?? []` restored in
  `GuidelinesView.tsx` (4 sites) and `lib/ai/assistant.ts`. Data was left untouched.

### 2026-11-03 — Collapsible sidebar

- Topbar gained a `panel-left` toggle; the sidebar collapses to a 76px icon rail on desktop
  (`.sb.min`, `.sb-collapsed`, `.main` margin animates). Rail hides labels/groups, shows a
  hover tooltip from the item's `title`.
- Preference persists in `localStorage` (`samaqu:sidebar-collapsed`) and is restored after mount.
- Mobile drawer unchanged in behaviour but now has a backdrop blur, an X button in the brand row,
  and closes on Escape. `.sb-burger` (X) must stay `display:none` above 820px.
- `prefers-reduced-motion` disables the transitions.

### 2026-11-04 — Sidebar header title clipped

- Symptom: "Samaqu CS Academy" cut off in the brand row, close (X) crowding it — even on desktop.
- Root cause: `.sb-burger { display:none }` is declared before `.icb { display:grid }`; equal
  specificity, so `.icb` won and the X showed at every width. The text block also had no
  `flex: 1` and no `text-overflow`.
- Fix: `.brand .sb-burger` scopes the hide/show (`.icb` can no longer override it); `.brand-id`
  is `flex: 1 1 auto`; title/subtitle truncate with an ellipsis. Drawer (`≤820px`) uses 16px
  brand padding and a 13.5px title so the full name fits next to the X. Rail mode keeps the logo
  centred (`.sb.min .brand-id`).

### 2026-11-04 — Before & After: "Hindari" + "Prinsip"

- No DDL needed: `content_items.data` is JSONB, so the new keys are optional fields only
  (`BeforeAfter.mistakeToAvoid?: string`, `principles?: string[]`, `mark?: CaseMark`).
- `RecordForm` gained a `list` field type (add/remove rows, reorder with arrows) used by the
  new `principles` field; `BEFORE_AFTER_FIELDS` also has `mark` and `mistakeToAvoid`.
- `features/scripts/BeforeAfterGuidance.tsx` renders the two blocks above the Before/After
  comparison on the BA card and returns `null` when both are empty, so old rows are unchanged.
- Seeded "Proactive Customer Assistance" (Size Consultation, Materi Pembelajaran).

### 2026-11-04 — Before & After transcript readability

- Symptom: the Before/After chat text rendered as one run-on paragraph (CSS collapsed the
  `\n` between `C:`/`A:` turns) and the two cards squeezed into ~190px columns on tablet.
- Fix: `.dd .ba-text { white-space: pre-line; line-height: 1.75; }` keeps one chat turn per
  row; the `.dd` pair now stacks below 980px instead of 600px. Applied in `ScriptsView.tsx`
  and `GuidelinesView.tsx` (the same block is reused in guideline 06). Content unchanged.

### 2026-11-04 — Before & After rendered as chat bubbles

- Follow-up: the owner asked for the Chat Flow treatment ("Customer"/"Admin" labels, white
  left bubble / dark right bubble). `ScriptsView` and `GuidelinesView` now render the Before and
  After texts through the existing `ChatBubbles` (same parser as Chat Flow), wrapped in the new
  `.ba-chat` flex-gap container. `.dd .ba-text` removed; data untouched.
- Manual entries render the same only when each line starts with `C:`/`A:` (`parseChatText`
  defaults unknown prefixes to customer, so an unprefixed text becomes one long customer bubble).
  `BEFORE_AFTER_FIELDS.hint` now states that rule on both fields.

### 2026-11-04 — Product Knowledge split into focused sections

- `/products` no longer has a "Semua" tab. It opens on four landing cards (Series, Bahan, Size
  Chart, Produk) and each section shows only its own categories. Query param is
  `?section=series|fabric|size|product`; legacy `?category=...` is mapped to its section by
  `sectionForCategory()` and a bare `?open=id` gets the owning section added behind the modal.
- New files: `product-sections.ts` (section meta + category mapping, single source of truth),
  `ProductCard.tsx` (tile extracted from the old view), `ProductHubCards.tsx` (landing cards).
  `ProductsView.tsx` is now only the orchestrator (section, search, form/delete modals).
- The Produk chip filter is derived from `?category=` instead of local state, so the URL can
  never disagree with the visible filter.
- Search stays cross-category and shows the card's category tag; an empty query returns to the
  active section. `SeriesMatrix` renders only in the Series section.
- Style: `.hub-card`/`.hub-ic` added to `styles/pages.css`; no new dependency. `/products` JS
  gzip 243.8 → 244.7 KB (+0.37%).

### 2026-11-04 — Series price in matrix

- `PRODUCT_SCHEMA['Product Series']` gained `price` ("Harga Mulai (Rp)", `type: 'number'`, hint
  acuan size M / kain B-01). `Product.price` already existed as a string, so no new key and no
  migration; ProductDetail renders it through `rupiah()` like garments.
- `SeriesMatrix` shows `mulai Rp…` (`rupiah(item.price)`) under the series code in each cell, read
  from the row; series without a price render exactly as before.
- Data: Jiharkah/Nahawand 359000; Imron/Bayati/Karim/Imalah 374000.

### 2026-11-04 — Product photos are pasted URLs (Cloudinary)

- Owner decision: no upload in the app, photos live in Cloudinary and only the URL is stored;
  the empty `product-images` bucket was retired (deleted 0 objects — nothing to move).
- `Product.image` (JSONB `data.image`) replaces `AcademySnapshot.images`. Removed the upload path:
  `saveImage`/`deleteImage` on the repository, `saveProductImage`/`deleteProductImage` in
  `DataProvider`, `lib/data/image-store.ts`, and `lib/utils/image.ts` (`compressImage`).
- `ProductForm` Media block is now one URL field with a live preview and an `http(s)` check;
  card, detail modal, and `SeriesMatrix` read `product.image` directly, so an edit shows instantly.

### 2026-11-04 — Script notes keep line breaks as bullets

- Symptom: "Catatan Penggunaan" was stored with `\n` but rendered as one run-on
  paragraph (`<p>` collapses newlines).
- Fix: `ScriptDetail` splits `script.notes` per line into `ul.notes-list` (`.notes-list`
  in `styles/components.css`, disc bullets, 18px indent); Before & After `notes` uses
  `white-space: pre-wrap` in `ScriptsView`. Data and forms untouched — newlines were
  always saved correctly.

### 2026-11-04 — Sample-only hint in script detail

- The "Bagian dalam [kurung] wajib diganti…" Note rendered for every script, including
  edited ones. It now renders only when `script.sample === true` (untouched seed content);
  both script submit paths already write `sample: false`, so edited scripts lose the hint
  without any data change.

### 2026-11-04 — Catatan script diedit per poin (bullet otomatis)

- Sebelumnya catatan hanya jadi bullet kalau owner menekan Enter di textarea; kalau ditulis
  satu paragraf hasilnya satu bullet panjang.
- `SCRIPT_FIELDS.notes` kini `type: 'list'` (baris bernomor, tambah/hapus/urut) dengan satu
  baris kosong siap isi untuk script baru; `ScriptsView` menyimpan balik sebagai
  `notes: string.join('\n')`, jadi format JSONB tidak berubah dan pembaca lama
  (`ScriptDetail`, assistant, retrieval AI) tetap jalan.
- `RecordForm.toFormValue` untuk `list` menerima string multi-baris (split `\n`), sehingga
  catatan script lama tetap muncul per poin saat diedit.

### 2026-11-04 — Variasi respons diedit per baris

- `SCRIPT_FIELDS.variants` kini `type: 'list'` (baris bernomor, tambah/hapus/urut) seperti
  Catatan Penggunaan, dengan contoh isi pada baris pertama agar mudah diisi.
- `RecordForm` memakai `field.placeholder` untuk baris pertama field `list` (baris lain tetap
  `"<label> <n>"`).
- Script baru mulai dengan satu baris variasi kosong (`variants: ['']`); `ScriptsView` tetap
  menyimpan `variants` sebagai `string[]`, jadi format JSONB dan pembaca lama tidak berubah.

### 2026-11-04 — Learning Center jadi jalur belajar (Fase 1)

- Migration `0006_learning_path.sql` (atomic + idempotent): tabel `learning_levels` (5 level),
  kolom `content_items.level_id` + `is_required`, tabel `quiz_questions` (25 soal; 5 per materi
  2–6, hanya dari isi materi) dan `quiz_attempts`. RLS: level/soal dibaca semua user login,
  ditulis owner; attempt hanya baris milik `auth.uid()`. Materi 1–3 → Level 1, 4–6 → Level 2;
  "Teknik Komunikasi Efektif" pindah ke Communication Guidelines; progres lama 10% → 50%.
- Konfigurasi belajar di `lib/learning.ts`: `LEARNING_CONFIG` (`passMark: 80`, `lockLevels: true`,
  `openedProgress: 50`, `doneProgress: 100`) plus helper `groupMaterialsByLevel()`.
- Status per user: belum dibuka = Belum; dibuka/ditonton = Sedang 50%; lulus kuis = Selesai 100%.
  Materi tanpa kuis memakai tombol "Tandai Selesai"; materi berkuis tidak bisa ditandai manual.
- `/learning` dikelompokkan per level (`LearningLevelSection`): header + "x/y selesai", level
  kosong hanya "Segera hadir", level berikutnya terkunci (kartu redup, `aria-disabled`) sampai
  materi wajib level sebelumnya selesai. Filter/search tetap jalan dan tidak mengubah hitungan kunci.
- Kuis di akhir detail materi (`MaterialQuiz`): skor + pembahasan per soal, bisa diulang; attempt
  disimpan lewat `saveQuizAttempt` di `DataProvider`/repository.
- Form materi punya pilihan Level dan Wajib/Opsional (`MATERIAL_FIELDS`); level null jatuh ke
  grup "Materi lain" agar materi tak hilang.
- Verifikasi: `npm run typecheck`, `next build` (18 route static), dan preview: kuis 100% →
  level 2 terbuka, "3/6 selesai". Attempt + progres uji dikembalikan ke kondisi awal.

### 2026-11-04 — Fase 1 Learning Center: progres bersih, akses owner, review kuis

- Migration `0007_learning_phase1_followup.sql`: baris progres materi hasil normalisasi 0006
  (10% → 50%) dihapus, jadi semua materi kembali "Belum" 0%; progres hanya lahir dari aktivitas
  user. Batas `updated_at < 2026-11-05` membuat migrasi aman dijalankan ulang.
- Kebijakan tulis `content_items`, `learning_levels`, `quiz_questions` ditegaskan ulang
  owner-only (`public.is_owner()`): admin CS diblokir di RLS, bukan hanya tombolnya disembunyikan.
  Tidak ada role `leader` terpisah — owner adalah role pengelola.
- Owner/leader tidak terkena kunci level: `groupMaterialsByLevel(..., { lockLevels })` dimatikan
  saat `canManage`. CS tetap melihat level terkunci.
- Halaman baru `/learning/quiz-review` (khusus owner, tautan "Review Kuis" di `/learning`):
  semua soal per materi + jawaban benar + pembahasan, bisa ditambah/diubah/dihapus lewat
  `QuizQuestionForm` → `saveQuizQuestion`/`deleteQuizQuestion` (repository + `DataProvider`).
- Verifikasi: `npm run typecheck`, `next build` (19 route static), preview owner: 0 level
  terkunci, progres 0/3, 25 soal tampil, simpan soal baru berhasil. Hapus soal lewat dialog
  belum terverifikasi otomatis (tombol "Hapus" ganda), data uji dihapus manual.

### 2026-11-05 — Product Knowledge: kode seri dihapus, video per seri

- Seri tidak lagi punya kode/SKU: key `code` hilang dari `PRODUCT_SCHEMA['Product Series']`
  (form, validasi duplikat, kartu, matriks, pencarian, salinan "Copy Info"). `Product.code`
  tetap ada untuk kode bahan (B-01) dan kode produk (TH-001) karena `product.fabric`
  mereferensikan `bahan.code` — ini referensi silang, bukan SKU seri.
- `Product.videoUrl` (+ kolom `content_items.video_url`, migration `0009`) menyimpan link YouTube
  per seri. Form punya "Link Video YouTube" dengan validasi `youtubeVideoId()` dari
  `features/learning/MaterialVideo`. Modal detail seri memakai `MaterialVideo` (thumbnail + tombol
  play, tanpa autoplay) full lebar 16:9; tanpa video → `.series-hero` (foto close-up kartu,
  `object-cover`). Kartu menampilkan badge `.thumb-play` kalau video terisi.
- `price` keluar dari schema seri ("Harga Mulai (Rp)"); baris "Produk dalam Seri Ini" dan teks
  "0 produk" disembunyikan saat kosong; urutan baris modal: Kerah, Placket / Klep, Karakteristik,
  Cara menjelaskan ke customer, Produk dalam Seri Ini.
- `lib/data/supabase-repository.ts` membaca `content_items` dengan `select('*')` dan memakai
  `row.video_url` hanya kalau `data.videoUrl` belum ada, jadi form (JSONB) dan SQL sama-sama jalan
  walau migration belum diterapkan.
- Migration `0008` menghapus key `code` dari `data` baris Product Series. Tidak ada kolom, FK,
  atau unique index untuk kode seri — seri adalah JSONB — jadi tidak ada DDL drop. **Belum
  dijalankan ke production** (butuh persetujuan owner).
- Verifikasi: `npm run typecheck`, `next build` (19 route static), `npm run audit` (products
  245.9 KB gzip), preview owner: 6 seri tanpa kode di matriks/kartu, urutan baris modal benar,
  form menolak link non-YouTube, mobile tanpa overflow.
- Catatan: 6 link YouTube seri dan kolom `video_url` belum diisi, jadi tampilan video (badge kartu
  + hero video di modal) belum terverifikasi di preview.

### 2026-11-05 — Popup seri menyesuaikan video Shorts

- Keluhan: popup seri untuk video Shorts (9:16) tampil sebagai modal 900px (`.mbox.lg`) sehingga
  video kecil di tengah dengan ruang kosong besar, dan saat diputar muncul pilar hitam kiri-kanan.
- `openModal` menerima opsi `portrait` → `.mbox.portrait` dengan lebar `min(400px, calc(72vh * 0.5625 + 52px))`
  (ikut tinggi layar supaya video tetap mengisi penuh). `.mbox.portrait .video-frame.is-vert`
  memakai `max-width:none`, jadi bingkai 9:16 selebar isi popup.
- `ProductsView.openProductDetail` memilih varian ini hanya saat seri punya link `/shorts/`
  (`isYoutubeShort`). Seri tanpa video Shorts tetap modal besar; tidak ada perubahan data.
- Verifikasi: `npm run typecheck`, `npm run build` (static), preview owner 920px: `.mbox.portrait`
  400px, frame video 333×592 (9:16) tanpa celah samping, thumbnail `oar2.jpg` termuat, tombol play
  mengganti frame dengan iframe `youtube-nocookie` id yang sama, skor tanpa overflow horizontal.
  Pemutaran video asli diblokir "Sign in to confirm you're not a bot" di browser uji (bukan defect app).

### 2026-11-05 — Popup seri kembali ke gaya Learning Center

- Keluhan: popup sempit 9:16 (`.mbox.portrait`) membuat isi seri sesak dan terasa terpisah dari
  halaman Product Knowledge; owner minta "samain kaya Learning Center".
- Varian `portrait` dihapus total: `openModal` hanya punya `large` lagi, `.mbox.portrait` dan
  `.video-frame.is-vert` dibuang dari CSS, `isYoutubeShort`/prop `vertical` hilang dari
  `MaterialVideo`. Semua seri (termasuk link Shorts) membuka modal lebar `.mbox.lg` dengan bingkai
  video 16:9 `MaterialVideo` — persis perlakuan video di detail materi Learning Center.
- Tidak ada perubahan data, migration, atau perilaku selain ukuran/bentuk popup.
- Verifikasi: `npm run typecheck` dan `npm run build` (19 route static) lulus.

### 2026-11-05 — Detail produk jadi halaman bergaya Learning Center

- Keluhan lanjutan: popup lebar 16:9 masih terasa salah; owner menunjuk UI/UX detail Learning
  Center. Penyebabnya struktur: Learning Center membuka materi sebagai halaman (back link,
  kartu konten `padding:32`, judul 27px, `lead`, lalu video 16:9 selebar kartu), bukan popup.
- `ProductsView` tidak lagi memakai modal untuk detail: `?open=<id>` dirender langsung sebagai
  halaman (`openedProduct`), tombol kembali menghapus param `open`. Efek/ref modal detail dihapus;
  `openProductDetail` sekarang `router.push` (section + open).
- `ProductDetail` memakai kerangka Learning Center: `btn ghost` "Product Knowledge" + Edit/Hapus
  di atas, kartu `card content` 32px, `eyebrow` kategori, `h1`, `lead`, status + tanggal, video
  16:9 selebar kartu, lalu tabel field. Seri menambah sidebar `.split` "Series lainnya" (AppLink
  ke `?section=series&open=…`), meniru daftar materi di Learning Center.
- Copy Info tetap di bawah kartu; form/konfirmasi hapus tetap modal.
- Verifikasi: `npm run typecheck`; preview owner 920px: kartu 721px, video 655×368 (16:9), h1 27px,
  tanpa `.mbox`, back link kembali ke daftar, sidebar seri lain muncul.

### 2026-11-05 — Video seri Shorts tanpa pilar hitam

- Keluhan: video seri (link `/shorts/`, contoh Jiharkah 0:28) masih diputar di bingkai 16:9,
  jadi YouTube memberi pilar hitam kiri-kanan.
- `MaterialVideo` menambah `youtubeVideoIsShort()` dan kelas `is-vert` pada bingkai hanya untuk
  link Shorts; `styles/pages.css` memberi `.video-frame.is-vert` rasio 9:16 dengan lebar
  `min(100%, 420px, (100vh - 160px) * 9/16)` dan `margin-inline:auto` supaya pas di kartu.
- Thumbnail tetap `hqdefault.jpg`: pilar hitamnya terpotong oleh `object-fit: cover` di bingkai
  9:16 (`oar2.jpg` tidak selalu tersedia). Link non-Shorts tetap 16:9, tidak berubah.
- Verifikasi: `npx tsc --noEmit` lulus; aturan `.video-frame.is-vert` terkonfirmasi ada di CSS
  yang disajikan dev server. Tampilan di browser belum dicek ulang otomatis.

### 2026-11-05 — Tabel spesifikasi seri di samping video

- Keluhan: tabel spesifikasi (Kerah, Placket, Karakteristik, Cara menjelaskan) menumpuk di
  bawah video, padahal ruang di sampingnya kosong.
- `ProductDetail` merender tabel field seri di grid baru `.pd-series`
  (`minmax(0,0.9fr) minmax(0,1.2fr)`): video/foto di kiri, tabel di kanan. Urutan DOM tidak
  berubah, jadi `Copy Info` dan perilaku lain tetap. Di bawah 760px grid jadi satu kolom.
- `styles/components.css`: `.pd-series` + reset `margin-top` untuk `.video-frame.mt` /
  `.series-hero.mt` di dalam grid. Size Chart / Bahan tetap memakai `.pd-split`.
- Verifikasi: `npx tsc --noEmit` lulus; preview owner 920px: grid 655px → video 287×510 (9:16),
  tabel 350px, tanpa overflow. Mobile 390px: kolom bertumpuk 277px, tanpa overflow.

### 2026-11-05 — Video seri bisa diperbesar, layout lebih lega

- Keluhan: video seri terasa kecil dan tidak bisa di-zoom.
- `MaterialVideo` kini punya prop `zoomable`: badge "Perbesar" di pojok kanan atas bingkai
  membuka `.lightbox.video-lightbox` berisi pemutar 9:16 setinggi layar (Escape, backdrop, X
  menutup). Poster dipindah ke `.video-poster` di dalam bingkai, jadi frame tetap satu-satunya
  container berposisi; rule `button.video-frame` diganti `.video-poster`/`.video-zoom`.
- `.pd-detail` menyempitkan panel "Series lainnya" ke 260px (kartu detail 548→661px di 1280px)
  dan `.pd-series` jadi 1fr/1fr. Di bawah 1180px `.split` tetap menumpuk sidebar ke bawah.
- Verifikasi: `npx tsc --noEmit` lulus; preview: badge "Perbesar" di pojok video, lightbox
  509×904 (9:16) berisi iframe, Escape menutup, play inline memakai id video yang sama, tanpa
  overflow di 1280/768/390. YouTube menampilkan bot-check di browser uji (bukan defect app).
  Materi Learning Center belum punya video, jadi jalur non-zoomable hanya dicek dari kode.

### 2026-11-05 — Video seri pindah ke hosting sendiri (Supabase Storage)

- Keluhan: overlay YouTube Shorts (logo, Suka/Bagikan, nama channel) menutupi teks video.
- Bucket baru `series-videos` lewat migration `0010_series_videos_bucket.sql`: public read
  (anon + authenticated), insert/update/delete hanya `public.is_owner()`, `file_size_limit`
  50 MB, `allowed_mime_types` `video/mp4`. **Belum dijalankan ke production** (butuh persetujuan
  owner). Kolom `video_url` tetap dari migration `0009`.
- `lib/storage/series-videos.ts`: `uploadSeriesVideo` (MP4 + batas 50 MB, kembalikan URL publik)
  dan `deleteSeriesVideo` (hapus file lama; link YouTube diabaikan).
- Form seri: field `videoUrl` berganti tipe jadi `video` → `SeriesVideoField` (input file MP4,
  tombol "Hapus video"). `ProductForm.handleSubmit` menghapus file lama dari storage setelah
  upsert kalau URL-nya berubah. `upsertContent` kini menulis `content_items.video_url` juga.
- Detail seri: `SeriesVideo` memakai `<video controls playsInline preload="metadata">` (tanpa
  autoplay, 9:16, rounded, `.series-video` di `pages.css`) plus tombol "Perbesar" ke fullscreen
  native. Link YouTube lama tetap dirender `MaterialVideo` (komponen Learning Center tidak
  diubah) sampai semua video dipindah.
- Verifikasi: `npm run typecheck` lulus; preview owner: detail Jiharkah masih memakai embed lama
  (`.video-frame` + Perbesar), form "Video Seri" berisi input `video/mp4` + "Hapus video", label
  "Link Video YouTube" hilang. Upload nyata dan pemutar `<video>` belum terverifikasi karena
  bucket `series-videos` belum ada di production.

### 2026-11-05 — Video seri: "Perbesar" tidak lagi terpotong

- Keluhan: setelah klik "Perbesar", video tampil seukuran aslinya (1080×1920) lalu terpotong
  bingkai, bukan mengecil mengikuti layar.
- Penyebab: `.series-video:fullscreen` memakai `display: grid; place-items: center`, sehingga
  tinggi `100%` pada `<video>` tidak punya acuan (baris grid auto) dan video digambar pada
  ukuran intrinsiknya; `overflow: hidden` di bingkai memotong sisanya.
- Fix (`styles/pages.css`): bingkai fullscreen jadi `display: block` + latar hitam, video
  `width/height: 100%` + `object-fit: contain` (tanpa `max-width`), jadi video 9:16 selalu utuh
  di tengah layar. Tombol "Perbesar" disembunyikan saat sudah fullscreen (`SeriesVideo`).
- Verifikasi: `npm run typecheck` lulus; CSS tersaji berisi aturan baru; preview 920px: video
  inline tetap 319×566 (9:16), tombol Perbesar ada, tanpa error console. Tampilan fullscreen
  **belum terverifikasi otomatis** — Fullscreen API ditolak di browser uji ("Permissions check
  failed"), perlu dicek manual di browser biasa.

### 2026-11-05 — "Perbesar" video seri pakai overlay, bukan Fullscreen API

- Gejala: log dev server berisi `unhandledRejection: TypeError: Permissions check failed`
  setiap kali detail seri dibuka lalu "Perbesar" diklik.
- Penyebab: iframe preview tidak memberi izin `fullscreen`, jadi `element.requestFullscreen()`
  ditolak dan promise-nya tidak ditangani; tombolnya pun tidak melakukan apa pun di preview.
- Fix: `SeriesVideo` membuang Fullscreen API. "Perbesar" menyalakan state `zoom` →
  `.series-video.is-zoomed` (overlay `position: fixed; inset: 0`, latar hitam, video
  `object-fit: contain`), ditutup lewat tombol X atau Escape (capture, sama seperti
  `MaterialVideo`). Elemen `<video>` tidak dilepas, jadi posisi putar ikut terbawa.
  Aturan `.series-video:fullscreen` di `styles/pages.css` diganti `.is-zoomed`.
- Verifikasi: `npm run typecheck` lulus; preview owner (920px) detail Jiharkah: klik "Perbesar"
  membuka overlay tanpa error console, Escape/X menutup.

### 2026-11-05 — Menu Job Desk & SOP

- Dua halaman baru di grup "Learning & Service": `/jobdesk` (satu kartu per jabatan: ringkasan,
  tanggung jawab, checklist tugas harian) dan `/sop` (judul, tujuan, langkah bernomor, catatan
  penting). Keduanya CRUD owner seperti section lain (`RecordForm` + `ConfirmDialog`).
- Data tetap di `content_items` dengan tipe baru `jobdesk` dan `sop` (JSONB `data`), tanpa tabel
  baru: `JobDeskRole`/`Sop` di `lib/types.ts`, `jobdesk`/`sops` di `ContentCollections`,
  `TYPE_BY_KEY` + `APPEND_COLLECTIONS` + `isContent`/`normalizeContent` ikut ditambah.
- **Blocker DB:** `content_items_type_check` (0001) masih hanya mengizinkan 10 tipe lama, jadi
  simpan Job Desk/SOP ditolak DB (`violates check constraint content_items_type_check`).
  Migration `0011_jobdesk_sop_types.sql` membuat ulang constraint dengan `jobdesk` + `sop`
  (atomic, idempotent, tanpa mengubah baris). **Belum dijalankan ke production** (butuh
  persetujuan owner).
- Verifikasi: `npm run typecheck` dan `npm run build` (21 route static, termasuk `/jobdesk` dan
  `/sop`) lulus; preview owner: dua menu muncul di sidebar, kedua halaman render, form
  tambah/ubah terbuka dan batal menutup, empty state tampil, 375px tanpa overflow, tanpa error
  console. Simpan ke DB **belum terverifikasi** sampai migration 0011 dijalankan.

## Operational notes

- **Migration history is not recorded remotely.** `supabase migration list` shows an empty
  remote column while the tables exist, so `supabase db push` would try to re-apply everything.
  Apply migrations with `supabase db query --file <path> --remote=<ref> --yes` instead.
- **Test migrations safely.** Dry-run with the file's trailing `commit;` swapped for `rollback;`
  before touching production, and re-run once afterwards to prove idempotency.
- **`npx supabase db query` quoting.** Inline SQL through PowerShell/cmd mangles quotes. Write the
  statement to a file and use `--file`.
- **Deployed function versions:** `npx supabase functions list --remote=<ref>`.
- **Verify UI changes in a real browser.** `agent-browser` (installed globally) reproduces
  client-side crashes that a 200 response hides. The app requires owner login first.
- **`next build` is stricter than `tsc --noEmit`** in this project. Run the build, not just the
  typecheck, before claiming a UI change is safe.
