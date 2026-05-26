"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Camp = { id: string; name: string; status: string | null; objective: string | null; isAgencyOwned: boolean; clientIds: string[] };
type Cli = { id: string; name: string };

export default function CampaignsClient({ campaigns, clients }: { campaigns: Camp[]; clients: Cli[] }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [q, setQ] = useState("");

  async function sync() {
    setSyncing(true);
    const r = await fetch("/api/meta/sync", { method: "POST" });
    setSyncing(false);
    if (!r.ok) alert(`סנכרון נכשל: ${await r.text()}`);
    router.refresh();
  }
  async function attach(clientId: string, campaignId: string) {
    if (!clientId) return;
    await fetch(`/api/clients/${clientId}/campaigns`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaignId }),
    });
    router.refresh();
  }
  async function detach(clientId: string, campaignId: string) {
    await fetch(`/api/clients/${clientId}/campaigns?campaignId=${campaignId}`, { method: "DELETE" });
    router.refresh();
  }
  async function toggleAgency(campaignId: string, next: boolean) {
    const r = await fetch(`/api/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isAgencyOwned: next }),
    });
    if (!r.ok) alert("עדכון נכשל");
    router.refresh();
  }

  const filtered = campaigns.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">קמפיינים</h1>
        <div className="flex gap-2">
          <input className="input w-64" placeholder="חיפוש…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button onClick={sync} disabled={syncing} className="btn-primary">{syncing ? "מסנכרן…" : "סנכרן ממטא"}</button>
        </div>
      </div>
      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-th">קמפיין</th>
              <th className="table-th">שלנו</th>
              <th className="table-th">סטטוס</th>
              <th className="table-th">מטרה</th>
              <th className="table-th">לקוחות מחוברים</th>
              <th className="table-th">חבר ל…</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id}>
                <td className="table-td">{c.name}<div className="text-xs text-muted">{c.id}</div></td>
                <td className="table-td">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={c.isAgencyOwned}
                      onChange={(e) => toggleAgency(c.id, e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-[var(--accent)]"
                    />
                    {c.isAgencyOwned && <span className="pill-accent">שלנו</span>}
                  </label>
                </td>
                <td className="table-td">{c.status ?? "—"}</td>
                <td className="table-td">{c.objective ?? "—"}</td>
                <td className="table-td">
                  {c.clientIds.length ? (
                    <div className="flex flex-wrap gap-1">
                      {c.clientIds.map((cid) => {
                        const cli = clients.find((x) => x.id === cid);
                        return (
                          <span key={cid} className="inline-flex items-center gap-1 rounded bg-border/60 px-2 py-0.5 text-xs">
                            {cli?.name ?? cid}
                            <button onClick={() => detach(cid, c.id)} className="text-muted hover:text-bad">×</button>
                          </span>
                        );
                      })}
                    </div>
                  ) : <span className="text-muted">—</span>}
                </td>
                <td className="table-td">
                  <select className="input" defaultValue="" onChange={(e) => attach(e.target.value, c.id)}>
                    <option value="">בחר לקוח…</option>
                    {clients.filter((cli) => !c.clientIds.includes(cli.id)).map((cli) => (
                      <option key={cli.id} value={cli.id}>{cli.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td className="table-td text-muted" colSpan={6}>אין קמפיינים. לחצו על &quot;סנכרן ממטא&quot;.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
