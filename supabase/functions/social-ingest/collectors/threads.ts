// Threads API (graph.threads.net). Scopes: threads_basic, threads_manage_insights, threads_read_replies.
import { getJson, firstLine, mentionsAi, num } from "../http.ts";
import type { Collector, PostMetricRow } from "../types.ts";
import { emptyResult } from "../types.ts";

const BASE = "https://graph.threads.net/v1.0";

interface ThreadsPost { id: string; text?: string; media_type?: string; permalink?: string; timestamp?: string }
interface Insight { name: string; values?: { value: number }[]; total_value?: { value: number } }
interface Reply { id: string; text?: string; username?: string; timestamp: string }

const pick = (list: Insight[], name: string) => {
  const i = list.find((x) => x.name === name);
  return num(i?.total_value?.value ?? i?.values?.[0]?.value);
};

export function mapThreadsPost(p: ThreadsPost, insights: Insight[]): PostMetricRow {
  const reposts = pick(insights, "reposts") ?? 0;
  const quotes = pick(insights, "quotes") ?? 0;
  const shares = pick(insights, "shares") ?? 0;
  return {
    post_key: p.id,
    title: firstLine(p.text, "Threads post"),
    format: p.media_type === "VIDEO" ? "video" : p.media_type === "CAROUSEL_ALBUM" ? "carousel" : "thread",
    posted_at: p.timestamp,
    url: p.permalink,
    views: pick(insights, "views"),
    likes: pick(insights, "likes"),
    comments: pick(insights, "replies"),
    shares: reposts + quotes + shares,
    raw: { insights },
  };
}

export const collectThreads: Collector = async (ctx) => {
  const token = ctx.env("THREADS_ACCESS_TOKEN");
  if (!token) return emptyResult("threads", "needs_token", "Set THREADS_ACCESS_TOKEN");
  const t = encodeURIComponent(token);
  const acct = await getJson<{ data: Insight[] }>(ctx.fetch, `${BASE}/me/threads_insights?metric=followers_count&access_token=${t}`);
  const posts = await getJson<{ data: ThreadsPost[] }>(
    ctx.fetch, `${BASE}/me/threads?fields=id,text,media_type,permalink,timestamp&limit=${ctx.maxPosts}&access_token=${t}`,
  );
  const result = { ...emptyResult("threads", "ok"), followers: pick(acct.data ?? [], "followers_count") };
  const problems: string[] = [];
  for (const p of posts.data ?? []) {
    try {
      const ins = await getJson<{ data: Insight[] }>(
        ctx.fetch, `${BASE}/${p.id}/insights?metric=views,likes,replies,reposts,quotes,shares&access_token=${t}`,
      );
      result.posts.push(mapThreadsPost(p, ins.data ?? []));
      const replies = await getJson<{ data: Reply[] }>(
        ctx.fetch, `${BASE}/${p.id}/replies?fields=id,text,username,timestamp&access_token=${t}`,
      );
      for (const r of replies.data ?? []) {
        if (mentionsAi(r.text)) {
          result.aiComments.push({ platform_comment_id: r.id, platform_post_id: p.id, author_handle: r.username, body: r.text ?? "", commented_at: r.timestamp });
        }
      }
    } catch (e) {
      problems.push(`${p.id}: ${(e as Error).message}`);
    }
  }
  return problems.length ? { ...result, status: "partial", message: problems.slice(0, 3).join("; ") } : result;
};
