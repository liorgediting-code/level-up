"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type F = {
  id: string;
  name: string;
  description: string;
  campaignCount: number;
  updatedAt: string;
};

export default function FunnelsClient(props: { funnels: F[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/funnels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (res.ok) {
        const f = await res.json();
        router.push(`/funnels/${f.id}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">משפך חדש</h2>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_2fr_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="שם המשפך"
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="תיאור קצר"
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm"
          />
          <button
            onClick={create}
            disabled={busy || !name.trim()}
            className="rounded-md bg-accent px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            צור
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface">
        {props.funnels.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">אין עדיין משפכים.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-right">שם</th>
                <th className="px-3 py-2 text-right">תיאור</th>
                <th className="px-3 py-2 text-right">קמפיינים</th>
                <th className="px-3 py-2 text-right">עודכן</th>
              </tr>
            </thead>
            <tbody>
              {props.funnels.map((f) => (
                <tr key={f.id} className="border-t border-border hover:bg-bg">
                  <td className="px-3 py-2">
                    <Link href={`/funnels/${f.id}`} className="font-medium hover:underline">
                      {f.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted">{f.description || "—"}</td>
                  <td className="px-3 py-2">{f.campaignCount}</td>
                  <td className="px-3 py-2 text-muted">
                    {new Date(f.updatedAt).toLocaleDateString("he-IL")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
