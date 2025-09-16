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
	IF NEW.type = 'preaching' THEN
		-- Normaliza formato HH:MM:SS (por si vienen con HH:MM)
		IF NEW.start_time IS NULL OR NEW.end_time IS NULL THEN
			RAISE EXCEPTION 'RANGO_INCOMPLETO' USING ERRCODE = 'check_violation';
		END IF;
		-- Buscar cualquier otro registro que se traslape
		SELECT id INTO conflict_id
		FROM activity_entries
		WHERE user_id = NEW.user_id
			AND activity_date = NEW.activity_date
			AND type = 'preaching'
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
WHERE type = 'preaching';

-- Client handling suggestion:
-- If error.message includes 'OVERLAP_PREACHING' show friendly message:
--   'Se traslapa con otra actividad de predicación.'
-- If includes 'RANGO_INCOMPLETO' -> 'Rango de horas incompleto.'
