import fs from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { aggregateForClient } from "@/lib/meta/aggregate";
import { getActiveConnection } from "@/lib/meta/connection";
import { MetaClient, type FbAd } from "@/lib/meta/client";

const MODEL = "claude-opus-4-7";

export type AnalysisOutput = {
  bottleneck: {
    summary: string;
    funnel_stage: "ad_creative" | "ad_targeting" | "landing_page_hook" | "landing_page_offer" | "landing_page_cta" | "tracking" | "other";
    evidence: string[];
  };
  ad_copy: { headline: string; primary_text: string; cta: string; angle: string }[];
  lp_copy: {
    headline: string;
    subhead: string;
    bullets: string[];
    cta: string;
    notes: string;
  };
  actions: { priority: number; change: string; expected_impact: string }[];
};

const SCHEMA_INSTRUCTIONS = `Return JSON ONLY (no prose, no markdown fences) matching this exact shape:
{
  "bottleneck": {
    "summary": string,
    "funnel_stage": "ad_creative"|"ad_targeting"|"landing_page_hook"|"landing_page_offer"|"landing_page_cta"|"tracking"|"other",
    "evidence": string[]
  },
  "ad_copy": [ { "headline": string, "primary_text": string, "cta": string, "angle": string } ],
  "lp_copy": { "headline": string, "subhead": string, "bullets": string[], "cta": string, "notes": string },
  "actions": [ { "priority": number, "change": string, "expected_impact": string } ]
}
Provide 3-5 ad_copy variants and 3-5 actions ordered by priority (1 = highest).`;

const SYSTEM_PROMPT = `You are a world-class direct-response marketer and conversion strategist for paid social. You will be given:
1) A client brief (description + offer).
2) Recent Meta Ads metrics (last 30 days) across one or more campaigns. All monetary values are in Israeli New Shekels (ILS, ₪).
3) A landing page (HTML excerpt and/or screenshot).
4) Optional additional materials: client strategy brief, internal notes, and uploaded creative images (and the labels of any video creatives on file).
5) Live Meta ad data fetched from the API — the actual headlines, body text, and image creatives currently running in the campaign. Treat these as the ground truth of what users are seeing in the feed. Critique them by name when relevant.

Your job is to (a) diagnose the single biggest bottleneck in the funnel, citing concrete evidence from the metrics and the landing page; (b) write best-in-class ad copy variants tailored to the audience and angle; (c) rewrite the landing page hero copy (headline, subhead, bullets, CTA) for higher conversion; (d) give a prioritized action list with expected impact.

CRITICAL LANGUAGE RULE: The audience is Israeli and the site is right-to-left Hebrew. Write ALL user-facing strings — bottleneck.summary, evidence, ad_copy fields, lp_copy fields, actions.change, actions.expected_impact — in natural, idiomatic modern Hebrew. Keep the JSON keys and the funnel_stage enum value in English exactly as specified. Currency in any human text is ₪ (e.g. "₪32 לליד"). Use ILS, not USD.

Principles: lead with a specific problem or desire, name a clear payoff, remove friction, use plain words, no fluff. Avoid generic phrasing. If metrics are missing or zero, say so and reason from the creative alone.

${SCHEMA_INSTRUCTIONS}`;

function metricsBlock(agg: Awaited<ReturnType<typeof aggregateForClient>>) {
  const t = agg.totals;
  const lines: string[] = [];
  lines.push(`Aggregate (last 30d across ${agg.perCampaign.length} campaign(s)):`);
  lines.push(`  spend=₪${t.spend.toFixed(2)}  impressions=${t.impressions}  clicks=${t.clicks}`);
  lines.push(`  ctr=${t.ctr.toFixed(2)}%  cpm=₪${t.cpm.toFixed(2)}`);
  lines.push(`  leads=${t.leads}  cpl=₪${t.costPerLead.toFixed(2)}`);
  lines.push(`  conversions=${t.conversions}  cpa=₪${t.costPerConversion.toFixed(2)}`);
  for (const c of agg.perCampaign) {
    lines.push(
      `  - ${c.campaign.name} [${c.campaign.objective ?? "?"}] spend=₪${c.spend.toFixed(2)} ctr=${c.ctr.toFixed(2)}% cpl=₪${c.costPerLead.toFixed(2)} leads=${c.leads}`,
    );
  }
  return lines.join("\n");
}

