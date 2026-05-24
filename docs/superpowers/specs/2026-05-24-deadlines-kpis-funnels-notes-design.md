# Task deadlines, KPI tables, ASTRAL funnels, and a notes panel

Date: 2026-05-24
Status: Approved (brainstorming)

## Goal

Four user-facing additions to ASTRAL:

1. **Task deadlines** exposed in the UI wherever a task is created or edited.
2. **Per-client monthly KPI table** with three built-in columns (leads / revenue / customers) and per-client user-defined extra columns.
3. **ASTRAL-level funnels** at `/funnels` — each funnel has a description, a many-to-many link to existing `Campaign` rows, and its own monthly KPI table with user-defined columns.
4. **Persistent left-side notes panel** on every client and funnel page — a free-form, timestamped note feed (add / delete only, no editing), state persisted in `localStorage`.

Out of scope for v1: auto-deriving funnel KPIs from `CampaignDailyStat`; editing notes; multi-user / per-user authorship; assigning a task deadline to anything other than the existing `Task` row.

## 1. Task deadlines (UI only)

`Task.dueDate` already exists in `prisma/schema.prisma` (line 285) and is indexed. No schema change.

Touchpoints:
- Marketing tasks UI under `/clients/[id]/marketing/tasks` — add a `<input type="date">` in the create form and inline-edit on each row.
- Sales tasks UI under `/clients/[id]/sales/*` (the sales task list) — same treatment.
- The task list rows render the due date with a soft amber color when `dueDate < today && status !== "done"`, and a muted gray otherwise.

Server: the existing `PATCH /api/tasks/[id]` already accepts arbitrary task fields — confirm `dueDate` is in its allowed-fields list; add it if missing. Date strings are parsed as `new Date(...)` on the server and stored as UTC midnight.

Journey-linked tasks: the deadline edit is allowed; `syncFromTaskStatusChange` already ignores fields other than `status`, so no journey-side sync is needed.

## 2. Per-client monthly KPI table

### Schema

```prisma
model ClientMetricColumn {
  id        String   @id @default(cuid())
  clientId  String
  key       String   // slug, unique per client; e.g. "appointments"
  label     String   // display name in Hebrew
  unit      String   @default("number") // number | currency | percent
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())

  client    Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@unique([clientId, key])
  @@index([clientId, sortOrder])
}

model ClientMetricRow {
  id          String   @id @default(cuid())
  clientId    String
  periodMonth DateTime // first day of the month, UTC midnight
  leads       Int      @default(0)
  revenue     Int      @default(0) // stored as agorot (integer)
  customers   Int      @default(0)
  extraJson   String   @default("{}") // JSON map: { [columnKey]: number }
  updatedAt   DateTime @updatedAt

  client      Client   @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@unique([clientId, periodMonth])
  @@index([clientId, periodMonth])
}
```

`Client` gains the reverse relations:
```
metricColumns ClientMetricColumn[]
metricRows    ClientMetricRow[]
```

### API

- `GET  /api/clients/[id]/metrics` — returns `{ columns: [...], rows: [...] }` ordered by `periodMonth desc`. Parses `extraJson` server-side and returns it as `extra: Record<string, number>`.
- `POST /api/clients/[id]/metrics/columns` — `{ label, unit }` → server slugifies `label` to `key` (ensuring uniqueness per client) and assigns `sortOrder = max + 1`.
- `DELETE /api/clients/[id]/metrics/columns/[columnId]` — removes the column; does NOT touch existing `extraJson` (forward-compatible).
- `POST /api/clients/[id]/metrics/rows` — `{ periodMonth: "YYYY-MM" }` upserts a row for that month with zeros if absent. Idempotent.
- `PATCH /api/clients/[id]/metrics/rows/[rowId]` — `{ leads?, revenue?, customers?, extra? }`. Built-ins update directly; `extra` is shallow-merged into `extraJson`.
- `DELETE /api/clients/[id]/metrics/rows/[rowId]`.

