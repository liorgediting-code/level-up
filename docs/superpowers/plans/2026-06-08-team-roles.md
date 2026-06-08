# Team Roles & Responsibilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/team` page where Lior and Liav can define each team member's responsibilities, add new members, and mark any responsibility as AI-handled.

**Architecture:** New top-level route `/team` with a server component that seeds initial members on first load and passes data to a client component. All mutations go through API routes under `/api/team/`; the client calls `router.refresh()` after each mutation to re-render server data.

**Tech Stack:** Next.js 15 App Router, Prisma (SQLite), Zod for request validation, React `useState` for form state.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `prisma/schema.prisma` |
| Modify | `src/app/_shell/app-shell.tsx` |
| Create | `src/app/team/page.tsx` |
| Create | `src/app/team/team-client.tsx` |
| Create | `src/app/api/team/members/route.ts` |
| Create | `src/app/api/team/members/[id]/route.ts` |
| Create | `src/app/api/team/members/[id]/responsibilities/route.ts` |
| Create | `src/app/api/team/responsibilities/[id]/route.ts` |

---

## Task 1: Schema — Add TeamMember and Responsibility models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add models to schema**

Open `prisma/schema.prisma` and append these two models at the end of the file (before the last closing brace if any, otherwise just at the bottom):

```prisma
model TeamMember {
  id               String           @id @default(cuid())
  name             String
  role             String           @default("")
  isAI             Boolean          @default(false)
  order            Int              @default(0)
  responsibilities Responsibility[]
  createdAt        DateTime         @default(now())
}

model Responsibility {
  id          String     @id @default(cuid())
  memberId    String
  member      TeamMember @relation(fields: [memberId], references: [id], onDelete: Cascade)
  label       String
  isAiHandled Boolean    @default(false)
  order       Int        @default(0)
  createdAt   DateTime   @default(now())
}
```

- [ ] **Step 2: Push schema and regenerate client**

```bash
pnpm db:push && pnpm db:generate
```

Expected: `Your database is now in sync with your Prisma schema.` followed by generator output. No errors.

