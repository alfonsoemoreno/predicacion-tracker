-- Migration: Purga automática de registros antiguos de activity_entries
-- Objetivo: mantener sólo los últimos 18 meses de datos detallados en activity_entries
-- Los informes mensuales (monthly_reports) permanecen como histórico permanente.
-- IMPORTANTE: Una vez eliminados los registros antiguos no será posible recalcular
-- informes de meses cuya data base fue purgada. Evita desbloquear meses cuyo
-- period_end sea anterior al cutoff de purga.

-- 1. Función para purgar registros anteriores a N meses (default 18)
create or replace function public.purge_old_activity_entries(p_months int default 18)
returns table(deleted integer, cutoff date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff date := (current_date - make_interval(months => p_months));
begin
  -- Borrar registros más antiguos que la fecha de corte
  return query with del as (
    delete from activity_entries
    where activity_date < v_cutoff
    returning 1
  )
  select count(*)::int as deleted, v_cutoff as cutoff from del;
end;$$;

comment on function public.purge_old_activity_entries is
'Elimina registros en activity_entries anteriores a (current_date - p_months meses). Devuelve cantidad eliminada y cutoff usado.';

-- 2. (Opcional) Evitar desbloquear informes demasiado antiguos (protección)
--    Ajustar la función de control si existe enforce_update_comments_unlock_recalc
--    para impedir locked=false cuando el mes terminó antes del cutoff de 18 meses.
do $$
begin
  if exists (
    select 1 from pg_proc where proname = 'enforce_update_comments_unlock_recalc'
  ) then
    create or replace function public.enforce_update_comments_unlock_recalc()
    returns trigger as $$
    declare
      allowed boolean;
      cutoff date := (current_date - make_interval(months => 18));
    begin
      -- Campos inmutables
      if OLD.user_id <> NEW.user_id or OLD.period_year <> NEW.period_year
         or OLD.month_index <> NEW.month_index
         or OLD.period_start <> NEW.period_start
         or OLD.period_end <> NEW.period_end then
        raise exception 'STRUCT_FIELDS_IMMUTABLE';
      end if;

      -- Si intenta desbloquear un informe cuyo fin es anterior al cutoff -> bloquear
      if OLD.locked = true and NEW.locked = false and OLD.period_end < cutoff then
        raise exception 'REPORT_TOO_OLD_TO_UNLOCK' using errcode='check_violation';
      end if;

      if OLD.locked = true then
        -- Sólo permitir cambiar locked (true->false) y/o comments mientras cerrado
        allowed := (
          NEW.locked in (true,false) and
          OLD.total_minutes = NEW.total_minutes and
          OLD.carried_in_minutes = NEW.carried_in_minutes and
          OLD.carried_out_minutes = NEW.carried_out_minutes and
          OLD.whole_hours = NEW.whole_hours and
          OLD.leftover_minutes = NEW.leftover_minutes and
          OLD.effective_minutes = NEW.effective_minutes and
          OLD.distinct_studies = NEW.distinct_studies and
          coalesce(OLD.sacred_service_minutes,-1) = coalesce(NEW.sacred_service_minutes,-1)
        );
        if not allowed then
          raise exception 'SOLO_COMMENTS_O_UNLOCK' using errcode='check_violation';
        end if;
        return NEW;
      else
        -- Informe abierto: permitir recálculo de métricas y relock
        return NEW;
      end if;
    end;$$ language plpgsql security definer;
  end if;
end $$;

-- 3. (Opcional) Programar ejecución diaria con pg_cron (si la extensión está habilitada)
--    NOTA: En Supabase, habilita primero la extensión desde la consola si no lo está.
--    Descomenta las siguientes líneas bajo tu propia validación:
-- create extension if not exists pg_cron with schema extensions;
-- select cron.schedule(
--   'purge_old_activity_entries_daily',       -- nombre
--   '15 03 * * *',                            -- hh:mm UTC (03:15 diario)
--   $$select public.purge_old_activity_entries(18);$$
-- );
-- Para revisar último resultado puedes crear un log manual o consultar cron.job_run_details (si disponible).

-- 4. Ejecución manual de la purga (ejemplo):
-- select * from public.purge_old_activity_entries();

-- Códigos de error relevantes añadidos/ajustados:
--   REPORT_TOO_OLD_TO_UNLOCK -> intento de desbloquear informe fuera de ventana de 18 meses.
--   SOLO_COMMENTS_O_UNLOCK   -> misma semántica previa (cifras no modificables cuando cerrado).
