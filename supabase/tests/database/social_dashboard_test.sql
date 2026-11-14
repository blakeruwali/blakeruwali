-- Run: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- start clean inside the transaction (rolled back at the end)
truncate public.post_metrics, public.posts, public.follower_snapshots, public.ai_comments, public.ingest_runs, public.dashboard_owners cascade;

-- two users: one owner, one stranger
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'stranger@test.local', 'authenticated', 'authenticated');
insert into public.dashboard_owners (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.follower_snapshots (channel_id, captured_at, followers, source) values
  ('instagram', '2026-11-14 17:00Z', 390, 'seed'), ('instagram', '2026-11-14 22:00Z', 392, 'seed');

-- anon sees nothing
set local role anon;
select throws_ok($$ select * from public.channels $$, '42501', null, 'anon cannot read channels');
select throws_ok($$ select * from public.v_channel_summary $$, '42501', null, 'anon cannot read summary');
reset role;

-- stranger: signed in, not owner
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select is((select count(*) from public.channels), 0::bigint, 'stranger reads 0 channels');
select is((select count(*) from public.follower_snapshots), 0::bigint, 'stranger reads 0 snapshots');
select throws_ok($$ select public.import_social_snapshot('{"followers":[{"channel":"x","followers":"1"}]}') $$, '42501', 'not allowed', 'stranger cannot import');
select throws_ok($$ select * from public.record_ai_comment('instagram','c1','AI',now()) $$, '42501', null, 'stranger cannot write AI comments');

-- owner
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select is((select count(*) from public.channels), 8::bigint, 'owner reads 8 channels');
select is((select follows_per_1k from public.v_channel_summary where channel_id = 'instagram'), null, 'no views yet means no follows per 1K');
select is(public.import_social_snapshot('{"source":"manual","posts":[{"channel":"instagram","post_key":"p1","title":"Reel","format":"reel","captured_at":"2026-11-14T22:00:00Z","views":"1000","follows":"3"}]}'),
  '{"followers": 0, "post_metrics": 1}'::jsonb, 'owner can import');
select is((select follows_per_1k from public.v_channel_summary where channel_id = 'instagram'), 2.00, 'channel follows per 1K = 2 gained / 1000 views');
select throws_ok($$ select * from public.record_ai_comment('instagram','c1','AI',now()) $$, '42501', null, 'owner cannot call writer RPC either');
reset role;

-- AI match rule
insert into public.ai_comments (channel_id, platform_comment_id, body, commented_at) values
  ('instagram', 'm1', 'AI', now()), ('instagram', 'm2', 'said thanks', now()), ('instagram', 'm3', 'Send the a.i. guide', now());
select is((select array_agg(platform_comment_id order by platform_comment_id) from public.ai_comments where matches_ai), array['m1','m3'], 'matches_ai finds AI as a word only');

select * from finish();
rollback;
