const GRAPH = "https://graph.facebook.com/v21.0";

export type FbAdAccount = {
  id: string;
  account_id?: string;
  name: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
  business?: { id: string; name: string };
};

export type FbCampaign = { id: string; name: string; status?: string; objective?: string };

export type FbAdCreative = {
  id?: string;
  name?: string;
  title?: string;
  body?: string;
  image_url?: string;
  thumbnail_url?: string;
  object_story_spec?: {
    link_data?: { message?: string; name?: string; description?: string; caption?: string };
    video_data?: { message?: string; title?: string };
  };
};

export type FbAd = {
  id: string;
  name: string;
  status?: string;
  effective_status?: string;
  creative?: FbAdCreative;
};

export type FbInsight = {
  date_start: string;
  date_stop: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpm?: string;
  actions?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
};

export class MetaClient {
  constructor(private token: string) {}

  private async get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(`${GRAPH}${path}`);
    url.searchParams.set("access_token", this.token);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const r = await fetch(url.toString(), { cache: "no-store" });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`Meta API ${r.status}: ${text}`);
    }
    return (await r.json()) as T;
  }

  async me() {
    return this.get<{ id: string; name: string }>("/me", { fields: "id,name" });
  }

  async listAdAccounts(): Promise<FbAdAccount[]> {
    const out: FbAdAccount[] = [];
    let path = "/me/adaccounts";
    let params: Record<string, string | number | undefined> = {
      fields: "id,account_id,name,currency,timezone_name,account_status",
      limit: 100,
    };
    for (;;) {
      const res: { data: FbAdAccount[]; paging?: { cursors?: { after?: string } } } = await this.get(path, params);
      out.push(...res.data);
      const after = res.paging?.cursors?.after;
      if (!after) break;
      params = { ...params, after };
    }
    return out;
  }

  async listCampaigns(adAccountId: string): Promise<FbCampaign[]> {
    const out: FbCampaign[] = [];
    let params: Record<string, string | number | undefined> = {
      fields: "id,name,status,objective",
      limit: 100,
    };
    for (;;) {
      const res: { data: FbCampaign[]; paging?: { cursors?: { after?: string } } } = await this.get(
        `/${adAccountId}/campaigns`,
        params,
      );
      out.push(...res.data);
      const after = res.paging?.cursors?.after;
      if (!after) break;
      params = { ...params, after };
    }
    return out;
  }

  async listCampaignAds(campaignId: string, limit = 10): Promise<FbAd[]> {
    const res: { data: FbAd[] } = await this.get(`/${campaignId}/ads`, {
      fields:
        "id,name,status,effective_status,creative{id,name,title,body,image_url,thumbnail_url,object_story_spec}",
      limit,
    });
    return res.data;
  }

  async campaignInsights(campaignId: string, days = 30): Promise<FbInsight[]> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    const until = new Date();
    const timeRange = JSON.stringify({
      since: since.toISOString().slice(0, 10),
      until: until.toISOString().slice(0, 10),
    });
    const res: { data: FbInsight[] } = await this.get(`/${campaignId}/insights`, {
      time_increment: 1,
      time_range: timeRange,
      fields: "spend,impressions,clicks,ctr,cpm,actions,cost_per_action_type",
      limit: 500,
    });
    return res.data;
  }
}

/** OAuth: exchange a short-lived auth code for a short-lived user access token. */
export async function exchangeCodeForToken(opts: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}) {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("client_id", opts.appId);
  url.searchParams.set("client_secret", opts.appSecret);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("code", opts.code);
  const r = await fetch(url.toString(), { cache: "no-store" });
  if (!r.ok) throw new Error(`Token exchange failed ${r.status}: ${await r.text()}`);
  return (await r.json()) as { access_token: string; token_type: string; expires_in?: number };
}

/** Upgrade a short-lived user token to a ~60-day long-lived token. */
export async function exchangeForLongLivedToken(opts: {
  appId: string;
  appSecret: string;
  shortToken: string;
}) {
  const url = new URL(`${GRAPH}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", opts.appId);
  url.searchParams.set("client_secret", opts.appSecret);
  url.searchParams.set("fb_exchange_token", opts.shortToken);
  const r = await fetch(url.toString(), { cache: "no-store" });
  if (!r.ok) throw new Error(`Long-lived exchange failed ${r.status}: ${await r.text()}`);
  return (await r.json()) as { access_token: string; token_type: string; expires_in?: number };
}
