alter table public.saju_readings
  add column if not exists alias text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.saju_readings'::regclass
      and conname = 'saju_readings_alias_valid'
  ) then
    alter table public.saju_readings
      add constraint saju_readings_alias_valid
      check (
        alias is null or (
          char_length(alias) between 1 and 30
          and alias = btrim(alias)
          and alias !~ '[[:cntrl:]]'
        )
      );
  end if;
end $$;
