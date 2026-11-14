// All reads go through views with security_invoker, so row-level security decides what comes back.

async function q(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data ?? [];
}

export async function loadAll(sb) {
  const since = new Date(Date.now() - 45 * 86400_000).toISOString().slice(0, 10);
  const [summary, goals, posts, daily, comments] = await Promise.all([
    q(sb.from("v_channel_summary").select("*").order("sort_order"), "channels"),
    q(sb.from("v_goal_progress").select("*"), "goal"),
    q(sb.from("v_post_latest").select("*").order("views", { ascending: false, nullsFirst: false }).limit(500), "posts"),
    q(sb.from("v_follower_daily").select("channel_id,day,followers,net_change").gte("day", since).order("day"), "followers"),
    q(sb.from("v_ai_comments").select("*").order("commented_at", { ascending: false }).limit(300), "ai comments"),
  ]);
  return { summary, goals, posts, daily, comments };
}

export async function isOwner(sb) {
  const { data, error } = await sb.rpc("is_dashboard_owner");
  if (error) throw new Error(error.message);
  return data === true;
}

export async function importPayload(sb, payload) {
  const { data, error } = await sb.rpc("import_social_snapshot", { payload });
  if (error) throw new Error(error.message);
  return data;
}

export async function markGuide(sb, id, status) {
  const patch = { guide_status: status, guide_via: status === "manual" ? "manual" : null };
  if (status === "manual") patch.guide_sent_at = new Date().toISOString();
  const { error } = await sb.from("ai_comments").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}
