import { prisma } from "@/lib/db";
import { MetaClient } from "@/lib/meta/client";

/** Single-connection app (v1): always use the most-recent row. */
export async function getActiveConnection() {
  return prisma.metaConnection.findFirst({ orderBy: { updatedAt: "desc" } });
}

export async function getClientForActiveConnection(): Promise<MetaClient> {
  const conn = await getActiveConnection();
  if (!conn) throw new Error("Meta is not connected. Connect from Settings.");
  return new MetaClient(conn.accessToken);
}

export async function refreshAdAccounts(connectionId: string) {
  const conn = await prisma.metaConnection.findUnique({ where: { id: connectionId } });
  if (!conn) throw new Error("Connection not found");
  const client = new MetaClient(conn.accessToken);
  const accounts = await client.listAdAccounts();
  for (const a of accounts) {
    await prisma.metaAccount.upsert({
      where: { id: a.id },
      update: {
        connectionId: conn.id,
        name: a.name,
        currency: a.currency ?? null,
        timezoneName: a.timezone_name ?? null,
        accountStatus: a.account_status ?? null,
        businessName: a.business?.name ?? null,
      },
      create: {
        id: a.id,
        connectionId: conn.id,
        name: a.name,
        currency: a.currency ?? null,
        timezoneName: a.timezone_name ?? null,
        accountStatus: a.account_status ?? null,
        businessName: a.business?.name ?? null,
        enabled: true,
      },
    });
  }
  return accounts.length;
}

export function oauthConfig() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const redirectUri =
    process.env.META_OAUTH_REDIRECT || "http://localhost:3000/api/meta/oauth/callback";
  return { appId, appSecret, redirectUri, isConfigured: !!(appId && appSecret) };
}
