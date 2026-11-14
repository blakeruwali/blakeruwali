// Social HQ bootstrap: sign-in gate, owner check, render, refresh, imports.
import { loadAll, isOwner, importPayload, markGuide } from "./data.js";
import { renderGoal, renderKpis, renderChannels, renderBars } from "./render-top.js";
import { renderTopPosts, renderCrosspost, renderAi, renderSources } from "./render-tables.js";
import { csvToPayload, templateCsv } from "./csv.js";
import { h, int, n, when } from "./util.js";

const $ = (id) => document.getElementById(id);
const state = { data: null, sort: "views", channel: "", aiFilter: "" };
let sb;

function showGate(text, isError = false) {
  $("app").hidden = true;
  $("gate").hidden = false;
  if (text) { $("gate-msg").textContent = text; $("gate-msg").className = `msg ${isError ? "err" : "ok"}`; }
}

function draw() {
  const d = state.data;
  renderGoal(d.goals, $("goal-rows"), $("days-left"));
  renderKpis(d.summary, $("kpis"));
  renderChannels(d.summary, d.daily, $("channels"));
  renderBars(d.summary, "views", $("bars-views"), int);
  renderBars(d.summary, "follows_per_1k", $("bars-f1k"), (v) => n(v, 2));
  renderTopPosts(d.posts, state.sort, state.channel, $("top-posts"));
  renderCrosspost(d.posts, d.summary, $("crosspost"));
  renderAi(d.comments, state.aiFilter, $("ai-stats"), $("ai-table"), onMark);
  renderSources(d.summary, $("sources"));
  const latest = d.summary.map((s) => s.followers_at).filter(Boolean).sort().pop();
  $("stamp").textContent = latest ? `Latest count ${when(latest)} ET` : "No counts yet";
  $("top-note").textContent = `${d.posts.length} posts tracked`;
}

async function refresh() {
  const btn = $("refresh");
  btn.disabled = true;
  try {
    state.data = await loadAll(sb);
    draw();
  } catch (e) {
    $("stamp").textContent = `Could not load: ${e.message}`;
  } finally {
    btn.disabled = false;
  }
}

async function onMark(id, btn) {
  btn.disabled = true;
  try { await markGuide(sb, id, "manual"); await refresh(); }
  catch (e) { btn.disabled = false; btn.textContent = "Failed"; btn.title = e.message; }
}

function setPressed(group, attr, value) {
  for (const b of group.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset[attr] === value));
}

function wireControls() {
  $("refresh").addEventListener("click", refresh);
  $("signout").addEventListener("click", async () => { await sb.auth.signOut(); entered = false; showGate("Signed out."); });
  $("sort-seg").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.sort = b.dataset.sort; setPressed($("sort-seg"), "sort", state.sort); draw();
  });
  $("ai-seg").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.aiFilter = b.dataset.status; setPressed($("ai-seg"), "status", state.aiFilter); draw();
  });
  $("ch-filter").addEventListener("change", (e) => { state.channel = e.target.value; draw(); });
  $("csv-file").addEventListener("change", async (e) => {
    const f = e.target.files?.[0]; if (f) $("csv").value = await f.text();
  });
  $("csv-template").addEventListener("click", () => {
    const a = h("a", { href: URL.createObjectURL(new Blob([templateCsv()], { type: "text/csv" })), download: "social-import-template.csv" });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("csv-import").addEventListener("click", () => runImport(() => csvToPayload($("csv").value), $("csv-msg"), () => { $("csv").value = ""; }));
  $("quick-followers").addEventListener("submit", (e) => {
    e.preventDefault();
    runImport(() => ({
      source: "manual",
      followers: [{
        channel: $("qf-channel").value,
        followers: String(Math.round(Number($("qf-count").value))),
        captured_at: $("qf-time").value ? new Date($("qf-time").value).toISOString() : new Date().toISOString(),
      }],
    }), $("qf-msg"), () => { $("qf-count").value = ""; });
  });
}

async function runImport(build, msgEl, onDone) {
  msgEl.className = "msg";
  try {
    const res = await importPayload(sb, build());
    msgEl.textContent = `Saved ${res.followers} follower counts and ${res.post_metrics} post snapshots.`;
    msgEl.className = "msg ok";
    onDone();
    await refresh();
  } catch (e) {
    msgEl.textContent = e.message;
    msgEl.className = "msg err";
  }
}

function fillChannelPickers(summary) {
  for (const s of summary) {
    $("ch-filter").append(h("option", { value: s.channel_id, text: s.label }));
    $("qf-channel").append(h("option", { value: s.channel_id, text: s.label }));
  }
}

let entered = false;
async function enter() {
  if (entered) return;
  entered = true;
  try {
    if (!(await isOwner(sb))) {
      entered = false;
      await sb.auth.signOut();
      showGate("This account is not the owner.", true);
      return;
    }
  } catch (e) {
    entered = false;
    showGate(`Could not check access: ${e.message}`, true);
    return;
  }
  $("gate").hidden = true;
  $("app").hidden = false;
  await refresh();
  if (state.data && !$("qf-channel").options.length) fillChannelPickers(state.data.summary);
}

function wireSignIn() {
  $("signin").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.submitter; btn.disabled = true;
    const { error } = await sb.auth.signInWithOtp({
      email: $("email").value.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${location.origin}${location.pathname}` },
    });
    btn.disabled = false;
    // Same message either way, so the form does not reveal which emails exist.
    showGate(error && error.status >= 500 ? `Sign-in is unavailable: ${error.message}` : "If that is the owner email, a sign-in link is on its way.", !!(error && error.status >= 500));
  });
}

async function main() {
  // GitHub Pages cannot send frame-ancestors, so refuse to run inside a frame.
  if (window.top !== window.self) { document.body.replaceChildren(); return; }
  const cfg = window.STUDIO_CONFIG ?? {};
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) {
    $("gate-text").textContent = "Not set up yet: add the Supabase URL and anon key to studio/config.js.";
    $("signin").querySelector("button").disabled = true;
    showGate();
    return;
  }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  wireSignIn();
  wireControls();
  const { data } = await sb.auth.getSession();
  if (data.session) await enter(); else showGate();
  sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_IN" && $("app").hidden) enter(); });
}

main();
