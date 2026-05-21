"use client";

import { useState } from "react";
import type { AnalysisOutput } from "@/lib/ai/analyze-funnel";

type LP = { id: string; label: string; sourceType: string };
type Meta = {
  id: string;
  status: string;
  model: string;
  startedAt: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  errorMessage: string | null;
};

export default function AnalyzeClient({
  clientId,
  landingPages,
  initialOutput,
  initialRunMeta,
}: {
  clientId: string;
  landingPages: LP[];
  initialOutput: AnalysisOutput | null;
  initialRunMeta: Meta | null;
}) {
  const [lpId, setLpId] = useState(landingPages[0]?.id ?? "");
  const [output, setOutput] = useState<AnalysisOutput | null>(initialOutput);
  const [meta, setMeta] = useState<Meta | null>(initialRunMeta);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const r = await fetch(`/api/clients/${clientId}/analyze`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ landingPageId: lpId || undefined }),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setError(json.error || `HTTP ${r.status}`);
      } else {
        setOutput(json.output);
        setMeta({
          id: json.runId,
          status: "done",
          model: "claude-opus-4-7",
          startedAt: new Date().toISOString(),
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          errorMessage: null,
        });
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="card flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <div className="label mb-1">דף נחיתה</div>
          <select className="input" value={lpId} onChange={(e) => setLpId(e.target.value)}>
            <option value="">(האחרון שנוסף)</option>
            {landingPages.map((lp) => (
              <option key={lp.id} value={lp.id}>{lp.label} · {lp.sourceType}</option>
            ))}
          </select>
        </div>
        <button onClick={run} disabled={running} className="btn-primary">
          {running ? "מנתח…" : "הרץ ניתוח"}
        </button>
      </div>

      {error && <div className="card border-bad/40 text-bad text-sm">שגיאה: {error}</div>}

      {meta && (
        <div className="text-xs text-muted">
          ריצה {meta.id} · {meta.model} · קלט {meta.inputTokens} / קריאה מהמטמון {meta.cacheReadTokens} / כתיבה למטמון {meta.cacheWriteTokens} / פלט {meta.outputTokens} טוקנים
        </div>
      )}

      {output && <ResultPanels output={output} />}
    </div>
  );
}

function ResultPanels({ output }: { output: AnalysisOutput }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="card md:col-span-2">
        <div className="label">צוואר בקבוק · {output.bottleneck.funnel_stage}</div>
        <p className="mt-2">{output.bottleneck.summary}</p>
        {output.bottleneck.evidence?.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pr-5 text-sm text-muted">
            {output.bottleneck.evidence.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="mb-3 font-semibold">פעולות לפי עדיפות</div>
        <ol className="space-y-3 text-sm">
          {output.actions.map((a, i) => (
            <li key={i} className="rounded-md border border-border p-3">
              <div className="text-xs text-muted">עדיפות {a.priority}</div>
              <div className="font-medium">{a.change}</div>
              <div className="mt-1 text-xs text-muted">השפעה צפויה: {a.expected_impact}</div>
            </li>
          ))}
        </ol>
      </div>

      <div className="card">
        <div className="mb-3 font-semibold">כתיבה מחדש לדף הנחיתה</div>
        <div className="space-y-2 text-sm">
          <div><span className="label block">כותרת</span>{output.lp_copy.headline}</div>
          <div><span className="label block">כותרת משנה</span>{output.lp_copy.subhead}</div>
          <div>
            <span className="label block">נקודות</span>
            <ul className="list-disc pr-5">
              {output.lp_copy.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </div>
          <div><span className="label block">קריאה לפעולה</span>{output.lp_copy.cta}</div>
          {output.lp_copy.notes && <div className="mt-2 text-xs text-muted">{output.lp_copy.notes}</div>}
        </div>
      </div>

      <div className="card md:col-span-2">
        <div className="mb-3 font-semibold">וריאציות למודעות</div>
        <div className="grid gap-3 md:grid-cols-2">
          {output.ad_copy.map((a, i) => (
            <div key={i} className="rounded-md border border-border p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted">{a.angle}</div>
              <div className="mt-1 font-medium">{a.headline}</div>
              <div className="mt-1 whitespace-pre-wrap text-muted">{a.primary_text}</div>
              <div className="mt-2 text-xs">קריאה לפעולה: {a.cta}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
