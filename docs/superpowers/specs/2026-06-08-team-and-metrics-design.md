# Design: Team Roles & Business Metrics Dashboard
**Date:** 2026-06-08  
**Status:** Approved

---

## Overview

Two new top-level pages added to the app navigation:

1. **`/team`** — Team roles and responsibilities management (ליאב, ליאור, AI, future members)
2. **`/metrics`** — Business metrics dashboard (marketing, sales, P&L) with time-period filtering

Both appear as new items in the sidebar nav alongside the existing CRM, campaigns, goals, etc.

---

## Feature 1: `/team` — צוות ותפקידים

### Purpose
Give Lior and Liav a single place to define who is responsible for what, with the ability to mark any responsibility as AI-handled. Serves as an operational reference and a living record of how the agency runs.

### Page Layout
- Grid of member cards (one per person)
- Predefined members on first load: **ליאב**, **ליאור**, **AI 🤖**
- "+ הוסף חבר צוות" button to add more human members
- The AI card is special: it aggregates all responsibilities that have been converted to AI from any member's card, in addition to responsibilities added directly to it

### Member Card
Each card contains:
- **Name** (editable inline) — e.g. "ליאב"
- **Role title** (editable inline) — e.g. "מנהל שיווק"
- **Responsibilities list** — ordered list of responsibility labels
- **Per-responsibility actions:** rename (inline edit) · "המר ל-AI 🤖" · delete
- **"+ הוסף אחריות"** button at the bottom of each card

### "Convert to AI" behavior
When a responsibility is converted to AI:
- Its `isAiHandled` flag is set to `true`
- It remains visible on the original member's card, dimmed with an AI badge `🤖`
- It also appears on the **AI card** as a mirror entry (read-only on AI card, source shown)
- Conversion is reversible: clicking the badge reverts it

### Add Team Member
- Clicking "+ הוסף חבר צוות" opens an inline form: name + role title
- Creates a new `TeamMember` row with `isAI = false`
- New member gets an empty responsibility list immediately

### Data Models

```prisma
model TeamMember {
  id              String           @id @default(cuid())
  name            String
  role            String           @default("")
  isAI            Boolean          @default(false)
  order           Int              @default(0)
  responsibilities Responsibility[]
  createdAt       DateTime         @default(now())
}

model Responsibility {
  id           String     @id @default(cuid())
  memberId     String
  member       TeamMember @relation(fields: [memberId], references: [id], onDelete: Cascade)
  label        String
  isAiHandled  Boolean    @default(false)
  order        Int        @default(0)
  createdAt    DateTime   @default(now())
}
```

### API Routes
- `GET /api/team` — fetch all members + responsibilities (server component, direct Prisma)
- `POST /api/team/members` — create member `{ name, role }`
- `PATCH /api/team/members/[id]` — update name or role
- `DELETE /api/team/members/[id]` — delete member (cascades responsibilities)
- `POST /api/team/members/[id]/responsibilities` — add responsibility `{ label }`
- `PATCH /api/team/responsibilities/[id]` — update label or isAiHandled
- `DELETE /api/team/responsibilities/[id]` — delete responsibility

### Seed on first load
On first visit, if `TeamMember` table is empty, seed three rows: ליאב (מנהל שיווק), ליאור (מנהל לקוחות), AI 🤖 (isAI=true). Done in the page server component, not a migration.

---

## Feature 2: `/metrics` — מדדים עסקיים

### Purpose
Single page with time-period filtering showing marketing performance, sales funnel conversion rates, and a full P&L view — enough to stay financially and operationally in control.

### Time Period Filter
A row of toggle buttons at the top of the page:
- **שנה** — full calendar year (default: current year), with a year picker
- **חודש** — single calendar month (default: current month), month/year picker
- **שבוע** — ISO week (default: current week), week picker
- **יום** — single date (default: today), date picker

All three sections below update simultaneously when the period changes. Period selection is stored in URL search params (`?period=month&date=2026-06`).

### Section 1: שיווק (Marketing)

Data source: `CampaignDailyStat` aggregated over the chosen period (all campaigns, or optionally filtered to agency-owned).

Metrics displayed as stat cards:
| Metric | Calculation |
|--------|-------------|
| הוצאה | SUM(spend) |
| חשיפות | SUM(impressions) |
| קליקים | SUM(clicks) |
| CTR | clicks / impressions × 100 |
| לידים | SUM(leads) |
| CPL | spend / leads |
| CPM | spend / impressions × 1000 |

Below the cards: a table of top campaigns by spend for the period.

### Section 2: מכירות (Sales)

Data source: `Lead`, `Meeting`, `Payment` filtered by date range.

Metrics:
| Metric | Calculation |
|--------|-------------|
| לידים נכנסו | COUNT(Lead.createdAt in range) |
| פגישות שנקבעו | COUNT(Meeting.scheduledAt in range) |
| פגישות שנערכו | COUNT(Meeting where status=held in range) |
| עסקאות נסגרו | COUNT(Payment type=closed in range) |
| הכנסות נסגרו | SUM(Payment.amount where type=closed in range) |
| הכנסות שהתקבלו | SUM(Payment.amount where type=paid in range) |
| המרה ליד→פגישה | meetings_scheduled / leads × 100 |
| המרה פגישה→סגירה | deals_closed / meetings_held × 100 |

### Section 3: רווח והפסד (P&L)

Three rows in a clean summary table:

| שורה | חישוב |
|------|-------|
| **הכנסות** | SUM(Payment.amount where type=paid in range) |
| **הוצאות פרסום** | SUM(CampaignDailyStat.spend in range) — all campaigns |
| **הוצאות כלליות** | SUM(BusinessExpense.amount in range) |
| **רווח נקי** | הכנסות − הוצאות פרסום − הוצאות כלליות |

Below the summary: a list of general expenses for the period with an inline "+ הוסף הוצאה" form (label, amount, date, category).

#### Categories for general expenses
`salary` (שכר) · `tools` (כלים ומנויים) · `office` (משרד) · `other` (אחר)

### Data Model: BusinessExpense

```prisma
model BusinessExpense {
  id        String   @id @default(cuid())
  label     String
  amount    Float
  date      DateTime
  category  String   @default("other")
  createdAt DateTime @default(now())
}
```

`amount` stored in whole shekels (not cents) — confirmed consistent with `Payment.amount` which is also stored in whole shekels.

### API Routes
- `GET /metrics` — server component, reads all data via Prisma with date range derived from search params
- `POST /api/expenses` — create expense `{ label, amount, date, category }`
- `DELETE /api/expenses/[id]` — delete expense

---

## Navigation Changes

`src/app/_shell/app-shell.tsx` — add two nav items:

```
מדדים  →  /metrics
צוות   →  /team
```

Position: after "קמפיינים", before "יעדים".

---

## Architecture Notes

- Both pages are **server components** that fetch directly from Prisma and pass serialized props to `*-client.tsx` for interactive parts (add/edit forms, period picker).
- Mutations go through API routes; client calls `router.refresh()` after each mutation.
- No new auth, no streaming, no background jobs needed.
- `BusinessExpense.amount` is a plain `Float` in whole shekels — same as `Payment.amount` which is confirmed stored in shekels.
- After schema changes: `pnpm db:push && pnpm db:generate`.

---

## Out of Scope

- Per-client expense breakdown within client card (separate feature, future)
- Drag-to-reorder responsibilities (use order field for future use, not wired to UI yet)
- Export to CSV / PDF
- Real-time refresh
