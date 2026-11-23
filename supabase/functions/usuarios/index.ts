// Función "usuarios": alta y administración de la mesa de control (solo el administrador).
// Se instala en Supabase > Edge Functions > Deploy a new function > Via Editor, con el nombre: usuarios
// Usa la llave de servicio que Supabase ya trae dentro de la función; nunca sale al navegador.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resp = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const ROLES = ['admin', 'finanzas', 'captura'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const llave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(url, llave, { auth: { persistSession: false, autoRefreshToken: false } });

    // ¿Quién llama? Debe ser administrador.
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: quien } = await sb.auth.getUser(jwt);
    if (!quien?.user) return resp({ error: 'Inicia sesión otra vez.' }, 401);
    const yo = quien.user.id;
    const { data: mio } = await sb.from('admins').select('rol').eq('user_id', yo).maybeSingle();
    if (mio?.rol !== 'admin') return resp({ error: 'Solo el administrador puede manejar usuarios.' }, 403);

    const b = await req.json().catch(() => ({}));
    const limpio = (v: unknown) => String(v ?? '').trim();

    if (b.accion === 'listar') {
      const { data: filas, error } = await sb.from('admins').select('user_id, rol, nombre, cargo');
      if (error) throw error;
      const { data: us, error: e2 } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (e2) throw e2;
      const porId = new Map(us.users.map((u) => [u.id, u]));
      return resp({
        yo,
        usuarios: (filas || []).map((f) => ({
          ...f,
          email: porId.get(f.user_id)?.email || '',
          ultimo_acceso: porId.get(f.user_id)?.last_sign_in_at || null,
        })),
      });
    }

    if (b.accion === 'crear') {
      const email = limpio(b.email).toLowerCase();
      const rol = limpio(b.rol);
      if (!/^\S+@\S+\.\S+$/.test(email)) return resp({ error: 'Correo no válido.' }, 400);
      if (!ROLES.includes(rol)) return resp({ error: 'Rol no válido.' }, 400);
      let id = '';
      const { data: nuevo, error } = await sb.auth.admin.createUser({ email, password: String(b.password || ''), email_confirm: true });
      if (error) {
        // Si el correo ya existe, solo se le dan (o devuelven) los permisos.
        const { data: us } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const ya = us?.users.find((u) => (u.email || '').toLowerCase() === email);
        if (!ya) return resp({ error: /password/i.test(error.message) ? 'La contraseña debe tener al menos 8 caracteres.' : error.message }, 400);
        id = ya.id;
        await sb.auth.admin.updateUserById(id, { ban_duration: 'none' });
      } else id = nuevo.user!.id;
      const { error: e3 } = await sb.from('admins').upsert({ user_id: id, rol, nombre: limpio(b.nombre) || null, cargo: limpio(b.cargo) || null });
      if (e3) throw e3;
      return resp({ ok: true, user_id: id, existente: !!error });
    }

    const id = limpio(b.user_id);
    if (!id) return resp({ error: 'Falta el usuario.' }, 400);

    if (b.accion === 'cambiar') {
      const cambios: Record<string, unknown> = {};
      if (b.rol !== undefined) {
        if (!ROLES.includes(b.rol)) return resp({ error: 'Rol no válido.' }, 400);
        if (id === yo && b.rol !== 'admin') return resp({ error: 'No puedes quitarte a ti mismo el rol de administrador.' }, 400);
        cambios.rol = b.rol;
      }
      if (b.nombre !== undefined) cambios.nombre = limpio(b.nombre) || null;
      if (b.cargo !== undefined) cambios.cargo = limpio(b.cargo) || null;
      const { error } = await sb.from('admins').update(cambios).eq('user_id', id);
      if (error) throw error;
      return resp({ ok: true });
    }

    if (b.accion === 'password') {
      const { error } = await sb.auth.admin.updateUserById(id, { password: String(b.password || '') });
      if (error) return resp({ error: /password/i.test(error.message) ? 'La contraseña debe tener al menos 8 caracteres.' : error.message }, 400);
      return resp({ ok: true });
    }

    if (b.accion === 'quitar') {
      if (id === yo) return resp({ error: 'No puedes quitarte el acceso a ti mismo.' }, 400);
      const { error } = await sb.from('admins').delete().eq('user_id', id);
      if (error) throw error;
      await sb.auth.admin.updateUserById(id, { ban_duration: '876000h' }); // bloquea el inicio de sesión
      return resp({ ok: true });
    }

    return resp({ error: 'Acción desconocida.' }, 400);
  } catch (e) {
    return resp({ error: (e as Error).message || String(e) }, 500);
  }
});
