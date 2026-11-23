// Capa de datos: Supabase (nube) o localStorage (modo demo).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const TABLAS = ['torneos', 'equipos', 'jugadores', 'jugadores_privado', 'partidos', 'eventos', 'pagos', 'suspensiones'];
const SOLO_ADMIN = new Set(['jugadores_privado', 'pagos']);
const LS_KEY = 'f7teo-datos-v1';

export const db = { modo: 'demo', data: {}, user: null, esAdmin: false, rol: null, client: null, faltaMigracion: false, faltaRoles: false,
  offline: false, pendientes: [], sincronizando: false, fallidos: [], alCambiarSync: null };

// ---------- Modo sin internet ----------
// Copia local de los datos (para abrir sin señal) y cola de cambios pendientes de enviar.
const CACHE_KEY = 'f7teo-cache-v1';
const COLA_KEY = 'f7teo-cola-v1';
const leerJSON = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const escribirJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio */ } };
db.pendientes = leerJSON(COLA_KEY) || [];

function guardarCache() {
  if (db.modo !== 'supabase') return;
  escribirJSON(CACHE_KEY, { guardado: new Date().toISOString(), user: db.user ? { id: db.user.id, email: db.user.email } : null,
    rol: db.rol, equipoId: db.equipoId, faltaMigracion: db.faltaMigracion, data: db.data });
}
const guardarCola = () => { escribirJSON(COLA_KEY, db.pendientes); avisarSync(); };
const avisarSync = () => { try { db.alCambiarSync?.(); } catch { /* nada */ } };

// ¿El error fue por falta de internet (y no por permisos o datos inválidos)?
const esErrorDeRed = e => !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout|aborted/i.test(String(e?.message || e || ''));

async function ejecutar(op) {
  const q = db.client.from(op.tabla);
  let r;
  if (op.tipo === 'insert') r = await q.insert(op.filas);
  else if (op.tipo === 'update') r = await q.update(op.cambios).in('id', op.ids);
  else r = await q.delete().in('id', op.ids);
  if (r.error) {
    if (op.tipo === 'insert' && r.error.code === '23505') return; // ya se había enviado
    const err = new Error(r.error.message); err.red = esErrorDeRed(r.error); throw err;
  }
}

// Intenta mandar a la nube; si no hay internet, lo deja en la cola y sigue trabajando con la copia local.
async function enviar(op) {
  if (db.modo !== 'supabase') return;
  if (db.offline || db.pendientes.length || !navigator.onLine) { encolar(op); return; }
  try { await ejecutar(op); }
  catch (e) {
    if (!e.red) throw e;
    db.offline = true; encolar(op);
  }
}
function encolar(op) { db.pendientes.push({ ...op, cuando: new Date().toISOString() }); guardarCola(); }

// Manda los cambios pendientes en orden. Se llama al volver el internet.
export async function sincronizar() {
  if (db.modo !== 'supabase' || db.sincronizando || !navigator.onLine) return;
  db.sincronizando = true; avisarSync();
  let enviados = 0;
  try {
    if (!db.client) await crearCliente();
    while (db.pendientes.length) {
      const op = db.pendientes[0];
      try { await ejecutar(op); enviados++; }
      catch (e) {
        if (e.red) { db.offline = true; break; }
        db.fallidos.push({ ...op, error: e.message }); enviados++;
      }
      db.pendientes.shift(); guardarCola();
    }
    if (!db.pendientes.length) {
      const antes = db.offline;
      db.offline = false;
      if (enviados || antes) {
        const { data: { session } } = await db.client.auth.getSession();
        if (session?.user) { db.user = session.user; db.esAdmin = await revisarAdmin(); }
        await cargarTodo();
      }
    }
  } catch (e) {
    if (esErrorDeRed(e)) db.offline = true;
  } finally {
    db.sincronizando = false; avisarSync();
  }
  return enviados;
}

