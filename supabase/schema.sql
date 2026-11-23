-- ============================================================
-- Base de datos de la Liga de Fútbol 7 Teocaltiche (Supabase)
-- Pega todo este archivo en Supabase > SQL Editor > New query > Run
-- ============================================================

create table if not exists torneos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  categoria text,
  temporada text,
  sede text,
  pts_victoria int not null default 3,
  pts_empate int not null default 1,
  multa_amarilla numeric not null default 30,
  multa_roja numeric not null default 50,
  multa_azul numeric not null default 10,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists equipos (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references torneos(id) on delete cascade,
  nombre text not null,
  grupo text,
  delegado text,
  telefono text,
  created_at timestamptz not null default now()
);

create table if not exists jugadores (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references equipos(id) on delete cascade,
  nombre text not null,
  numero int,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Datos privados del jugador (menores de edad): solo los ve el administrador.
create table if not exists jugadores_privado (
  id uuid primary key references jugadores(id) on delete cascade,
  curp text,
  fecha_nac date,
  created_at timestamptz not null default now()
);

create table if not exists partidos (
  id uuid primary key default gen_random_uuid(),
  torneo_id uuid not null references torneos(id) on delete cascade,
  jornada int not null,
  fecha date,
  hora text,
  cancha text,
  local_id uuid not null references equipos(id) on delete cascade,
  visita_id uuid not null references equipos(id) on delete cascade,
  goles_local int,
  goles_visita int,
  estado text not null default 'programado'
    check (estado in ('programado','jugado','suspendido')),
  notas text,
  created_at timestamptz not null default now()
);

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  partido_id uuid not null references partidos(id) on delete cascade,
  jugador_id uuid not null references jugadores(id) on delete cascade,
  equipo_id uuid not null references equipos(id) on delete cascade,
  tipo text not null check (tipo in ('gol','amarilla','roja','azul')),
  minuto int,
  created_at timestamptz not null default now()
);

create index if not exists equipos_torneo_idx on equipos(torneo_id);
create index if not exists jugadores_equipo_idx on jugadores(equipo_id);
create index if not exists partidos_torneo_idx on partidos(torneo_id);
create index if not exists eventos_partido_idx on eventos(partido_id);

-- ---------- Administradores ----------
-- Solo los usuarios en esta tabla pueden capturar o modificar datos.
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;
grant execute on function es_admin() to anon, authenticated;

-- ---------- Seguridad (RLS) ----------
alter table torneos   enable row level security;
alter table equipos   enable row level security;
alter table jugadores enable row level security;
alter table partidos  enable row level security;
alter table eventos   enable row level security;
alter table jugadores_privado enable row level security;
alter table admins    enable row level security;

do $$
declare t text;
begin
  foreach t in array array['torneos','equipos','jugadores','partidos','eventos'] loop
    execute format('drop policy if exists "lectura publica" on %I', t);
    execute format('create policy "lectura publica" on %I for select using (true)', t);
    execute format('drop policy if exists "admin escribe" on %I', t);
    execute format('create policy "admin escribe" on %I for all to authenticated using (es_admin()) with check (es_admin())', t);
  end loop;
end $$;

-- CURP y fecha de nacimiento: solo administradores (ni lectura pública).
drop policy if exists "solo admin" on jugadores_privado;
create policy "solo admin" on jugadores_privado for all to authenticated
  using (es_admin()) with check (es_admin());

-- ============================================================
-- PASO FINAL (una sola vez): hazte administrador.
-- 1) En Supabase > Authentication > Users > "Add user", crea tu usuario
--    con tu correo y una contraseña (marca "Auto confirm").
-- 2) Corre esta línea cambiando el correo:
--
-- insert into admins (user_id) select id from auth.users where email = 'TU_CORREO@ejemplo.com';
-- ============================================================

-- Después de este archivo, corre también: supabase/migracion-002-credenciales.sql
