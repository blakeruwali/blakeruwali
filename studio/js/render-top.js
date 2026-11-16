// Goal hero, KPI strip, channel cards, comparison bars.
import { h, svg, int, n, pct, secs, signed, compact, sum, replace, safeHref, DASH } from "./util.js";

export function renderGoal(goals, rowsEl, daysEl) {
  const order = ["facebook", "instagram"];
  const rows = order.map((id) => goals.find((g) => g.channel_id === id)).filter(Boolean);
  daysEl.textContent = rows.length ? int(rows[0].days_left) : DASH;
  if (!rows.length) {
    replace(rowsEl, h("p", { class: "muted", text: "No follower counts yet for Facebook or Instagram." }));
    return;
  }
  replace(rowsEl, rows.map((g) => {
    const share = Math.min(100, Number(g.pct_of_goal));
    const onPace = Number(g.actual_per_day) >= Number(g.needed_per_day);
    const fill = h("span");
    fill.style.width = `${Math.max(share, 0.6)}%`;
    const tick = h("i", { title: "Where you would be today on a straight line from the start" });
    tick.style.left = `${straightLinePct(g)}%`;
    return h("div", { class: "goal-row" },
      h("div", { class: "label", text: g.label }),
      h("div", { class: "meter", role: "meter", "aria-valuemin": 0, "aria-valuemax": g.goal_followers, "aria-valuenow": g.followers_now, "aria-label": `${g.label} followers toward ${int(g.goal_followers)}` }, fill, tick),
      h("div", { class: "figs num" },
        h("b", { text: int(g.followers_now) }), ` / ${compact(g.goal_followers)} · ${pct(g.pct_of_goal)}`, h("br"),
        `need ${int(g.needed_per_day)}/day · doing ${n(g.actual_per_day, 1)}/day `,
        h("span", { class: `pace ${onPace ? "on" : "behind"}`, text: onPace ? "on pace" : "behind" })),
    );
  }));
}

function straightLinePct(g) {
  const start = new Date(g.start_at).getTime();
  const end = new Date(`${g.goal_date}T23:59:59-05:00`).getTime();
  const t = Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
  const expected = Number(g.start_followers) + t * (Number(g.goal_followers) - Number(g.start_followers));
  return Math.min(100, (expected / Number(g.goal_followers)) * 100);
}

export function renderKpis(summary, el) {
  const withBase = summary.filter((s) => s.gained_since_first !== null && s.views);
  const gained = sum(withBase, "gained_since_first");
  const baseViews = sum(withBase, "views");
  const f1k = gained !== null && baseViews ? (gained * 1000) / baseViews : null;
  const netDay = sum(summary.filter((s) => s.net_change_latest_day !== null), "net_change_latest_day");
  const interactions = (sum(summary, "likes") ?? 0) + (sum(summary, "comments") ?? 0) + (sum(summary, "shares") ?? 0) + (sum(summary, "saves") ?? 0);
  const kpi = (label, value, sub, cls = "") =>
    h("div", { class: `kpi ${cls}` }, h("div", { class: "k", text: label }), h("div", { class: "v num", text: value }), h("div", { class: "s", text: sub }));
  replace(el,
    kpi("Follows per 1K views", f1k === null ? DASH : n(f1k, 2), withBase.length ? `${signed(gained)} on ${int(baseViews)} views · ${withBase.map((s) => s.label).join(", ")}` : "Needs two follower counts on a channel", "key"),
    kpi("Followers, all channels", int(sum(summary, "followers_now")), `${summary.filter((s) => s.followers_now !== null).length} of ${summary.length} channels counted`),
    kpi("Net change, latest day", signed(netDay), "Channels with a prior day"),
    kpi("Views tracked", compact(sum(summary, "views")), `${int(sum(summary, "posts_tracked"))} posts`),
    kpi("Interactions", compact(interactions), "Likes + comments + shares + saves"),
  );
}

