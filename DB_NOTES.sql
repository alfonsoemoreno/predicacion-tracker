-- DB_NOTES.sql
-- Migrations / manual SQL snippets for predicacion-tracker

-- 1. Add color column to persons (nullable, hex string up to 7 chars like #AABBCC)
ALTER TABLE persons
ADD COLUMN IF NOT EXISTS color text CHECK (color ~ '^#[0-9A-Fa-f]{6}$');

-- 2. Enforce only one bible_course per person per day per user.
-- Assuming activity_entries(activity_date date, type text, person_id uuid)
-- Create partial unique index (Postgres) ignoring NULL person_id.
CREATE UNIQUE INDEX IF NOT EXISTS ux_activity_entries_course_person_day
ON activity_entries (user_id, activity_date, person_id)
WHERE type = 'bible_course' AND person_id IS NOT NULL;

-- 3. (Planned) Overlap prevention for preaching time ranges per user & day.
-- Final overlap trigger: ensures no traslape de predicación por usuario/día.
-- Important: Assumes start_time/end_time are NOT NULL for type='preaching'.
-- Custom SQLSTATE: use check_violation (23514) so client can catch.

CREATE OR REPLACE FUNCTION prevent_preaching_overlap()
RETURNS trigger AS $$
DECLARE
	conflict_id uuid;
BEGIN
	-- Incluye predicación y servicio sagrado (ambos con rango horario)
	IF NEW.type IN ('preaching','sacred_service') THEN
		-- Normaliza formato HH:MM:SS (por si vienen con HH:MM)
		IF NEW.start_time IS NULL OR NEW.end_time IS NULL THEN
			RAISE EXCEPTION 'RANGO_INCOMPLETO' USING ERRCODE = 'check_violation';
		END IF;
		-- Buscar cualquier otro registro que se traslape
		SELECT id INTO conflict_id
		FROM activity_entries
		WHERE user_id = NEW.user_id
			AND activity_date = NEW.activity_date
			AND type IN ('preaching','sacred_service')
			AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000')
			AND NEW.start_time < end_time AND NEW.end_time > start_time
		LIMIT 1;
		IF conflict_id IS NOT NULL THEN
			RAISE EXCEPTION 'OVERLAP_PREACHING' USING ERRCODE = 'check_violation';
		END IF;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_preaching_overlap ON activity_entries;
CREATE TRIGGER trg_prevent_preaching_overlap
BEFORE INSERT OR UPDATE ON activity_entries
FOR EACH ROW EXECUTE FUNCTION prevent_preaching_overlap();

-- Optional performance index to support overlap search (composite)
CREATE INDEX IF NOT EXISTS idx_activity_preaching_day_time
ON activity_entries (user_id, activity_date, start_time, end_time)
WHERE type IN ('preaching','sacred_service');

-- Client handling suggestion:
-- If error.message includes 'OVERLAP_PREACHING' show friendly message:
--   'Se traslapa con otra actividad de predicación.'
-- If includes 'RANGO_INCOMPLETO' -> 'Rango de horas incompleto.'

--------------------------------------------------------------------------------
-- 4. Monthly Reports (Informes Mensuales) with sequential locking & rollover
--------------------------------------------------------------------------------
-- Table stores one row per month in the theocratic year (Sep-Aug) once closed.
-- Generation is sequential: only the next month_index after the latest exists.
-- Rollover: leftover_minutes from previous month becomes carried_in_minutes of next.
-- month_index: 0 = September, 11 = August (based on period_year start).

CREATE TABLE IF NOT EXISTS monthly_reports (
	id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
	period_year int NOT NULL, -- theocratic year start (e.g. 2025 for Sep 2025 - Aug 2026)
	month_index int NOT NULL CHECK (month_index BETWEEN 0 AND 11),
	period_start date NOT NULL,
	period_end date NOT NULL, -- exclusive
	total_minutes int NOT NULL DEFAULT 0, -- minutes recorded in that calendar month
	carried_in_minutes int NOT NULL DEFAULT 0, -- leftover from previous month
	carried_out_minutes int NOT NULL DEFAULT 0, -- leftover to next month
	whole_hours int NOT NULL DEFAULT 0, -- floor((total+carried_in)/60)
	leftover_minutes int NOT NULL DEFAULT 0, -- (total+carried_in) % 60 (same as carried_out)
	effective_minutes int NOT NULL DEFAULT 0, -- total + carried_in
	distinct_studies int NOT NULL DEFAULT 0,
	locked boolean NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	UNIQUE (user_id, period_year, month_index)
);

-- Helpful index
CREATE INDEX IF NOT EXISTS idx_monthly_reports_user_year ON monthly_reports(user_id, period_year);

-- Trigger to prevent modifications to activity_entries for locked months.
CREATE OR REPLACE FUNCTION prevent_modifications_locked_month()
RETURNS trigger AS $$
DECLARE
	rpt monthly_reports;
BEGIN
	SELECT * INTO rpt
	FROM monthly_reports
	WHERE user_id = NEW.user_id
		AND NEW.activity_date >= period_start
		AND NEW.activity_date < period_end
		AND locked = true
	LIMIT 1;
	IF FOUND THEN
		RAISE EXCEPTION 'MES_CERRADO' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END;$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_block_locked_month_ins ON activity_entries;
CREATE TRIGGER trg_block_locked_month_ins
BEFORE INSERT ON activity_entries
FOR EACH ROW EXECUTE FUNCTION prevent_modifications_locked_month();

DROP TRIGGER IF EXISTS trg_block_locked_month_upd ON activity_entries;
CREATE TRIGGER trg_block_locked_month_upd
BEFORE UPDATE ON activity_entries
FOR EACH ROW EXECUTE FUNCTION prevent_modifications_locked_month();

-- Separate trigger for deletes: need OLD reference
CREATE OR REPLACE FUNCTION prevent_delete_locked_month()
RETURNS trigger AS $$
DECLARE
	rpt monthly_reports;
BEGIN
	SELECT * INTO rpt
	FROM monthly_reports
	WHERE user_id = OLD.user_id
		AND OLD.activity_date >= period_start
		AND OLD.activity_date < period_end
		AND locked = true
	LIMIT 1;
	IF FOUND THEN
		RAISE EXCEPTION 'MES_CERRADO' USING ERRCODE = 'check_violation';
	END IF;
	RETURN OLD;
END;$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_block_locked_month_del ON activity_entries;
CREATE TRIGGER trg_block_locked_month_del
BEFORE DELETE ON activity_entries
FOR EACH ROW EXECUTE FUNCTION prevent_delete_locked_month();

-- Client should map MES_CERRADO to: 'El mes ya está cerrado por un informe generado.'

--------------------------------------------------------------------------------
-- 4.a RLS Policies for monthly_reports (solo acceso del propio usuario)
--------------------------------------------------------------------------------
-- Habilitar RLS (ejecutar una sola vez)
ALTER TABLE monthly_reports ENABLE ROW LEVEL SECURITY;

-- Lectura: solo filas del usuario autenticado
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'monthly_reports' AND policyname = 'sel_monthly_reports_own'
	) THEN
		CREATE POLICY sel_monthly_reports_own ON monthly_reports
			FOR SELECT USING (auth.uid() = user_id);
	END IF;