- [ ] **Step 3: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors. If you see "Cannot find model 'TeamMember'" errors, re-run `pnpm db:generate`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma tsconfig.tsbuildinfo
git commit -m "feat(schema): add TeamMember and Responsibility models"
```

---

## Task 2: API routes — Members (POST, PATCH, DELETE)

**Files:**
- Create: `src/app/api/team/members/route.ts`
- Create: `src/app/api/team/members/[id]/route.ts`

- [ ] **Step 1: Create POST /api/team/members**

Create `src/app/api/team/members/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().min(1).max(60),
  role: z.string().max(80).default(""),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const maxOrder = await prisma.teamMember.aggregate({ _max: { order: true } });
  const member = await prisma.teamMember.create({
    data: {
      name: parsed.data.name.trim(),
      role: parsed.data.role.trim(),
      isAI: false,
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
  return NextResponse.json(
    { id: member.id, name: member.name, role: member.role, isAI: member.isAI },
    { status: 201 }
  );
}
```

- [ ] **Step 2: Create PATCH + DELETE /api/team/members/[id]**

Create `src/app/api/team/members/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().min(1).max(60).optional(),
  role: z.string().max(80).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const data: Record<string, string> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (parsed.data.role !== undefined) data.role = parsed.data.role.trim();
  const member = await prisma.teamMember.update({ where: { id }, data });
  return NextResponse.json({ id: member.id, name: member.name, role: member.role });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const member = await prisma.teamMember.findUnique({ where: { id } });
  if (!member) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (member.isAI) return NextResponse.json({ error: "cannot delete AI member" }, { status: 400 });
  await prisma.teamMember.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/team/
git commit -m "feat(api): member CRUD routes for /team"
```

---

## Task 3: API routes — Responsibilities (POST, PATCH, DELETE)

**Files:**
- Create: `src/app/api/team/members/[id]/responsibilities/route.ts`
- Create: `src/app/api/team/responsibilities/[id]/route.ts`

- [ ] **Step 1: Create POST /api/team/members/[id]/responsibilities**

Create `src/app/api/team/members/[id]/responsibilities/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  label: z.string().min(1).max(120),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const maxOrder = await prisma.responsibility.aggregate({
    where: { memberId: id },
    _max: { order: true },
  });
  const resp = await prisma.responsibility.create({
    data: {
      memberId: id,
      label: parsed.data.label.trim(),
      order: (maxOrder._max.order ?? 0) + 1,
    },
  });
  return NextResponse.json(
    { id: resp.id, label: resp.label, isAiHandled: resp.isAiHandled },
    { status: 201 }
  );
}
```

- [ ] **Step 2: Create PATCH + DELETE /api/team/responsibilities/[id]**

Create `src/app/api/team/responsibilities/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const Body = z.object({
  label: z.string().min(1).max(120).optional(),
  isAiHandled: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) data.label = parsed.data.label.trim();
  if (parsed.data.isAiHandled !== undefined) data.isAiHandled = parsed.data.isAiHandled;
  const resp = await prisma.responsibility.update({ where: { id }, data });
  return NextResponse.json({ id: resp.id, label: resp.label, isAiHandled: resp.isAiHandled });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.responsibility.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/team/
git commit -m "feat(api): responsibility CRUD routes for /team"
```

---

## Task 4: Nav item + server page scaffold

**Files:**
- Modify: `src/app/_shell/app-shell.tsx`
- Create: `src/app/team/page.tsx`

- [ ] **Step 1: Add "צוות" nav item to app-shell**

In `src/app/_shell/app-shell.tsx`, find the `NAV` array and add the "צוות" entry after `{ href: "/campaigns", ... }`:

```typescript
const NAV = [
  { href: "/", label: "סקירה כללית", icon: HomeIcon },
  { href: "/clients", label: "לקוחות", icon: UsersIcon },
  { href: "/goals", label: "מטרות", icon: TargetIcon },
  { href: "/funnels", label: "משפכים", icon: FunnelIcon },
  { href: "/sales", label: "מכירות", icon: MicIcon },
  { href: "/campaigns", label: "קמפיינים", icon: MegaphoneIcon },
  { href: "/team", label: "צוות", icon: PeopleIcon },       // ← new
  { href: "/crm", label: "CRM", icon: InboxIcon, badgeKey: "unread" as const },
  { href: "/settings", label: "הגדרות", icon: GearIcon },
];
```

Then add the `PeopleIcon` function at the bottom of the file alongside the other icon functions:

```typescript
function PeopleIcon(p: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 19c.5-2.5 3-4 6-4s5.5 1.5 6 4" />
      <circle cx="17" cy="8" r="2.5" />
      <path d="M20 19c-.3-1.8-1.8-3-4-3" />
    </svg>
  );
}
```

- [ ] **Step 2: Create the server page component**

Create `src/app/team/page.tsx`:

```typescript
import { prisma } from "@/lib/db";
import TeamClient from "./team-client";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  // Seed on first load if table is empty
  const count = await prisma.teamMember.count();
  if (count === 0) {
    await prisma.teamMember.createMany({
      data: [
        { name: "ליאב", role: "מנהל שיווק", isAI: false, order: 0 },
        { name: "ליאור", role: "מנהל לקוחות", isAI: false, order: 1 },
        { name: "AI 🤖", role: "בינה מלאכותית", isAI: true, order: 99 },
      ],
    });
  }

  const members = await prisma.teamMember.findMany({
    orderBy: { order: "asc" },
    include: {
      responsibilities: { orderBy: { order: "asc" } },
    },
  });

  return (
    <TeamClient
      members={members.map((m) => ({
        id: m.id,
        name: m.name,
        role: m.role,
        isAI: m.isAI,
        responsibilities: m.responsibilities.map((r) => ({
          id: r.id,
          label: r.label,
          isAiHandled: r.isAiHandled,
        })),
      }))}
    />
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: error about missing `./team-client` module — that's fine, will be fixed in Task 5.

- [ ] **Step 4: Commit nav item (not page yet — wait for client)**

Skip commit here; commit together with Task 5.

---

## Task 5: Team client component

**Files:**
- Create: `src/app/team/team-client.tsx`

- [ ] **Step 1: Create team-client.tsx**

Create `src/app/team/team-client.tsx`:

```typescript
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Responsibility = {
  id: string;
  label: string;
  isAiHandled: boolean;
};

type Member = {
  id: string;
  name: string;
  role: string;
  isAI: boolean;
  responsibilities: Responsibility[];
};

export default function TeamClient({ members }: { members: Member[] }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("");
  const [busy, setBusy] = useState(false);

  const humanMembers = members.filter((m) => !m.isAI);
  const aiMember = members.find((m) => m.isAI);
  const allAiHandled = humanMembers.flatMap((m) =>
    m.responsibilities
      .filter((r) => r.isAiHandled)
      .map((r) => ({ ...r, memberName: m.name }))
  );

  async function addMember() {
    if (!newName.trim()) return;
    setBusy(true);
    await fetch("/api/team/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), role: newRole.trim() }),
    });
    setBusy(false);
    setNewName("");
    setNewRole("");
    setAddOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">צוות ותפקידים</h1>
          <p className="mt-1 text-sm text-muted">הגדרת אחריויות לכל חבר צוות</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="btn-primary">+ הוסף חבר צוות</button>
      </header>

      {addOpen && (
        <div className="card flex flex-wrap gap-3">
          <input
            autoFocus
            className="input flex-1 min-w-32"
            placeholder="שם"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addMember()}
          />
          <input
            className="input flex-1 min-w-32"
            placeholder="תפקיד (אופציונלי)"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addMember()}
          />
          <button onClick={addMember} disabled={busy || !newName.trim()} className="btn-primary">
            {busy ? "…" : "הוסף"}
          </button>
          <button onClick={() => setAddOpen(false)} className="btn-ghost">ביטול</button>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {humanMembers.map((m) => (
          <MemberCard key={m.id} member={m} onRefresh={() => router.refresh()} />
        ))}
        {aiMember && (
          <AiCard
            member={aiMember}
            allAiHandled={allAiHandled}
            onRefresh={() => router.refresh()}
          />
        )}
      </div>
    </div>
  );
}

function MemberCard({
  member,
  onRefresh,
}: {
  member: Member;
  onRefresh: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [editingRole, setEditingRole] = useState(false);
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState(member.role);
  const [newResp, setNewResp] = useState("");
  const [addingResp, setAddingResp] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveName() {
    setEditingName(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === member.name) return;
    await fetch(`/api/team/members/${member.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    onRefresh();
  }

  async function saveRole() {
    setEditingRole(false);
    const trimmed = role.trim();
    if (trimmed === member.role) return;
    await fetch(`/api/team/members/${member.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: trimmed }),
    });
    onRefresh();
  }

  async function deleteMember() {
    if (!confirm(`למחוק את ${member.name} מהצוות?`)) return;
    await fetch(`/api/team/members/${member.id}`, { method: "DELETE" });
    onRefresh();
  }

  async function addResp() {
    if (!newResp.trim()) return;
    setBusy(true);
    await fetch(`/api/team/members/${member.id}/responsibilities`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: newResp.trim() }),
    });
    setBusy(false);
    setNewResp("");
    setAddingResp(false);
    onRefresh();
  }

  async function toggleAI(r: Responsibility) {
    await fetch(`/api/team/responsibilities/${r.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isAiHandled: !r.isAiHandled }),
    });
    onRefresh();
  }

  async function deleteResp(id: string) {
    await fetch(`/api/team/responsibilities/${id}`, { method: "DELETE" });
    onRefresh();
  }

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {editingName ? (
            <input
              autoFocus
              className="input w-full text-base font-bold"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") { setName(member.name); setEditingName(false); } }}
            />
          ) : (
            <h2
              className="cursor-pointer truncate text-base font-bold hover:text-accent"
              onClick={() => setEditingName(true)}
              title="לחץ לעריכה"
            >
              {member.name}
            </h2>
          )}
          {editingRole ? (
            <input
              autoFocus
              className="input mt-1 w-full text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              onBlur={saveRole}
              onKeyDown={(e) => { if (e.key === "Enter") saveRole(); if (e.key === "Escape") { setRole(member.role); setEditingRole(false); } }}
            />
          ) : (
            <p
              className="mt-0.5 cursor-pointer truncate text-sm text-muted hover:text-fg"
              onClick={() => setEditingRole(true)}
              title="לחץ לעריכת תפקיד"
            >
              {member.role || "הוסף תפקיד..."}
            </p>
          )}
        </div>
        <button onClick={deleteMember} className="shrink-0 text-xs text-muted hover:text-bad">
          מחק
        </button>
      </div>

      <ul className="space-y-2">
        {member.responsibilities.map((r) => (
          <li
            key={r.id}
            className={`flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm ${
              r.isAiHandled ? "opacity-50" : ""
            }`}
          >
            <span className="flex-1 leading-snug">{r.label}</span>
            {r.isAiHandled && (
              <span className="shrink-0 text-xs text-muted">🤖</span>
            )}
            <button
              onClick={() => toggleAI(r)}
              className="shrink-0 rounded px-1.5 py-0.5 text-xs text-muted hover:bg-elevated hover:text-accent"
              title={r.isAiHandled ? "החזר לאדם" : "המר ל-AI"}
            >
              {r.isAiHandled ? "↩" : "🤖 AI"}
            </button>
            <button
              onClick={() => deleteResp(r.id)}
              className="shrink-0 text-xs text-muted hover:text-bad"
              aria-label="מחק אחריות"
            >
              ✕
            </button>
          </li>
        ))}
        {member.responsibilities.length === 0 && (
          <li className="text-sm text-muted">אין אחריויות — לחץ הוסף.</li>
        )}
      </ul>

      {addingResp ? (
        <div className="flex gap-2">
          <input
            autoFocus
            className="input flex-1 text-sm"
            placeholder="שם האחריות"
            value={newResp}
            onChange={(e) => setNewResp(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addResp(); if (e.key === "Escape") setAddingResp(false); }}
          />
          <button onClick={addResp} disabled={busy || !newResp.trim()} className="btn-primary text-sm">
            {busy ? "…" : "הוסף"}
          </button>
          <button onClick={() => setAddingResp(false)} className="btn-ghost text-sm">ביטול</button>
        </div>
      ) : (
        <button
          onClick={() => setAddingResp(true)}
          className="btn-ghost w-full text-sm"
        >
          + הוסף אחריות
        </button>
      )}
    </div>
  );
}

