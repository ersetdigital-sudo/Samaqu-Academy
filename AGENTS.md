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