END $$;

-- Inserción: solo permitida si user_id = auth.uid()
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'monthly_reports' AND policyname = 'ins_monthly_reports_self'
	) THEN
		CREATE POLICY ins_monthly_reports_self ON monthly_reports
			FOR INSERT WITH CHECK (auth.uid() = user_id);
	END IF;
END $$;

-- (Opcional / comentado) Permitir UPDATE solo si el mes NO está bloqueado.
-- Descomentar si en el futuro se quiere una acción para editar antes de cerrar.
-- DO $$
-- BEGIN
--   IF NOT EXISTS (
--     SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'monthly_reports' AND policyname = 'upd_monthly_reports_unlocked'
--   ) THEN
--     CREATE POLICY upd_monthly_reports_unlocked ON monthly_reports
--       FOR UPDATE USING (auth.uid() = user_id AND locked = false)
--       WITH CHECK (auth.uid() = user_id AND locked = false);
--   END IF;
-- END $$;

-- No se crea policy DELETE -> elimina la capacidad de borrar informes (se mantienen como histórico).

-- NOTA: Asegúrate de tener "service_role" (o usar la consola) para ejecutar ALTER/CREATE POLICY.

--------------------------------------------------------------------------------
-- 5. Servicio sagrado: Ajustes
--------------------------------------------------------------------------------
-- Añadir columnas adicionales a monthly_reports si no existen ya
ALTER TABLE monthly_reports ADD COLUMN IF NOT EXISTS sacred_service_minutes int NOT NULL DEFAULT 0;
ALTER TABLE monthly_reports ADD COLUMN IF NOT EXISTS comments text;

