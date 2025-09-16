-- Migration: add start_time and end_time columns and adjust minutes logic
-- Run this in Supabase SQL editor or via CLI

begin;

alter table public.activity_entries
  add column if not exists start_time time,
  add column if not exists end_time time,
  alter column minutes drop not null;

-- Optional: backfill minutes from start/end if both present and minutes null (future-proof)
create or replace function public.compute_minutes_from_range() returns trigger as $$
declare
  dur integer;
begin
  if (NEW.start_time is not null and NEW.end_time is not null) then
    dur := extract(epoch from (NEW.end_time - NEW.start_time)) / 60;
    if dur < 0 then
      -- assume crossing midnight not allowed; raise exception
      raise exception 'end_time (% ) must be after start_time (%)', NEW.end_time, NEW.start_time;
    end if;
    if NEW.minutes is null then
      NEW.minutes := dur;
    end if;
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

create or replace trigger trg_activity_entries_time_range
  before insert or update on public.activity_entries
  for each row execute function public.compute_minutes_from_range();

commit;
