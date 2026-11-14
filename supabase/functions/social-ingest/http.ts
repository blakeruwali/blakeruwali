// Small JSON fetch helper with a timeout and readable errors (never echoes tokens).
import type { Fetch } from "./types.ts";

const TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function getJson<T>(
  fetchFn: Fetch,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetchFn(url, { ...init, signal: ctrl.signal });
    } catch (e) {
      // Network errors can echo the full URL; never let a key travel on in a message.
      throw new Error(redact(`${new URL(url).host}: ${(e as Error).message}`));
    }
    const text = await res.text();
    if (!res.ok) {
      throw new ApiError(res.status, redact(`${new URL(url).host} ${res.status}: ${summarize(text)}`));
    }
    return (text ? JSON.parse(text) : {}) as T;
  } finally {
    clearTimeout(timer);
  }
}

function summarize(body: string): string {
  try {
    const j = JSON.parse(body);
    const msg = j?.error?.message ?? j?.error_description ?? j?.message ?? j?.detail ?? j?.title;
    if (msg) return String(msg).slice(0, 200);
  } catch { /* not JSON */ }
  return body.slice(0, 200);
}

const SECRET_PARAM = /([?&](?:access_token|key|client_secret|refresh_token)=)[^&\s)"']+/gi;
const BEARER = /(Bearer\s+)[A-Za-z0-9._~+/=-]+/g;
export function redact(text: string): string;
export function redact(text: string | undefined): string | undefined;
export function redact(text: string | undefined): string | undefined {
  return text?.replace(SECRET_PARAM, "$1[redacted]").replace(BEARER, "$1[redacted]");
}

export function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

// Same rule as ai_comments.matches_ai in SQL: "AI" or "A.I." as its own word.
const AI_RE = /(^|[^\p{L}\p{N}])a\.?i\.?([^\p{L}\p{N}]|$)/iu;
export function mentionsAi(text: string | undefined | null): boolean {
  return !!text && AI_RE.test(text);
}

export function firstLine(text: string | undefined | null, fallback: string): string {
  const line = (text ?? "").split("\n").map((s) => s.trim()).find(Boolean);
  return (line ?? fallback).slice(0, 120);
}