async function crearCliente() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  db.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Sin internet: abre con la última copia guardada en este teléfono.
function usarCache() {
  const c = leerJSON(CACHE_KEY);
  if (!c?.data) return false;
  db.data = c.data;
  for (const t of TABLAS) db.data[t] ||= [];
  db.faltaMigracion = !!c.faltaMigracion;
  if (!db.user && c.user) db.user = c.user;
  if (db.user && c.user && db.user.id === c.user.id) { db.rol = c.rol; db.equipoId = c.equipoId || null; db.esAdmin = !!c.rol; }
  db.offline = true; db.cacheDe = c.guardado;
  return true;
}

export const nuevoToken = () => uuid().replace(/-/g, '').slice(0, 12);

export const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
      }));

function lsGet() { try { return localStorage.getItem(LS_KEY); } catch { return null; } }
function lsSet(v) { try { localStorage.setItem(LS_KEY, v); } catch { /* sin almacenamiento */ } }
function guardarDemo() { if (db.modo === 'demo') lsSet(JSON.stringify(db.data)); else guardarCache(); }

function semilla() {
  const torneo = {
    id: uuid(), nombre: 'Liga Juvenil F7 – Apertura 2026', categoria: 'Juvenil 11 a 17 años',
    temporada: '2026-2027', sede: 'Cancha F7 Lomas de Teocaltiche',
    pts_victoria: 3, pts_empate: 1, multa_amarilla: 30, multa_roja: 50, multa_azul: 10, activo: true,
  };
  const nombres = ['Alta Rienda FC', 'Sementales FC', 'Jaloco FC', 'Chikens FC', 'Atlético Jaguares',
    'San Arroyo FC', 'Mamitas FC', 'Cometas FC', 'Lacost FC', 'Prep. Carlos Fuentes'];
  return {
    torneos: [torneo],
    equipos: nombres.map(nombre => ({ id: uuid(), torneo_id: torneo.id, nombre, grupo: '', delegado: '', telefono: '' })),
    jugadores: [], jugadores_privado: [], partidos: [], eventos: [], pagos: [], suspensiones: [],
  };
}

export async function iniciar() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    db.modo = 'supabase';
    try {
      await crearCliente();
      const { data: { session } } = await db.client.auth.getSession();
      db.user = session?.user || null;
      db.esAdmin = db.user ? await revisarAdmin() : false;
      if (db.pendientes.length) { await sincronizar(); if (!db.offline) return; }
      await cargarTodo();
    } catch (e) {
      if (!usarCache()) throw esErrorDeRed(e) ? new Error('No hay internet y este teléfono todavía no tiene una copia de los datos. Abre la página una vez con internet.') : e;
    }
    return;
  }
  db.esAdmin = true; db.rol = 'admin';
  await cargarTodo();
}

// Vuelve el internet: manda lo pendiente. También lo intenta cada 30 segundos mientras haya cola.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => sincronizar());
  window.addEventListener('offline', () => { if (db.modo === 'supabase') { db.offline = true; avisarSync(); } });
  setInterval(() => { if (db.modo === 'supabase' && (db.pendientes.length || db.offline) && navigator.onLine) sincronizar(); }, 30000);
}

// Guarda el rol del usuario (admin, finanzas, captura) y devuelve si es parte del equipo de la liga.
async function revisarAdmin() {
  const r = await db.client.rpc('mi_rol');
  if (r.error && esErrorDeRed(r.error)) throw new Error(r.error.message);
  if (!r.error) {
    db.rol = r.data || null; db.faltaRoles = false; db.equipoId = null;
    if (db.rol === 'capitan') { const e = await db.client.rpc('mi_equipo'); db.equipoId = e.data || null; }
    return !!db.rol;
  }
  db.faltaRoles = true;
  const { data, error } = await db.client.rpc('es_admin');
  db.rol = !error && data === true ? 'admin' : null;
  return !!db.rol;
}

export async function cargarTodo() {
  if (db.modo === 'demo') {
    const raw = lsGet();
    let d = null;
    try { d = raw ? JSON.parse(raw) : null; } catch { d = null; }
    db.data = d || semilla();
    for (const t of TABLAS) db.data[t] ||= [];
    guardarDemo();
    return;
  }
  for (const t of TABLAS) {
    if (SOLO_ADMIN.has(t) && !db.esAdmin) { db.data[t] = []; continue; }
    const filas = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await db.client.from(t).select('*').order('created_at').range(desde, desde + 999);
      if (error && (t === 'pagos' || t === 'suspensiones')) { db.faltaMigracion = true; break; }
      if (error) throw new Error(`No se pudo leer ${t}: ${error.message}`);
      filas.push(...data);
      if (data.length < 1000) break;
    }
    db.data[t] = filas;
  }
  aplicarPendientes();
  guardarCache();
}

