-- ============================================================
-- Migración 005: usuarios de capitán y SOLO el presidente (administrador) puede borrar.
-- Pega todo en Supabase > SQL Editor > New query > Run (una sola vez). No borra datos.
-- ============================================================

-- Capitanes: rol nuevo ligado a un equipo.
alter table admins add column if not exists equipo_id uuid references equipos(id) on delete set null;
alter table admins drop constraint if exists admins_rol_check;
alter table admins add constraint admins_rol_check check (rol in ('admin', 'finanzas', 'captura', 'capitan'));

create or replace function mi_equipo() returns uuid
language sql stable security definer set search_path = public as $$
  select equipo_id from admins where user_id = auth.uid() and rol = 'capitan';
$$;
grant execute on function mi_equipo() to anon, authenticated;

-- ---------- Nadie borra, salvo el administrador ----------
-- Torneos, equipos, jugadores, partidos, eventos y suspensiones ya tienen "admin escribe" (solo el administrador),
-- que es lo único que permite borrar. Aquí se quita el borrado a finanzas y captura.

-- Goles y tarjetas: captura agrega y corrige, pero no borra.
drop policy if exists "captura escribe" on eventos;
drop policy if exists "captura inserta" on eventos;
drop policy if exists "captura actualiza" on eventos;
create policy "captura inserta" on eventos for insert to authenticated with check (tiene_rol(array['captura']));
create policy "captura actualiza" on eventos for update to authenticated using (tiene_rol(array['captura'])) with check (tiene_rol(array['captura']));

-- Suspensiones: igual.
drop policy if exists "captura escribe" on suspensiones;
drop policy if exists "captura inserta" on suspensiones;
drop policy if exists "captura actualiza" on suspensiones;
create policy "captura inserta" on suspensiones for insert to authenticated with check (tiene_rol(array['captura']));
create policy "captura actualiza" on suspensiones for update to authenticated using (tiene_rol(array['captura'])) with check (tiene_rol(array['captura']));

-- Pagos: finanzas ve, agrega y marca pagado; solo el administrador borra.
drop policy if exists "finanzas" on pagos;
drop policy if exists "finanzas lee" on pagos;
drop policy if exists "finanzas inserta" on pagos;
drop policy if exists "finanzas actualiza" on pagos;
drop policy if exists "admin borra" on pagos;
create policy "finanzas lee" on pagos for select to authenticated using (tiene_rol(array['finanzas']));
create policy "finanzas inserta" on pagos for insert to authenticated with check (tiene_rol(array['finanzas']));
create policy "finanzas actualiza" on pagos for update to authenticated using (tiene_rol(array['finanzas'])) with check (tiene_rol(array['finanzas']));
create policy "admin borra" on pagos for delete to authenticated using (es_admin());

-- El capitán solo VE los pagos de su equipo y de sus jugadores.
drop policy if exists "capitan lee" on pagos;
create policy "capitan lee" on pagos for select to authenticated using (
  mi_equipo() is not null and (equipo_id = mi_equipo() or jugador_id in (select id from jugadores where equipo_id = mi_equipo())));

-- Datos privados (CURP, fecha de nacimiento, código QR): finanzas ve y edita; solo el administrador borra.
drop policy if exists "solo admin" on jugadores_privado;
drop policy if exists "finanzas lee" on jugadores_privado;
drop policy if exists "finanzas inserta" on jugadores_privado;
drop policy if exists "finanzas actualiza" on jugadores_privado;
drop policy if exists "admin borra" on jugadores_privado;
create policy "finanzas lee" on jugadores_privado for select to authenticated using (tiene_rol(array['finanzas']));
create policy "finanzas inserta" on jugadores_privado for insert to authenticated with check (tiene_rol(array['finanzas']));
create policy "finanzas actualiza" on jugadores_privado for update to authenticated using (tiene_rol(array['finanzas'])) with check (tiene_rol(array['finanzas']));
create policy "admin borra" on jugadores_privado for delete to authenticated using (es_admin());
