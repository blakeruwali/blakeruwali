import { assertEquals } from "jsr:@std/assert@1.0.8";
import { mentionsAi, firstLine } from "./http.ts";
import { igFormat, igMetricNames, mapIgInsights } from "./collectors/instagram.ts";
import { isoDurationSec, mapVideo } from "./collectors/youtube.ts";
import { mapThreadsPost } from "./collectors/threads.ts";
import { mapTikTok } from "./collectors/tiktok.ts";
import { mapTweet } from "./collectors/x.ts";
import { mapPin } from "./collectors/pinterest.ts";
import { COLLECTORS } from "./collectors/index.ts";

Deno.test("mentionsAi matches AI as a word, not inside other words", () => {
  for (const t of ["AI", "ai please", "Send the A.I. guide", "AI!", "guide (ai)", "🔥AI"]) assertEquals(mentionsAi(t), true, t);
  for (const t of ["said", "mail", "great video", "", "Thai food", "aim"]) assertEquals(mentionsAi(t), false, t);
});

Deno.test("firstLine trims and falls back", () => {
  assertEquals(firstLine("\n  Hello world \nmore", "x"), "Hello world");
  assertEquals(firstLine(undefined, "fallback"), "fallback");
});

Deno.test("instagram maps reels insights and converts watch time from ms", () => {
  const m = { id: "1", caption: "Day 1 reel\n#ai", media_type: "VIDEO", media_product_type: "REELS", permalink: "p", timestamp: "2026-11-14T17:30:00Z" };
  assertEquals(igFormat(m), "reel");
  assertEquals(igMetricNames("reel").includes("ig_reels_avg_watch_time"), true);
  const row = mapIgInsights(m, [
    { name: "views", values: [{ value: 221 }] },
    { name: "reach", values: [{ value: 146 }] },
    { name: "saved", values: [{ value: 1 }] },
    { name: "ig_reels_avg_watch_time", values: [{ value: 6450 }] },
  ]);
  assertEquals([row.title, row.views, row.reach, row.saves, row.avg_watch_sec], ["Day 1 reel", 221, 146, 1, 6.45]);
});

Deno.test("instagram carousel requests follows", () => {
  assertEquals(igFormat({ id: "2", media_type: "CAROUSEL_ALBUM" }), "carousel");
  assertEquals(igMetricNames("carousel").includes("follows"), true);
});

Deno.test("youtube duration parsing and short detection", () => {
  assertEquals(isoDurationSec("PT2M10S"), 130);
  assertEquals(isoDurationSec("PT37S"), 37);
  assertEquals(isoDurationSec("P1DT1H"), 90000);
  const v = mapVideo(
    { id: "abc", snippet: { title: "Short", publishedAt: "2026-11-14T17:00:00Z" }, contentDetails: { duration: "PT37S" }, statistics: { viewCount: "18", likeCount: "2" } },
    { avgSec: 14, subsGained: 1 },
  );
  assertEquals([v.format, v.views, v.likes, v.avg_watch_sec, v.follows], ["short", 18, 2, 14, 1]);
});

Deno.test("threads sums reposts, quotes and shares", () => {
  const r = mapThreadsPost({ id: "t", text: "hi" }, [
    { name: "views", values: [{ value: 90 }] }, { name: "reposts", values: [{ value: 2 }] }, { name: "quotes", values: [{ value: 1 }] },
  ]);
  assertEquals([r.views, r.shares, r.format], [90, 3, "thread"]);
});

Deno.test("tiktok, x and pinterest mappers", () => {
  const t = mapTikTok({ id: "v", title: "Story", create_time: 1763141400, view_count: 122, like_count: 4, comment_count: 1 });
  assertEquals([t.views, t.likes, t.comments, t.posted_at?.slice(0, 10)], [122, 4, 1, "2025-11-14"]);
  const x = mapTweet({ id: "9", text: "post", public_metrics: { impression_count: 18, retweet_count: 1, quote_count: 1 } }, "blakeruwali");
  assertEquals([x.views, x.shares, x.url], [18, 2, "https://x.com/blakeruwali/status/9"]);
  const p = mapPin({ id: "5", title: "Pin" }, { all: { lifetime_metrics: { IMPRESSION: 40, SAVE: 3 } } });
  assertEquals([p.views, p.saves], [40, 3]);
});

Deno.test("collectors without tokens report needs_token instead of throwing", async () => {
  const ctx = { env: () => undefined, fetch: () => { throw new Error("no network in tests"); }, now: new Date(), maxPosts: 5 };
  for (const [ch, fn] of Object.entries(COLLECTORS)) {
    const r = await fn(ctx as never);
    const expected = ch === "facebook" || ch === "linkedin" ? "skipped" : "needs_token";
    assertEquals(r.status, expected, ch);
  }
});

Deno.test("manual Day 1 rows are matched to the API post with the closest lower view count", async () => {
  const { pickManualMatch } = await import("./store.ts");
  const reel = { id: "reel", views: 221 }, longform = { id: "long", views: 166 };
  assertEquals(pickManualMatch([reel], undefined), "reel");
  assertEquals(pickManualMatch([reel, longform], 260), "reel");
  assertEquals(pickManualMatch([reel, longform], 190), "long");
  assertEquals(pickManualMatch([reel, longform], 100), undefined);
  assertEquals(pickManualMatch([{ id: "a", views: 5 }, { id: "b", views: 5 }], 9), undefined);
});

Deno.test("redact strips tokens from error text", async () => {
  const { redact } = await import("./http.ts");
  assertEquals(redact("GET https://g.com/me?fields=a&access_token=EAAB123 failed"), "GET https://g.com/me?fields=a&access_token=[redacted] failed");
  assertEquals(redact("x?key=AIzaXYZ&id=1"), "x?key=[redacted]&id=1");
  assertEquals(redact("Authorization: Bearer abc.def-123"), "Authorization: Bearer [redacted]");
});

Deno.test("network errors from fetch are redacted", async () => {
  const { getJson } = await import("./http.ts");
  const boom = () => Promise.reject(new Error("error sending request for url (https://graph.instagram.com/me?access_token=SECRET123)"));
  let msg = "";
  try { await getJson(boom as never, "https://graph.instagram.com/me?access_token=SECRET123"); } catch (e) { msg = (e as Error).message; }
  assertEquals(msg.includes("SECRET123"), false);
});

Deno.test("instagram picks the Graph host by token kind", async () => {
  const { igApi } = await import("./collectors/instagram.ts");
  assertEquals(igApi(undefined), { base: "https://graph.instagram.com/v23.0", account: "me" });
  assertEquals(igApi("1784"), { base: "https://graph.facebook.com/v23.0", account: "1784" });
});
