"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Camp = { id: string; name: string; status: string | null; objective: string | null };

export default function CampaignsClient(props: { clientId: string; attached: Camp[]; all: Camp[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const available = props.all.filter((c) => !props.attached.some((a) => a.id === c.id));

  async function attach() {
    if (!selected) return;
    await fetch(`/api/clients/${props.clientId}/campaigns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaignId: selected }),
    });
    setSelected("");
    router.refresh();
  }
  async function detach(campaignId: string) {
    await fetch(`/api/clients/${props.clientId}/campaigns?campaignId=${campaignId}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="card">
      <h2 className="mb-3 font-semibold">קמפיינים במטא</h2>
      <ul className="mb-3 space-y-1 text-sm">
        {props.attached.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2">
            <span>{c.name} <span className="text-xs text-muted">{c.objective ?? ""}</span></span>
            <button onClick={() => detach(c.id)} className="text-xs text-muted hover:text-bad">נתק</button>
          </li>
        ))}
        {!props.attached.length && (
          <li className="text-muted">לא חוברו קמפיינים. <Link className="hover:text-accent" href="/campaigns">צפה בכל הקמפיינים ←</Link></li>
        )}
      </ul>
      {available.length > 0 && (
        <div className="flex gap-2">
          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">— בחר קמפיין —</option>
            {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={attach} className="btn-ghost whitespace-nowrap">חבר</button>
        </div>
      )}
    </div>
  );
}
