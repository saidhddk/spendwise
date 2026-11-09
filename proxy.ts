import { NextResponse } from "next/server";

// VULN-11: no Content-Security-Policy, no X-Frame-Options (clickjacking), no HSTS, no no-store.
export function proxy() {
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
