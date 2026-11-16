// Instagram API with Instagram Login (graph.instagram.com).
// Scopes: instagram_business_basic, instagram_business_manage_insights, instagram_business_manage_comments.
import { getJson, firstLine, mentionsAi, num } from "../http.ts";
import type { AiCommentRow, Collector, CollectorContext, PostFormat, PostMetricRow } from "../types.ts";
import { emptyResult } from "../types.ts";

// Two token kinds work:
// - Instagram Login token (IGAA…): graph.instagram.com, account addressed as /me.
// - System-user token from a business portfolio (Unified login, never expires): graph.facebook.com,
//   account addressed by its Instagram user id, set as IG_USER_ID.
export function igApi(igUserId: string | undefined): { base: string; account: string } {
  return igUserId
    ? { base: "https://graph.facebook.com/v23.0", account: igUserId }
    : { base: "https://graph.instagram.com/v23.0", account: "me" };
}
// Token goes in a header, never the URL, so it cannot leak through error messages or logs.
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

interface IgMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_product_type?: string;
  permalink?: string;
  timestamp?: string;
}
interface IgInsight { name: string; values?: { value: number }[]; total_value?: { value: number } }
interface IgComment { id: string; text?: string; username?: string; timestamp: string }

export function igFormat(m: IgMedia): PostFormat {
  if (m.media_product_type === "REELS") return "reel";
  if (m.media_product_type === "STORY") return "story";
  if (m.media_type === "CAROUSEL_ALBUM") return "carousel";
  if (m.media_type === "VIDEO") return "video";
  return "image";
}

export function igMetricNames(format: PostFormat): string[] {
  const base = ["views", "reach", "likes", "comments", "shares", "saved"];
  if (format === "reel") return [...base, "ig_reels_avg_watch_time"];
  if (format === "story") return ["views", "reach", "shares", "follows", "profile_visits"];
  return [...base, "follows", "profile_visits"];
}

export function mapIgInsights(m: IgMedia, insights: IgInsight[]): PostMetricRow {
  const v = (name: string) => {
    const i = insights.find((x) => x.name === name);
    return num(i?.total_value?.value ?? i?.values?.[0]?.value);
  };
  const watchMs = v("ig_reels_avg_watch_time");
  const format = igFormat(m);
  return {
    post_key: m.id,
    title: firstLine(m.caption, `Instagram ${format}`),
    format,
    posted_at: m.timestamp,
    url: m.permalink,
    views: v("views"),
    reach: v("reach"),
    likes: v("likes"),
    comments: v("comments"),
    shares: v("shares"),
    saves: v("saved"),
    follows: v("follows"),
    profile_visits: v("profile_visits"),
    avg_watch_sec: watchMs === undefined ? undefined : Math.round(watchMs / 10) / 100,
    raw: { insights },
  };
}

async function insightsFor(ctx: CollectorContext, BASE: string, token: string, m: IgMedia): Promise<IgInsight[]> {
  const names = igMetricNames(igFormat(m));
  const url = (metrics: string[]) => `${BASE}/${m.id}/insights?metric=${metrics.join(",")}`;
  try {
    return (await getJson<{ data: IgInsight[] }>(ctx.fetch, url(names), auth(token))).data ?? [];
  } catch {
    // Some metrics are not offered for every media type; fall back to the safe core set.
    return (await getJson<{ data: IgInsight[] }>(ctx.fetch, url(["views", "reach"]), auth(token))).data ?? [];
  }
}

async function aiCommentsFor(ctx: CollectorContext, BASE: string, token: string, m: IgMedia): Promise<AiCommentRow[]> {
  const res = await getJson<{ data: IgComment[] }>(
    ctx.fetch,
    `${BASE}/${m.id}/comments?fields=id,text,username,timestamp&limit=50`, auth(token),
  );
  return (res.data ?? []).filter((c) => mentionsAi(c.text)).map((c) => ({
    platform_comment_id: c.id,
    platform_post_id: m.id,
    author_handle: c.username,
    body: c.text ?? "",
    commented_at: c.timestamp,
  }));
}

export const collectInstagram: Collector = async (ctx) => {
  const token = ctx.env("IG_ACCESS_TOKEN");
  if (!token) return emptyResult("instagram", "needs_token", "Set IG_ACCESS_TOKEN");
  const { base: BASE, account } = igApi(ctx.env("IG_USER_ID"));
  const me = await getJson<{ followers_count?: number }>(ctx.fetch, `${BASE}/${account}?fields=username,followers_count`, auth(token));
  const media = await getJson<{ data: IgMedia[] }>(
    ctx.fetch, `${BASE}/${account}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp&limit=${ctx.maxPosts}`, auth(token),
  );
  const result = { ...emptyResult("instagram", "ok"), followers: num(me.followers_count) };
  const problems: string[] = [];
  for (const m of media.data ?? []) {
    try {
      result.posts.push(mapIgInsights(m, await insightsFor(ctx, BASE, token, m)));
      result.aiComments.push(...await aiCommentsFor(ctx, BASE, token, m));
    } catch (e) {
      problems.push(`${m.id}: ${(e as Error).message}`);
    }
  }
  return problems.length ? { ...result, status: "partial", message: problems.slice(0, 3).join("; ") } : result;
};