function imageMediaType(p: string): "image/png" | "image/jpeg" | "image/webp" | "image/gif" {
  const ext = p.toLowerCase().split(".").pop() ?? "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

export async function runAnalysis(opts: { clientId: string; landingPageId?: string }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const anthropic = new Anthropic({ apiKey });

  const client = await prisma.client.findUnique({ where: { id: opts.clientId } });
  if (!client) throw new Error("Client not found");
  const lp = opts.landingPageId
    ? await prisma.landingPage.findUnique({ where: { id: opts.landingPageId } })
    : await prisma.landingPage.findFirst({ where: { clientId: opts.clientId }, orderBy: { createdAt: "desc" } });

  const agg = await aggregateForClient(opts.clientId, "30d");

  let htmlExcerpt = "";
  if (lp?.htmlPath) {
    try {
      const raw = await fs.readFile(lp.htmlPath, "utf8");
      const body = raw.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? raw;
      htmlExcerpt = body.replace(/\s+/g, " ").slice(0, 30_000);
    } catch {}
  }

  let imageBase64: string | undefined;
  let imageMt: ReturnType<typeof imageMediaType> | undefined;
  if (lp?.screenshotPath) {
    try {
      const buf = await fs.readFile(lp.screenshotPath);
      imageBase64 = buf.toString("base64");
      imageMt = imageMediaType(lp.screenshotPath);
    } catch {}
  }

  const assets = await prisma.clientAsset.findMany({
    where: { clientId: opts.clientId },
    orderBy: { createdAt: "desc" },
  });
  const creativeImages: { base64: string; mt: ReturnType<typeof imageMediaType>; label: string }[] = [];
  for (const a of assets.filter((x) => x.kind === "creative_image" && x.filePath).slice(0, 6)) {
    try {
      const buf = await fs.readFile(a.filePath!);
      creativeImages.push({ base64: buf.toString("base64"), mt: imageMediaType(a.filePath!), label: a.label });
    } catch {}
  }
  const briefText = assets
    .filter((a) => a.kind === "brief" && a.text)
    .map((a) => `[${a.label}]\n${a.text}`)
    .join("\n\n");
  const notesText = assets
    .filter((a) => a.kind === "note" && a.text)
    .map((a) => `[${a.label}]\n${a.text}`)
    .join("\n\n");
  const videoCreativeLabels = assets
    .filter((a) => a.kind === "creative_video")
    .map((a) => a.label);

  // Fetch live ad creatives from Meta for each attached campaign.
  const metaAds: { campaign: string; ads: FbAd[] }[] = [];
  const metaAdImages: { base64: string; mt: ReturnType<typeof imageMediaType>; label: string }[] = [];
  try {
    const conn = await getActiveConnection();
    if (conn && agg.perCampaign.length) {
      const meta = new MetaClient(conn.accessToken);
      for (const c of agg.perCampaign.slice(0, 4)) {
        try {
          const ads = await meta.listCampaignAds(c.campaign.id, 5);
          const active = ads.filter((a) => (a.effective_status ?? a.status) === "ACTIVE");
          const picked = (active.length ? active : ads).slice(0, 3);
          if (picked.length) metaAds.push({ campaign: c.campaign.name, ads: picked });
          for (const ad of picked) {
            const url = ad.creative?.image_url || ad.creative?.thumbnail_url;
            if (!url) continue;
            if (metaAdImages.length >= 6) break;
            try {
              const r = await fetch(url);
              if (!r.ok) continue;
              const buf = Buffer.from(await r.arrayBuffer());
              const ct = r.headers.get("content-type") ?? "image/jpeg";
              const mt: ReturnType<typeof imageMediaType> =
                ct.includes("png") ? "image/png" :
                ct.includes("webp") ? "image/webp" :
                ct.includes("gif") ? "image/gif" : "image/jpeg";
              metaAdImages.push({ base64: buf.toString("base64"), mt, label: `${c.campaign.name} · ${ad.name}` });
            } catch {}
          }
        } catch {}
      }
    }
  } catch {}

  const run = await prisma.analysisRun.create({
    data: {
      clientId: opts.clientId,
      landingPageId: lp?.id,
      campaignIdsJson: JSON.stringify(agg.perCampaign.map((c) => c.campaign.id)),
      status: "running",
      model: MODEL,
      inputSnapshotJson: JSON.stringify({
        client: { name: client.name, description: client.description },
        totals: agg.totals,
        perCampaign: agg.perCampaign.map((c) => ({ name: c.campaign.name, ...c, campaign: undefined })),
        landingPage: lp ? { id: lp.id, label: lp.label, sourceType: lp.sourceType, sourceUrl: lp.sourceUrl } : null,
      }),
    },
  });

  try {
    const userBlocks: Anthropic.Messages.ContentBlockParam[] = [];
    userBlocks.push({
      type: "text",
      text: `CLIENT: ${client.name}\nDESCRIPTION: ${client.description ?? "(none)"}\n\nMETRICS:\n${metricsBlock(agg)}`,
    });
    if (briefText) {
      userBlocks.push({ type: "text", text: `CLIENT BRIEF / STRATEGY:\n${briefText}` });
    }
    if (notesText) {
      userBlocks.push({ type: "text", text: `INTERNAL NOTES:\n${notesText}` });
    }
    if (videoCreativeLabels.length) {
      userBlocks.push({
        type: "text",
        text: `VIDEO CREATIVES ON FILE (not analyzable here, mention if relevant): ${videoCreativeLabels.join(", ")}`,
      });
    }
    if (metaAds.length) {
      const lines: string[] = [];
      for (const g of metaAds) {
        lines.push(`Campaign: ${g.campaign}`);
        for (const ad of g.ads) {
          const cr = ad.creative ?? {};
          const oss = cr.object_story_spec?.link_data ?? cr.object_story_spec?.video_data ?? {};
          lines.push(
            `  - ${ad.name} [${ad.effective_status ?? ad.status ?? "?"}]`,
          );
          if (cr.title || (oss as { name?: string }).name) lines.push(`    title: ${cr.title ?? (oss as { name?: string }).name}`);
          if (cr.body || (oss as { message?: string }).message)
            lines.push(`    body: ${cr.body ?? (oss as { message?: string }).message}`);
        }
      }
      userBlocks.push({ type: "text", text: `LIVE META ADS (from API):\n${lines.join("\n")}` });
    }
    for (const ai of metaAdImages) {
      userBlocks.push({ type: "text", text: `META AD IMAGE: ${ai.label}` });
      userBlocks.push({
        type: "image",
        source: { type: "base64", media_type: ai.mt, data: ai.base64 },
      });
    }
    for (const ci of creativeImages) {
      userBlocks.push({ type: "text", text: `UPLOADED CREATIVE: ${ci.label}` });
      userBlocks.push({
        type: "image",
        source: { type: "base64", media_type: ci.mt, data: ci.base64 },
      });
    }
    if (imageBase64 && imageMt) {
      userBlocks.push({ type: "text", text: "LANDING PAGE SCREENSHOT:" });
      userBlocks.push({
        type: "image",
        source: { type: "base64", media_type: imageMt, data: imageBase64 },
      });
    }
    if (htmlExcerpt) {
      userBlocks.push({
        type: "text",
        text: `LANDING PAGE HTML (truncated):\n${htmlExcerpt}`,
        cache_control: { type: "ephemeral" },
      });
    }
    userBlocks.push({
      type: "text",
      text: "Now produce the JSON.",
    });

    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userBlocks }],
    });

    const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const json = extractJson(text);
    const parsed = JSON.parse(json) as AnalysisOutput;

    const usage = resp.usage;
    await prisma.analysisRun.update({
      where: { id: run.id },
      data: {
        status: "done",
        finishedAt: new Date(),
        outputJson: JSON.stringify(parsed),
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadTokens: (usage as { cache_read_input_tokens?: number }).cache_read_input_tokens ?? 0,
        cacheWriteTokens: (usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens ?? 0,
      },
    });
    return { runId: run.id, output: parsed };
  } catch (err: unknown) {
    await prisma.analysisRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        finishedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

function extractJson(s: string): string {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) return s.slice(first, last + 1);
  return s;
}
