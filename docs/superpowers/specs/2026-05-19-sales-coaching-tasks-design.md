# Per-Client Sales Coaching & Tasks Module — Design

**Date:** 2026-05-19
**Project:** ASTRAL — internal agency platform
**Scope:** Second of three sub-projects. (A = CRM for inbound leads — shipped. C = client lifecycle tracking / goals — deferred to a separate spec.)

## Goal

Restructure the per-client area into two workspaces — **Sales Coaching** (אימון מכירות) and **Marketing** (שיווק) — each with its own sub-navigation. Add a sales-coaching workspace that tracks meetings (scheduled / held / cancelled / no-show) with notes and outcomes, plus a per-client tasks list scoped to each workspace.

"Sales" throughout this spec refers to the agency's sales-coaching service delivered to clients (not the agency's own deal pipeline — that's project A's CRM).

## Non-Goals (v1)

- Linking a task to a specific meeting.
- Notifications/reminders for upcoming meetings or overdue tasks.
- Calendar sync (Google Calendar, etc.).
- Sales metrics beyond a "meetings held" counter.
- Cron job to auto-flip overdue scheduled meetings — handled lazily on read.

## Information Architecture

### Client landing page (`/clients/[id]`)

Default view: **Portfolio** (current page, with the *campaigns section removed* — see below). Two large workspace cards above the portfolio: **"אימון מכירות"** and **"שיווק"**. Clicking enters the workspace.

The legacy `client-tabs.tsx` row of 5 tabs is removed; only the "פורטפוליו" link remains, alongside the two workspace cards.

### Sales workspace (`/clients/[id]/sales/...`)

Layout-level sub-nav with **two tabs**: פגישות (default), משימות. A "← חזרה לפורטפוליו" link in the header.

- `/clients/[id]/sales` — meetings list
- `/clients/[id]/sales/tasks` — tasks list scoped to `space=sales`

### Marketing workspace (`/clients/[id]/marketing/...`)

Layout-level sub-nav with **six tabs**: דשבורד (default), דף נחיתה, חומרים, ניתוח AI, קמפיינים, משימות. A "← חזרה לפורטפוליו" link in the header.

- `/clients/[id]/marketing/dashboard` — existing dashboard page, moved
- `/clients/[id]/marketing/landing` — existing, moved
- `/clients/[id]/marketing/materials` — existing, moved
- `/clients/[id]/marketing/analyze` — existing, moved
- `/clients/[id]/marketing/campaigns` — **new**: attached campaigns list + attach/detach UI extracted from the current `portfolio-client.tsx`
- `/clients/[id]/marketing/tasks` — tasks list scoped to `space=marketing`

### Legacy redirects

`src/middleware.ts` (new file) issues `308` redirects from the old per-client paths to their new locations under `/marketing/`:

| Old | New |
|---|---|
| `/clients/[id]/dashboard` | `/clients/[id]/marketing/dashboard` |
| `/clients/[id]/landing` | `/clients/[id]/marketing/landing` |
| `/clients/[id]/materials` | `/clients/[id]/marketing/materials` |
| `/clients/[id]/analyze` | `/clients/[id]/marketing/analyze` |

Preserves bookmarks and any links recorded in `LeadActivity` payloads.

## Data Model

Two new Prisma models. Relations added on the existing `Client` model.

### `Meeting`

| Field | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `clientId` | String | FK → Client, on delete cascade |
| `title` | String | e.g. "פגישת היכרות" |
| `scheduledAt` | DateTime | meeting date+time |
| `status` | String | enum-like: `scheduled` / `pending_update` / `held` / `cancelled` / `no_show` |
| `attendees` | String | free text, default `""` |
| `notes` | String | long-form text, default `""` |
| `outcome` | String | short, default `""` (filled after the meeting) |
| `link` | String? | optional zoom/calendly URL |
| `createdAt` | DateTime | |
| `updatedAt` | DateTime | |

Indexes: `clientId`, `scheduledAt`.

### `Task`

| Field | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `clientId` | String | FK → Client, on delete cascade |
| `space` | String | `sales` or `marketing` — drives which workspace's tab renders it |
| `title` | String | required |
| `description` | String | default `""` |
| `priority` | String | `low` / `normal` / `high` (default `normal`) |
| `dueDate` | DateTime? | optional |
| `status` | String | `open` / `done` (default `open`) |
| `completedAt` | DateTime? | set when status flips to `done`, cleared when flipped back |
| `createdAt` | DateTime | |

Indexes: `clientId`, `(clientId, space, status)` composite, `dueDate`.

Add to `Client`:
```prisma
  meetings Meeting[]
  tasks    Task[]
```

## Auto Status — `pending_update`

The DB never auto-mutates a meeting's status. Instead, the read path is a single helper:

```ts
// src/lib/sales/meetings.ts
export function effectiveStatus(m: Meeting, now: Date = new Date()): MeetingStatus {
  if (m.status === "scheduled" && m.scheduledAt < now) return "pending_update";
  return m.status as MeetingStatus;
}
```

All list/detail server components call `effectiveStatus` when shaping data for the client. When the user opens a meeting drawer and the displayed status is `pending_update`, the drawer offers the three resolution buttons (התקיימה / בוטלה / לא הגיעו). Picking one PATCHes `status` to the chosen value — at that point the DB row catches up. No background job is required for v1.

