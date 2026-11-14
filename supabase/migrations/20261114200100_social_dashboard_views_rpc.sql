-- Read models and write RPCs for the social dashboard.

-- ---------------------------------------------------------------- latest metrics per post
create view public.v_post_latest with (security_invoker = true) as
select
  p.id as post_id, p.channel_id, c.label as channel_label, p.post_key, p.content_key, p.title, p.format,
  p.posted_at, p.url, p.duration_sec,
  m.captured_at, m.views, m.reach, m.avg_watch_sec, m.three_sec_views, m.one_min_views,
  m.likes, m.comments, m.shares, m.saves, m.follows, m.profile_visits, m.engaged, m.non_follower_pct, m.source,
  case when m.views > 0 and m.three_sec_views is not null
       then round(m.three_sec_views * 100.0 / m.views, 1) end as hold_3s_pct,
  case when m.views > 0 and m.follows is not null
       then round(m.follows * 1000.0 / m.views, 2) end as follows_per_1k,
  coalesce(m.likes,0) + coalesce(m.comments,0) + coalesce(m.shares,0) + coalesce(m.saves,0) as interactions
from public.posts p
join public.channels c on c.id = p.channel_id
left join lateral (
  select * from public.post_metrics pm where pm.post_id = p.id order by pm.captured_at desc limit 1
) m on true;

-- ---------------------------------------------------------------- daily followers (New York days)
create view public.v_follower_daily with (security_invoker = true) as
with last_per_day as (
  select distinct on (channel_id, (captured_at at time zone 'America/New_York')::date)
    channel_id, (captured_at at time zone 'America/New_York')::date as day, followers, captured_at
  from public.follower_snapshots
  order by channel_id, (captured_at at time zone 'America/New_York')::date, captured_at desc
)
select channel_id, day, followers, captured_at,
  followers - lag(followers) over (partition by channel_id order by day) as net_change
from last_per_day;

-- ---------------------------------------------------------------- per-channel summary
create view public.v_channel_summary with (security_invoker = true) as
with snaps as (
  select channel_id,
    (array_agg(followers order by captured_at desc))[1] as followers_now,
    (array_agg(captured_at order by captured_at desc))[1] as followers_at,
    (array_agg(followers order by captured_at asc))[1] as followers_first,
    count(*) as snapshot_count
  from public.follower_snapshots group by channel_id
), today as (
  select distinct on (channel_id) channel_id, net_change as net_change_latest_day, day as latest_day
  from public.v_follower_daily order by channel_id, day desc
), posts_agg as (
  select channel_id, count(*) as posts_tracked,
    sum(views) as views, sum(reach) as reach, sum(likes) as likes, sum(comments) as comments,
    sum(shares) as shares, sum(saves) as saves, sum(follows) as post_follows,
    sum(three_sec_views) filter (where three_sec_views is not null) as three_sec_views,
    sum(views) filter (where three_sec_views is not null) as views_with_hold,
    round(sum(avg_watch_sec * views) filter (where avg_watch_sec is not null)
          / nullif(sum(views) filter (where avg_watch_sec is not null), 0), 1) as avg_watch_sec
  from public.v_post_latest group by channel_id
), last_run as (
  select distinct on (channel_id) channel_id, status as last_ingest_status, started_at as last_ingest_at, message as last_ingest_message
  from public.ingest_runs where channel_id is not null order by channel_id, started_at desc
)
select c.id as channel_id, c.label, c.handle, c.profile_url, c.ingest_mode, c.sort_order, c.goal_followers, c.goal_date,
  s.followers_now, s.followers_at,
  case when s.snapshot_count > 1 then s.followers_now - s.followers_first end as gained_since_first,
  t.net_change_latest_day, t.latest_day,
  coalesce(pa.posts_tracked, 0) as posts_tracked, pa.views, pa.reach, pa.likes, pa.comments, pa.shares, pa.saves,
  pa.post_follows, pa.avg_watch_sec,
  case when pa.views_with_hold > 0 then round(pa.three_sec_views * 100.0 / pa.views_with_hold, 1) end as hold_3s_pct,
  case when pa.views > 0 and s.snapshot_count > 1
       then round((s.followers_now - s.followers_first) * 1000.0 / pa.views, 2) end as follows_per_1k,
  lr.last_ingest_status, lr.last_ingest_at, lr.last_ingest_message
