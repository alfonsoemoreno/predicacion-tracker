## Predicación Tracker

Registro sencillo y moderno (Material Design) de actividades de predicación y cursos bíblicos con autenticación Google y visualización en calendario.

### Stack Actual

- Next.js (App Router) + React 19 + TypeScript
- Supabase (Auth, Postgres, RLS, Realtime)
- Material UI v6 (theming claro/oscuro persistente)
- `react-big-calendar` + `date-fns` (locale ES)

### Principales Características

- Autenticación con Google (Supabase OAuth)
- Calendario mensual / semana / día con soporte de rangos horarios para predicación
- Modal Material UI para crear / editar actividades (predicación o curso bíblico)
- Validación de solapamientos para rangos de predicación en el día
- Cursos bíblicos asociados opcionalmente a una persona (estudio)
- Métricas mensuales: minutos totales de predicación, cursos (personas distintas), sesiones
- Feedback con Snackbar (creación, actualización, eliminación)
- Realtime (suscripción a cambios en `activity_entries`)
- Modo claro/oscuro (persistido en localStorage + preferencia del sistema)
- Policies RLS: aislamiento por usuario

### Cambios Recientes Importantes (Migración)

Se migró de un diseño previo con Tailwind + Radix UI a Material UI por:

- Consistencia visual inmediata (Material Design tokens predefinidos)
- Reducción de CSS personalizado y utilidades ad-hoc
- Mejor accesibilidad y estados interactivos listos
- Simplificación de mantenimiento (un solo sistema de componentes)

La limpieza incluyó: eliminación de Tailwind, Radix y componentes custom (`ui/Button`, `ui/Card`, `ui/MetricPill`), consolidación de estilos de eventos en el theme (`MuiCssBaseline`).

### Theming

`src/theme/materialTheme.ts` define dos temas (light/dark) con paleta primaria (#12b58b) y secundaria (#6366f1). Se aplican overrides a:

- `MuiButton`, `MuiPaper`, `MuiDialog`, `MuiChip` (bordes y tipografía)
- Estilos globales para clases de eventos de `react-big-calendar` (`.event-preaching`, `.event-bible_course`), hoy y off‑range.

Persistencia de modo: en `layout.tsx` se lee `localStorage` (`color-mode`) o preferencia del sistema (`prefers-color-scheme`).

### Flujo de Uso

1. Inicia sesión con Google.
2. Haz click en un día vacío para crear actividad (por defecto predicación).
3. Elige tipo (predicación / curso) vía toggle en el modal.
4. Predicación: ingresa hora inicio y fin (valida fin > inicio y no solapar).
5. Curso: ingresa minutos y selecciona persona (opcional).
6. Click en un evento para editar o borrar (prompt actual para acción, mejorable a menú contextual).
7. Observa métricas mensuales arriba del calendario.

### Próximas Mejoras Sugeridas

- Reemplazar prompt de editar/borrar por menú contextual o actions en tooltip
- CRUD visual de personas (pantalla dedicada o Autocomplete con creación rápida)
- Filtros por tipo / persona en calendario
- Exportación (CSV / PDF) de métricas mensuales
- Cálculo/agrupación de estadísticas en SQL (evitar sobrecarga cliente)
- PWA + offline (cache de últimas actividades)
- Tests (unit + integration + e2e)
- Accesibilidad adicional (navegación teclado completa en modal & calendario)

---

## 1. Configuración de Base de Datos (Supabase)

Ejecuta en el SQL editor de tu proyecto Supabase:

```sql
create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
	id uuid primary key references auth.users on delete cascade,
	full_name text,
	created_at timestamptz default now()
);

create table if not exists public.persons (
	id uuid primary key default uuid_generate_v4(),
	user_id uuid not null references auth.users(id) on delete cascade,
	name text not null,
	notes text,
	created_at timestamptz default now()
);

create type if not exists public.activity_type as enum ('preaching','bible_course');

create table if not exists public.activity_entries (
	id uuid primary key default uuid_generate_v4(),
	user_id uuid not null references auth.users(id) on delete cascade,
	activity_date date not null,
	minutes integer not null check (minutes > 0), -- será nullable tras migración rango horario
	start_time time, -- nuevo (migración)
	end_time time,   -- nuevo (migración)
	type activity_type not null,
	person_id uuid references public.persons(id) on delete set null,
	title text,
	notes text,
	created_at timestamptz default now(),
	updated_at timestamptz default now()
);

create index if not exists idx_activity_entries_user_date on public.activity_entries(user_id, activity_date);

alter table public.profiles enable row level security;
alter table public.persons enable row level security;
alter table public.activity_entries enable row level security;

create policy if not exists "profiles.select_own" on public.profiles for select using (id = auth.uid());
create policy if not exists "profiles.insert_own" on public.profiles for insert with check (id = auth.uid());
create policy if not exists "profiles.update_own" on public.profiles for update using (id = auth.uid());

create policy if not exists "persons.select_own" on public.persons for select using (user_id = auth.uid());
create policy if not exists "persons.crud_own" on public.persons for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy if not exists "entries.select_own" on public.activity_entries for select using (user_id = auth.uid());
create policy if not exists "entries.crud_own" on public.activity_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

### Habilitar Google OAuth

En Supabase → Authentication → Providers → Google. Configura los redirect:

- Desarrollo: `http://localhost:3000`
- Producción: dominio de Vercel (incluir `*.vercel.app` para previews si deseas)

---

## 2. Variables de Entorno

Crea `.env.local` (no se commitea):

```
NEXT_PUBLIC_SUPABASE_URL= https://TU_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY= TU_ANON_KEY
```

En Vercel añade las mismas variables (Project Settings → Environment Variables).

---

## 3. Scripts

Desarrollo:

```bash
npm run dev
```

Build producción local:

```bash
npm run build && npm start
```

---

## 4. Estructura relevante

```
src/
	app/
		page.tsx               # Calendario principal
		persons/page.tsx       # CRUD de personas
		layout.tsx             # Layout raíz
	components/
		Navbar.tsx
		CalendarView.tsx
	lib/
		supabaseClient.ts
```

---

## 5. Migración a rangos de tiempo (start_time / end_time)

Ejecuta después de haber creado la tabla inicial si vienes de una versión previa:

```sql
begin;
alter table public.activity_entries
	add column if not exists start_time time,
	add column if not exists end_time time,
	alter column minutes drop not null;

create or replace function public.compute_minutes_from_range() returns trigger as $$
declare
	dur integer;
begin
	if (NEW.start_time is not null and NEW.end_time is not null) then
		dur := extract(epoch from (NEW.end_time - NEW.start_time)) / 60;
		if dur < 0 then
			raise exception 'end_time (%) must be after start_time (%)', NEW.end_time, NEW.start_time;
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
```

Notas:

- Para predicación ahora se ingresa hora inicio y fin; `minutes` se rellena automáticamente.
- Para cursos bíblicos se mantiene entrada all‑day con minutos manuales.
- Métricas mostradas se calculan en cliente (puede migrarse a SQL agregada más adelante).

---

## 6. Despliegue en Vercel

1. Haz push del repositorio a GitHub.
2. Importa el repo en Vercel.
3. Añade variables de entorno.
4. Deploy. Verifica login OAuth (si error de redirect, revisa URLs en Supabase).

---

## 7. Licencia

Uso personal / educativo. Ajusta según tus necesidades.

---

¡Listo! Siente libertad de extender. Para nuevas contribuciones: añade tests y respeta el tema MUI existente.
