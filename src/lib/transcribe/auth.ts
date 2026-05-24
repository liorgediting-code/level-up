import { NextResponse } from "next/server";

const EXPECTED = process.env.LIVE_TRANSCRIBE_TOKEN || "";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Returns null on success, or a NextResponse to return on failure. */
export function requireTranscribeAuth(req: Request): NextResponse | null {
  if (!EXPECTED) {
    return NextResponse.json(
      { error: "LIVE_TRANSCRIBE_TOKEN not configured on server" },
      { status: 500 }
    );
  }
  const header = req.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m || !safeEqual(m[1], EXPECTED)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
