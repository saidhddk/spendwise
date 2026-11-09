import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { z } from "zod";
import { appOrigin } from "./config";
import { allowRequest } from "./rateLimit";
import { logEvent } from "./audit";
import { sessionFromRequest, type AuthContext } from "@/modules/auth/session";

// Every API route goes through api(). In one place it enforces: the Origin check on
// state-changing requests (NFR-02), the 10 KB body limit (FR-12), strict input schemas for the
// body and the query string (FR-12, NFR-27), login (FR-11), the per-user rate limit (NFR-16),
// generic error messages (NFR-24) and Cache-Control: no-store (NFR-21).

export const MAX_BODY_BYTES = 10 * 1024;
const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const NO_QUERY = z.strictObject({});

export class HttpError extends Error {
  constructor(
    public status: number,
    public publicMessage: string,
    public fields?: Record<string, string>,
  ) {
    super(publicMessage);
  }
}

export const notFound = () => new HttpError(404, "Not found.");

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** The right-most X-Forwarded-For entry is the one added by our own reverse proxy. */
export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const hops = forwarded?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return hops[hops.length - 1] ?? req.headers.get("x-real-ip") ?? "unknown";
}

export type ApiContext<B, Q> = {
  req: NextRequest;
  ip: string;
  body: B;
  query: Q;
  auth: AuthContext;
  params: Record<string, string>;
};

type Options<B, Q> = {
  auth?: boolean; // the route needs a logged-in user
  limit?: boolean; // the route counts towards the 60 requests/minute limit
  touch?: boolean; // false: checking the session does not extend it (session-status polling)
  body?: ZodType<B>;
  query?: ZodType<Q>;
};

type Segment = { params: Promise<Record<string, string>> };

export function api<B = undefined, Q = Record<string, never>>(
  options: Options<B, Q>,
  handler: (ctx: ApiContext<B, Q>) => Promise<Response>,
) {
  return async (req: NextRequest, segment?: Segment): Promise<Response> => {
    const ip = clientIp(req);
    let res: Response;
    try {
      // NFR-02: a POST, PUT, PATCH or DELETE must come from our own pages. Browsers always send
      // Origin on these requests, so a form or script on another site gets 403 before anything runs.
      if (STATE_CHANGING.has(req.method) && req.headers.get("origin") !== appOrigin()) {
        await logEvent("CSRF_REJECTED", { ip, detail: `${req.method} ${req.nextUrl.pathname}` });
        throw new HttpError(403, "Request refused.");
      }
      const auth = await sessionFromRequest(req, options.touch ?? true);
      if (options.auth && !auth) throw new HttpError(401, "Please log in.");
      void allowRequest; // VULN-10: no rate limit
      const query = parse((options.query ?? NO_QUERY) as ZodType<Q>, Object.fromEntries(req.nextUrl.searchParams));
      const body = options.body ? parse(options.body, await readJson(req)) : (undefined as B);
      const params = segment ? await segment.params : {};
      res = await handler({ req, ip, body, query, auth: auth as AuthContext, params });
    } catch (err) {
      res = errorResponse(err);
    }
    res.headers.set("Cache-Control", "no-store");
    return res;
  };
}

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? String(issue.path[0]) : "_";
    fields[key] ??= issue.message;
  }
  throw new HttpError(400, "Invalid input.", fields);
}

/** Reads at most 10 KB; larger bodies are refused before they are parsed (FR-12). */
async function readJson(req: NextRequest): Promise<unknown> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) throw new HttpError(413, "Request too large.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body?.getReader();
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "Request too large.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid input.");
  }
}

/** NFR-24: known errors get their public message; anything else a generic one. Details stay in the server log. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return json({ error: err.publicMessage, ...(err.fields ? { fields: err.fields } : {}) }, err.status);
  }
  console.error("Unhandled API error:", err);
  return json({ error: "Something went wrong. Please try again." }, 500);
}