All routes set `runtime = "nodejs"` and use Zod for body validation, following the existing API pattern.

### UI

Renders on `/clients/[id]` (portfolio page) as a new card, after the existing payments/links sections and before the analysis history.

- Table: months down (newest first), metrics across.
- First three columns are the built-ins (`לידים`, `הכנסות`, `לקוחות`); extra columns follow in `sortOrder`.
- Cells are inline-editable — click to focus, blur or Enter commits via the PATCH endpoint.
- "+ הוסף עמודה" opens a small popover (label + unit select) and POSTs to the columns endpoint.
- "+ הוסף חודש" defaults to the current month and POSTs to the rows endpoint; the page does `router.refresh()`.
- `revenue` renders as `₪X,XXX` (no decimals, since stored as integer agorot — display divides by 100). `percent` renders `X%`. `number` renders raw.

## 3. ASTRAL funnels (`/funnels`)

A new top-level area for ASTRAL's own marketing funnels — completely separate from the per-client `Journey` model. Linked to the existing `Campaign` table many-to-many.

### Schema

```prisma
model Funnel {
  id          String   @id @default(cuid())
  name        String
  description String   @default("")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  campaigns   FunnelCampaign[]
  columns     FunnelMetricColumn[]
  rows        FunnelMetricRow[]
  notes       Note[]   // see section 4
}

model FunnelCampaign {
  funnelId   String
  campaignId String
  createdAt  DateTime @default(now())

  funnel     Funnel   @relation(fields: [funnelId], references: [id], onDelete: Cascade)
  campaign   Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@id([funnelId, campaignId])
  @@index([campaignId])
}

model FunnelMetricColumn {
  id        String   @id @default(cuid())
  funnelId  String
  key       String
  label     String
  unit      String   @default("number")
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())

  funnel    Funnel   @relation(fields: [funnelId], references: [id], onDelete: Cascade)

  @@unique([funnelId, key])
  @@index([funnelId, sortOrder])
}

model FunnelMetricRow {
  id          String   @id @default(cuid())
  funnelId    String
  periodMonth DateTime
  valuesJson  String   @default("{}") // { [columnKey]: number } — no built-ins
  updatedAt   DateTime @updatedAt

  funnel      Funnel   @relation(fields: [funnelId], references: [id], onDelete: Cascade)

  @@unique([funnelId, periodMonth])
  @@index([funnelId, periodMonth])
}
```

`Campaign` gains `funnels FunnelCampaign[]`.

Funnel metric rows have **no built-in columns** — funnels are a blank canvas, every metric is user-defined.

### API

- `GET    /api/funnels` — list `{ id, name, description, campaignCount }`.
- `POST   /api/funnels` — `{ name, description? }`.
- `GET    /api/funnels/[id]` — full funnel: campaigns (id+name), columns, rows.
- `PATCH  /api/funnels/[id]` — `{ name?, description? }`.
- `DELETE /api/funnels/[id]` — cascade-deletes columns/rows/links/notes via Prisma.
- `PUT    /api/funnels/[id]/campaigns` — `{ campaignIds: string[] }` — replaces the set in a `$transaction`.
- `POST   /api/funnels/[id]/columns`, `DELETE /api/funnels/[id]/columns/[colId]` — mirrors client metrics.
- `POST   /api/funnels/[id]/rows`, `PATCH .../rows/[rowId]`, `DELETE .../rows/[rowId]` — mirrors client metrics, but PATCH only accepts `{ values: Record<string, number> }` (shallow-merged into `valuesJson`).

### UI

- `/funnels` — list page (table: name, description preview, campaign count, last-edited). "+ משפך חדש" button.
- `/funnels/[id]` — detail page: editable name & description header, "קמפיינים משויכים" multi-select (existing `Campaign` rows, searchable), and the metrics table (same UX as the client one but with no built-in columns).
- Add "משפכים" to the app shell nav (`src/app/_shell/app-shell.tsx`), between `/clients` and `/crm`.

## 4. Left-side notes panel

