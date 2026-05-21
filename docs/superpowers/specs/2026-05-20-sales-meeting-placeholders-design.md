# Sales Meeting Placeholders by Target

## Context

A client engagement is usually sold as a fixed number of coaching meetings (e.g. 12). Today the sales workspace shows only meetings the user manually created, so the agreed scope is invisible until each meeting is logged one at a time. The user wants the full set to appear up-front as numbered placeholders, then fill in date + retrospective per meeting as the engagement progresses.

`Client.salesMeetingsTarget: Int?` already exists. `Meeting.scheduledAt` is currently required.

## Goals

- Setting/changing `Client.salesMeetingsTarget` auto-materializes that many meeting rows for the client.
- Existing meetings count toward the target — a client with 3 logged meetings and a target of 12 ends up with 12 rows total (3 real + 9 placeholders), not 15.
- A placeholder can be turned into a real meeting in place — same record, same id — by filling in a date.
- The meetings page shows progress ("N done · N scheduled · N awaiting scheduling · target: M") and numbers each row "פגישה N מתוך M".

## Non-goals

- No new task generation, journey wiring, or notifications.
- No bulk-edit dates / spread-N-meetings-over-X-weeks helper.
- No history of past targets — we only track the current target.

## Schema change

```prisma
model Meeting {
  // ...
  scheduledAt DateTime?   // was: DateTime (required)
  // status, attendees, notes, outcome, whatWorked, whatToImprove, link unchanged
}
```

A placeholder is defined by `scheduledAt IS NULL`. No new status value is introduced — placeholders keep `status='scheduled'` (the existing default). Filling `scheduledAt` is what transitions a placeholder into a scheduled meeting; no other field is required for that transition.

`effectiveStatus(m)` in `src/lib/sales/meetings.ts` must treat `scheduledAt = null` as never "past", so it cannot project to `pending_update`. It returns the stored `status` unchanged in that case.

Migration: `pnpm db:push` is sufficient (column becomes nullable; existing rows keep their dates).

## Sync logic — `syncMeetingsToTarget`

New helper in `src/lib/sales/meetings.ts`:

```ts
syncMeetingsToTarget(tx, clientId, target: number | null): { created: number; deleted: number; kept: number }
```

Runs inside a Prisma `$transaction` (caller passes `tx`). Behavior:

1. If `target` is `null` or `<= 0` → no-op (return zeros). The target being cleared does not delete anything.
2. `count = tx.meeting.count({ where: { clientId } })`.
3. If `count < target`: create `target - count` placeholders in a single `createMany` with `clientId`, `title: "פגישה"`, `scheduledAt: null`, all other fields at their schema defaults.
4. If `count > target`: delete placeholders only — `deleteMany({ where: { clientId, scheduledAt: null } })` ordered by `createdAt DESC`, capped at `count - target`. If the client has more dated meetings than `target`, we stop at the floor of dated-meeting-count and do NOT delete any dated meeting. The route returns `{ warning: "target lower than existing dated meetings" }` to the caller so the UI can show a toast; the target is still saved.
5. If `count === target`: no-op.

The helper is the single source of truth for "make meetings match target." It is called from the client PATCH route whenever `salesMeetingsTarget` is in the request body — even if the value is unchanged (idempotent, cheap, and self-healing if anything ever drifts).

## API

**PATCH `/api/clients/[id]`** (existing route):
- Validate `salesMeetingsTarget` as `z.number().int().min(0).nullable().optional()`.
- After the client update, if the field was in the body, call `syncMeetingsToTarget(tx, clientId, newTarget)` inside the same transaction. Return the sync result alongside the updated client.

**POST `/api/clients/[id]/meetings`** (existing): unchanged. Manual creation still works and counts toward the target on the next sync.

**PATCH `/api/clients/[id]/meetings/[meetingId]`** (existing):
- Allow `scheduledAt` to be `null` or a date. Filling it is what "schedules" a placeholder.
- The route does not call `syncMeetingsToTarget` — manual creation/deletion of meetings is deliberately decoupled from the target. The header counter on the meetings page makes any drift visible.

**DELETE `/api/clients/[id]/meetings/[meetingId]`** (existing): unchanged. Deleting drops the row whether it's a placeholder or a real meeting. We do NOT auto-create a replacement placeholder — if the user wants to re-sync, they re-save the target.

## UI

**Meetings list query** (`src/app/clients/[id]/sales/page.tsx`):

Order by `scheduledAt ASC NULLS LAST, createdAt ASC`. Numbering ("פגישה N מתוך M") is computed at render time from the row's index in this ordered list; M is `client.salesMeetingsTarget ?? meetings.length`.

**Row rendering** (`MeetingRow` / list item):
- Placeholder (`scheduledAt === null`): show "פגישה N מתוך M" with a muted "לא תוזמנה" tag where the date normally appears. Click opens the existing `MeetingDrawer` empty, focused on the date picker.
- Real meeting: unchanged, but the title prefix becomes "פגישה N מתוך M · {existing title or status}".

**Header counters** (sales meetings page):

A new strip above the list:
> `3 בוצעו · 2 מתוזמנות · 7 ממתינות לתזמון · יעד: 12`

Counts derived from the same fetched list:
- `done = status === 'held'`
- `scheduled = status === 'scheduled' && scheduledAt !== null` (plus `cancelled`/`no_show` shown separately if non-zero — open question, see below)
- `awaiting = scheduledAt === null`
- `target = client.salesMeetingsTarget`

**Drawer (`MeetingDrawer`)**: accepts an empty date. Save with `scheduledAt = null` is allowed and keeps the row as a placeholder (so the user can edit notes/attendees ahead of time without committing a date). Save with a real `scheduledAt` is what visually "schedules" it.

**Client form** (where `salesMeetingsTarget` is edited): no UI change beyond a toast on save — "נוספו N פגישות" / "הוסרו N פלייסהולדרים" / warning if target is lower than dated meetings.

## Edge cases

- **Target decreased below dated count**: target is saved, only placeholders are removed, warning toast surfaces. List header will show e.g. "10 בוצעו · יעד: 8" so the drift is visible; the user can either raise the target back or delete dated meetings manually.
- **Target cleared (null)**: no rows are deleted. M in "פגישה N מתוך M" falls back to `meetings.length`.
- **Placeholder deleted manually**: allowed. User can re-save target to regenerate.
- **Concurrent target edits**: the sync is inside the same transaction as the client update; last write wins.

## Testing

No automated test suite exists in this repo (per `CLAUDE.md`). Manual verification checklist for the implementation plan:

1. New client, set target=12 → 12 placeholders appear, all `scheduledAt = null`.
2. Open one placeholder, set date + held + retrospective → row becomes a real meeting, count strip updates.
3. Increase target 12 → 15 → 3 new placeholders appear at the bottom.
4. Decrease target 15 → 10 → placeholders removed from the tail; dated meetings untouched.
5. Decrease target below dated count (e.g. 5 real held meetings, target → 3) → target saves, no deletion, warning toast.
6. Clear target → existing rows stay; header drops the "יעד: M" segment.
7. Delete a placeholder manually → row gone, no auto-replace; re-saving target restores it.

## Open questions

- **Cancelled / no_show in the counters**: should those count toward the "done" total (they happened) or be shown as their own segment? Default in this spec: their own small segment, only shown when non-zero. Flag for review.
