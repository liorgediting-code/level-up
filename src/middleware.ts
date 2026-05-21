import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const LEGACY_PATHS = ["dashboard", "landing", "materials", "analyze"] as const;

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const match = pathname.match(/^\/clients\/([^/]+)\/([^/]+)(\/.*)?$/);
  if (!match) return NextResponse.next();
  const [, clientId, segment, rest] = match;
  if ((LEGACY_PATHS as readonly string[]).includes(segment)) {
    const url = req.nextUrl.clone();
    url.pathname = `/clients/${clientId}/marketing/${segment}${rest ?? ""}`;
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/clients/:id/:segment*"],
};
