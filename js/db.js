// Capa de datos: Supabase (nube) o localStorage (modo demo).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const TABLAS = ['torneos', 'equipos', 'jugadores', 'jugadores_privado', 'partidos', 'eventos', 'pagos', 'suspensiones'];
const SOLO_ADMIN = new Set(['jugadores_privado', 'pagos']);
const LS_KEY = 'f7teo-datos-v1';

export const db = { modo: 'demo', data: {}, user: null, esAdmin: false, rol: null, client: null, faltaMigracion: false, faltaRoles: false };

export const nuevoToken = () => uuid().replace(/-/g, '').slice(0, 12);

export const uuid = () =>
  (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
      }));

function lsGet() { try { return localStorage.getItem(LS_KEY); } catch { return null; } }
function lsSet(v) { try { localStorage.setItem(LS_KEY, v); } catch { /* sin almacenamiento */ } }
function guardarDemo() { if (db.modo === 'demo') lsSet(JSON.stringify(db.data)); }

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
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    db.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    db.modo = 'supabase';
    const { data: { session } } = await db.client.auth.getSession();
    db.user = session?.user || null;
    db.esAdmin = db.user ? await revisarAdmin() : false;
  } else {
    db.esAdmin = true; db.rol = 'admin';
  }
  await cargarTodo();
}

// Guarda el rol del usuario (admin, finanzas, captura) y devuelve si es parte del equipo de la liga.
async function revisarAdmin() {
  const r = await db.client.rpc('mi_rol');
  if (!r.error) { db.rol = r.data || null; db.faltaRoles = false; return !!db.rol; }
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
}

function limpiar(row) {
  const r = { ...row };
  for (const k of Object.keys(r)) if (r[k] === '') r[k] = null;
  return r;
}

export async function insertar(tabla, filas) {
  const lista = (Array.isArray(filas) ? filas : [filas]).map(f => limpiar({ id: f.id || uuid(), ...f }));
  if (!lista.length) return [];
  if (db.modo === 'supabase') {
    for (let i = 0; i < lista.length; i += 500) {
      const { error } = await db.client.from(tabla).insert(lista.slice(i, i + 500));
      if (error) throw new Error(error.message);
    }
  }
  db.data[tabla].push(...lista);
  guardarDemo();
  return lista;
}

export async function actualizar(tabla, id, cambios) {
  const c = limpiar(cambios);
  if (db.modo === 'supabase') {
    const { error } = await db.client.from(tabla).update(c).eq('id', id);
    if (error) throw new Error(error.message);
  }
  const fila = db.data[tabla].find(f => f.id === id);
  if (fila) Object.assign(fila, c);
  guardarDemo();
}

export async function borrar(tabla, ids) {
  const lista = Array.isArray(ids) ? ids : [ids];
  if (!lista.length) return;
  if (db.modo === 'supabase') {
    for (let i = 0; i < lista.length; i += 200) {
      const { error } = await db.client.from(tabla).delete().in('id', lista.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
  }
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
  if (db.modo === 'demo') {
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
  const { error } = await db.client.auth.signInWithPassword({ email, password });
  if (error) throw new Error('Correo o contraseña incorrectos.');
  const { data: { session } } = await db.client.auth.getSession();
  db.user = session?.user || null;
  db.esAdmin = await revisarAdmin();
  await cargarTodo();
  if (!db.esAdmin) throw new Error('Tu usuario existe, pero no está dado de alta como administrador (tabla admins).');
}

export async function salir() {
  await db.client.auth.signOut();
  db.user = null; db.esAdmin = false; db.rol = null;
  await cargarTodo();
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
  if (db.modo === 'supabase') {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await db.client.from(tabla).update(c).in('id', ids.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
  }
  const set = new Set(ids);
  db.data[tabla].forEach(f => { if (set.has(f.id)) Object.assign(f, c); });
  guardarDemo();
}
