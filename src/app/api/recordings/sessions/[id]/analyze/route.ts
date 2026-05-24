import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Placeholder — AI analysis instructions will be added later.
// When ready, this route should: load the session + concatenated transcript,
// send it to Claude with the user-provided system prompt, and store the
// result in TranscriptSession.summary.
export async function POST() {
  return NextResponse.json(
    { error: "AI analysis not yet configured. Add instructions to enable." },
    { status: 501 }
  );
}