// Si quedan cambios en cola, se vuelven a aplicar sobre lo recién descargado.
function aplicarPendientes() {
  for (const op of db.pendientes) {
    const arr = db.data[op.tabla]; if (!arr) continue;
    if (op.tipo === 'insert') op.filas.forEach(f => { if (!arr.some(x => x.id === f.id)) arr.push({ ...f }); });
    else if (op.tipo === 'update') { const s = new Set(op.ids); arr.forEach(f => { if (s.has(f.id)) Object.assign(f, op.cambios); }); }
    else op.ids.forEach(id => cascadaLocal(op.tabla, id));
  }
}

function limpiar(row) {
  const r = { ...row };
  for (const k of Object.keys(r)) if (r[k] === '') r[k] = null;
  return r;
}

export async function insertar(tabla, filas) {
  const lista = (Array.isArray(filas) ? filas : [filas]).map(f => limpiar({ id: f.id || uuid(), ...f }));
  if (!lista.length) return [];
  for (let i = 0; i < lista.length; i += 500) await enviar({ tipo: 'insert', tabla, filas: lista.slice(i, i + 500) });
  db.data[tabla].push(...lista);
  guardarDemo();
  return lista;
}

export async function actualizar(tabla, id, cambios) {
  const c = limpiar(cambios);
  await enviar({ tipo: 'update', tabla, ids: [id], cambios: c });
  const fila = db.data[tabla].find(f => f.id === id);
  if (fila) Object.assign(fila, c);
  guardarDemo();
}

export async function borrar(tabla, ids) {
  const lista = Array.isArray(ids) ? ids : [ids];
  if (!lista.length) return;
  for (let i = 0; i < lista.length; i += 200) await enviar({ tipo: 'delete', tabla, ids: lista.slice(i, i + 200) });
  for (const id of lista) cascadaLocal(tabla, id);
  guardarDemo();
}

// Replica en memoria el "on delete cascade" de la base de datos.
function cascadaLocal(tabla, id) {
  const d = db.data;
  d[tabla] = d[tabla].filter(f => f.id !== id);
  if (tabla === 'torneos') {
    d.equipos.filter(e => e.torneo_id === id).forEach(e => cascadaLocal('equipos', e.id));
    d.partidos.filter(p => p.torneo_id === id).forEach(p => cascadaLocal('partidos', p.id));
  } else if (tabla === 'equipos') {
    d.jugadores.filter(j => j.equipo_id === id).forEach(j => cascadaLocal('jugadores', j.id));
    d.partidos.filter(p => p.local_id === id || p.visita_id === id).forEach(p => cascadaLocal('partidos', p.id));
    d.eventos.filter(e => e.equipo_id === id).forEach(e => cascadaLocal('eventos', e.id));
    d.pagos = d.pagos.filter(g => g.equipo_id !== id);
  } else if (tabla === 'jugadores') {
    d.jugadores_privado = d.jugadores_privado.filter(x => x.id !== id);
    d.eventos.filter(e => e.jugador_id === id).forEach(e => cascadaLocal('eventos', e.id));
    d.pagos = d.pagos.filter(g => g.jugador_id !== id);
    d.suspensiones = d.suspensiones.filter(x => x.jugador_id !== id);
  } else if (tabla === 'partidos') {
    d.eventos.filter(e => e.partido_id === id).forEach(e => cascadaLocal('eventos', e.id));
    d.suspensiones.forEach(x => { if (x.partido_id === id) x.partido_id = null; });
  } else if (tabla === 'eventos') {
    d.pagos = d.pagos.filter(g => g.evento_id !== id);
  }
}

