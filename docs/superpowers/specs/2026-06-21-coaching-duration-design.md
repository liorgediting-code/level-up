# Coaching duration tracking — design

**Date:** 2026-06-21
**Status:** Approved

## Goal

Let each client record how many months of coaching was agreed, and have the
system automatically show when that coaching window has elapsed — without any
manual action.

## Decisions

- **"Finished" is derived, not stored.** When `createdAt + coachingMonths` has
  passed, the client shows a "הסתיים" badge but stays **active** (no automatic
  `endedAt` write, no archiving). The existing manual "end client" flow and the
  `endedAt`-based active/past split are untouched.
- **Start date = existing `Client.createdAt`.** No separate, editable start-date
  field is added.
- **Editing happens on the client portfolio page** (`/clients/[id]`).

## Schema

`prisma/schema.prisma` — add one nullable field to `Client`:

```prisma
coachingMonths Int?
```

No migration of existing data needed (nullable). Apply with `pnpm db:push &&
pnpm db:generate`.

## Derived logic — `src/lib/clients/coaching.ts` (new)

A pure, dependency-free helper so the same computation is used by the list and
the portfolio page:

```ts
export type CoachingStatus = {
  endsAt: Date;
  monthsLeft: number; // rounded; can be 0 or negative-clamped to 0
  finished: boolean;
};

// Returns null when coachingMonths is not set.
export function coachingStatus(
  createdAt: Date,
  coachingMonths: number | null,
  now?: Date,
): CoachingStatus | null;
```

- `endsAt` = `createdAt` plus `coachingMonths` calendar months (use a month-add
  that clamps overflowing days, e.g. `setMonth`).
- `finished` = `now >= endsAt`.
- `monthsLeft` = whole months remaining from `now` to `endsAt`, clamped at 0
  when finished.
- `now` defaults to the current time; passed in for testability.

## API — `src/app/api/clients/[id]/route.ts`

Add `coachingMonths` to the existing Zod `Body`:

```ts
coachingMonths: z.number().int().min(0).nullable().optional(),
```

It flows through the existing `...rest` spread into `prisma.client.update` — no
other handler changes. `0` and `null` are both accepted (null clears it).

## UI

### Portfolio page — `src/app/clients/[id]/page.tsx` + `portfolio-client.tsx`

- Pass `createdAt` (ISO) and `coachingMonths` from the server page into
  `ClientPortfolio`.
- Add an editable numeric field **"חודשי ליווי"** next to the existing
  revenue/expense-share inputs. On save it PATCHes `coachingMonths` to the
  existing route, then `router.refresh()`.
- Show a read-only summary line when `coachingMonths` is set:
  `תחילת ליווי: DD/MM/YYYY · X חודשים · מסתיים DD/MM/YYYY`
  plus a state badge: **"נותרו N חודשים"** (active) or **"הסתיים"** (red) when
  finished. Computed via `coachingStatus`.

### Clients list — `src/app/clients/page.tsx`

- Select `coachingMonths` (and `createdAt`, already available) for each client.
- Render a small **"הסתיים"** badge next to the client name when
  `coachingStatus(...).finished` is true, so finished-but-active clients are
  visible at a glance.

## Out of scope (YAGNI)

- No cron / scheduled job.
- No automatic `endedAt` write or auto-archiving.
- No separate editable start-date field.
- No notifications.

## Touched files

- `prisma/schema.prisma` — add `coachingMonths Int?`
- `src/lib/clients/coaching.ts` — new helper
- `src/app/api/clients/[id]/route.ts` — extend Zod body
- `src/app/clients/[id]/page.tsx` — pass fields through
- `src/app/clients/[id]/portfolio-client.tsx` — edit field + summary/badge
- `src/app/clients/page.tsx` — finished badge in list
