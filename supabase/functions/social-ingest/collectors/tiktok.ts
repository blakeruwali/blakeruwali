// TikTok Display API v2. Scopes: user.info.basic, user.info.stats, video.list. App must pass TikTok review.
import { getJson, firstLine, num } from "../http.ts";
import type { Collector, CollectorContext, PostMetricRow } from "../types.ts";
import { emptyResult } from "../types.ts";

const BASE = "https://open.tiktokapis.com/v2";

interface TtVideo {
  id: string; title?: string; video_description?: string; create_time?: number; share_url?: string; duration?: number;
  view_count?: number; like_count?: number; comment_count?: number; share_count?: number;
}

export function mapTikTok(v: TtVideo): PostMetricRow {
  return {
    post_key: v.id,
    title: firstLine(v.title || v.video_description, "TikTok video"),
    format: "video",
    posted_at: v.create_time ? new Date(v.create_time * 1000).toISOString() : undefined,
    url: v.share_url,
    duration_sec: num(v.duration),
    views: num(v.view_count),
    likes: num(v.like_count),
    comments: num(v.comment_count),
    shares: num(v.share_count),
    raw: v,
  };
}

async function accessToken(ctx: CollectorContext): Promise<string | undefined> {
  const key = ctx.env("TIKTOK_CLIENT_KEY");
  const secret = ctx.env("TIKTOK_CLIENT_SECRET");
  const refresh = ctx.env("TIKTOK_REFRESH_TOKEN");
  if (!key || !secret || !refresh) return undefined;
  const body = new URLSearchParams({ client_key: key, client_secret: secret, grant_type: "refresh_token", refresh_token: refresh });
  const res = await getJson<{ access_token?: string }>(ctx.fetch, `${BASE}/oauth/token/`, {
    method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return res.access_token;
}

export const collectTikTok: Collector = async (ctx) => {
  const token = await accessToken(ctx);
  if (!token) return emptyResult("tiktok", "needs_token", "Set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN");
  const auth = { Authorization: `Bearer ${token}` };
  const user = await getJson<{ data?: { user?: { follower_count?: number } } }>(
    ctx.fetch, `${BASE}/user/info/?fields=open_id,username,follower_count`, { headers: auth },
  );
  const fields = "id,title,video_description,create_time,share_url,duration,view_count,like_count,comment_count,share_count";
  const list = await getJson<{ data?: { videos?: TtVideo[] } }>(ctx.fetch, `${BASE}/video/list/?fields=${fields}`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ max_count: Math.min(ctx.maxPosts, 20) }),
  });
  return {
    ...emptyResult("tiktok", "ok", "Display API has no watch time or follows per video"),
    followers: num(user.data?.user?.follower_count),
    posts: (list.data?.videos ?? []).map(mapTikTok),
  };
};
