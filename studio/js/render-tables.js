// Top posts, cross-post matrix, Comment AI table, data-source cards.
import { h, int, n, pct, secs, when, ago, replace, safeHref, DASH } from "./util.js";
import { statusChip } from "./render-top.js";

const FORMAT = { reel: "Reel", short: "Short", video: "Video", long_video: "Long video", carousel: "Carousel", image: "Image", text: "Post", story: "Story", pin: "Pin", thread: "Thread" };

function postTitle(p) {
  const title = safeHref(p.url)
    ? h("a", { href: safeHref(p.url), target: "_blank", rel: "noopener noreferrer", class: "t", text: p.title })
    : h("span", { class: "t", text: p.title });
  return h("td", {}, title, h("div", { class: "sub", text: `${FORMAT[p.format] ?? p.format} · ${when(p.posted_at)}` }));
}

export function renderTopPosts(posts, sortKey, channel, table) {
  const rows = posts
    .filter((p) => !channel || p.channel_id === channel)
    .filter((p) => p[sortKey] !== null && p[sortKey] !== undefined)
    .sort((a, b) => Number(b[sortKey]) - Number(a[sortKey]))
    .slice(0, 25);
  const head = ["Post", "Channel", "Views", "Reach", "Avg watch", "3-s hold", "Likes", "Comm.", "Shares", "Saves", "Follows", "Follows / 1K"];
  const keys = [null, null, "views", "reach", "avg_watch_sec", "hold_3s_pct", "likes", "comments", "shares", "saves", "follows", "follows_per_1k"];
  replace(table,
    h("thead", {}, h("tr", {}, head.map((t, i) => h("th", { class: i > 1 ? "r" : "", scope: "col", text: t, "aria-sort": keys[i] === sortKey ? "descending" : null })))),
    h("tbody", {}, rows.length ? rows.map((p) => h("tr", {},
      postTitle(p),
      h("td", { text: p.channel_label }),
      h("td", { class: `r${sortKey === "views" ? " best" : ""}`, text: int(p.views) }),
      h("td", { class: "r", text: int(p.reach) }),
      h("td", { class: "r", text: secs(p.avg_watch_sec) }),
      h("td", { class: `r${sortKey === "hold_3s_pct" ? " best" : ""}`, text: pct(p.hold_3s_pct) }),
      h("td", { class: "r", text: int(p.likes) }),
      h("td", { class: "r", text: int(p.comments) }),
      h("td", { class: "r", text: int(p.shares) }),
      h("td", { class: "r", text: int(p.saves) }),
      h("td", { class: "r", text: int(p.follows) }),
      h("td", { class: `r key${sortKey === "follows_per_1k" ? " best" : ""}`, text: p.follows_per_1k === null ? DASH : n(p.follows_per_1k, 2) }),
    )) : h("tr", {}, h("td", { colspan: head.length, class: "empty", text: "No posts with this number yet." }))),
  );
}

