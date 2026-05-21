# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install
cp .env.local.example .env.local            # fill ANTHROPIC_API_KEY, META_ACCESS_TOKEN, META_AD_ACCOUNT_ID
pnpm exec playwright install chromium       # one-time, required for landing-page URL ingest
pnpm db:push                                # apply prisma/schema.prisma to ./prisma/dev.db
pnpm dev                                    # next dev on :3000
pnpm typecheck                              # tsc --noEmit (no test suite exists)
pnpm db:studio                              # open Prisma Studio to inspect data
pnpm db:generate                            # re-run after schema changes (also runs as postinstall)
```

After editing `prisma/schema.prisma`: `pnpm db:push && pnpm db:generate`.

`DATABASE_URL` must be set both in `.env` (read by the Prisma CLI) and `.env.local` (read by Next.js at runtime). Both default to `file:./dev.db`.

## Architecture

Single Next.js 15 App Router process (UI + API routes + background work in the same Node runtime). SQLite via Prisma. No auth — single-user, local-only. Hebrew RTL UI throughout (`<html lang="he" dir="rtl">`). Repo is NOT git-initialized.

### Top-level surfaces

- **`/`** — overview home.
- **`/clients`** — clients list; `/clients/[id]` lands on the **portfolio** (description, links, payments, landing pages, analysis history).
- **`/clients/[id]/sales/*`** — Sales Coaching workspace (meetings + tasks).
- **`/clients/[id]/marketing/*`** — Marketing workspace (dashboard, landing, materials, analyze, campaigns, journeys, tasks). The four legacy paths `/clients/[id]/{dashboard,landing,materials,analyze}` 308-redirect here via `src/middleware.ts`.
- **`/crm`** — inbound-lead CRM (lists, leads, statuses, metrics, webhook URLs).
- **`/campaigns`**, **`/settings`** — global.

### Data flow

1. **Meta sync** (`src/lib/meta/sync.ts`, triggered by `POST /api/meta/sync`): `MetaClient` hits Graph v21.0 → upserts `Campaign` rows + `CampaignDailyStat` (unique on `campaignId+date`). Lead detection is hardcoded to a small set of `action_type` strings (`LEAD_TYPES`); other action types fold into generic `conversions`.
2. **Attach campaigns to clients** via the `ClientCampaign` join table. Many-to-many — a campaign can belong to multiple clients.
3. **Landing pages** (`src/lib/landing/ingest.ts`): three `sourceType`s — `url` (Playwright fetches + screenshots), `html` (uploaded file, screenshotted via `setContent`), `image` (uploaded image used directly as the screenshot). Files land in `./uploads/{clientId}/lp-{timestamp}.{ext}` and are served by the `/api/uploads/[...path]` route (NOT Next.js static — `uploads/` is gitignored and outside `public/`). Use `publicPath()` from `src/lib/landing/paths.ts` to convert an absolute upload path into its served URL.
4. **AI analysis** (`src/lib/ai/analyze-funnel.ts`, `POST /api/clients/[id]/analyze`): aggregates last-30d metrics via `aggregateForClient`, reads LP screenshot as base64 + LP HTML truncated to 30k chars of `<body>`, sends to Claude Opus 4.7 with vision. The system prompt and the HTML user block both have `cache_control: ephemeral` — re-runs against the same LP hit the prompt cache. Output JSON is parsed against `AnalysisOutput` shape and stored in `AnalysisRun.outputJson`. The route is synchronous (no streaming yet); `maxDuration = 120` seconds.
5. **Dashboard** (`src/app/clients/[id]/marketing/dashboard/page.tsx`) calls `aggregateForClient(clientId, range)` which sums `CampaignDailyStat` over the chosen range and recomputes derived metrics (CTR/CPM/CPL/CPA) from the totals — do NOT average the per-row percentages.
6. **CRM webhooks** (`src/app/api/webhooks/leads/[listId]/route.ts`): public endpoint, `?token=` auth via `timingSafeEqual`, 64 KB body cap, accepts JSON + form-urlencoded. Lead + initial `LeadActivity` write in one tx; new-lead email via Resend is fire-and-forget. Per-list status overrides resolved by `src/lib/crm/statuses.ts:resolveStatusesForList` — falls back to global statuses (`listId IS NULL`) when no per-list rows exist.
7. **Marketing journeys** (`src/lib/journeys/*`): `Journey` has `kind ∈ {organic, paid}`, a sequential stage template from `templates.ts`, and `JourneyVideoItem`s materialized lazily on stage activation. Each active stage is mirrored as a marketing `Task` via `Task.linkedStageId` (unique). `advanceStageInTx` / `revertStageInTx` keep both sides in sync inside a Prisma `$transaction`. `PATCH /api/tasks/[id]` on a linked task routes through `syncFromTaskStatusChange`; `DELETE` on a linked task is rejected with 409.
8. **Meeting status** (`src/lib/sales/meetings.ts:effectiveStatus`): the on-disk enum is `scheduled | held | cancelled | no_show`. `pending_update` is a READ-TIME projection only — never written. Server components shape rows through `effectiveStatus(m)` before passing to the client.

### Server vs client components

- All pages are server components by default; they call Prisma directly and pass serialized data into a sibling `*-client.tsx` for interactive UI.
- Dates and other non-serializable Prisma values are converted to strings/numbers at the server/client boundary (see `src/app/clients/[id]/page.tsx` → `portfolio-client.tsx`).
- API routes mutate; client components `fetch()` then call `router.refresh()` to re-render server data. There is no client-side data cache.

### Model used

Hardcoded to `claude-opus-4-7` in `src/lib/ai/analyze-funnel.ts` (`MODEL` constant). Anthropic SDK is `@anthropic-ai/sdk`.

### Module conventions

- Path alias `@/*` → `src/*`.
- `src/lib/db.ts` is the Prisma singleton — always import `prisma` from there, never `new PrismaClient()` elsewhere (would leak connections during dev HMR).
- API route files set `export const runtime = "nodejs"` when they use Playwright, Prisma writes, or filesystem — needed because the Edge runtime cannot load those.
- Zod is used for request validation in API routes; keep the pattern of `Body.safeParse(json)` returning 400. For internal admin routes `parsed.error.format()` is fine; for endpoints whose errors surface in user-facing `alert()` calls (e.g. journey stage PATCH), flatten to a string so the client doesn't render `[object Object]`.
- After moving page directories (e.g. the legacy `/dashboard` → `/marketing/dashboard` move), delete `.next` before re-running typecheck — Next.js leaves stale type stubs that reference the old paths.
- After `prisma/schema.prisma` changes that drop/rename: `pnpm db:push --accept-data-loss`.

### Working with the journey ↔ task sync

- `JourneyStage.taskId` and `Task.linkedStageId` are paired and both `@unique`. Always mutate them inside a `$transaction`.
- `createJourneyForClient` / `materializeActiveStage` defensively `deleteMany({ where: { linkedStageId: stageId } })` before inserting the new Task — needed for revert+re-advance idempotency.
- Reverting a stage cascades forward: every later non-`locked` stage is reset to `locked`, its `JourneyVideoItem`s are deleted, and its linked Task is deleted. UI must confirm with the user before triggering.

## Specs and plans

Brainstorming → design → plan → implementation. Specs live in `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and plans in `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`. When adding non-trivial features, follow the same flow rather than coding directly — past plans demonstrate the level of detail expected.

## Out of scope for v1 (do not add without discussion)

Multi-user accounts, RBAC/roles, OAuth flow for Meta, landing-page tracking script (time-on-site/CTR for self-hosted LPs), cloud deployment. The plan deliberately deferred these — see `/Users/liorgabay/.claude/plans/i-want-you-to-quiet-kettle.md` for context.
