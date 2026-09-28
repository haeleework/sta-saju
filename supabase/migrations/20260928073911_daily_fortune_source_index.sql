create index if not exists saju_daily_profiles_source_reading_id_idx
  on public.saju_daily_profiles (source_reading_id)
  where source_reading_id is not null;
