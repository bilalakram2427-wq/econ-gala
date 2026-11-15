-- Fix: QR codes did not load on Supabase.
--
-- Supabase installs pgcrypto into the "extensions" schema. qr_token() and
-- qr_short_code() pin search_path to "public", so hmac() was not found and
-- get_qr() failed for everyone. A plain local Postgres puts pgcrypto in
-- public, which is why the local tests did not catch it.
--
-- Also: the home screen asks for the QR every 5 seconds, which is exactly the
-- old limit of 12 a minute. Raised to 30 so normal polling, a second tab or
-- a dev double-mount cannot lock a guest out of their own code.

begin;

create or replace function qr_token(p_guest_id uuid, p_window bigint)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  master  text := cfg('secret.qr_master');
  payload text := p_guest_id::text || ':' || p_window::text;
  sig     bytea;
begin
  if master is null then
    raise exception 'UNKNOWN';  -- misconfigured; never show a guest a reason
  end if;
  sig := hmac(payload, master, 'sha256');
  return translate(encode(convert_to(payload, 'utf8'), 'base64'), E'+/=\n', '-_')
      || '.'
      || translate(encode(substring(sig from 1 for 10), 'base64'), E'+/=\n', '-_');
end;
$$;

create or replace function qr_short_code(p_guest_id uuid, p_window bigint)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  master text := cfg('secret.qr_master');
  sig    bytea;
begin
  sig := hmac(p_guest_id::text || ':' || p_window::text, master, 'sha256');
  return lpad(((get_byte(sig,0)::bigint << 24 | get_byte(sig,1)::bigint << 16
              | get_byte(sig,2)::bigint << 8  | get_byte(sig,3)::bigint)
              % 1000000)::text, 6, '0');
end;
$$;

create or replace function get_qr()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  g guests := require_playable_guest();
  w int    := cfg_int('qr_window_seconds');
  idx bigint := floor(extract(epoch from now()) / w);
  window_end timestamptz := to_timestamp((idx + 1) * w);
begin
  perform check_rate_limit(g.id, 'qr', 30);

  return json_build_object(
    'token',           qr_token(g.id, idx),
    'short_code',      qr_short_code(g.id, idx),
    'window_ends_at',  window_end,
    'next_token',      qr_token(g.id, idx + 1),
    'next_starts_at',  window_end
  );
end;
$$;

commit;
