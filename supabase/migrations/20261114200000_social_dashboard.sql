-- Social dashboard for blakeruwali.com/studio/ (owner-only).
-- Stores Blake's own channel stats. No customer data, payroll or cash figures belong here.
-- Every table has RLS on. Only rows in dashboard_owners can read; ingestion uses the service role.

-- ---------------------------------------------------------------- owner gate
create table public.dashboard_owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.dashboard_owners enable row level security;

create or replace function public.is_dashboard_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.dashboard_owners o where o.user_id = (select auth.uid()));
$$;
revoke all on function public.is_dashboard_owner() from public, anon;
grant execute on function public.is_dashboard_owner() to authenticated, service_role;

create policy owners_read_self on public.dashboard_owners
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- channels
create table public.channels (
  id text primary key check (id in ('facebook','instagram','tiktok','youtube','x','threads','linkedin','pinterest')),
  label text not null,
  handle text not null,
  profile_url text not null,
  platform_account_id text,
  ingest_mode text not null default 'manual' check (ingest_mode in ('api','manual')),
  sort_order int not null default 0,
  goal_followers int check (goal_followers > 0),
  goal_date date,
  notes text
);

insert into public.channels (id, label, handle, profile_url, platform_account_id, ingest_mode, sort_order, goal_followers, goal_date, notes) values
  ('facebook',  'Facebook',  'bikigram',     'https://www.facebook.com/bikigram',             null, 'manual', 1, 100000, '2027-05-31', 'Profile in professional mode. Graph API does not cover profiles; import the Professional dashboard export.'),
  ('instagram', 'Instagram', '@blakeruwali', 'https://www.instagram.com/blakeruwali/',        null, 'api',    2, 100000, '2027-05-31', 'Instagram API with Instagram Login (professional account).'),
  ('tiktok',    'TikTok',    '@blakeruwali', 'https://www.tiktok.com/@blakeruwali',           null, 'api',    3, null, null, 'TikTok Display API; app must pass review.'),
  ('youtube',   'YouTube',   '@blakeruwali', 'https://www.youtube.com/@blakeruwali',          'UCrvL3rvxM1WMRclSeqYNtXg', 'api', 4, null, null, 'Data API v3 (key) + Analytics API (OAuth) for watch time.'),
  ('x',         'X',         '@blakeruwali', 'https://x.com/blakeruwali',                     null, 'api',    5, null, null, 'X API v2; reads need a paid tier.'),
  ('threads',   'Threads',   '@blakeruwali', 'https://www.threads.net/@blakeruwali',          null, 'api',    6, null, null, 'Threads API (threads_basic + threads_manage_insights).'),
  ('linkedin',  'LinkedIn',  'blakeruwali',  'https://www.linkedin.com/in/blakeruwali/',      null, 'manual', 7, null, null, 'Member analytics API needs Community Management approval; import the creator analytics export.'),
  ('pinterest', 'Pinterest', 'blakeruwali',  'https://www.pinterest.com/blakeruwali/',        null, 'api',    8, null, null, 'Pinterest API v5 (user_accounts:read, pins:read).');

-- ---------------------------------------------------------------- follower snapshots
create table public.follower_snapshots (
  id bigint generated always as identity primary key,
  channel_id text not null references public.channels (id),
  captured_at timestamptz not null,
  followers int not null check (followers >= 0),
  source text not null default 'manual' check (source in ('api','manual','csv','seed')),
  unique (channel_id, captured_at)
);
create index follower_snapshots_channel_time on public.follower_snapshots (channel_id, captured_at desc);

-- ---------------------------------------------------------------- posts + metric snapshots
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null references public.channels (id),
  post_key text not null,            -- platform post id, or a content key like day1-v1-reel for manual rows
  content_key text,                  -- groups the same piece across channels (day1-v1-reel)
  title text not null,
  format text not null default 'video' check (format in ('reel','short','video','long_video','carousel','image','text','story','pin','thread')),
  posted_at timestamptz,
  url text,
  duration_sec int check (duration_sec >= 0),
  created_at timestamptz not null default now(),
  unique (channel_id, post_key)
);
create index posts_content_key on public.posts (content_key);

