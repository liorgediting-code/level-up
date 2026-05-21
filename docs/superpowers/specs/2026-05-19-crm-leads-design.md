# CRM for Inbound Leads — Design

**Date:** 2026-05-19
**Project:** ASTRAL — internal agency platform
**Scope:** First of three sub-projects. (B = sales module per client, C = client lifecycle tracking — both deferred to separate specs.)

## Goal

A CRM module inside ASTRAL where leads captured by the agency's own landing pages are received, organized into lists, progressed through statuses, and converted into `Client` records. Tracks where leads come from (UTM), how fast we respond, and what % convert.

Leads represent **prospective clients of the agency itself** — not leads belonging to the agency's clients.

## Non-Goals (v1)

- Tasks per lead (deferred to project B's tasks module, which will be generic enough to also serve leads).
- Lead value tracking / revenue per lead (no deal-size field at conversion).
- SMS/WhatsApp notifications.
- Multi-user — single-user per project's overall scope.

## Data Model

New Prisma models. All `id` fields are `cuid()`, all timestamps `DateTime`.

### `LeadList`

One list per inbound source (e.g. "Lead Magnet", "Webinar Q2").

| Field | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `name` | String | display name |
| `slug` | String | URL-friendly, unique |
| `webhookToken` | String | random 32 chars, used to auth incoming webhooks |
| `createdAt` | DateTime | |

### `LeadStatus`

A status a lead can hold. When `listId` is `null` → global status (applies to lists with no overrides). When `listId` is set → override for that specific list.

| Field | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `name` | String | e.g. "ליד חדש", "יצרתי קשר" |
| `color` | String | hex, for chip rendering |
| `order` | Int | sort order in funnel |
| `listId` | String? | FK → LeadList; null = global |
| `isDefault` | Boolean | the status assigned on lead creation |

Resolution rule when reading a list's available statuses: if any `LeadStatus` rows exist with `listId = X`, use only those. Otherwise use all global statuses (`listId IS NULL`). Exactly one `isDefault = true` is required per resolved set.

### `Lead`

| Field | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `listId` | String | FK → LeadList |
| `name` | String | required |
| `phone` | String? | nullable |
| `email` | String? | nullable |
| `utm` | Json? | `{ source, medium, campaign, content, term }` — any subset that was sent |
| `customFields` | Json | every key in the webhook payload not mapped to a known column; defaults to `{}` |
| `statusId` | String | FK → LeadStatus |
| `notes` | String | free text; default `""` |
| `convertedClientId` | String? | FK → existing `Client` model when converted |
| `firstContactAt` | DateTime? | set on the first status change away from default; used for "time to first contact" metric |
| `viewedAt` | DateTime? | set when a user opens the lead drawer; drives unread badge |
| `createdAt` | DateTime | |

Validation (in app layer, since SQLite has no CHECK in Prisma): at least one of `phone` or `email` must be non-null. Webhook returns 400 otherwise.

### `LeadActivity`

Append-only event log per lead.

| Field | Type | Notes |
|---|---|---|
| `id` | String | PK |
| `leadId` | String | FK → Lead, on delete cascade |
| `type` | String | enum-like: `created`, `status_change`, `note`, `converted` |
| `payload` | Json | type-specific: e.g. `{ from: statusId, to: statusId }` for status_change |
| `createdAt` | DateTime | |

Drives the timeline UI in the lead drawer.

## Webhook Endpoint

`POST /api/webhooks/leads/[listId]?token={webhookToken}` — `runtime = "nodejs"`.

- Accepts `application/json` and `application/x-www-form-urlencoded` (some landing-page builders only send forms).
- Auth: token in query string must equal `LeadList.webhookToken`. Mismatch or unknown list → `401`.
- Zod parses payload. Required: `name`. Required: at least one of `phone`, `email`. UTM keys (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`) are extracted into the `utm` JSON. All other keys land in `customFields`.
- On success: in a single Prisma transaction, create the `Lead` (with `statusId = ` the default status resolved for the list) and a `LeadActivity` of type `created`. Commit, then fire the email notification (failure of email must not roll back the lead).
- Response: `200 { leadId }` on success, `400 { error }` on validation failure, `401` on auth failure.

## Notifications

**Email** — via Resend (`RESEND_API_KEY` in `.env.local`, `notificationEmail` in `/crm/settings`). Subject: `ליד חדש מ-{listName}`. Body includes name, phone/email, UTM source, link to the lead drawer. If `RESEND_API_KEY` is missing, log a warning and skip — do not fail the webhook.

**In-app badge** — count of `Lead` rows where `viewedAt IS NULL`, rendered on the CRM nav item. The count is queried by a small server component on each navigation; no client polling.

## UI

A new top-level nav item `CRM` next to the existing `Clients`.

### `/crm` — index

Cards for each `LeadList`: name, total leads, unread count, "open" button. A "+ רשימה חדשה" button opens a dialog with one field (name). On save, the dialog immediately shows the generated webhook URL and a copy button.

### `/crm/[listId]` — list view

Table of leads in the list. Columns: name, phone/email, status chip (color from `LeadStatus.color`), `utm_source`, `createdAt`. Unread rows visually emphasized.

Controls: status filter, free-text search (name/phone/email/customFields stringified), date range.

Row click opens a right-hand drawer with:
- All lead fields including `customFields` rendered as a key/value list
- Status dropdown (changing it writes a `status_change` activity; sets `firstContactAt` if still null and the new status isn't the default)
- Notes textarea (autosave on blur; writes a `note` activity only if content changed)
- Activity timeline (most recent first)
- "המר ללקוח" button

Opening the drawer triggers a PATCH that sets `viewedAt = now()` if null.

### `/crm/[listId]/settings`

List name (editable), webhook URL with copy + "החלף טוקן" (regenerates `webhookToken`, warns that existing landing pages will break), status management (override the global set).

### `/crm/settings`

Global statuses, `notificationEmail`.

### `/crm/metrics`

Filters at top: date range, list.

Sections:
- **Leads over time** — daily bar chart of leads created in range. Group-by toggle: by list / by `utm_source` / by `utm_campaign`.
- **Conversion rate** — % of leads in range with `convertedClientId != null`, broken down by list and by `utm_source`.
- **Time to first contact** — average of `firstContactAt - createdAt` over leads in range that have `firstContactAt` set. Displayed as `Xh Ym`.
- **Funnel** — for each status in `order`, the current count of leads in that status (filtered by list if a list is selected).

## Convert to Client

Drawer button "המר ללקוח" opens a dialog pre-filled from the lead (name, email, phone — `Client` schema fields). Save runs a Prisma transaction:

1. Create `Client` from form values.
2. Set `lead.convertedClientId = client.id`.
3. Write `LeadActivity { type: "converted", payload: { clientId } }`.
4. If a status with `name = "סגור"` (or any heuristic — TBD: see open question) exists in the resolved set for this list, move the lead to it; otherwise leave the status unchanged.

The `Client` detail page shows a "הגיע כליד מ-{listName} בתאריך {createdAt}" badge with a link back to the lead drawer.

**Resolved open question:** rather than name-matching, add a `LeadStatus.isConvertedTarget Boolean` (default `false`). Conversion moves the lead to whichever status has that flag in the resolved set, if any. Settings UI lets the user mark one status per set as the "converted" target.

## File Layout

```
prisma/schema.prisma                       # add models
src/lib/crm/
  statuses.ts                              # resolveStatusesForList(listId)
  webhook.ts                               # parsePayload, createLeadFromWebhook
  notify.ts                                # sendNewLeadEmail
  metrics.ts                               # aggregation helpers used by /crm/metrics
src/app/api/webhooks/leads/[listId]/route.ts
src/app/api/crm/lists/route.ts             # POST create, GET list
src/app/api/crm/lists/[id]/route.ts        # PATCH name, DELETE
src/app/api/crm/lists/[id]/token/route.ts  # POST rotate
src/app/api/crm/leads/[id]/route.ts        # PATCH notes/status/viewedAt
src/app/api/crm/leads/[id]/convert/route.ts
src/app/api/crm/statuses/route.ts          # CRUD scoped by listId query
src/app/crm/page.tsx                       # /crm index
src/app/crm/[listId]/page.tsx
src/app/crm/[listId]/[listId]-client.tsx
src/app/crm/[listId]/settings/page.tsx
src/app/crm/settings/page.tsx
src/app/crm/metrics/page.tsx
```

Follows the existing server-component + `*-client.tsx` pattern from `src/app/clients/[id]`.

## Out of Scope (explicit)

- Bulk lead actions (delete many, mass status change) — add later if needed.
- Lead deduplication across lists.
- Lead assignment to a specific user (single-user app).
- Importing existing leads from CSV.
- Configurable email templates.

## Open Questions

None at spec time. Implementation plan will surface any further questions.