The persisted enum domain therefore stays `scheduled | held | cancelled | no_show`; `pending_update` is a read-time projection only. (We keep it in the type enum so the UI can switch on it cleanly.)

## UX

### Sales workspace — meetings page

Header: "אימון מכירות" + counter chip "פגישות שהתקיימו: N" (count of `status="held"` for this client, all-time).

Controls: range filter (עתידיות / עבר / כולן), "+ פגישה חדשה" button.

Table columns: תאריך + שעה, כותרת, סטטוס (chip colored per status), משתתפים. Row click opens a right-hand drawer (RTL) with all fields editable. Drawer "שמור" PATCHes the meeting; "מחק" with confirmation DELETEs.

New meeting dialog: all the listed fields. `status` defaults to `scheduled`. Created meetings always start `scheduled`.

### Sales workspace — tasks page

Single quick-add row: title input + Enter creates an `open` task with default priority `normal`, no due date.

Below: list grouped by status (פתוחות / הושלמו), sorted within each group by priority (high → normal → low) then dueDate ascending (nulls last). Each row: checkbox (toggle done), title, priority pill, due date.

Click a row → edit drawer (title, description, priority, dueDate, status). "מחק" with confirmation.

Filter: פתוחות / הושלמו / כולן (defaults to פתוחות).

### Marketing workspace — tasks page

Identical UX to sales/tasks, but `space="marketing"`. Implemented via a single shared component (`tasks-shared.tsx`) parameterized by `space`.

### Marketing workspace — campaigns page

Reuses the campaign-attachment UI currently in `portfolio-client.tsx`: list of attached campaigns, "attach campaign" search/select control, detach button per row. Pulls from `ClientCampaign` join exactly as today.

### Portfolio page changes

`portfolio-client.tsx` is edited to **remove** the campaigns section. It keeps payments, links, and basic client info. Two new buttons at the top (rendered as large cards): "אימון מכירות" → `/clients/[id]/sales`, "שיווק" → `/clients/[id]/marketing/dashboard`.

## API

All routes: `runtime = "nodejs"`, Zod validation, no auth.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/clients/[id]/meetings` | Create meeting |
| PATCH | `/api/meetings/[id]` | Update any field |
| DELETE | `/api/meetings/[id]` | Delete |
| POST | `/api/clients/[id]/tasks` | Create task (`space` in body) |
| PATCH | `/api/tasks/[id]` | Update (toggling to `done` sets `completedAt = now()`; toggling back clears it) |
| DELETE | `/api/tasks/[id]` | Delete |

GET endpoints are not added — server components query Prisma directly via `src/lib/sales/{meetings,tasks}.ts` helpers.

### Validation

- `Meeting.title` 1..160 chars.
- `Meeting.scheduledAt` is required and must be a valid ISO timestamp.
- `Meeting.status` ∈ `{scheduled, held, cancelled, no_show}` on writes — `pending_update` is read-only.
- `Task.title` 1..200 chars, `Task.space` ∈ `{sales, marketing}`, `Task.priority` ∈ `{low, normal, high}`, `Task.status` ∈ `{open, done}`.

## File Layout

```
prisma/schema.prisma                                  # + Meeting, Task, Client relations
src/middleware.ts                                     # legacy redirects
src/lib/sales/meetings.ts                             # listMeetingsForClient, effectiveStatus
src/lib/sales/tasks.ts                                # listTasksForClient(clientId, space)
src/app/api/clients/[id]/meetings/route.ts
src/app/api/meetings/[id]/route.ts
src/app/api/clients/[id]/tasks/route.ts
src/app/api/tasks/[id]/route.ts
src/app/clients/[id]/client-tabs.tsx                  # MODIFY: portfolio only + space cards
src/app/clients/[id]/portfolio-client.tsx             # MODIFY: drop campaigns section
src/app/clients/[id]/sales/layout.tsx                 # space sub-nav
src/app/clients/[id]/sales/page.tsx                   # meetings list (server)
src/app/clients/[id]/sales/sales-client.tsx           # meetings table + drawer (client)
src/app/clients/[id]/sales/tasks/page.tsx             # server, wraps shared
src/app/clients/[id]/marketing/layout.tsx             # space sub-nav (6 tabs incl. tasks)
src/app/clients/[id]/marketing/dashboard/page.tsx     # MOVED from /clients/[id]/dashboard
src/app/clients/[id]/marketing/landing/page.tsx       # MOVED
src/app/clients/[id]/marketing/materials/page.tsx     # MOVED
src/app/clients/[id]/marketing/analyze/page.tsx       # MOVED
src/app/clients/[id]/marketing/campaigns/page.tsx     # NEW (extracted from portfolio)
src/app/clients/[id]/marketing/tasks/page.tsx         # server, wraps shared
src/app/clients/[id]/tasks-shared.tsx                 # client component used by both tasks pages
```

The moved pages keep their file contents; only their `import` paths to `../helpers` etc. need to be adjusted to `../../helpers` if such imports exist (verify when moving).

## Out of Scope (explicit)

- Linking tasks to meetings.
- Reminders / notifications.
- Calendar sync.
- show-up % / no-show % / advanced sales metrics.
- Background job to auto-update meeting status.
- Re-ordering tasks by drag.
- Bulk operations on tasks/meetings.

## Open Questions

None at spec time.