create table public.post_metrics (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts (id) on delete cascade,
  captured_at timestamptz not null,
  views int check (views >= 0),
  reach int check (reach >= 0),          -- unique viewers/accounts reached
  avg_watch_sec numeric(8,2) check (avg_watch_sec >= 0),
  three_sec_views int check (three_sec_views >= 0),
  one_min_views int check (one_min_views >= 0),
  likes int check (likes >= 0),
  comments int check (comments >= 0),
  shares int check (shares >= 0),
  saves int check (saves >= 0),
  follows int check (follows >= 0),
  profile_visits int check (profile_visits >= 0),
  engaged int check (engaged >= 0),
  non_follower_pct numeric(5,2) check (non_follower_pct between 0 and 100),
  source text not null default 'manual' check (source in ('api','manual','csv','seed')),
  raw jsonb,
  unique (post_id, captured_at)
);
create index post_metrics_post_time on public.post_metrics (post_id, captured_at desc);

-- ---------------------------------------------------------------- "Comment AI" queue
-- Written by the auto-DM job (service role) and readable by the owner.
create table public.ai_comments (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null references public.channels (id),
  post_id uuid references public.posts (id) on delete set null,
  platform_post_id text,
  platform_comment_id text not null,
  author_handle text,
  author_platform_id text,
  body text not null,
  matches_ai boolean generated always as (body ~* '(^|[^[:alnum:]])a\.?i\.?([^[:alnum:]]|$)') stored,
  commented_at timestamptz not null,
  guide_status text not null default 'pending' check (guide_status in ('pending','sent','failed','skipped','manual')),
  guide_via text check (guide_via in ('dm','reply','email','manual')),
  guide_sent_at timestamptz,
  guide_error text,
  attempts int not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, platform_comment_id),
  check (guide_status <> 'sent' or guide_sent_at is not null)
);
create index ai_comments_status on public.ai_comments (guide_status, commented_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end; $$;
create trigger ai_comments_touch before update on public.ai_comments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- ingestion log
create table public.ingest_runs (
  id bigint generated always as identity primary key,
  channel_id text references public.channels (id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('ok','partial','needs_token','error','skipped')),
  rows_written int not null default 0,
  message text
);
create index ingest_runs_channel_time on public.ingest_runs (channel_id, started_at desc);

-- ---------------------------------------------------------------- RLS
alter table public.channels enable row level security;
alter table public.follower_snapshots enable row level security;
alter table public.posts enable row level security;
alter table public.post_metrics enable row level security;
alter table public.ai_comments enable row level security;
alter table public.ingest_runs enable row level security;

revoke all on public.channels, public.follower_snapshots, public.posts, public.post_metrics,
  public.ai_comments, public.ingest_runs, public.dashboard_owners from anon;

create policy owner_read on public.channels           for select to authenticated using ((select public.is_dashboard_owner()));
create policy owner_read on public.follower_snapshots for select to authenticated using ((select public.is_dashboard_owner()));
create policy owner_read on public.posts              for select to authenticated using ((select public.is_dashboard_owner()));
create policy owner_read on public.post_metrics       for select to authenticated using ((select public.is_dashboard_owner()));
create policy owner_read on public.ai_comments        for select to authenticated using ((select public.is_dashboard_owner()));
create policy owner_read on public.ingest_runs        for select to authenticated using ((select public.is_dashboard_owner()));

-- Manual / CSV import and hand-marking a guide as sent.
create policy owner_insert on public.follower_snapshots for insert to authenticated with check ((select public.is_dashboard_owner()));
create policy owner_update on public.follower_snapshots for update to authenticated using ((select public.is_dashboard_owner())) with check ((select public.is_dashboard_owner()));
create policy owner_insert on public.posts              for insert to authenticated with check ((select public.is_dashboard_owner()));
create policy owner_update on public.posts              for update to authenticated using ((select public.is_dashboard_owner())) with check ((select public.is_dashboard_owner()));
create policy owner_insert on public.post_metrics       for insert to authenticated with check ((select public.is_dashboard_owner()));
create policy owner_update on public.post_metrics       for update to authenticated using ((select public.is_dashboard_owner())) with check ((select public.is_dashboard_owner()));
create policy owner_update on public.ai_comments        for update to authenticated using ((select public.is_dashboard_owner())) with check ((select public.is_dashboard_owner()));
