"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Account = {
  id: string;
  name: string;
  currency: string | null;
  businessName: string | null;
  enabled: boolean;
  lastSyncedAt: string | null;
  accountStatus: number | null;
};

type Connection = {
  fbUserName: string | null;
  expiresAt: string | null;
  accounts: Account[];
};

export default function SettingsClient({
  anthropicSet,
  appConfigured,
  redirectUri,
  connection,
  banner,
}: {
  anthropicSet: boolean;
  appConfigured: boolean;
  redirectUri: string;
  connection: Connection | null;
  banner: { success: boolean; error: string | null };
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setResult(null);
    const r = await fetch("/api/meta/sync", { method: "POST" });
    const json = await r.json().catch(() => ({}));
    setSyncing(false);
    setResult(
      json.ok
        ? `סונכרנו ${json.campaigns} קמפיינים מ-${json.accounts} חשבונות (${json.statRows} שורות).`
        : `שגיאה: ${json.error ?? "לא ידועה"}`,
    );
    router.refresh();
  }
  async function refreshAccounts() {
    setRefreshing(true);
    const r = await fetch("/api/meta/accounts", { method: "POST" });
    const json = await r.json().catch(() => ({}));
    setRefreshing(false);
    setResult(json.ok ? `נמצאו ${json.discovered} חשבונות.` : `שגיאה: ${json.error ?? "לא ידועה"}`);
    router.refresh();
  }
  async function toggle(id: string, enabled: boolean) {
    await fetch("/api/meta/accounts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, enabled }),
    });
    router.refresh();
  }
  async function disconnect() {
    if (!confirm("לנתק את חשבון פייסבוק?")) return;
    await fetch("/api/meta/disconnect", { method: "POST" });
    router.refresh();
  }

  const connected = !!connection;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">הגדרות</h1>

      {banner.success && <div className="card border-good/40 text-good text-sm">החיבור הצליח. נמצאו {connection?.accounts.length ?? 0} חשבונות מודעות.</div>}
      {banner.error && <div className="card border-bad/40 text-bad text-sm">שגיאת OAuth: {banner.error}</div>}

      <div className="card">
        <h2 className="mb-3 font-semibold">מפתחות API</h2>
        <ul className="space-y-2 text-sm">
          <li>מפתח Anthropic: {anthropicSet ? <span className="text-good">מוגדר</span> : <span className="text-bad">חסר</span>}</li>
          <li>אפליקציית Meta (APP_ID + SECRET): {appConfigured ? <span className="text-good">מוגדרת</span> : <span className="text-bad">חסרה</span>}</li>
        </ul>
        <p className="mt-3 text-xs text-muted">
          ערכו את <code>.env.local</code> והפעילו את השרת מחדש. כתובת ה-Redirect לרשום באפליקציה:{" "}
          <code dir="ltr" className="break-all">{redirectUri}</code>
        </p>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">חיבור פייסבוק</h2>
        {!connected ? (
          <>
            <p className="mb-3 text-sm text-muted">
              חברו את חשבון הפייסבוק שלכם דרך אפליקציית הפיתוח. נסרוק אוטומטית את כל חשבונות המודעות שיש לכם גישה אליהם — אין צורך להזין מזהה ידנית.
            </p>
            <a
              href="/api/meta/oauth/start"
              className={`btn-primary inline-block ${!appConfigured ? "pointer-events-none opacity-50" : ""}`}
            >
              חבר חשבון פייסבוק
            </a>
            {!appConfigured && (
              <p className="mt-2 text-xs text-bad">הגדירו תחילה <code>META_APP_ID</code> ו-<code>META_APP_SECRET</code>.</p>
            )}
          </>
        ) : (
          <>
            <div className="mb-3 text-sm">
              מחובר כ-<span className="font-medium">{connection!.fbUserName ?? "(לא ידוע)"}</span>
              {connection!.expiresAt && (
                <span className="ms-2 text-xs text-muted">
                  טוקן בתוקף עד {new Date(connection!.expiresAt).toLocaleDateString("he-IL")}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <a href="/api/meta/oauth/start" className="btn-ghost">חבר מחדש / רענן טוקן</a>
              <button onClick={refreshAccounts} disabled={refreshing} className="btn-ghost">
                {refreshing ? "מרענן…" : "רענן רשימת חשבונות"}
              </button>
              <button onClick={disconnect} className="btn-ghost text-bad">נתק</button>
            </div>
          </>
        )}
      </div>

      {connected && (
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">חשבונות מודעות</h2>
            <button onClick={sync} disabled={syncing} className="btn-primary">
              {syncing ? "מסנכרן…" : "סנכרן עכשיו (כל החשבונות המסומנים)"}
            </button>
          </div>
          {result && <div className="mb-3 text-sm">{result}</div>}
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">פעיל</th>
                  <th className="table-th">חשבון</th>
                  <th className="table-th">עסק</th>
                  <th className="table-th">מטבע</th>
                  <th className="table-th">מזהה</th>
                  <th className="table-th">סונכרן לאחרונה</th>
                </tr>
              </thead>
              <tbody>
                {connection!.accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="table-td">
                      <input
                        type="checkbox"
                        checked={a.enabled}
                        onChange={(e) => toggle(a.id, e.target.checked)}
                      />
                    </td>
                    <td className="table-td">{a.name}</td>
                    <td className="table-td text-muted">{a.businessName ?? "—"}</td>
                    <td className="table-td">{a.currency ?? "—"}</td>
                    <td className="table-td text-xs text-muted" dir="ltr">{a.id}</td>
                    <td className="table-td text-xs text-muted">
                      {a.lastSyncedAt ? new Date(a.lastSyncedAt).toLocaleString("he-IL") : "אף פעם"}
                    </td>
                  </tr>
                ))}
                {!connection!.accounts.length && (
                  <tr><td className="table-td text-muted" colSpan={6}>לא נמצאו חשבונות. לחצו על &quot;רענן רשימת חשבונות&quot;.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-semibold">איך יוצרים אפליקציית Meta דבלופר?</h2>
        <ol className="list-decimal space-y-2 pr-5 text-sm leading-relaxed">
          <li>
            פתחו <a className="text-accent hover:underline" target="_blank" rel="noreferrer" href="https://developers.facebook.com/apps/">developers.facebook.com/apps</a> → <em>Create App</em>.
          </li>
          <li>בחרו <em>Other</em> ואז <em>Business</em> כסוג האפליקציה.</li>
          <li>במסך הראשי של האפליקציה: <em>App settings → Basic</em>. העתיקו את <strong>App ID</strong> ואת <strong>App Secret</strong> ל-<code>.env.local</code> שלכם.</li>
          <li>
            הוסיפו את המוצר <strong>Facebook Login</strong> (Add Product → Facebook Login → Set Up). תחת <em>Settings</em> שלו, הדביקו ב-<em>Valid OAuth Redirect URIs</em>:{" "}
            <code dir="ltr" className="break-all">{redirectUri}</code>.
          </li>
          <li>
            הוסיפו את המוצר <strong>Marketing API</strong>. ההרשאות <code dir="ltr">ads_read</code> ו-<code dir="ltr">ads_management</code> זמינות אוטומטית למפתח עצמו וליוזרים שמופיעים תחת <em>App Roles → Roles</em> במצב Development — אין צורך באישור App Review לשימוש אישי.
          </li>
          <li>שמרו, הפעילו את השרת מחדש, וחזרו לכאן ולחצו &quot;חבר חשבון פייסבוק&quot;.</li>
        </ol>
        <p className="mt-3 text-xs text-muted">
          חשוב: בעת ה-OAuth תקבלו טוקן משתמש לטווח של ~60 יום. כשהוא יפוג פשוט לחצו &quot;חבר מחדש&quot; כאן.
        </p>
      </div>
    </div>
  );
}
