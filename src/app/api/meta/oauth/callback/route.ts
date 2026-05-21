import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { exchangeCodeForToken, exchangeForLongLivedToken, MetaClient } from "@/lib/meta/client";
import { oauthConfig, refreshAdAccounts } from "@/lib/meta/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const fbError = url.searchParams.get("error_description") || url.searchParams.get("error");
  const cookieState = req.headers.get("cookie")?.match(/meta_oauth_state=([^;]+)/)?.[1];

  if (fbError) return errorRedirect(`Facebook returned: ${fbError}`);
  if (!code) return errorRedirect("Missing authorization code.");
  if (!state || !cookieState || state !== cookieState) return errorRedirect("OAuth state mismatch.");

  const { appId, appSecret, redirectUri, isConfigured } = oauthConfig();
  if (!isConfigured) return errorRedirect("META_APP_ID / META_APP_SECRET not configured.");

  try {
    const short = await exchangeCodeForToken({ appId: appId!, appSecret: appSecret!, redirectUri, code });
    const long = await exchangeForLongLivedToken({ appId: appId!, appSecret: appSecret!, shortToken: short.access_token });
    const expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null;

    const client = new MetaClient(long.access_token);
    const me = await client.me().catch(() => null);

    const existing = await prisma.metaConnection.findFirst({ orderBy: { updatedAt: "desc" } });
    const conn = existing
      ? await prisma.metaConnection.update({
          where: { id: existing.id },
          data: {
            accessToken: long.access_token,
            expiresAt,
            fbUserId: me?.id ?? existing.fbUserId,
            fbUserName: me?.name ?? existing.fbUserName,
            scope: "ads_read,ads_management",
          },
        })
      : await prisma.metaConnection.create({
          data: {
            accessToken: long.access_token,
            expiresAt,
            fbUserId: me?.id,
            fbUserName: me?.name,
            scope: "ads_read,ads_management",
          },
        });

    await refreshAdAccounts(conn.id);

    const res = NextResponse.redirect(new URL("/settings?connected=1", req.url));
    res.cookies.delete("meta_oauth_state");
    return res;
  } catch (err: unknown) {
    return errorRedirect(err instanceof Error ? err.message : String(err));
  }

  function errorRedirect(msg: string) {
    const u = new URL("/settings", req.url);
    u.searchParams.set("oauth_error", msg);
    return NextResponse.redirect(u);
  }
}
