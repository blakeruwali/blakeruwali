// CSV → import payload for public.import_social_snapshot.

export const COLUMNS = [
  "type", "channel", "captured_at", "followers", "post_key", "content_key", "title", "format", "posted_at", "url",
  "duration_sec", "views", "reach", "avg_watch_sec", "three_sec_views", "one_min_views", "likes", "comments",
  "shares", "saves", "follows", "profile_visits", "engaged", "non_follower_pct",
];
const CHANNELS = new Set(["facebook", "instagram", "tiktok", "youtube", "x", "threads", "linkedin", "pinterest"]);
const NUMERIC = new Set(COLUMNS.slice(10).concat(["followers"]));

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

function toIso(value, line) {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Line ${line}: "${value}" is not a date`);
  return d.toISOString();
}

export function csvToPayload(text) {
  const rows = parseCsv(text.trim());
  if (rows.length < 2) throw new Error("Need a header row and at least one data row.");
  const header = rows[0].map((x) => x.trim().toLowerCase());
  const missing = ["type", "channel"].filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`Missing column: ${missing.join(", ")}`);
  const unknown = header.filter((c) => c && !COLUMNS.includes(c));
  if (unknown.length) throw new Error(`Unknown column: ${unknown.join(", ")}`);

  const followers = [], posts = [];
  rows.slice(1).forEach((cells, idx) => {
    const line = idx + 2;
    const rec = {};
    header.forEach((col, i) => { rec[col] = (cells[i] ?? "").trim(); });
    if (!CHANNELS.has(rec.channel)) throw new Error(`Line ${line}: unknown channel "${rec.channel}"`);
    for (const col of NUMERIC) {
      if (rec[col] !== undefined && rec[col] !== "") {
        const v = Number(rec[col].replace(/[, ]/g, ""));
        if (!Number.isFinite(v) || v < 0) throw new Error(`Line ${line}: ${col} must be a number ≥ 0`);
        rec[col] = String(v);
      }
    }
    rec.captured_at = toIso(rec.captured_at, line) ?? new Date().toISOString();
    if (rec.posted_at) rec.posted_at = toIso(rec.posted_at, line);
    if (rec.type === "followers") {
      if (rec.followers === undefined || rec.followers === "") throw new Error(`Line ${line}: followers is empty`);
      followers.push({ channel: rec.channel, captured_at: rec.captured_at, followers: rec.followers });
    } else if (rec.type === "post") {
      if (!rec.post_key || !rec.title) throw new Error(`Line ${line}: post rows need post_key and title`);
      const { type: _t, followers: _f, ...post } = rec;
      posts.push(post);
    } else {
      throw new Error(`Line ${line}: type must be "followers" or "post"`);
    }
  });
  return { source: "csv", followers, posts };
}

export function templateCsv() {
  const example = [
    ["followers", "instagram", "2026-11-15T17:00:00-05:00", "410"],
    ["post", "facebook", "2026-11-15T17:00:00-05:00", "", "day2-reel", "day2-reel", "Day 2 reel", "reel", "2026-11-15T12:30:00-05:00", "", "30", "1800", "", "11", "700"],
  ];
  return [COLUMNS.join(","), ...example.map((r) => r.join(","))].join("\n") + "\n";
}
