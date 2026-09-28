create table public.saju_daily_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  birth_date date not null,
  birth_time time without time zone not null,
  gender text not null check (gender in ('male', 'female')),
  calendar_type text not null default 'solar' check (calendar_type = 'solar'),
  source_reading_id bigint references public.saju_readings(id) on delete set null,
  chart jsonb not null check (jsonb_typeof(chart) = 'object'),
  profile_token uuid not null default gen_random_uuid(),
  profile_version integer not null default 1 check (profile_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.saju_daily_fortunes (
  user_id uuid not null references auth.users(id) on delete cascade,
  fortune_date date not null,
  profile_token uuid not null,
  profile_version integer not null,
  status text not null check (status in ('limited', 'processing', 'ready', 'failed')),
  gemini_attempted_at timestamptz,
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, fortune_date)
);

create table public.saju_daily_usage (
  fortune_date date primary key,
  attempt_count integer not null default 0 check (attempt_count between 0 and 30),
  updated_at timestamptz not null default now()
);

create index saju_daily_fortunes_date_idx on public.saju_daily_fortunes (fortune_date);

alter table public.saju_daily_profiles enable row level security;
alter table public.saju_daily_fortunes enable row level security;
alter table public.saju_daily_usage enable row level security;

revoke all on public.saju_daily_profiles, public.saju_daily_fortunes, public.saju_daily_usage from anon, authenticated;
grant select on public.saju_daily_profiles, public.saju_daily_fortunes to authenticated;
grant all on public.saju_daily_profiles, public.saju_daily_fortunes, public.saju_daily_usage to service_role;

create policy "Users read their own daily profile"
on public.saju_daily_profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users read their own daily fortune"
on public.saju_daily_fortunes for select to authenticated
using ((select auth.uid()) = user_id);

-- Only the server-side service_role may claim a Gemini attempt. The usage row
-- serializes both Cron and post-registration requests for the same KST date.
create function public.save_saju_daily_profile(
  p_user_id uuid,
  p_birth_date date,
  p_birth_time time without time zone,
  p_gender text,
  p_source_reading_id bigint,
  p_chart jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.saju_daily_profiles%rowtype;
  v_saved public.saju_daily_profiles%rowtype;
begin
  if p_gender not in ('male', 'female') or jsonb_typeof(p_chart) <> 'object' then
    raise exception 'invalid profile';
  end if;
  if p_source_reading_id is not null and not exists (
    select 1 from public.saju_readings
    where id = p_source_reading_id and user_id = p_user_id and chart = p_chart
  ) then
    raise exception 'source reading does not belong to user or chart differs';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 83921));
  select * into v_existing from public.saju_daily_profiles where user_id = p_user_id for update;
  if found and v_existing.birth_date = p_birth_date and v_existing.birth_time = p_birth_time
    and v_existing.gender = p_gender and v_existing.source_reading_id is not distinct from p_source_reading_id then
    return to_jsonb(v_existing);
  end if;

  insert into public.saju_daily_profiles
    (user_id, birth_date, birth_time, gender, source_reading_id, chart, profile_version)
  values
    (p_user_id, p_birth_date, p_birth_time, p_gender, p_source_reading_id, p_chart,
     case when v_existing.user_id is null then 1 else v_existing.profile_version + 1 end)
  on conflict (user_id) do update set
    birth_date = excluded.birth_date, birth_time = excluded.birth_time,
    gender = excluded.gender, source_reading_id = excluded.source_reading_id,
    chart = excluded.chart, profile_version = excluded.profile_version,
    updated_at = now()
  returning * into v_saved;
  return to_jsonb(v_saved);
end;
$$;