from public.channels c
left join snaps s on s.channel_id = c.id
left join today t on t.channel_id = c.id
left join posts_agg pa on pa.channel_id = c.id
left join last_run lr on lr.channel_id = c.id;

-- ---------------------------------------------------------------- goal progress
create view public.v_goal_progress with (security_invoker = true) as
with first_snap as (
  select distinct on (channel_id) channel_id, followers as start_followers, captured_at as start_at
  from public.follower_snapshots order by channel_id, captured_at asc
)
select s.channel_id, s.label, s.goal_followers, s.goal_date, f.start_followers, f.start_at, s.followers_now,
  round(s.followers_now * 100.0 / s.goal_followers, 2) as pct_of_goal,
  greatest(s.goal_date - (now() at time zone 'America/New_York')::date, 0) as days_left,
  ceil((s.goal_followers - s.followers_now)::numeric
       / greatest(s.goal_date - (now() at time zone 'America/New_York')::date, 1)) as needed_per_day,
  round((s.followers_now - f.start_followers)
        / greatest(extract(epoch from (now() - f.start_at)) / 86400.0, 1)::numeric, 1) as actual_per_day
from public.v_channel_summary s
join first_snap f on f.channel_id = s.channel_id
where s.goal_followers is not null and s.followers_now is not null;

-- ---------------------------------------------------------------- Comment AI read model
create view public.v_ai_comments with (security_invoker = true) as
select a.id, a.channel_id, c.label as channel_label, a.post_id, p.title as post_title, p.url as post_url,
  a.author_handle, a.body, a.commented_at, a.guide_status, a.guide_via, a.guide_sent_at, a.guide_error,
  a.attempts, a.last_attempt_at, a.updated_at
from public.ai_comments a
join public.channels c on c.id = a.channel_id
left join public.posts p on p.id = a.post_id
where a.matches_ai;

revoke all on public.v_post_latest, public.v_follower_daily, public.v_channel_summary,
  public.v_goal_progress, public.v_ai_comments from anon;
grant select on public.v_post_latest, public.v_follower_daily, public.v_channel_summary,
  public.v_goal_progress, public.v_ai_comments to authenticated;

-- ---------------------------------------------------------------- owner import (manual form + CSV)
-- payload: {"source":"csv","followers":[{channel,captured_at,followers}],
--           "posts":[{channel,post_key,content_key,title,format,posted_at,url,duration_sec,
--                     captured_at,views,reach,avg_watch_sec,three_sec_views,one_min_views,likes,comments,
--                     shares,saves,follows,profile_visits,engaged,non_follower_pct}]}
create or replace function public.import_social_snapshot(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source text := coalesce(payload->>'source', 'manual');
  v_followers int := 0;
  v_metrics int := 0;
  r jsonb;
  v_post_id uuid;
begin
  if not public.is_dashboard_owner() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_source not in ('manual','csv','seed','api') then
    raise exception 'bad source %', v_source using errcode = '22023';
  end if;

  for r in select * from jsonb_array_elements(coalesce(payload->'followers', '[]'::jsonb)) loop
    insert into public.follower_snapshots (channel_id, captured_at, followers, source)
    values (r->>'channel', coalesce((r->>'captured_at')::timestamptz, now()), (r->>'followers')::int, v_source)
    on conflict (channel_id, captured_at) do update set followers = excluded.followers, source = excluded.source;
    v_followers := v_followers + 1;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(payload->'posts', '[]'::jsonb)) loop
    if coalesce(r->>'post_key', '') = '' or coalesce(r->>'title', '') = '' then
      raise exception 'each post needs post_key and title (channel %)', r->>'channel' using errcode = '22023';
    end if;
    insert into public.posts (channel_id, post_key, content_key, title, format, posted_at, url, duration_sec)
    values (r->>'channel', r->>'post_key', nullif(r->>'content_key', ''), r->>'title',
            coalesce(nullif(r->>'format', ''), 'video'), (nullif(r->>'posted_at', ''))::timestamptz,
            nullif(r->>'url', ''), (nullif(r->>'duration_sec', ''))::int)
    on conflict (channel_id, post_key) do update set
      title = excluded.title,
      content_key = coalesce(excluded.content_key, public.posts.content_key),
      format = excluded.format,
      posted_at = coalesce(excluded.posted_at, public.posts.posted_at),
      url = coalesce(excluded.url, public.posts.url),
      duration_sec = coalesce(excluded.duration_sec, public.posts.duration_sec)
    returning id into v_post_id;

    insert into public.post_metrics (post_id, captured_at, views, reach, avg_watch_sec, three_sec_views, one_min_views,
      likes, comments, shares, saves, follows, profile_visits, engaged, non_follower_pct, source, raw)
    values (v_post_id, coalesce((nullif(r->>'captured_at', ''))::timestamptz, now()),
      (nullif(r->>'views',''))::int, (nullif(r->>'reach',''))::int, (nullif(r->>'avg_watch_sec',''))::numeric,
      (nullif(r->>'three_sec_views',''))::int, (nullif(r->>'one_min_views',''))::int,
      (nullif(r->>'likes',''))::int, (nullif(r->>'comments',''))::int, (nullif(r->>'shares',''))::int,
      (nullif(r->>'saves',''))::int, (nullif(r->>'follows',''))::int, (nullif(r->>'profile_visits',''))::int,
      (nullif(r->>'engaged',''))::int, (nullif(r->>'non_follower_pct',''))::numeric, v_source, r)
    on conflict (post_id, captured_at) do update set
      views = excluded.views, reach = excluded.reach, avg_watch_sec = excluded.avg_watch_sec,
      three_sec_views = excluded.three_sec_views, one_min_views = excluded.one_min_views,
      likes = excluded.likes, comments = excluded.comments, shares = excluded.shares, saves = excluded.saves,
      follows = excluded.follows, profile_visits = excluded.profile_visits, engaged = excluded.engaged,
      non_follower_pct = excluded.non_follower_pct, source = excluded.source, raw = excluded.raw;
    v_metrics := v_metrics + 1;
  end loop;

  return jsonb_build_object('followers', v_followers, 'post_metrics', v_metrics);
