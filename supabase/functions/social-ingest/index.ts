// social-ingest: pulls follower counts, per-post metrics and "AI" comments from each platform API.
// Called by pg_cron (see docs/social-dashboard.md) with header x-ingest-secret.
// Optional query: ?channel=instagram to run one channel.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { COLLECTORS } from "./collectors/index.ts";
import { logRun, writeResult } from "./store.ts";
import type { ChannelId, CollectResult } from "./types.ts";
import { emptyResult } from "./types.ts";
import { redact } from "./http.ts";
import { resolveTokens } from "./tokens.ts";

const MAX_POSTS = 25;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("INGEST_SECRET");
  if (!secret) return Response.json({ error: "INGEST_SECRET is not set" }, { status: 500 });
  if (!timingSafeEqual(req.headers.get("x-ingest-secret") ?? "", secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const only = new URL(req.url).searchParams.get("channel");
  const channels = (Object.keys(COLLECTORS) as ChannelId[]).filter((c) => !only || c === only);
  if (!channels.length) return Response.json({ error: `unknown channel ${only}` }, { status: 400 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const now = new Date();
  now.setSeconds(0, 0);
  const capturedAt = now.toISOString();
  const { overrides, notes } = await resolveTokens(db, (n) => Deno.env.get(n), fetch, now);
  const ctx = { env: (n: string) => overrides[n] ?? Deno.env.get(n), fetch, now, maxPosts: MAX_POSTS };
  const noteFor: Record<string, string | undefined> = {
    instagram: notes.IG_ACCESS_TOKEN, threads: notes.THREADS_ACCESS_TOKEN,
  };

  const summary = await Promise.all(channels.map(async (channel) => {
    const startedAt = new Date().toISOString();
    let result: CollectResult;
    try {
      result = await COLLECTORS[channel](ctx);
    } catch (e) {
      result = emptyResult(channel, "error", (e as Error).message);
    }
    let rows = 0;
    if (result.status === "ok" || result.status === "partial") {
      try {
        rows = await writeResult(db, result, capturedAt);
      } catch (e) {
        result = { ...result, status: "error", message: (e as Error).message };
      }
    }
    const note = noteFor[channel];
    if (note && result.status === "error") result = { ...result, message: `${result.message ?? ""} (${note})`.trim() };
    await logRun(db, channel, startedAt, result.status, rows, result.message);
    return { channel, status: result.status, rows, message: redact(result.message) };
  }));

  return Response.json({ captured_at: capturedAt, channels: summary });
});