function sparkline(points) {
  const W = 220, H = 34, P = 4;
  const box = svg("svg", { class: "spark", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true" });
  if (points.length < 2) return null;
  const ys = points.map((p) => Number(p.followers));
  const min = Math.min(...ys), max = Math.max(...ys), span = max - min || 1;
  const xy = points.map((p, i) => [P + (i * (W - 2 * P)) / (points.length - 1), H - P - ((Number(p.followers) - min) * (H - 2 * P)) / span]);
  box.append(svg("path", { d: xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ") }));
  const [lx, ly] = xy[xy.length - 1];
  box.append(svg("circle", { cx: lx, cy: ly, r: 3 }));
  return box;
}

export function renderChannels(summary, daily, el) {
  replace(el, summary.map((s) => {
    const wide = s.channel_id === "facebook" || s.channel_id === "instagram";
    const d = s.net_change_latest_day;
    const dir = d === null ? "flat" : d > 0 ? "up" : d < 0 ? "down" : "flat";
    const pts = daily.filter((r) => r.channel_id === s.channel_id);
    const stat = (k, v, cls) => h("div", {}, h("dt", { text: k }), h("dd", { class: cls, text: v }));
    return h("article", { class: `ch${wide ? " wide" : ""}`, "aria-label": s.label },
      h("div", { class: "ch-head" },
        h("div", {}, h("h3", { text: s.label }), h("a", { href: safeHref(s.profile_url), target: "_blank", rel: "noopener noreferrer", text: s.handle })),
        statusChip(s)),
      h("div", { class: "followers" },
        h("span", { class: "n num", text: int(s.followers_now) }),
        h("span", { class: `delta ${dir}`, text: d === null ? "no prior day" : `${signed(d)} today` })),
      sparkline(pts),
      h("dl", {},
        stat("Views", compact(s.views)),
        stat("Follows / 1K", s.follows_per_1k === null ? DASH : n(s.follows_per_1k, 2), "key"),
        stat("Avg watch", secs(s.avg_watch_sec)),
        stat("3-s hold", pct(s.hold_3s_pct)),
        stat("Likes", int(s.likes)),
        stat("Comments", int(s.comments)),
        ...(wide ? [stat("Shares", int(s.shares)), stat("Saves", int(s.saves)), stat("Posts", int(s.posts_tracked)),
          stat("Reach", compact(s.reach)), stat("Post follows", int(s.post_follows)), stat("Since start", signed(s.gained_since_first))] : []),
      ),
    );
  }));
}

// Pulls run every 3 hours; two missed runs in a row means the schedule or the function is down.
const STALE_AFTER_MS = 7 * 3_600_000;

export function isStale(s, now = Date.now()) {
  if (s.ingest_mode !== "api" || !s.last_ingest_at) return false;
  return now - new Date(s.last_ingest_at).getTime() > STALE_AFTER_MS;
}

export function statusChip(s) {
  if (s.ingest_mode === "manual" && !s.last_ingest_status) return h("span", { class: "chip manual", text: "manual" });
  if (isStale(s)) return h("span", { class: "chip error", text: "stale", title: `No pull for 7+ hours. Check the cron job and the social-ingest function.${s.last_ingest_message ? ` Last message: ${s.last_ingest_message}` : ""}` });
  const st = s.last_ingest_status ?? "needs_token";
  const label = { ok: "API live", partial: "API partial", needs_token: "needs key", error: "API error", skipped: "manual" }[st] ?? st;
  return h("span", { class: `chip ${st}`, text: label, title: s.last_ingest_message ?? "" });
}

export function renderBars(summary, key, el, fmt) {
  const rows = summary.filter((s) => s[key] !== null && s[key] !== undefined);
  if (!rows.length) { replace(el, h("li", { class: "muted", text: "No data yet." })); return; }
  const max = Math.max(...rows.map((r) => Number(r[key])), 0) || 1;
  const sorted = [...summary].sort((a, b) => (Number(b[key] ?? -1)) - (Number(a[key] ?? -1)));
  replace(el, sorted.map((s) => {
    const fill = h("span", { class: "fill" });
    fill.style.width = `${s[key] === null ? 0 : (Number(s[key]) / max) * 100}%`;
    return h("li", { title: `${s.label}: ${fmt(s[key])}` },
      h("span", { text: s.label }), h("span", { class: "track" }, fill), h("span", { class: "val num", text: fmt(s[key]) }));
  }));
}