end;
$$;
revoke all on function public.import_social_snapshot(jsonb) from public, anon;
grant execute on function public.import_social_snapshot(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------- auto-DM writer API (service role only)
-- record_ai_comment: idempotent upsert of one comment. Never resets a guide status that is already set.
create or replace function public.record_ai_comment(
  p_channel text, p_platform_comment_id text, p_body text, p_commented_at timestamptz,
  p_platform_post_id text default null, p_author_handle text default null, p_author_platform_id text default null
)
returns table (id uuid, guide_status text, matches_ai boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  insert into public.ai_comments as a (channel_id, platform_comment_id, body, commented_at, platform_post_id,
    author_handle, author_platform_id, post_id)
  values (p_channel, p_platform_comment_id, p_body, p_commented_at, p_platform_post_id, p_author_handle,
    p_author_platform_id,
    (select p.id from public.posts p where p.channel_id = p_channel and p.post_key = p_platform_post_id))
  on conflict (channel_id, platform_comment_id) do update set
    body = excluded.body,
    author_handle = coalesce(excluded.author_handle, a.author_handle),
    post_id = coalesce(a.post_id, excluded.post_id)
  returning a.id, a.guide_status, a.matches_ai;
end;
$$;

-- set_ai_guide_status: call after each send attempt.
create or replace function public.set_ai_guide_status(
  p_id uuid, p_status text, p_via text default null, p_error text default null
)
returns public.ai_comments
language plpgsql
security definer
set search_path = ''
as $$
declare v public.ai_comments;
begin
  if p_status not in ('pending','sent','failed','skipped','manual') then
    raise exception 'bad status %', p_status using errcode = '22023';
  end if;
  update public.ai_comments a set
    guide_status = p_status,
    guide_via = coalesce(p_via, a.guide_via),
    guide_error = case when p_status = 'failed' then p_error else null end,
    guide_sent_at = case when p_status in ('sent','manual') then coalesce(a.guide_sent_at, now()) else a.guide_sent_at end,
    attempts = a.attempts + case when p_status in ('sent','failed') then 1 else 0 end,
    last_attempt_at = case when p_status in ('sent','failed') then now() else a.last_attempt_at end
  where a.id = p_id
  returning * into v;
  if v.id is null then
    raise exception 'ai comment % not found', p_id using errcode = 'P0002';
  end if;
  return v;
end;
$$;

revoke all on function public.record_ai_comment(text, text, text, timestamptz, text, text, text) from public, anon, authenticated;
revoke all on function public.set_ai_guide_status(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_ai_comment(text, text, text, timestamptz, text, text, text) to service_role;
grant execute on function public.set_ai_guide_status(uuid, text, text, text) to service_role;