-- Nota: total_minutes continúa representando solo predicación.
-- sacred_service_minutes se mostrará en informes y estadísticas aparte; no afecta cálculo de horas completas ni rollover.

-- Si la columna activity_entries.type es un ENUM (activity_type) y todavía no incluye 'sacred_service',
-- hay que extenderlo. (El error reportado: "invalid input value for enum activity_type: 'sacred_service'")
-- Supabase (Postgres >= 14) permite ALTER TYPE ... ADD VALUE de forma directa.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
		IF NOT EXISTS (
			SELECT 1 FROM pg_type t
			JOIN pg_enum e ON t.oid = e.enumtypid
			WHERE t.typname = 'activity_type' AND e.enumlabel = 'sacred_service'
		) THEN
			ALTER TYPE activity_type ADD VALUE 'sacred_service';
		END IF;
	END IF;
END $$;

-- Si tu versión de Postgres fuese muy antigua y no soportara el bloque anterior con DO/IF, usar plan B manual:
-- 1) CREATE TYPE activity_type_new AS ENUM ('preaching','bible_course','sacred_service');
-- 2) ALTER TABLE activity_entries ALTER COLUMN type TYPE activity_type_new USING type::text::activity_type_new;
-- 3) DROP TYPE activity_type;
-- 4) ALTER TYPE activity_type_new RENAME TO activity_type;
-- (No ejecutar el plan B si ya funcionó el DO $$ ... $$ superior.)

--------------------------------------------------------------------------------
-- 6. Edición posterior SOLO de comentarios en monthly_reports
--------------------------------------------------------------------------------
-- Requisito: permitir que el usuario edite el campo comments incluso después
-- de que el informe esté bloqueado (locked = true) SIN permitir cambiar cifras.
-- Estrategia:
--  a) Política UPDATE permitiendo al dueño (auth.uid() = user_id)
--  b) Trigger BEFORE UPDATE que impida modificar cualquier columna distinta
--     de comments.

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='monthly_reports' AND policyname='upd_monthly_reports_comments'
	) THEN
		CREATE POLICY upd_monthly_reports_comments ON monthly_reports
			FOR UPDATE USING (auth.uid() = user_id)
			WITH CHECK (auth.uid() = user_id);
	END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_update_comments_only()
RETURNS trigger AS $$
DECLARE
	same boolean;
BEGIN
	-- Permitir sólo cambio en comments; cualquier otro cambio -> error
	same := (
		OLD.user_id = NEW.user_id AND
		OLD.period_year = NEW.period_year AND
		OLD.month_index = NEW.month_index AND
		OLD.period_start = NEW.period_start AND
		OLD.period_end = NEW.period_end AND
		OLD.total_minutes = NEW.total_minutes AND
		OLD.carried_in_minutes = NEW.carried_in_minutes AND
		OLD.carried_out_minutes = NEW.carried_out_minutes AND
		OLD.whole_hours = NEW.whole_hours AND
		OLD.leftover_minutes = NEW.leftover_minutes AND
		OLD.effective_minutes = NEW.effective_minutes AND
		OLD.distinct_studies = NEW.distinct_studies AND
		OLD.locked = NEW.locked AND
		COALESCE(OLD.sacred_service_minutes, -1) = COALESCE(NEW.sacred_service_minutes, -1)
	);
	IF NOT same THEN
		RAISE EXCEPTION 'SOLO_COMMENTS_EDITABLE' USING ERRCODE='check_violation';
	END IF;
	RETURN NEW;
END;$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_monthly_reports_comments_only ON monthly_reports;
CREATE TRIGGER trg_monthly_reports_comments_only
BEFORE UPDATE ON monthly_reports
FOR EACH ROW EXECUTE FUNCTION enforce_update_comments_only();

-- Manejo en cliente: si error incluye SOLO_COMMENTS_EDITABLE -> mostrar mensaje
-- 'Solo es posible editar los comentarios del informe.'


