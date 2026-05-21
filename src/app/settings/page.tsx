import { prisma } from "@/lib/db";
import { oauthConfig } from "@/lib/meta/connection";
import SettingsClient from "./settings-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; oauth_error?: string }>;
}) {
  const sp = await searchParams;
  const anthropic = !!process.env.ANTHROPIC_API_KEY;
  const cfg = oauthConfig();
  const connection = await prisma.metaConnection.findFirst({
    orderBy: { updatedAt: "desc" },
    include: { accounts: { orderBy: { name: "asc" } } },
  });
  return (
    <SettingsClient
      anthropicSet={anthropic}
      appConfigured={cfg.isConfigured}
      redirectUri={cfg.redirectUri}
      connection={
        connection
          ? {
              fbUserName: connection.fbUserName,
              expiresAt: connection.expiresAt?.toISOString() ?? null,
              accounts: connection.accounts.map((a) => ({
                id: a.id,
                name: a.name,
                currency: a.currency,
                businessName: a.businessName,
                enabled: a.enabled,
                lastSyncedAt: a.lastSyncedAt?.toISOString() ?? null,
                accountStatus: a.accountStatus,
              })),
            }
          : null
      }
      banner={{ success: sp.connected === "1", error: sp.oauth_error ?? null }}
    />
  );
}
