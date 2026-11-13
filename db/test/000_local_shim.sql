-- Local-testing shim ONLY. Never run this against Supabase.
--
-- Supabase provides auth.uid(), the anon and authenticated roles, and the
-- pgcrypto and pg_cron extensions. A bare Postgres does not, so this file
-- fakes just enough of them to run the migrations and the rule tests.
--
-- auth.uid() here reads a session setting, so a test can say "now I am this
-- guest" with: select set_config('test.uid', '<uuid>', false);

create extension if not exists pgcrypto;

create schema if not exists auth;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end;
$$;
