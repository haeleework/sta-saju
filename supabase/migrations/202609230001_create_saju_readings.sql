create table public.saju_readings (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_id uuid not null,
  interpreted_at timestamptz not null,
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  schema_version integer not null default 1 check (schema_version = 1),
  chart jsonb not null check (jsonb_typeof(chart) = 'object'),
  base_reading jsonb not null check (jsonb_typeof(base_reading) = 'object'),
  topic_readings jsonb not null default '{}'::jsonb check (jsonb_typeof(topic_readings) = 'object'),
  constraint saju_readings_user_source_unique unique (user_id, source_id)
);

create index saju_readings_user_saved_at_idx
  on public.saju_readings (user_id, saved_at desc);

create function public.set_saju_readings_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_saju_readings_updated_at
before update on public.saju_readings
for each row execute function public.set_saju_readings_updated_at();

alter table public.saju_readings enable row level security;

revoke all on table public.saju_readings from anon;
revoke all on sequence public.saju_readings_id_seq from anon;
grant select, insert, update, delete on table public.saju_readings to authenticated;
grant usage, select on sequence public.saju_readings_id_seq to authenticated;

create policy "Users can read their own saju readings"
on public.saju_readings
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own saju readings"
on public.saju_readings
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own saju readings"
on public.saju_readings
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own saju readings"
on public.saju_readings
for delete
to authenticated
using ((select auth.uid()) = user_id);
