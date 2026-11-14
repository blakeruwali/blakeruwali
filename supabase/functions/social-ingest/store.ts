// Writes one collector result to Postgres with the service role.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";
import type { CollectResult, PostMetricRow } from "./types.ts";
import { redact } from "./http.ts";

const nyDay = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/New_York" }) : undefined;

// A post entered by hand (post_key = content_key) gets adopted by the API row for the same
// channel, format and New York day, so Day 1 manual rows are not counted twice. When several
// manual rows qualify, the one with the most views that is still <= the API count wins
// (counts only grow). API posts are processed biggest first.
export function pickManualMatch(
  candidates: { id: string; views: number | null }[], apiViews: number | undefined,
): string | undefined {
  if (candidates.length === 1) return candidates[0].id;
  if (apiViews === undefined) return undefined;
  const fit = candidates.filter((c) => c.views !== null && c.views <= apiViews).sort((a, b) => b.views! - a.views!);
  if (!fit.length || (fit.length > 1 && fit[0].views === fit[1].views)) return undefined;
  return fit[0].id;
}

async function adoptManualPost(db: SupabaseClient, channel: string, p: PostMetricRow): Promise<void> {
  const { data: existing } = await db.from("posts").select("id").eq("channel_id", channel).eq("post_key", p.post_key).maybeSingle();
  if (existing || !p.posted_at) return;
  const { data: manual } = await db.from("v_post_latest").select("post_id, post_key, content_key, posted_at, views")
    .eq("channel_id", channel).eq("format", p.format).not("content_key", "is", null);
  const day = nyDay(p.posted_at);
  const candidates = (manual ?? [])
    .filter((m) => m.post_key === m.content_key && nyDay(m.posted_at) === day)
    .map((m) => ({ id: m.post_id as string, views: m.views as number | null }));
  const id = pickManualMatch(candidates, p.views);
  if (id) await db.from("posts").update({ post_key: p.post_key }).eq("id", id);
}

export async function writeResult(db: SupabaseClient, r: CollectResult, capturedAt: string): Promise<number> {
  const biggestFirst = [...r.posts].sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  for (const p of biggestFirst) await adoptManualPost(db, r.channel, p);
  const payload = {
    source: "api",
    followers: r.followers === undefined ? [] : [{ channel: r.channel, captured_at: capturedAt, followers: r.followers }],
    posts: r.posts.map((p) => ({ ...p, channel: r.channel, captured_at: capturedAt })),
  };
  const { data, error } = await db.rpc("import_social_snapshot", { payload });
  if (error) throw new Error(`import: ${error.message}`);
  let written = (data?.followers ?? 0) + (data?.post_metrics ?? 0);

  for (const c of r.aiComments) {
    const { error: e } = await db.rpc("record_ai_comment", {
      p_channel: r.channel,
      p_platform_comment_id: c.platform_comment_id,
      p_body: c.body,
      p_commented_at: c.commented_at,
      p_platform_post_id: c.platform_post_id ?? null,
      p_author_handle: c.author_handle ?? null,
      p_author_platform_id: null,
    });
    if (e) throw new Error(`ai comment: ${e.message}`);
    written += 1;
  }
  return written;
}

export async function logRun(
  db: SupabaseClient, channel: string, startedAt: string, status: string, rows: number, message?: string,
): Promise<void> {
  const { error } = await db.from("ingest_runs").insert({
    channel_id: channel, started_at: startedAt, finished_at: new Date().toISOString(),
    status, rows_written: rows, message: redact(message)?.slice(0, 500) ?? null,
  });
  if (error) console.error(`ingest_runs insert failed for ${channel}: ${error.message}`);
}
