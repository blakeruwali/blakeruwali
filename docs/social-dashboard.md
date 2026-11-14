# Social HQ — private owner dashboard

`/studio/` on blakeruwali.com. Shows followers, daily net change, per-post views, watch time, 3-second hold,
likes/comments/shares/saves, follows, **follows per 1K views**, the 100K FB + 100K IG goal, and the
“Comment AI” guide queue across Facebook, Instagram, TikTok, YouTube, X, Threads, LinkedIn and Pinterest.

The page itself is static and holds no data. Data lives in a Supabase project behind row-level security;
only the account listed in `dashboard_owners` can read it. The page is `noindex`, not in `sitemap.xml`,
not linked from the site, and sign-ups are off.

Never put customer data, payroll or cash figures in this project.

## How it fits together

| Part | Where |
|---|---|
| Page (HTML/CSS/JS, supabase-js self-hosted) | `studio/` |
| Public config (project URL + anon key) | `studio/config.js` |
| Schema, views, RPCs, RLS | `supabase/migrations/` |
| Platform pulls (Deno edge function) | `supabase/functions/social-ingest/` |
| Database tests (pgTAP) | `supabase/tests/database/` |

Tables: `channels`, `follower_snapshots`, `posts`, `post_metrics` (one row per post per pull), `ai_comments`,
`ingest_runs`, `dashboard_owners`. Read models: `v_channel_summary`, `v_post_latest`, `v_follower_daily`,
`v_goal_progress`, `v_ai_comments`.

Follows per 1K views = followers gained since the first count ÷ views on tracked posts × 1,000 (per channel),
and follows ÷ views × 1,000 per post where the platform reports follows (Instagram feed posts, YouTube subs gained).

## One-time setup (Blake)

Keys go into the Supabase secret store or the SQL editor. Never paste them into chat, a file in this repo, or the page.

1. **Create a Supabase project** (free tier is enough) at supabase.com. Name it `blake-social`.
   - Authentication → Sign In / Providers: turn **Allow new users to sign up** off. Keep Email on.
   - Authentication → URL Configuration: Site URL `https://www.blakeruwali.com/studio/`, and add the same URL to Redirect URLs.
   - Authentication → Users → **Invite user** with your own email.
2. **Apply the schema** from this repo:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   supabase functions deploy social-ingest
   ```
3. **Make yourself the owner** (SQL editor):
   ```sql
   insert into public.dashboard_owners (user_id)
   select id from auth.users where email = '<your email>';
   ```
4. **Fill in `studio/config.js`** production block with the Project URL and the **anon/publishable** key
   (Settings → API). These two are public by design. Never the service-role/secret key.
5. **Load Day 1**: sign in at `/studio/`, then *Add numbers by hand* → choose
   `~/Downloads/blake-content/week1/post-day1/social-dashboard-seed-day1-2026-11-14.csv` → Import CSV.
   (The seed is kept outside this public repo on purpose.)
6. **Set the ingest secret and schedule** (SQL editor; enable the `pg_cron` and `pg_net` extensions first):
   ```bash
   supabase secrets set INGEST_SECRET=$(openssl rand -hex 32)
   ```
   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1/social-ingest', 'social_ingest_url');
   select vault.create_secret('<the same INGEST_SECRET>', 'social_ingest_secret');
   select cron.schedule('social-ingest-every-3h', '0 */3 * * *', $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'social_ingest_url'),
       headers := jsonb_build_object('Content-Type', 'application/json',
         'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'social_ingest_secret')),
       body := '{}'::jsonb, timeout_milliseconds := 60000);
   $$);
   ```
7. **Add platform keys** as they arrive (`supabase secrets set NAME=value`). Each channel works on its own;
   a missing key just shows “needs key” on the dashboard.

## What each platform needs

