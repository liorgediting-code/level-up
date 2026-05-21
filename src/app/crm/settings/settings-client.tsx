"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusEditor } from "@/app/crm/[listId]/settings/list-settings-client";

type Status = {
  id: string; name: string; color: string; order: number;
  isDefault: boolean; isConvertedTarget: boolean; listId: string | null;
};

export default function SettingsClient(props: {
  notificationEmail: string | null;
  globals: Status[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState(props.notificationEmail ?? "");

  async function save() {
    await fetch("/api/crm/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notificationEmail: email.trim() ? email.trim() : null }),
    });
    router.refresh();
  }

  return (
    <div>
      <Link href="/crm" className="text-xs text-muted hover:underline">← חזרה ל-CRM</Link>
      <h1 className="mb-6 text-2xl font-semibold">הגדרות CRM</h1>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">אימייל להתראות</h2>
        <p className="mb-2 text-xs text-muted">דורש <code>RESEND_API_KEY</code> ב-<code>.env.local</code>. אם חסר, ההתראות פשוט מדולגות.</p>
        <div className="flex gap-2">
          <input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="you@example.com" className="flex-1 rounded-md border px-3 py-1.5 text-sm" type="email" />
          <button onClick={save} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white">שמור</button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">סטטוסים גלובליים</h2>
        <p className="mb-2 text-xs text-muted">סטטוסים אלה משמשים את כל הרשימות שאין להן סט מותאם.</p>
        <StatusEditor scope={{ listId: null }} statuses={props.globals} canEditCurrent={true} />
      </section>
    </div>
  );
}
