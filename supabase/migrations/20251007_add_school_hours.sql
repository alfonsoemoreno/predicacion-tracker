-- Migration: Tabla para registrar horas de Escuelas (no afectan informes mensuales)
-- Características:
--  * Se suman a la meta anual de 600h (junto con ministerio) pero NO a monthly_reports.
--  * Sólo horas enteras.

create table if not exists public.school_hours (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_date date not null,
  hours int not null check (hours > 0 and hours <= 24),
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_school_hours_user_date on public.school_hours(user_id, school_date);

alter table public.school_hours enable row level security;

-- Policies
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='school_hours' and policyname='sel_school_hours_own'
  ) then
    create policy sel_school_hours_own on public.school_hours for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='school_hours' and policyname='ins_school_hours_own'
  ) then
    create policy ins_school_hours_own on public.school_hours for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='school_hours' and policyname='upd_school_hours_own'
  ) then
    create policy upd_school_hours_own on public.school_hours for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='school_hours' and policyname='del_school_hours_own'
  ) then
    create policy del_school_hours_own on public.school_hours for delete using (auth.uid() = user_id);
  end if;
end $$;

-- Trigger para updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;$$ language plpgsql;

drop trigger if exists trg_school_hours_updated_at on public.school_hours;
create trigger trg_school_hours_updated_at
before update on public.school_hours
for each row execute function public.set_updated_at();

comment on table public.school_hours is 'Horas de Escuelas (suman a meta anual, no a informes mensuales)';