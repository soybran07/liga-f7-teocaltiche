-- ============================================================
-- Migración 002: credenciales con QR, pagos, suspensiones
-- Pega todo en Supabase > SQL Editor > New query > Run (una sola vez).
-- Se puede correr de nuevo sin romper nada.
-- ============================================================

-- Jugadores: folio de credencial y documentos verificados (acta/CURP revisados).
alter table jugadores add column if not exists folio int;
alter table jugadores add column if not exists docs_verificados boolean not null default false;

-- Torneos: cuota de registro por jugador.
alter table torneos add column if not exists cuota_registro numeric not null default 50;

-- Código secreto del QR (privado: solo el admin lo ve).
alter table jugadores_privado add column if not exists token text;
insert into jugadores_privado (id) select j.id from jugadores j
  where not exists (select 1 from jugadores_privado p where p.id = j.id);
update jugadores_privado set token = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12) where token is null;
alter table jugadores_privado alter column token set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
create unique index if not exists jugadores_privado_token_idx on jugadores_privado(token);

-- Pagos y adeudos (registro, inscripción, arbitraje, multas). Privado: solo admin.
create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid references jugadores(id) on delete cascade,
  equipo_id uuid references equipos(id) on delete cascade,
  evento_id uuid references eventos(id) on delete cascade,  -- multa ligada a una tarjeta
  concepto text not null default 'otro'
    check (concepto in ('registro','inscripcion','arbitraje','multa','otro')),
  monto numeric not null default 0,
  pagado boolean not null default false,
  fecha date not null default current_date,
  notas text,
  created_at timestamptz not null default now()
);
create index if not exists pagos_jugador_idx on pagos(jugador_id);

-- Suspensiones (pública, como la tabla de disciplina).
create table if not exists suspensiones (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references jugadores(id) on delete cascade,
  partido_id uuid references partidos(id) on delete set null,  -- partido donde se originó
  partidos int not null default 1,                             -- partidos a cumplir
  fecha date not null default current_date,
  motivo text,
  created_at timestamptz not null default now()
);
create index if not exists suspensiones_jugador_idx on suspensiones(jugador_id);

alter table pagos enable row level security;
alter table suspensiones enable row level security;

drop policy if exists "solo admin" on pagos;
create policy "solo admin" on pagos for all to authenticated using (es_admin()) with check (es_admin());

drop policy if exists "lectura publica" on suspensiones;
create policy "lectura publica" on suspensiones for select using (true);
drop policy if exists "admin escribe" on suspensiones;
create policy "admin escribe" on suspensiones for all to authenticated using (es_admin()) with check (es_admin());

-- Perfil público al escanear el QR: devuelve solo banderas, nunca montos ni CURP.
create or replace function perfil_por_token(t text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'jugador_id', j.id,
    'registro_pagado', exists (select 1 from pagos g where g.jugador_id = j.id and g.concepto = 'registro' and g.pagado),
    'con_adeudo', exists (select 1 from pagos g where g.jugador_id = j.id and not g.pagado)
  )
  from jugadores_privado p join jugadores j on j.id = p.id
  where p.token = t;
$$;
grant execute on function perfil_por_token(text) to anon, authenticated;
