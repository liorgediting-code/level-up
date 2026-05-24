"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MetricsTable, { type Column, type Row } from "@/components/metrics-table";

type Lite = { id: string; name: string };

export default function FunnelClient(props: {
  id: string;
  name: string;
  description: string;
  attachedCampaignIds: string[];
  allCampaigns: Lite[];
  columns: Column[];
  rows: Row[];
}) {
  const router = useRouter();
  const [name, setName] = useState(props.name);
  const [description, setDescription] = useState(props.description);
  const [attached, setAttached] = useState<Set<string>>(new Set(props.attachedCampaignIds));

  async function saveHeader() {
    await fetch(`/api/funnels/${props.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() || props.name, description }),
    });
    router.refresh();
  }

  async function toggleCampaign(cid: string) {
    const next = new Set(attached);
    if (next.has(cid)) next.delete(cid);
    else next.add(cid);
    setAttached(next);
    await fetch(`/api/funnels/${props.id}/campaigns`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignIds: [...next] }),
    });
    router.refresh();
  }

  async function remove() {
    if (!confirm("למחוק את המשפך?")) return;
    const res = await fetch(`/api/funnels/${props.id}`, { method: "DELETE" });
    if (res.ok) router.push("/funnels");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-2 text-lg font-semibold"
          />
          <button onClick={saveHeader} className="rounded-md bg-accent px-3 py-2 text-sm text-white">
            שמור
          </button>
          <button
            onClick={remove}
            className="rounded-md border border-rose-500/40 px-3 py-2 text-sm text-rose-500"
          >
            מחק
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="תיאור המשפך"
          rows={2}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
      </header>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">קמפיינים משויכים ({attached.size})</h2>
        {props.allCampaigns.length === 0 ? (
          <div className="text-xs text-muted">אין קמפיינים זמינים. סנכרן מ-Meta כדי להוסיף.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {props.allCampaigns.map((c) => {
              const on = attached.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCampaign(c.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    on ? "border-accent bg-accent text-white" : "border-border bg-bg"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">מדדים חודשיים</h2>
        <MetricsTable columns={props.columns} rows={props.rows} kind="funnel" targetId={props.id} />
      </section>
    </div>
  );
}
