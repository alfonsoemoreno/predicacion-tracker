## Predicación Tracker

Aplicación (Next.js + Supabase) para registrar minutos de predicación y cursos bíblicos sobre un calendario.

### Stack

- Next.js (App Router)
- React 19 + TypeScript
- Supabase (Auth + Postgres + RLS)
- `react-big-calendar` + `date-fns` (i18n español)

### Características

- Login con Google (OAuth via Supabase)
- Calendario mensual/semana/día con eventos (predicación / curso bíblico)
- CRUD básico de personas (estudios) y actividades
- Policies RLS: cada usuario solo ve sus datos

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
	minutes integer not null check (minutes > 0),
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

## 5. Flujo de uso

1. Inicia sesión con Google (navbar).
2. En el calendario: selecciona un día (slot) para crear entrada (prompt minutos + tipo + título opcional).
3. Click sobre un evento para editar minutos o borrar.
4. Crea personas en la página Personas (asociación manual futura; hoy no aparece selector en formulario rápido del calendario).

---

## 6. Mejoras futuras sugeridas

- Reemplazar prompts por formularios modales.
- Selector de persona y notas en creación/edición de actividad.
- Estadísticas: minutos por mes, desglose por tipo/persona.
- Tests de componentes (Playwright / React Testing Library).
- PWA + modo offline.
- Formularios accesibles y diseño responsive mejorado.

---

## 7. Despliegue en Vercel

1. Haz push del repositorio a GitHub.
2. Importa el repo en Vercel.
3. Añade variables de entorno.
4. Deploy. Verifica login OAuth (si error de redirect, revisa URLs en Supabase).

---

## 8. Licencia

Uso personal / educativo. Ajusta según tus necesidades.

---

¡Listo! Cualquier mejora puedes abrir un issue o continuar extendiendo.