// Guarda CURP / fecha de nacimiento (crea o actualiza).
export async function guardarPrivado(id, datos = {}) {
  const fila = db.data.jugadores_privado.find(x => x.id === id);
  if (fila) return actualizar('jugadores_privado', id, fila.token ? datos : { ...datos, token: nuevoToken() });
  return insertar('jugadores_privado', { id, token: nuevoToken(), ...datos });
}

// Código del QR de un jugador; lo crea si no existe.
export async function tokenDe(id) {
  const fila = db.data.jugadores_privado.find(x => x.id === id);
  if (fila?.token) return fila.token;
  await guardarPrivado(id, {});
  return db.data.jugadores_privado.find(x => x.id === id).token;
}

// Perfil público por código QR: { jugador_id, registro_pagado, con_adeudo } o null.
export async function perfilPorToken(token) {
  if (db.modo === 'demo' || db.offline) {
    const p = db.data.jugadores_privado.find(x => x.token === token);
    if (!p) return null;
    const pg = db.data.pagos.filter(g => g.jugador_id === p.id);
    return { jugador_id: p.id, registro_pagado: pg.some(g => g.concepto === 'registro' && g.pagado), con_adeudo: pg.some(g => !g.pagado) };
  }
  const { data, error } = await db.client.rpc('perfil_por_token', { t: token });
  if (error) throw new Error('No se pudo validar la credencial: ' + error.message);
  return data;
}

export async function entrar(email, password) {
  if (!navigator.onLine) throw new Error('Para iniciar sesión necesitas internet (solo la primera vez en este teléfono).');
  if (!db.client) await crearCliente();
  const { error } = await db.client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Correo o contraseña incorrectos.');
  const { data: { session } } = await db.client.auth.getSession();
  db.user = session?.user || null;
  db.esAdmin = await revisarAdmin();
  await cargarTodo();
  if (!db.esAdmin) throw new Error('Tu usuario existe, pero no está dado de alta como administrador (tabla admins).');
}

export async function salir() {
  if (db.pendientes.length) throw new Error(`Hay ${db.pendientes.length} cambios sin enviar. Espera a tener internet para que se manden antes de cerrar sesión.`);
  await db.client.auth.signOut();
  db.user = null; db.esAdmin = false; db.rol = null;
  try { localStorage.removeItem(CACHE_KEY); } catch { /* nada */ }
  await cargarTodo();
}

// ---------- Usuarios de la mesa de control (función "usuarios" en Supabase) ----------
export async function usuarios(accion, datos = {}) {
  if (db.modo !== 'supabase') throw new Error('En modo demo no hay usuarios.');
  if (!navigator.onLine || db.offline) throw new Error('Para administrar usuarios necesitas internet.');
  const { data, error } = await db.client.functions.invoke('usuarios', { body: { accion, ...datos } });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch { /* nada */ }
    if (/not found|404|failed to send/i.test(msg)) msg = 'Falta instalar la función "usuarios" en Supabase (ver supabase/functions/usuarios).';
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function exportarJSON() {
  return JSON.stringify({ version: 1, exportado: new Date().toISOString(), ...db.data }, null, 2);
}

// Agrega (sin borrar lo existente) los registros de un respaldo que todavía no existan.
export async function importarJSON(texto) {
  const datos = JSON.parse(texto);
  const resumen = {};
  for (const t of TABLAS) {
    const existentes = new Set(db.data[t].map(f => f.id));
    const nuevas = (datos[t] || []).filter(f => f.id && !existentes.has(f.id));
    await insertar(t, nuevas);
    resumen[t] = nuevas.length;
  }
  return resumen;
}

export function reiniciarDemo() {
  db.data = semilla();
  guardarDemo();
}

// Actualiza varios registros con los mismos cambios.
export async function actualizarVarios(tabla, ids, cambios) {
  if (!ids.length) return;
  const c = limpiar(cambios);
  for (let i = 0; i < ids.length; i += 200) await enviar({ tipo: 'update', tabla, ids: ids.slice(i, i + 200), cambios: c });
  const set = new Set(ids);
  db.data[tabla].forEach(f => { if (set.has(f.id)) Object.assign(f, c); });
  guardarDemo();
}
