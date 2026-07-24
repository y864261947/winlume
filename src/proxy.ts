import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Home (`/`) now redirects to `/studio` via app/page.tsx.
// Business-audience marketing redirect is no longer applied on `/`.
export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = { matcher: "/" };
