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