A persistent collapsible sidebar pinned to the **visual left** of every `/clients/[id]/*` and `/funnels/[id]/*` page. RTL layout note: the page content reads right-to-left, but the user explicitly asked for the panel on the left side of the screen — i.e., the side opposite the menu.

### Schema

```prisma
model Note {
  id        String   @id @default(cuid())
  scope     String   // "client" | "funnel"
  targetId  String   // clientId or funnelId
  body      String
  createdAt DateTime @default(now())

  // Optional named relations for cascade-delete safety:
  client    Client?  @relation(fields: [clientId], references: [id], onDelete: Cascade, map: "Note_client_fk")
  clientId  String?
  funnel    Funnel?  @relation(fields: [funnelId], references: [id], onDelete: Cascade, map: "Note_funnel_fk")
  funnelId  String?

  @@index([scope, targetId, createdAt])
  @@index([clientId])
  @@index([funnelId])
}
```

The dual nullable FKs (`clientId` / `funnelId`) coexist with the `scope`+`targetId` pair so that Prisma cascade-delete cleans up notes when the parent is removed. The API layer always writes both: when `scope === "client"`, sets `clientId = targetId`; same for funnel. Reads use `scope`+`targetId`.

### API

- `GET    /api/notes?scope=client&targetId=X` — returns notes sorted `createdAt desc`. 400 if either query param is missing or scope is unknown.
- `POST   /api/notes` — `{ scope, targetId, body }`. Body trimmed; reject if empty after trim. Body capped at 4000 chars.
- `DELETE /api/notes/[id]`.

All Zod-validated, `runtime = "nodejs"`.

### UI

- Component: `src/components/notes-panel.tsx` — client component with props `{ scope: "client" | "funnel"; targetId: string }`.
- Mounted from the app shell when the current pathname matches `^/clients/[^/]+(/|$)` or `^/funnels/[^/]+(/|$)`. The shell reads `usePathname()` and renders `<NotesPanel scope=... targetId=... />` accordingly.
- Layout:
  - Fixed position, left edge of the viewport, full height below the top nav.
  - Width: 320px when open, 36px collapsed handle.
  - When open, the main content gets `padding-left: 320px` (or `margin-left`) via a CSS class on `<body>` toggled by the panel.
  - When closed, only the handle is visible; clicking it expands.
- State: `useState` mirroring `localStorage["notes-panel:open"]` (default open on desktop, closed on `< 768px`). Width is fixed in v1 (no resize handle).
- Internals: textarea at the top with placeholder "כתוב הערה…"; Cmd/Ctrl+Enter submits via fetch; on success, optimistically prepend the new note. Below, a scrollable list of notes — each shows body (with `whitespace-pre-wrap`), relative timestamp ("לפני 5 דקות") computed client-side, and a small trash icon visible on hover that DELETEs after confirm.
- No edit affordance in v1.

## Implementation order

1. **Schema migration** — add all new models in one pass; `pnpm db:push && pnpm db:generate`.
2. **Task deadline UI** — smallest change, no new API.
3. **Client KPI table** — API + table component.
4. **Funnels area** — schema is already in place; build list page, detail page, campaign-attach UI, metrics table (reusing the table component from step 3 via a small `<MetricsTable>` component that takes its data and column descriptors as props).
5. **Notes panel** — API, component, shell wiring.

## Edge cases & conventions

- All amounts (currency) are integers in agorot in the DB; the UI divides by 100 for display.
- `periodMonth` is always normalized to the first day of the month at UTC midnight before write.
- The metrics table component is shared between client and funnel; it accepts an `onUpdateRow` callback and a `columns` descriptor — built-ins vs all-custom is a prop difference, not a separate component.
- All new API routes set `runtime = "nodejs"` (Prisma writes).
- No streaming, no optimistic UI for metric updates — PATCH then `router.refresh()`. The notes panel is the only place we use optimistic updates because the panel state survives refresh and the latency would feel slow otherwise.
- Hebrew labels throughout; no i18n abstraction (consistent with the rest of the app).