export function renderCrosspost(posts, summary, table) {
  const groups = new Map();
  for (const p of posts) {
    const key = p.content_key ?? `${p.channel_id}:${p.post_key}`;
    if (!groups.has(key)) groups.set(key, { title: p.title, posted_at: p.posted_at, byChannel: {} });
    const g = groups.get(key);
    g.byChannel[p.channel_id] = (g.byChannel[p.channel_id] ?? 0) + Number(p.views ?? 0);
    if (p.posted_at && (!g.posted_at || p.posted_at < g.posted_at)) g.posted_at = p.posted_at;
  }
  const list = [...groups.values()]
    .map((g) => ({ ...g, total: Object.values(g.byChannel).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total).slice(0, 20);
  replace(table,
    h("thead", {}, h("tr", {}, h("th", { scope: "col", text: "Content" }), summary.map((s) => h("th", { class: "r", scope: "col", text: s.label })), h("th", { class: "r", scope: "col", text: "Total" }))),
    h("tbody", {}, list.length ? list.map((g) => {
      const vals = summary.map((s) => g.byChannel[s.channel_id]);
      const best = Math.max(...vals.filter((v) => v !== undefined));
      return h("tr", {},
        h("td", {}, h("span", { class: "t", text: g.title }), h("div", { class: "sub", text: when(g.posted_at) })),
        vals.map((v) => h("td", { class: `r${v === best && v > 0 ? " best" : ""}`, text: v === undefined ? DASH : int(v) })),
        h("td", { class: "r key", text: int(g.total) }));
    }) : h("tr", {}, h("td", { colspan: summary.length + 2, class: "empty", text: "No posts yet." }))),
  );
}

const STATUS = { pending: "waiting", sent: "sent", failed: "failed", skipped: "skipped", manual: "sent by hand" };

export function renderAi(comments, filter, statsEl, table, onMark) {
  const count = (s) => comments.filter((c) => c.guide_status === s).length;
  const sent = count("sent") + count("manual");
  const stat = (k, v, s) => h("div", { class: "kpi" }, h("div", { class: "k", text: k }), h("div", { class: "v num", text: v }), s ? h("div", { class: "s", text: s }) : null);
  replace(statsEl,
    stat("Asked", int(comments.length)),
    stat("Guide sent", int(sent), comments.length ? pct((sent * 100) / comments.length) : null),
    stat("Waiting", int(count("pending"))),
    stat("Failed", int(count("failed"))),
  );
  const rows = comments.filter((c) => !filter || c.guide_status === filter || (filter === "sent" && c.guide_status === "manual"));
  replace(table,
    h("thead", {}, h("tr", {}, ["When", "Channel", "Who", "Comment", "On post", "Guide", ""].map((t) => h("th", { scope: "col", text: t })))),
    h("tbody", {}, rows.length ? rows.map((c) => h("tr", {},
      h("td", { class: "num", text: when(c.commented_at) }),
      h("td", { text: c.channel_label }),
      h("td", { text: c.author_handle ?? DASH }),
      h("td", { class: "quote", text: c.body }),
      h("td", {}, safeHref(c.post_url) ? h("a", { href: safeHref(c.post_url), target: "_blank", rel: "noopener noreferrer", text: c.post_title ?? "post" }) : (c.post_title ?? DASH)),
      h("td", {},
        h("span", { class: `chip ${c.guide_status === "manual" ? "sent" : c.guide_status}`, text: STATUS[c.guide_status] ?? c.guide_status, title: c.guide_error ?? "" }),
        c.guide_sent_at ? h("div", { class: "sub", text: `${c.guide_via ?? ""} ${when(c.guide_sent_at)}`.trim() }) : null,
        c.guide_status === "failed" && c.guide_error ? h("div", { class: "sub", text: c.guide_error }) : null),
      h("td", {}, c.guide_status === "sent" || c.guide_status === "manual"
        ? null
        : h("button", { class: "btn ghost small", type: "button", text: "Mark sent", onclick: (e) => onMark(c.id, e.currentTarget) })),
    )) : h("tr", {}, h("td", { colspan: 7, class: "empty", text: comments.length ? "Nothing with this status." : "No “AI” comments recorded yet. The auto-DM job writes here once it runs." }))),
  );
}

const NEEDS = {
  facebook: "Profile in professional mode: no Graph API access. Export from Professional dashboard → import CSV.",
  instagram: "IG_ACCESS_TOKEN (Instagram API with Instagram Login). Refresh every 60 days.",
  tiktok: "TIKTOK_CLIENT_KEY / _SECRET / _REFRESH_TOKEN. App review for user.info.stats + video.list.",
  youtube: "YOUTUBE_API_KEY for counts. YOUTUBE_OAUTH_* for watch time + subs per video.",
  x: "X_BEARER_TOKEN on a paid tier (Basic). Free tier cannot read posts.",
  threads: "THREADS_ACCESS_TOKEN (threads_basic, threads_manage_insights, threads_read_replies).",
  linkedin: "Member analytics API needs Community Management approval. Export creator analytics → import CSV.",
  pinterest: "PINTEREST_ACCESS_TOKEN (user_accounts:read, pins:read). Expires in 30 days.",
};

export function renderSources(summary, el) {
  replace(el, summary.map((s) => h("div", { class: "src" },
    h("div", { class: "ch-head" }, h("b", { text: s.label }), statusChip(s)),
    h("div", { class: "muted", text: s.last_ingest_at ? `Last pull ${ago(s.last_ingest_at)}` : "Never pulled" }),
    s.last_ingest_message && !["needs_token", "skipped"].includes(s.last_ingest_status) ? h("div", { class: "soft", text: s.last_ingest_message }) : null,
    h("div", { class: "soft", text: NEEDS[s.channel_id] ?? "" }),
  )));
}