revoke all on function public.save_saju_daily_profile(uuid, date, time without time zone, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_saju_daily_profile(uuid, date, time without time zone, text, bigint, jsonb) to service_role;

create function public.claim_saju_daily_fortune(
  p_user_id uuid,
  p_fortune_date date,
  p_profile_token uuid,
  p_profile_version integer
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
  v_profile_version integer;
  v_profile_token uuid;
  v_attempted_at timestamptz;
begin
  if p_fortune_date <> (now() at time zone 'Asia/Seoul')::date then
    return 'invalid_date';
  end if;

  select profile_version, profile_token into v_profile_version, v_profile_token
  from public.saju_daily_profiles where user_id = p_user_id for update;
  if v_profile_version is null or v_profile_version <> p_profile_version or v_profile_token <> p_profile_token then
    return 'no_profile';
  end if;

  insert into public.saju_daily_usage (fortune_date)
  values (p_fortune_date)
  on conflict (fortune_date) do nothing;

  select attempt_count into v_count
  from public.saju_daily_usage
  where fortune_date = p_fortune_date
  for update;

  select gemini_attempted_at into v_attempted_at
  from public.saju_daily_fortunes
  where user_id = p_user_id and fortune_date = p_fortune_date;
  if v_attempted_at is not null then
    return 'already_attempted';
  end if;

  if v_count >= 30 then
    insert into public.saju_daily_fortunes
      (user_id, fortune_date, profile_token, profile_version, status, error_code)
    values (p_user_id, p_fortune_date, p_profile_token, p_profile_version, 'limited', 'daily_limit')
    on conflict (user_id, fortune_date) do update
    set status = 'limited', error_code = 'daily_limit',
        profile_token = excluded.profile_token, profile_version = excluded.profile_version, updated_at = now();
    return 'limited';
  end if;

  insert into public.saju_daily_fortunes
    (user_id, fortune_date, profile_token, profile_version, status, gemini_attempted_at, error_code)
  values (p_user_id, p_fortune_date, p_profile_token, p_profile_version, 'processing', now(), null)
  on conflict (user_id, fortune_date) do update
  set status = 'processing', gemini_attempted_at = now(), error_code = null,
      profile_token = excluded.profile_token, profile_version = excluded.profile_version, updated_at = now();

  update public.saju_daily_usage
  set attempt_count = attempt_count + 1, updated_at = now()
  where fortune_date = p_fortune_date;
  return 'claimed';
end;
$$;

revoke all on function public.claim_saju_daily_fortune(uuid, date, uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_saju_daily_fortune(uuid, date, uuid, integer) to service_role;

create function public.complete_saju_daily_fortune(
  p_user_id uuid,
  p_fortune_date date,
  p_profile_token uuid,
  p_profile_version integer,
  p_result jsonb,
  p_error_code text
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_changed integer;
  v_current integer;
begin
  select profile_version into v_current
  from public.saju_daily_profiles
  where user_id = p_user_id and profile_token = p_profile_token
    and profile_version = p_profile_version
  for update;
  if v_current is null then
    return false;
  end if;

  update public.saju_daily_fortunes f
  set status = case when p_result is null then 'failed' else 'ready' end,
      result = p_result, error_code = p_error_code, updated_at = now()
  where f.user_id = p_user_id and f.fortune_date = p_fortune_date
    and f.profile_token = p_profile_token and f.profile_version = p_profile_version
    and f.status = 'processing';
  get diagnostics v_changed = row_count;
  return v_changed = 1;
end;
$$;

revoke all on function public.complete_saju_daily_fortune(uuid, date, uuid, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.complete_saju_daily_fortune(uuid, date, uuid, integer, jsonb, text) to service_role;

create function public.delete_saju_daily_profile(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 83921));
  delete from public.saju_daily_profiles where user_id = p_user_id;
  update public.saju_daily_fortunes
  set result = null, updated_at = now()
  where user_id = p_user_id and result is not null;
end;
$$;

revoke all on function public.delete_saju_daily_profile(uuid) from public, anon, authenticated;
grant execute on function public.delete_saju_daily_profile(uuid) to service_role;

create function public.cleanup_saju_daily_fortunes(p_today date)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_today <> (now() at time zone 'Asia/Seoul')::date then
    raise exception 'invalid date';
  end if;
  -- Yesterday's prose is no longer used. Keep only attempt metadata for 30 days.
  update public.saju_daily_fortunes
  set result = null, updated_at = now()
  where fortune_date < p_today and result is not null;

  delete from public.saju_daily_fortunes
  where fortune_date < p_today - 30;
  delete from public.saju_daily_usage
  where fortune_date < p_today - 30;
end;
$$;

revoke all on function public.cleanup_saju_daily_fortunes(date) from public, anon, authenticated;
grant execute on function public.cleanup_saju_daily_fortunes(date) to service_role;
