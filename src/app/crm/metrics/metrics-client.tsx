"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";

type ByList = { listId: string; name: string; total: number; converted: number; rate: number };
type ByUtm = { source: string; total: number; converted: number; rate: number };
type OverTime = { date: string; count: number };
type Funnel = { statusId: string; name: string; color: string; order: number; count: number };

export default function MetricsClient(props: {
  filters: { days: number; listId: string };
  lists: { id: string; name: string }[];
  overTime: OverTime[];
  byList: ByList[];
  byUtm: ByUtm[];
  avgContact: string | null;
  funnel: Funnel[];
}) {
  const router = useRouter();
  function nav(next: Partial<{ days: number; listId: string }>) {
    const params = new URLSearchParams();
    const days = next.days ?? props.filters.days;
    const listId = next.listId ?? props.filters.listId;
    if (days !== 30) params.set("days", String(days));
    if (listId) params.set("listId", listId);
    router.push(`/crm/metrics${params.toString() ? `?${params}` : ""}`);
  }

  const maxOverTime = Math.max(1, ...props.overTime.map((o) => o.count));
  const maxFunnel = Math.max(1, ...props.funnel.map((f) => f.count));

  return (
    <div>
      <Link href="/crm" className="text-xs text-muted hover:underline">← חזרה ל-CRM</Link>
      <h1 className="mb-4 text-2xl font-semibold">מדדים</h1>

      <div className="mb-6 flex gap-2 text-sm">
        <select value={props.filters.days} onChange={(e) => nav({ days: Number(e.target.value) })} className="rounded-md border px-2 py-1.5">
          <option value={7}>7 ימים</option>
          <option value={30}>30 ימים</option>
          <option value={90}>90 ימים</option>
        </select>
        <select value={props.filters.listId} onChange={(e) => nav({ listId: e.target.value })} className="rounded-md border px-2 py-1.5">
          <option value="">כל הרשימות</option>
          {props.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <section className="mb-6 rounded-md border p-4">
        <h2 className="mb-2 text-sm font-semibold">לידים לפי יום</h2>
        {props.overTime.length === 0 ? <p className="text-xs text-muted">אין לידים בטווח.</p> : (
          <div className="space-y-1">
            {props.overTime.map((o) => (
              <div key={o.date} className="flex items-center gap-2 text-xs">
                <span className="w-24 tabular-nums">{o.date}</span>
                <span className="h-3 rounded bg-blue-500" style={{ width: `${(o.count / maxOverTime) * 100}%`, minWidth: 4 }} />
                <span className="w-8 text-right tabular-nums">{o.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-6 rounded-md border p-4">
        <h2 className="mb-2 text-sm font-semibold">שיעור המרה לפי רשימה</h2>
        <table className="w-full text-sm">
          <thead className="text-right text-xs text-muted">
            <tr><th className="p-1">רשימה</th><th className="p-1">סה&quot;כ</th><th className="p-1">הומרו</th><th className="p-1">%</th></tr>
          </thead>
          <tbody>
            {props.byList.map((r) => (
              <tr key={r.listId} className="border-t">
                <td className="p-1">{r.name}</td>
                <td className="p-1 tabular-nums">{r.total}</td>
                <td className="p-1 tabular-nums">{r.converted}</td>
                <td className="p-1 tabular-nums">{(r.rate * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-6 rounded-md border p-4">
        <h2 className="mb-2 text-sm font-semibold">שיעור המרה לפי UTM source</h2>
        <table className="w-full text-sm">
          <thead className="text-right text-xs text-muted">
            <tr><th className="p-1">מקור</th><th className="p-1">סה&quot;כ</th><th className="p-1">הומרו</th><th className="p-1">%</th></tr>
          </thead>
          <tbody>
            {props.byUtm.map((r) => (
              <tr key={r.source} className="border-t">
                <td className="p-1">{r.source}</td>
                <td className="p-1 tabular-nums">{r.total}</td>
                <td className="p-1 tabular-nums">{r.converted}</td>
                <td className="p-1 tabular-nums">{(r.rate * 100).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-6 rounded-md border p-4">
        <h2 className="mb-2 text-sm font-semibold">זמן ממוצע ליצירת קשר</h2>
        <p className="text-lg font-semibold">{props.avgContact ?? "אין נתונים"}</p>
      </section>

      {props.filters.listId && (
        <section className="mb-6 rounded-md border p-4">
          <h2 className="mb-2 text-sm font-semibold">משפך (הרשימה הנבחרת)</h2>
          <div className="space-y-1">
            {props.funnel.map((f) => (
              <div key={f.statusId} className="flex items-center gap-2 text-xs">
                <span className="w-32 truncate">{f.name}</span>
                <span className="h-4 rounded" style={{ width: `${(f.count / maxFunnel) * 100}%`, background: f.color, minWidth: 4 }} />
                <span className="w-8 text-right tabular-nums">{f.count}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
