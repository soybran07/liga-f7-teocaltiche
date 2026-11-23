-- ============================================================
-- Migración 004: cargo de cada integrante de la mesa de control.
-- Pega todo en Supabase > SQL Editor > New query > Run (una sola vez). No borra datos.
-- ============================================================
alter table admins add column if not exists cargo text;
update admins set cargo = 'Presidente' where rol = 'admin' and cargo is null;
