-- Transit location is administrator-managed and visible through the read-only tracking lookup.
begin;

alter table public.check_records
  add column if not exists current_location text
    check (current_location is null or char_length(btrim(current_location)) between 1 and 200),
  add column if not exists location_updated_at timestamptz;

comment on column public.check_records.current_location is
  'Latest administrator-recorded transit location shown to the tracking-code holder.';
comment on column public.check_records.location_updated_at is
  'Timestamp of the latest administrator-recorded transit location.';

commit;
