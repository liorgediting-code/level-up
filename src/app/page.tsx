import Link from "next/link";
import { prisma } from "@/lib/db";
import { fmtIls, fmtInt, fmtPct, monthRange } from "@/lib/utils";
import { StatCard } from "./_shell/stat-card";
import { KIND_LABEL, STAGE_LABEL, templateFor, type JourneyKind, type StageKind } from "@/lib/journeys/templates";
import AgencyCampaignsAttach from "./_shell/agency-campaigns-attach";
import MonthSwitcher from "./_shell/month-switcher";

export const dynamic = "force-dynamic";

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const { start: monthStart, end: monthEnd, label: currentLabel, key: monthKey, isCurrent } = monthRange(m);

  const [
    clients,
    journeys,
    leadsTotal,
    leadsThisMonth,
    leadsUnread,
    leadStatusCounts,
    recentLeads,
    agencyStats,
    agencyCampaigns,
    allCampaigns,
  ] = await Promise.all([
    prisma.client.findMany({
      where: {
        createdAt: { lt: monthEnd },
        OR: [{ endedAt: null }, { endedAt: { gte: monthStart } }],
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        payments: { select: { type: true, amount: true } },
        meetings: { select: { id: true, status: true, scheduledAt: true }, orderBy: { scheduledAt: "desc" }, take: 1 },
        journeys: {
          select: {
            id: true, kind: true, status: true, currentStageIndex: true,
            stages: { select: { kind: true, index: true, status: true } },
          },
        },
      },
    }),
    prisma.journey.count({ where: { status: "active" } }),
    prisma.lead.count(),
    prisma.lead.count({ where: { createdAt: { gte: monthStart, lt: monthEnd } } }),
    prisma.lead.count({ where: { viewedAt: null } }),
    prisma.lead.groupBy({ by: ["statusId"], _count: { _all: true } }),
    prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true, name: true, phone: true, createdAt: true, viewedAt: true,
        list: { select: { id: true, name: true, slug: true } },
        status: { select: { id: true, name: true, color: true } },
      },
    }),
    prisma.campaignDailyStat.aggregate({
      where: { date: { gte: monthStart, lt: monthEnd }, campaign: { isAgencyOwned: true } },
      _sum: { spend: true, impressions: true, clicks: true, leads: true, conversions: true },
    }),
    prisma.campaign.findMany({
      where: { isAgencyOwned: true },
      orderBy: { name: "asc" },
      include: {
        stats: { where: { date: { gte: monthStart, lt: monthEnd } }, select: { spend: true, impressions: true, clicks: true, leads: true } },
      },
    }),
    prisma.campaign.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, isAgencyOwned: true, status: true },
    }),
  ]);

  // Sales totals across all clients
  let closed = 0, paid = 0;
  for (const c of clients) {
    for (const p of c.payments) {
      if (p.type === "closed") closed += p.amount;
      if (p.type === "paid") paid += p.amount;
    }
  }
  const outstanding = closed - paid;
  const activeClients = clients.filter((c) => c.status !== "archived").length;

  // Agency campaign aggregates
  const aSpend = agencyStats._sum.spend ?? 0;
  const aImpr = agencyStats._sum.impressions ?? 0;
  const aClicks = agencyStats._sum.clicks ?? 0;
  const aLeads = agencyStats._sum.leads ?? 0;
  const aCtr = aImpr ? (aClicks / aImpr) * 100 : 0;
  const aCpl = aLeads ? aSpend / aLeads : 0;

  // Lead status pills
  const statusIds = leadStatusCounts.map((s) => s.statusId);
  const statuses = statusIds.length
    ? await prisma.leadStatus.findMany({
        where: { id: { in: statusIds } },
        select: { id: true, name: true, color: true },
      })
    : [];
  const statusBy = new Map(statuses.map((s) => [s.id, s]));
  const statusBuckets = leadStatusCounts
    .map((b) => ({
      id: b.statusId,
      name: statusBy.get(b.statusId)?.name ?? "—",
      color: statusBy.get(b.statusId)?.color ?? "#64748b",
      count: b._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  // Build client-progress rows
  const clientRows = clients.slice(0, 8).map((c) => {
    const journeyByKind = new Map(c.journeys.map((j) => [j.kind as JourneyKind, j]));
    const nextMeeting = c.meetings[0]?.scheduledAt ?? null;
    const cClosed = c.payments.filter((p) => p.type === "closed").reduce((s, p) => s + p.amount, 0);
    const cPaid = c.payments.filter((p) => p.type === "paid").reduce((s, p) => s + p.amount, 0);
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      organicJourney: buildJourneySummary(journeyByKind.get("organic")),
      paidJourney: buildJourneySummary(journeyByKind.get("paid")),
      lastMeeting: c.meetings[0] && c.meetings[0].scheduledAt
        ? { at: c.meetings[0].scheduledAt.toISOString(), status: c.meetings[0].status }
        : null,
      nextMeeting: nextMeeting ? nextMeeting.toISOString() : null,
      closed: cClosed,
      paid: cPaid,
      outstanding: cClosed - cPaid,
    };
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">סקירת סוכנות</h1>
          <p className="mt-1 text-sm text-muted">
            {isCurrent ? "פעילות " : "פעילות בחודש "}
            {currentLabel} · {activeClients} לקוחות פעילים
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MonthSwitcher monthKey={monthKey} label={currentLabel} isCurrent={isCurrent} />
          <Link href="/crm" className="btn-soft">CRM · {fmtInt(leadsUnread)} חדשים →</Link>
        </div>
      </header>

      {/* KPI ROW */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          tone="blue"
          label="לקוחות פעילים"
          value={fmtInt(activeClients)}
          sub={`${fmtInt(journeys)} מסלולים פעילים`}
        />
        <StatCard
          tone="pink"
          label="לידים החודש"
          value={fmtInt(leadsThisMonth)}
          sub={`סה״כ במערכת ${fmtInt(leadsTotal)}`}
        />
        <StatCard
          tone="amber"
          label="לא נקראו"
          value={fmtInt(leadsUnread)}
          sub="לידים חדשים בתיבה"
        />
        <StatCard
          tone="green"
          label="הכנסות נסגרות"
          value={fmtIls(closed)}
          sub={outstanding > 0 ? `יתרה ${fmtIls(outstanding)}` : "נגבה במלואו"}
        />
      </section>

      {/* TWO-COLUMN: CLIENTS PROGRESS + CRM SUMMARY */}
      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="card p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <div className="text-base font-semibold">התקדמות לקוחות</div>
              <div className="text-xs text-muted">שלב נוכחי במסלולים + סטטוס מכירות</div>
            </div>
            <Link href="/clients" className="text-sm font-medium text-accent hover:text-accent-ink">
              צפייה בכולם →
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {clientRows.map((row) => (
              <li key={row.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/clients/${row.id}`} className="font-semibold hover:text-accent">
                    {row.name}
                  </Link>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    {row.lastMeeting ? (
                      <span>
                        פגישה אחרונה · <span className="num">{fmtDateShort(row.lastMeeting.at)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-soft">ללא פגישות</span>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <JourneyChip kind="organic" summary={row.organicJourney} />
                  <JourneyChip kind="paid" summary={row.paidJourney} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                  <span className="text-muted">מכירות:</span>
                  <span className="pill-good num">נסגר {fmtIls(row.closed)}</span>
                  <span className="pill-accent num">שולם {fmtIls(row.paid)}</span>
                  {row.outstanding > 0 && (
                    <span className="pill-bad num">יתרה {fmtIls(row.outstanding)}</span>
                  )}
                </div>
              </li>
            ))}
            {!clientRows.length && (
              <li className="px-5 py-10 text-center text-sm text-muted">
                אין לקוחות עדיין · <Link href="/clients" className="text-accent">צרו לקוח</Link>
              </li>
            )}
          </ul>
        </div>

        <div className="card p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <div className="text-base font-semibold">CRM · לידים</div>
              <div className="text-xs text-muted">סיכום לפי סטטוס</div>
            </div>
            <Link href="/crm" className="text-sm font-medium text-accent hover:text-accent-ink">
              ניהול →
            </Link>
          </div>
          <div className="px-5 py-4">
            <div className="flex flex-wrap gap-1.5">
              {statusBuckets.length ? (
                statusBuckets.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-2.5 py-1 text-xs font-medium"
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ background: s.color }}
                    />
                    {s.name}
                    <span className="num text-muted">· {fmtInt(s.count)}</span>
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted">אין סטטוסי לידים מוגדרים</span>
              )}
            </div>
          </div>
          <div className="border-t border-border px-5 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            אחרונים
          </div>
          <ul className="divide-y divide-border">
            {recentLeads.map((l) => (
              <li key={l.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/crm/${l.list.slug}#lead-${l.id}`}
                    className="min-w-0 truncate text-sm font-medium hover:text-accent"
                  >
                    {l.name || l.phone || "—"}
                    {!l.viewedAt && (
                      <span className="ms-2 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: "oklch(0.56 0.22 258)" }} />
                    )}
                  </Link>
                  <span className="num shrink-0 text-xs text-muted">{fmtDateShort(l.createdAt.toISOString())}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
                    style={{ background: `${l.status.color}1a`, color: l.status.color }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.status.color }} />
                    {l.status.name}
                  </span>
                  <span className="text-muted-soft">·</span>
                  <span>{l.list.name}</span>
                </div>
              </li>
            ))}
            {!recentLeads.length && (
              <li className="px-5 py-6 text-center text-sm text-muted">אין לידים חדשים</li>
            )}
          </ul>
        </div>
      </section>

      {/* AGENCY CAMPAIGNS */}
      <section className="card p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="text-base font-semibold">קמפיינים של הסוכנות</div>
            <div className="text-xs text-muted">{currentLabel} · קמפיינים ששויכו אלינו</div>
          </div>
          <AgencyCampaignsAttach
            campaigns={allCampaigns.map((c) => ({ id: c.id, name: c.name, isAgencyOwned: c.isAgencyOwned }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-5">
          <MiniMetric label="הוצאה" value={fmtIls(aSpend)} tone="red" />
          <MiniMetric label="חשיפות" value={fmtInt(aImpr)} tone="blue" />
          <MiniMetric label="קליקים" value={fmtInt(aClicks)} sub={`CTR ${fmtPct(aCtr)}`} tone="violet" />
          <MiniMetric label="לידים" value={fmtInt(aLeads)} sub={`CPL ${fmtIls(aCpl)}`} tone="pink" />
          <MiniMetric label="קמפיינים שלנו" value={fmtInt(agencyCampaigns.length)} tone="amber" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-elevated">
              <tr>
                <th className="table-th">קמפיין</th>
                <th className="table-th">הוצאה</th>
                <th className="table-th">חשיפות</th>
                <th className="table-th">קליקים</th>
                <th className="table-th">לידים</th>
              </tr>
            </thead>
            <tbody>
              {agencyCampaigns.map((c) => {
                const sp = c.stats.reduce((s, r) => s + (r.spend ?? 0), 0);
                const im = c.stats.reduce((s, r) => s + (r.impressions ?? 0), 0);
                const cl = c.stats.reduce((s, r) => s + (r.clicks ?? 0), 0);
                const ld = c.stats.reduce((s, r) => s + (r.leads ?? 0), 0);
                return (
                  <tr key={c.id}>
                    <td className="table-td">
                      <div className="font-medium">{c.name}</div>
                      {c.objective && <div className="text-xs text-muted">{c.objective}</div>}
                    </td>
                    <td className="table-td num">{fmtIls(sp)}</td>
                    <td className="table-td num">{fmtInt(im)}</td>
                    <td className="table-td num">{fmtInt(cl)}</td>
                    <td className="table-td num">{fmtInt(ld)}</td>
                  </tr>
                );
              })}
              {!agencyCampaigns.length && (
                <tr>
                  <td className="table-td text-muted" colSpan={5}>
                    טרם שויכו קמפיינים. לחצו על &quot;הוסף קמפיין&quot; מעל כדי לשייך.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ---------- helpers + sub-components ---------- */

type JourneySummary =
  | { state: "none" }
  | {
      state: "active" | "completed";
      stageLabel: string;
      stageKind: StageKind;
      stageIndex: number;
      totalStages: number;
    };

function buildJourneySummary(j?: { kind: string; status: string; currentStageIndex: number; stages: { kind: string; index: number; status: string }[] }): JourneySummary {
  if (!j) return { state: "none" };
  const tpl = templateFor(j.kind as JourneyKind);
  const total = tpl.length;
  if (j.status === "completed") {
    const last = tpl[total - 1];
    return { state: "completed", stageLabel: STAGE_LABEL[last.kind], stageKind: last.kind, stageIndex: total - 1, totalStages: total };
  }
  const idx = Math.min(j.currentStageIndex ?? 0, total - 1);
  const stage = tpl[idx];
  return {
    state: "active",
    stageLabel: STAGE_LABEL[stage.kind],
    stageKind: stage.kind,
    stageIndex: idx,
    totalStages: total,
  };
}

function JourneyChip({ kind, summary }: { kind: JourneyKind; summary: JourneySummary }) {
  const tone = kind === "organic"
    ? { ring: "oklch(0.65 0.22 0 / 0.14)", dot: "oklch(0.65 0.22 0)", text: "oklch(0.45 0.22 0)" }
    : { ring: "oklch(0.58 0.22 295 / 0.14)", dot: "oklch(0.58 0.22 295)", text: "oklch(0.42 0.22 295)" };

  if (summary.state === "none") {
    return (
      <div className="flex items-center justify-between rounded-xl border border-dashed border-border bg-elevated px-3 py-2 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: tone.dot, opacity: 0.4 }} />
          {KIND_LABEL[kind]}
        </span>
        <span className="text-muted-soft">ללא מסלול</span>
      </div>
    );
  }

  const progress = ((summary.stageIndex + (summary.state === "completed" ? 1 : 0)) / summary.totalStages) * 100;

  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-2 font-medium">
          <span className="h-2 w-2 rounded-full" style={{ background: tone.dot }} />
          {KIND_LABEL[kind]}
        </span>
        <span className="num text-muted">
          {summary.stageIndex + 1}/{summary.totalStages}
        </span>
      </div>
      <div className="mt-1.5 truncate text-[13px] font-medium" style={{ color: tone.text }}>
        {summary.state === "completed" ? "הושלם" : summary.stageLabel}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-elevated">
        <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: tone.dot }} />
      </div>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "red" | "blue" | "violet" | "pink" | "amber";
}) {
  const dot: Record<typeof tone, string> = {
    red: "oklch(0.62 0.22 25)",
    blue: "oklch(0.56 0.22 258)",
    violet: "oklch(0.58 0.22 295)",
    pink: "oklch(0.65 0.22 0)",
    amber: "oklch(0.74 0.16 75)",
  } as const;
  return (
    <div className="bg-surface px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: dot[tone] }} />
        <span className="label">{label}</span>
      </div>
      <div className="num mt-2 text-xl font-bold leading-none tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function fmtDateShort(iso: string) {
  return new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit" }).format(new Date(iso));
}
