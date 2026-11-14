// YouTube Data API v3 (API key) for subscribers, views, likes, comments.
// Optional YouTube Analytics API (OAuth refresh token) adds average view duration and subscribers gained.
import { getJson, firstLine, mentionsAi, num } from "../http.ts";
import type { AiCommentRow, Collector, CollectorContext, PostMetricRow } from "../types.ts";
import { emptyResult } from "../types.ts";

const DATA = "https://www.googleapis.com/youtube/v3";
const DEFAULT_CHANNEL = "UCrvL3rvxM1WMRclSeqYNtXg";
const SHORT_MAX_SEC = 60;

interface Video {
  id: string;
  snippet: { title: string; publishedAt: string };
  contentDetails: { duration: string };
  statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
}

export function isoDurationSec(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? "");
  if (!m) return 0;
  const [, d, h, mi, s] = m.map((x) => Number(x ?? 0));
  return d * 86400 + h * 3600 + mi * 60 + s;
}

export function mapVideo(v: Video, analytics?: { avgSec?: number; subsGained?: number }): PostMetricRow {
  const dur = isoDurationSec(v.contentDetails.duration);
  return {
    post_key: v.id,
    title: firstLine(v.snippet.title, "YouTube video"),
    format: dur > 0 && dur <= SHORT_MAX_SEC ? "short" : "video",
    posted_at: v.snippet.publishedAt,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    duration_sec: dur || undefined,
    views: num(v.statistics.viewCount),
    likes: num(v.statistics.likeCount),
    comments: num(v.statistics.commentCount),
    avg_watch_sec: analytics?.avgSec,
    follows: analytics?.subsGained,
    raw: { statistics: v.statistics },
  };
}

async function oauthToken(ctx: CollectorContext): Promise<string | undefined> {
  const id = ctx.env("YOUTUBE_OAUTH_CLIENT_ID");
  const secret = ctx.env("YOUTUBE_OAUTH_CLIENT_SECRET");
  const refresh = ctx.env("YOUTUBE_OAUTH_REFRESH_TOKEN");
  if (!id || !secret || !refresh) return undefined;
  const body = new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" });
  const res = await getJson<{ access_token: string }>(ctx.fetch, "https://oauth2.googleapis.com/token", { method: "POST", body });
  return res.access_token;
}

async function analyticsByVideo(ctx: CollectorContext, token: string) {
  const end = ctx.now.toISOString().slice(0, 10);
  const q = new URLSearchParams({
    ids: "channel==MINE", startDate: "2026-11-01", endDate: end,
    metrics: "views,averageViewDuration,subscribersGained", dimensions: "video", sort: "-views", maxResults: "200",
  });
  const res = await getJson<{ rows?: [string, number, number, number][] }>(
    ctx.fetch, `https://youtubeanalytics.googleapis.com/v2/reports?${q}`, { headers: { Authorization: `Bearer ${token}` } },
  );
  return new Map((res.rows ?? []).map(([id, , avg, subs]) => [id, { avgSec: num(avg), subsGained: num(subs) }]));
}

async function aiComments(ctx: CollectorContext, key: string, channel: string): Promise<AiCommentRow[]> {
  const q = new URLSearchParams({ part: "snippet", allThreadsRelatedToChannelId: channel, maxResults: "100", key });
  const res = await getJson<{ items?: { id: string; snippet: { videoId?: string; topLevelComment: { snippet: { textOriginal: string; authorDisplayName?: string; publishedAt: string } } } }[] }>(
    ctx.fetch, `${DATA}/commentThreads?${q}`,
  );
  return (res.items ?? [])
    .filter((i) => mentionsAi(i.snippet.topLevelComment.snippet.textOriginal))
    .map((i) => ({
      platform_comment_id: i.id,
      platform_post_id: i.snippet.videoId,
      author_handle: i.snippet.topLevelComment.snippet.authorDisplayName,
      body: i.snippet.topLevelComment.snippet.textOriginal,
      commented_at: i.snippet.topLevelComment.snippet.publishedAt,
    }));
}

export const collectYouTube: Collector = async (ctx) => {
  const key = ctx.env("YOUTUBE_API_KEY");
  if (!key) return emptyResult("youtube", "needs_token", "Set YOUTUBE_API_KEY");
  const channel = ctx.env("YOUTUBE_CHANNEL_ID") ?? DEFAULT_CHANNEL;
  const ch = await getJson<{ items?: { statistics: { subscriberCount?: string }; contentDetails: { relatedPlaylists: { uploads: string } } }[] }>(
    ctx.fetch, `${DATA}/channels?part=statistics,contentDetails&id=${channel}&key=${key}`,
  );
  const item = ch.items?.[0];
  if (!item) return emptyResult("youtube", "error", `Channel ${channel} not found`);
  const pl = await getJson<{ items?: { contentDetails: { videoId: string } }[] }>(
    ctx.fetch, `${DATA}/playlistItems?part=contentDetails&maxResults=${ctx.maxPosts}&playlistId=${item.contentDetails.relatedPlaylists.uploads}&key=${key}`,
  );
  const ids = (pl.items ?? []).map((i) => i.contentDetails.videoId);
  const vids = ids.length
    ? (await getJson<{ items?: Video[] }>(ctx.fetch, `${DATA}/videos?part=snippet,contentDetails,statistics&id=${ids.join(",")}&key=${key}`)).items ?? []
    : [];

  const notes: string[] = [];
  let analytics = new Map<string, { avgSec?: number; subsGained?: number }>();
  try {
    const token = await oauthToken(ctx);
    if (token) analytics = await analyticsByVideo(ctx, token);
    else notes.push("watch time needs YOUTUBE_OAUTH_* secrets");
  } catch (e) {
    notes.push(`analytics: ${(e as Error).message}`);
  }
  let comments: AiCommentRow[] = [];
  try {
    comments = await aiComments(ctx, key, channel);
  } catch (e) {
    notes.push(`comments: ${(e as Error).message}`);
  }
  return {
    channel: "youtube",
    status: notes.some((n) => n.includes(":")) ? "partial" : "ok",
    message: notes.join("; ") || undefined,
    followers: num(item.statistics.subscriberCount),
    posts: vids.map((v) => mapVideo(v, analytics.get(v.id))),
    aiComments: comments,
  };
};
