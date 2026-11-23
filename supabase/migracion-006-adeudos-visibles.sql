-- ============================================================
-- Migración 006: secretario, vocales (captura) y capitanes pueden VER los adeudos de toda la liga.
-- Solo lectura: no pueden crear, cambiar ni borrar pagos. No borra datos.
-- Pega todo en Supabase > SQL Editor > New query > Run (una sola vez).
-- ============================================================
drop policy if exists "mesa y capitanes leen" on pagos;
create policy "mesa y capitanes leen" on pagos for select to authenticated
  using (tiene_rol(array['captura', 'capitan']));
