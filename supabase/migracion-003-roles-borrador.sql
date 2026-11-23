-- ============================================================
-- Migración 003: roles de usuario, fianza por equipo y jornadas en borrador
-- Pega todo en Supabase > SQL Editor > New query > Run (una sola vez).
-- ============================================================

-- Roles: admin (todo), finanzas (pagos, registro, documentos, credenciales), captura (resultados).
alter table admins add column if not exists rol text not null default 'admin';
alter table admins drop constraint if exists admins_rol_check;
alter table admins add constraint admins_rol_check check (rol in ('admin', 'finanzas', 'captura'));
alter table admins add column if not exists nombre text;

create or replace function mi_rol() returns text
language sql stable security definer set search_path = public as $$
  select rol from admins where user_id = auth.uid();
$$;
grant execute on function mi_rol() to anon, authenticated;

-- es_admin() ahora significa solo administrador completo.
create or replace function es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and rol = 'admin');
$$;

-- tiene_rol(): el admin siempre pasa; los demás solo si su rol está en la lista.
create or replace function tiene_rol(r text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and (rol = 'admin' or rol = any(r)));
$$;
grant execute on function tiene_rol(text[]) to anon, authenticated;

-- Estado "borrador" para jornadas que aún no se publican.
alter table partidos drop constraint if exists partidos_estado_check;
alter table partidos add constraint partidos_estado_check check (estado in ('programado', 'jugado', 'suspendido', 'borrador'));

-- Concepto "fianza" (por equipo).
alter table pagos drop constraint if exists pagos_concepto_check;
alter table pagos add constraint pagos_concepto_check check (concepto in ('registro', 'inscripcion', 'arbitraje', 'multa', 'fianza', 'otro'));

-- ---------- Permisos por rol ----------
-- Partidos: el público no ve borradores; captura puede actualizar resultados.
drop policy if exists "lectura publica" on partidos;
create policy "lectura publica" on partidos for select using (estado <> 'borrador' or tiene_rol(array['captura', 'finanzas']));
drop policy if exists "captura actualiza" on partidos;
create policy "captura actualiza" on partidos for update to authenticated
  using (tiene_rol(array['captura'])) with check (tiene_rol(array['captura']));

-- Goles y tarjetas: captura.
drop policy if exists "captura escribe" on eventos;
create policy "captura escribe" on eventos for all to authenticated
  using (tiene_rol(array['captura'])) with check (tiene_rol(array['captura']));

-- Suspensiones: captura (automáticas por tarjeta).
drop policy if exists "captura escribe" on suspensiones;
create policy "captura escribe" on suspensiones for all to authenticated
  using (tiene_rol(array['captura'])) with check (tiene_rol(array['captura']));

-- Pagos: finanzas todo; captura solo puede crear multas (al capturar tarjetas).
drop policy if exists "solo admin" on pagos;
drop policy if exists "finanzas" on pagos;
create policy "finanzas" on pagos for all to authenticated
  using (tiene_rol(array['finanzas'])) with check (tiene_rol(array['finanzas']));
drop policy if exists "captura multas" on pagos;
create policy "captura multas" on pagos for insert to authenticated
  with check (tiene_rol(array['captura']) and concepto = 'multa');

-- Jugadores: finanzas puede marcar documentos verificados y asignar folio.
drop policy if exists "finanzas actualiza" on jugadores;
create policy "finanzas actualiza" on jugadores for update to authenticated
  using (tiene_rol(array['finanzas'])) with check (tiene_rol(array['finanzas']));

-- Datos privados y código QR: admin y finanzas.
drop policy if exists "solo admin" on jugadores_privado;
create policy "solo admin" on jugadores_privado for all to authenticated
  using (tiene_rol(array['finanzas'])) with check (tiene_rol(array['finanzas']));

-- ============================================================
-- ALTA DE UN USUARIO NUEVO (repetir por cada persona):
-- 1) Authentication > Users > Add user: su correo + contraseña, "Auto Confirm User".
-- 2) Corre una de estas líneas con su correo:
--
-- insert into admins (user_id, rol, nombre) select id, 'finanzas', 'Finanzas' from auth.users where email = 'CORREO_FINANZAS';
-- insert into admins (user_id, rol, nombre) select id, 'captura', 'Secretario' from auth.users where email = 'CORREO_SECRETARIO';
-- ============================================================