function AiCard({
  member,
  allAiHandled,
  onRefresh,
}: {
  member: Member;
  allAiHandled: Array<Responsibility & { memberName: string }>;
  onRefresh: () => void;
}) {
  const [newResp, setNewResp] = useState("");
  const [addingResp, setAddingResp] = useState(false);
  const [busy, setBusy] = useState(false);

  async function addResp() {
    if (!newResp.trim()) return;
    setBusy(true);
    await fetch(`/api/team/members/${member.id}/responsibilities`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: newResp.trim() }),
    });
    setBusy(false);
    setNewResp("");
    setAddingResp(false);
    onRefresh();
  }

  async function deleteResp(id: string) {
    await fetch(`/api/team/responsibilities/${id}`, { method: "DELETE" });
    onRefresh();
  }

  return (
    <div className="card flex flex-col gap-4 border-accent/40 bg-accent/[0.04]">
      <div>
        <h2 className="text-base font-bold">🤖 AI</h2>
        <p className="mt-0.5 text-sm text-muted">פעולות שבינה מלאכותית מבצעת</p>
      </div>

      <ul className="space-y-2">
        {allAiHandled.map((r) => (
          <li
            key={`conv-${r.id}`}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <span className="flex-1 leading-snug">{r.label}</span>
            <span className="shrink-0 text-xs text-muted">← {r.memberName}</span>
          </li>
        ))}
        {member.responsibilities.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
          >
            <span className="flex-1 leading-snug">{r.label}</span>
            <button
              onClick={() => deleteResp(r.id)}
              className="shrink-0 text-xs text-muted hover:text-bad"
              aria-label="מחק"
            >
              ✕
            </button>
          </li>
        ))}
        {allAiHandled.length === 0 && member.responsibilities.length === 0 && (
          <li className="text-sm text-muted">אין פעולות AI עדיין.</li>
        )}
      </ul>

      {addingResp ? (
        <div className="flex gap-2">
          <input
            autoFocus
            className="input flex-1 text-sm"
            placeholder="פעולה חדשה ל-AI"
            value={newResp}
            onChange={(e) => setNewResp(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addResp(); if (e.key === "Escape") setAddingResp(false); }}
          />
          <button onClick={addResp} disabled={busy || !newResp.trim()} className="btn-primary text-sm">
            {busy ? "…" : "הוסף"}
          </button>
          <button onClick={() => setAddingResp(false)} className="btn-ghost text-sm">ביטול</button>
        </div>
      ) : (
        <button onClick={() => setAddingResp(true)} className="btn-ghost w-full text-sm">
          + הוסף פעולה ל-AI
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Run the dev server and verify manually**

```bash
pnpm dev
```

Open `http://localhost:3000/team`. Verify:
1. Three cards appear: ליאב, ליאור, AI 🤖
2. Clicking a name enables inline editing — blur saves
3. "+ הוסף אחריות" opens inline form — Enter adds it to the list
4. "🤖 AI" button on a responsibility dims it and it appears in the AI card
5. "↩" button on a dimmed responsibility reverts it
6. "✕" removes the responsibility
7. "+ הוסף חבר צוות" creates a new card
8. "מחק" on a human member removes the card; "מחק" on AI card is absent

- [ ] **Step 4: Commit**

```bash
git add src/app/_shell/app-shell.tsx src/app/team/
git commit -m "feat(team): add /team page with member roles and responsibilities"
```
