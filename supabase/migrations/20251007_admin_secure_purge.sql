-- Migration: Administración y restricción de purga a usuarios administradores
-- Crea tabla admin_users y refuerza función de purga para requerir rol admin.

-- 1. Tabla de administradores
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- Policies: un usuario sólo puede ver si él es admin (o podrías permitir que admins vean la lista completa)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='admin_users' and policyname='sel_admin_self'
  ) then
    create policy sel_admin_self on public.admin_users
      for select using (auth.uid() = user_id);
  end if;
end $$;

-- Política opcional para que un admin pueda ver a todos los admins (descomentar si se desea)
-- create policy sel_admin_all on public.admin_users for select using (
--   exists(select 1 from public.admin_users a where a.user_id = auth.uid())
-- );

-- Insert manual: usar la consola SQL para añadir un administrador:
-- insert into public.admin_users(user_id) values ('<UUID_DEL_USUARIO>');

-- 2. Reemplazar función de purga con verificación de administrador
create or replace function public.purge_old_activity_entries(p_months int default 18)
returns table(deleted integer, cutoff date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff date := (current_date - make_interval(months => p_months));
  is_admin boolean;
begin
  select exists(select 1 from public.admin_users where user_id = auth.uid()) into is_admin;
  if not is_admin then
    raise exception 'NOT_ADMIN' using errcode='insufficient_privilege';
  end if;
  return query with del as (
    delete from activity_entries
    where activity_date < v_cutoff
    returning 1
  )
  select count(*)::int as deleted, v_cutoff as cutoff from del;
end;$$;

comment on function public.purge_old_activity_entries is
'Elimina registros anteriores al cutoff (p_months meses) sólo si el usuario es admin (tabla admin_users).';

-- 3. (Opcional) Programar job pg_cron usando esta función (ver migración previa para ejemplo)
