// Pinterest API v5. Scopes: user_accounts:read, pins:read. Access tokens last 30 days.
import { getJson, firstLine, num } from "../http.ts";
import type { Collector, PostMetricRow } from "../types.ts";
import { emptyResult } from "../types.ts";

const BASE = "https://api.pinterest.com/v5";

interface Pin { id: string; title?: string; description?: string; created_at?: string }
interface PinAnalytics { all?: { summary_metrics?: Record<string, number>; lifetime_metrics?: Record<string, number> } }

export function mapPin(p: Pin, a: PinAnalytics): PostMetricRow {
  const m = a.all?.lifetime_metrics ?? a.all?.summary_metrics ?? {};
  return {
    post_key: p.id,
    title: firstLine(p.title || p.description, "Pin"),
    format: "pin",
    posted_at: p.created_at,
    url: `https://www.pinterest.com/pin/${p.id}/`,
    views: num(m.IMPRESSION),
    saves: num(m.SAVE),
    raw: m,
  };
}

export const collectPinterest: Collector = async (ctx) => {
  const token = ctx.env("PINTEREST_ACCESS_TOKEN");
  if (!token) return emptyResult("pinterest", "needs_token", "Set PINTEREST_ACCESS_TOKEN");
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const acct = await getJson<{ follower_count?: number }>(ctx.fetch, `${BASE}/user_account`, auth);
  const pins = await getJson<{ items?: Pin[] }>(ctx.fetch, `${BASE}/pins?page_size=${Math.min(ctx.maxPosts, 100)}`, auth);
  const end = ctx.now.toISOString().slice(0, 10);
  const start = new Date(ctx.now.getTime() - 89 * 86400_000).toISOString().slice(0, 10);
  const posts: PostMetricRow[] = [];
  const problems: string[] = [];
  for (const p of pins.items ?? []) {
    try {
      const a = await getJson<PinAnalytics>(
        ctx.fetch, `${BASE}/pins/${p.id}/analytics?start_date=${start}&end_date=${end}&metric_types=IMPRESSION,SAVE`, auth,
      );
      posts.push(mapPin(p, a));
    } catch (e) {
      problems.push(`${p.id}: ${(e as Error).message}`);
    }
  }
  return {
    ...emptyResult("pinterest", problems.length ? "partial" : "ok", problems.slice(0, 3).join("; ") || undefined),
    followers: num(acct.follower_count),
    posts,
  };
};
