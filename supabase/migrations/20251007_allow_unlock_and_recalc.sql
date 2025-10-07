-- Migration: Permit "unlock" (cambiar locked=false) y recálculo de métricas cuando el informe está desbloqueado.
-- Ajusta el trigger que antes impedía cualquier cambio excepto comments.
-- Nueva lógica:
--   * Si OLD.locked = true (el informe estaba cerrado): sólo se permite
--       - cambiar comments
--       - y/o cambiar locked de true -> false (desbloquear)
--   * Si OLD.locked = false (informe abierto): se permiten cambios a las
--       métricas (para recálculo) además de comments y locked (false->true al cerrar).
--   * Mantiene protección para no alterar period_year, month_index, etc.

create or replace function public.enforce_update_comments_unlock_recalc()
returns trigger as $$
declare
  allowed boolean;
begin
  -- Verificar que columnas estructurales no cambian nunca
  if OLD.user_id <> NEW.user_id
     or OLD.period_year <> NEW.period_year
     or OLD.month_index <> NEW.month_index
     or OLD.period_start <> NEW.period_start
     or OLD.period_end <> NEW.period_end then
    raise exception 'STRUCT_FIELDS_IMMUTABLE';
  end if;

  if OLD.locked = true then
    -- Informe estaba cerrado: sólo permitir cambiar comments y/o locked -> false
    allowed := (
      NEW.locked in (true,false) and -- locked puede cambiar (para desbloquear)
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
  else
    -- Informe abierto: permitir recálculo de métricas y luego relock.
    -- Aún así proteger que no cambien los identificadores (ya verificado arriba).
    -- No hay restricción adicional aquí.
    return NEW;
  end if;
  return NEW;
end;$$ language plpgsql security definer;

-- Reemplazar trigger anterior si existía
drop trigger if exists trg_monthly_reports_comments_only on public.monthly_reports;
create trigger trg_monthly_reports_control
before update on public.monthly_reports
for each row execute function public.enforce_update_comments_unlock_recalc();

-- Notas para el cliente:
--  * Si error incluye SOLO_COMMENTS_O_UNLOCK => se intentó modificar métricas con el mes cerrado.
--  * Primero desbloquear (locked=false), luego recálculo actualiza métricas y vuelve a locked=true.
--  * Error STRUCT_FIELDS_IMMUTABLE indica intento de cambiar campos estructurales prohibidos.