# ASTRAL

Local agency console: clients, Meta Ads campaigns, landing pages, AI funnel analysis.

## Setup

```bash
pnpm install
cp .env.local.example .env.local   # fill in keys
pnpm exec playwright install chromium
pnpm db:push
pnpm dev
```

Open http://localhost:3000.

## Required env vars (`.env.local`)

- `ANTHROPIC_API_KEY` — for AI analysis.
- `META_ACCESS_TOKEN` — long-lived System User token with `ads_read` on the target ad account.
- `META_AD_ACCOUNT_ID` — e.g. `act_1234567890`.
- `DATABASE_URL` — defaults to `file:./dev.db`.

### How to get a long-lived Meta token

1. Business Manager → **Business settings** → **Users → System Users** → create a system user.
2. **Add Assets** → assign your ad account with `Manage campaigns` permission.
3. **Generate Token** → select your Meta app, scopes `ads_read` (and `ads_management` if you want to push changes later). Choose the **never-expires** option.
4. Paste into `META_ACCESS_TOKEN`. Find the ad account id in Ads Manager (top of URL or Account Overview).

## Usage

1. **Settings → Sync now** pulls all campaigns + 30 days of daily insights.
2. **Campaigns** — attach campaigns to clients.
3. **Clients → \<client\>** — edit description, add links, record payments, attach campaigns, upload landing pages (URL fetched via Playwright; or upload HTML/image).
4. **Dashboard** — per-client metric cards + per-campaign table; `?range=7d|30d|90d`.
5. **Analyze with AI** — sends client brief + last-30d metrics + LP screenshot/HTML to Claude Opus 4.7 → returns bottleneck, ad copy, LP copy, prioritized actions. Reruns are cheaper because the system prompt is prompt-cached.

## Notes

- All uploads live in `./uploads/` and are served via `/api/uploads/...`.
- SQLite database is `./prisma/dev.db`. Inspect with `pnpm db:studio`.
- v1 is single-user / no auth. Multi-user + roles + LP tracking script are deferred to v2.
