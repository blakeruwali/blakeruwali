-- Long-lived platform tokens that the ingest function renews itself (Instagram, Threads).
-- Kept in a schema the Data API does not expose; only service_role can reach it, through two RPCs.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.platform_tokens (
  env_name     text primary key check (env_name in ('IG_ACCESS_TOKEN', 'THREADS_ACCESS_TOKEN')),
  access_token text not null,
  expires_at   timestamptz,
  refreshed_at timestamptz not null default now(),
  source_hash  text  -- SHA-256 of the secret this token came from; a different secret replaces it
);
-- Safe to re-run if an earlier draft of this file was already applied.
alter table private.platform_tokens add column if not exists source_hash text;
alter table private.platform_tokens enable row level security;
revoke all on private.platform_tokens from public, anon, authenticated;

drop function if exists public.get_platform_tokens();
drop function if exists public.save_platform_token(text, text, timestamptz);

create or replace function public.get_platform_tokens()
returns table (env_name text, access_token text, expires_at timestamptz, refreshed_at timestamptz, source_hash text)
language sql stable security definer set search_path = ''
as $$ select t.env_name, t.access_token, t.expires_at, t.refreshed_at, t.source_hash from private.platform_tokens t $$;

create or replace function public.save_platform_token(p_env_name text, p_access_token text, p_expires_at timestamptz, p_source_hash text)
returns void
language sql security definer set search_path = ''
as $$
  insert into private.platform_tokens (env_name, access_token, expires_at, refreshed_at, source_hash)
  values (p_env_name, p_access_token, p_expires_at, now(), p_source_hash)
  on conflict (env_name) do update
    set access_token = excluded.access_token, expires_at = excluded.expires_at, refreshed_at = now(),
        source_hash = excluded.source_hash;
$$;

revoke all on function public.get_platform_tokens() from public, anon, authenticated;
revoke all on function public.save_platform_token(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.get_platform_tokens() to service_role;
grant execute on function public.save_platform_token(text, text, timestamptz, text) to service_role;
