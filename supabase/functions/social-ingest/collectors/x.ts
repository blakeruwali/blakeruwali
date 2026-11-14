// X API v2 with an app bearer token. Reading your own posts needs a paid tier (Basic or higher).
import { getJson, firstLine, num } from "../http.ts";
import type { Collector, PostMetricRow } from "../types.ts";
import { emptyResult } from "../types.ts";

const BASE = "https://api.x.com/2";

interface Tweet {
  id: string; text: string; created_at?: string;
  public_metrics?: { retweet_count?: number; reply_count?: number; like_count?: number; quote_count?: number; bookmark_count?: number; impression_count?: number };
}

export function mapTweet(t: Tweet, username: string): PostMetricRow {
  const m = t.public_metrics ?? {};
  return {
    post_key: t.id,
    title: firstLine(t.text, "Post on X"),
    format: "text",
    posted_at: t.created_at,
    url: `https://x.com/${username}/status/${t.id}`,
    views: num(m.impression_count),
    likes: num(m.like_count),
    comments: num(m.reply_count),
    shares: (m.retweet_count ?? 0) + (m.quote_count ?? 0),
    saves: num(m.bookmark_count),
    raw: m,
  };
}

export const collectX: Collector = async (ctx) => {
  const bearer = ctx.env("X_BEARER_TOKEN");
  if (!bearer) return emptyResult("x", "needs_token", "Set X_BEARER_TOKEN (paid API tier)");
  const username = ctx.env("X_USERNAME") ?? "blakeruwali";
  const auth = { headers: { Authorization: `Bearer ${bearer}` } };
  const user = await getJson<{ data?: { id: string; public_metrics?: { followers_count?: number } } }>(
    ctx.fetch, `${BASE}/users/by/username/${username}?user.fields=public_metrics`, auth,
  );
  if (!user.data) return emptyResult("x", "error", `User ${username} not found`);
  const max = Math.max(5, Math.min(ctx.maxPosts, 100));
  const tweets = await getJson<{ data?: Tweet[] }>(
    ctx.fetch, `${BASE}/users/${user.data.id}/tweets?max_results=${max}&exclude=replies,retweets&tweet.fields=created_at,public_metrics`, auth,
  );
  return {
    ...emptyResult("x", "ok"),
    followers: num(user.data.public_metrics?.followers_count),
    posts: (tweets.data ?? []).map((t) => mapTweet(t, username)),
  };
};