| Channel | How data comes in | Secrets | Approval |
|---|---|---|---|
| Facebook profile (professional mode) | **CSV import.** The Graph API covers Pages, not profiles. Export from Professional dashboard → Insights. | — | — |
| Instagram @blakeruwali | API: Instagram API with Instagram Login. Followers, views, reach, likes, comments, shares, saves, reel avg watch time, follows + profile visits on feed posts, “AI” comments. | `IG_ACCESS_TOKEN` (long-lived, 60 days) | Meta developer app with you as admin. Own-account reads work in dev mode. Scopes: `instagram_business_basic`, `instagram_business_manage_insights`, `instagram_business_manage_comments`. |
| Threads @blakeruwali | API: followers, views, likes, replies, reposts/quotes/shares, “AI” replies. | `THREADS_ACCESS_TOKEN` (long-lived, 60 days) | Same Meta app, Threads use case. Scopes: `threads_basic`, `threads_manage_insights`, `threads_read_replies`. |
| YouTube UCrvL3rvxM1WMRclSeqYNtXg | Data API v3: subscribers, views, likes, comments, “AI” comments. Analytics API (optional): average view duration and subscribers gained per video. | `YOUTUBE_API_KEY`; optional `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET`, `YOUTUBE_OAUTH_REFRESH_TOKEN` (scope `yt-analytics.readonly`) | Google Cloud project, no review for your own channel. |
| TikTok @blakeruwali | Display API: followers, views, likes, comments, shares. No watch time or follows per video. | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN` | TikTok developer app with Login Kit; scopes `user.info.basic`, `user.info.stats`, `video.list`. Sandbox with your account as a target user may work before review; production needs app review. |
| X @blakeruwali | API v2: followers, impressions, likes, replies, reposts, bookmarks. | `X_BEARER_TOKEN` | **Paid tier (Basic) needed to read posts.** Recommended: skip and use CSV until X matters. |
| LinkedIn /in/blakeruwali | **CSV import.** Member post analytics needs Community Management API approval. Export from your creator analytics. | — | Community Management API (hard to get for a personal profile). |
| Pinterest /blakeruwali | API v5: followers, impressions, saves per pin. | `PINTEREST_ACCESS_TOKEN` (30 days) | Pinterest developer app, trial access is enough. Scopes `user_accounts:read`, `pins:read`. |

Token refresh is manual for now: Instagram and Threads tokens last 60 days, Pinterest 30. When one expires
the channel shows “API error” with the reason. Re-run `supabase secrets set`.

## CSV import format

Header (any subset, `type` and `channel` required):

```
type,channel,captured_at,followers,post_key,content_key,title,format,posted_at,url,duration_sec,views,reach,avg_watch_sec,three_sec_views,one_min_views,likes,comments,shares,saves,follows,profile_visits,engaged,non_follower_pct
```

- `type=followers` rows need `followers`. `type=post` rows need `post_key` and `title`.
- Use the same `content_key` (like `day2-reel`) for the same piece on every channel; the “Same post, every channel” table groups by it.
- Leave unknown numbers blank, not 0. Times default to now; use ISO times with offset (`2026-11-15T17:00:00-05:00`).
- Re-importing the same `channel + post_key + captured_at` updates that snapshot.
- When the API later sees a post on the same channel, format and day as a hand-entered row, it adopts that row
  (picks the hand-entered row with the most views at or below the API count), so it is not counted twice.
  Check the Top posts table after the first API pull.

## Comment “AI” — contract for the auto-DM job

The auto-DM job (separate work) writes with the **service role** key through two RPCs. Both are
callable only by `service_role`.

```http
POST /rest/v1/rpc/record_ai_comment
{ "p_channel": "instagram", "p_platform_comment_id": "1789…", "p_body": "AI",
  "p_commented_at": "2026-11-14T18:02:00Z", "p_platform_post_id": "1801…", "p_author_handle": "someone",
  "p_author_platform_id": "…" }
→ [{ "id": "<uuid>", "guide_status": "pending", "matches_ai": true }]
```

Idempotent on `(channel, platform_comment_id)`; never resets a status that is already set. Skip DMs when
`matches_ai` is false. `social-ingest` also records matching comments it sees on Instagram, Threads and
YouTube, so either side may create the row first.

```http
POST /rest/v1/rpc/set_ai_guide_status
{ "p_id": "<uuid>", "p_status": "sent", "p_via": "dm" }
{ "p_id": "<uuid>", "p_status": "failed", "p_error": "24-hour messaging window closed" }
```

Statuses: `pending`, `sent`, `failed`, `skipped`, `manual` (Blake marked it sent by hand from the dashboard).
`p_via`: `dm`, `reply`, `email`, `manual`. `sent`/`failed` add one to `attempts`.

Note for that job: sending Instagram DMs needs `instagram_business_manage_messages`, and messaging people who
are not app testers needs Advanced Access (Meta App Review).

## Local development

```bash
supabase start -x vector,logflare,imgproxy,studio,postgres-meta   # API on :56321, mail on :56324
supabase test db                                                  # pgTAP: RLS + import + AI match
deno test supabase/functions/social-ingest/collectors_test.ts     # collector mapping tests
python3 -m http.server 8787 --bind 127.0.0.1                      # then open http://127.0.0.1:8787/studio/
```

Locally, create a user with the Auth admin API, add it to `dashboard_owners`, request a magic link on the
page and open it from the local mail viewer on port 56324.
