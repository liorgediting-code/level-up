import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { oauthConfig } from "@/lib/meta/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES = ["ads_read", "ads_management"];

export async function GET() {
  const { appId, redirectUri, isConfigured } = oauthConfig();
  if (!isConfigured) {
    return NextResponse.json(
      { error: "META_APP_ID / META_APP_SECRET not set in .env.local" },
      { status: 400 },
    );
  }
  const state = crypto.randomBytes(16).toString("hex");
  const auth = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  auth.searchParams.set("client_id", appId!);
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("scope", SCOPES.join(","));
  auth.searchParams.set("state", state);
  auth.searchParams.set("response_type", "code");

  const res = NextResponse.redirect(auth.toString());
  res.cookies.set("meta_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
