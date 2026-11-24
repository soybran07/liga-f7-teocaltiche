-- ============================================================
-- Migración 007: los capitanes dan de alta a los jugadores y jugadoras de SU equipo.
-- Solo pueden AGREGAR (no cambiar ni borrar), y no pueden darse folio ni marcar documentos.
-- También pueden ver la fecha de nacimiento y CURP de su propio equipo (las que ellos capturan).
-- Pega todo en Supabase > SQL Editor > New query > Run (una sola vez). No borra datos.
-- ============================================================
drop policy if exists "capitan agrega jugadores" on jugadores;
create policy "capitan agrega jugadores" on jugadores for insert to authenticated
  with check (mi_equipo() is not null and equipo_id = mi_equipo() and folio is null and coalesce(docs_verificados, false) = false);

drop policy if exists "capitan agrega privado" on jugadores_privado;
create policy "capitan agrega privado" on jugadores_privado for insert to authenticated
  with check (mi_equipo() is not null and id in (select id from jugadores where equipo_id = mi_equipo()));

drop policy if exists "capitan lee privado" on jugadores_privado;
create policy "capitan lee privado" on jugadores_privado for select to authenticated
  using (mi_equipo() is not null and id in (select id from jugadores where equipo_id = mi_equipo()));
