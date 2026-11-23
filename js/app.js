import { db, iniciar, insertar, actualizar, borrar, entrar, salir, exportarJSON, importarJSON, reiniciarDemo, guardarPrivado } from './db.js';
import { todosContraTodos, unirGrupos, calendarizar } from './roundrobin.js';
import { tablaPosiciones, tablaGoleo, tablaDisciplina } from './stats.js';
import { NOMBRE_LIGA } from './config.js';
import { revisarJugador, fechaDeCurp } from './validar.js';

const $app = document.getElementById('app');
const PREF = 'f7teo-pref-v1';
const pref = (() => { try { return JSON.parse(localStorage.getItem(PREF)) || {}; } catch { return {}; } })();
const st = {
  torneoId: pref.torneoId || null,
  tabPub: 'calendario',
  tabAdmin: 'resultados',
  jornadaAdmin: null,
  abierto: null,          // partido con detalles abiertos
  equipoAbierto: null,    // equipo con plantilla abierta
  jugadorEditando: null,  // jugador en edición
  vistaPrevia: null,      // partidos generados sin guardar
};
const guardarPref = () => { try { localStorage.setItem(PREF, JSON.stringify({ torneoId: st.torneoId })); } catch { } };

// ---------- utilidades ----------
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fmtFecha(iso) {
  if (!iso) return 'Fecha por definir';
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(y, m - 1, d);
  return `${DIAS[f.getDay()]} ${d} ${MESES[m - 1]}`;
}
function fmtHora(h) {
  if (!h) return '';
  const [H, M] = h.split(':').map(Number);
  const ap = H >= 12 ? 'pm' : 'am';
  return `${((H + 11) % 12) + 1}:${String(M || 0).padStart(2, '0')} ${ap}`;
}
function toast(msg, error = false) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (error ? ' error' : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, error ? 6000 : 2500);
}
async function seguro(fn) {
  try { await fn(); } catch (e) { console.error(e); toast(e.message || 'Ocurrió un error', true); }
  render();
}
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// ---------- selectores de datos ----------
const D = () => db.data;
const torneo = () => D().torneos.find(t => t.id === st.torneoId) || D().torneos[0] || null;
const equiposDe = tid => D().equipos.filter(e => e.torneo_id === tid).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
const partidosDe = tid => D().partidos.filter(p => p.torneo_id === tid)
  .sort((a, b) => a.jornada - b.jornada || String(a.fecha || '9').localeCompare(String(b.fecha || '9')) || String(a.hora || '').localeCompare(String(b.hora || '')));
const jugadoresDe = eid => D().jugadores.filter(j => j.equipo_id === eid)
  .sort((a, b) => (a.numero ?? 999) - (b.numero ?? 999) || a.nombre.localeCompare(b.nombre, 'es'));
const mapa = arr => new Map(arr.map(x => [x.id, x]));
function eventosDeTorneo(tid) {
  const ids = new Set(D().partidos.filter(p => p.torneo_id === tid).map(p => p.id));
  return D().eventos.filter(e => ids.has(e.partido_id));
}
const grupos = eqs => [...new Set(eqs.map(e => (e.grupo || '').trim()).filter(Boolean))].sort();

// ---------- render principal ----------
function render() {
  const t = torneo();
  if (t) st.torneoId = t.id;
  const admin = location.hash.startsWith('#/admin');
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('activo', (a.dataset.nav === 'admin') === admin));
  const aviso = document.getElementById('aviso');
  if (db.modo === 'demo') {
    aviso.hidden = false;
    aviso.textContent = 'Modo demo: los datos se guardan solo en este navegador. Conecta Supabase (ver LEEME) para guardarlos en la nube y publicarlos.';
  } else aviso.hidden = true;
  $app.innerHTML = admin ? vistaAdmin() : vistaPublica();
}

function selectorTorneo() {
  const ts = D().torneos;
  if (ts.length < 2) return '';
  return `<select data-cambio="torneo" style="max-width:320px">${ts.map(t =>
    `<option value="${t.id}" ${t.id === st.torneoId ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select>`;
}

function tabs(lista, actual, clave) {
  return `<div class="tabs">${lista.map(([id, txt]) =>
    `<button data-act="tab" data-clave="${clave}" data-id="${id}" class="${id === actual ? 'activo' : ''}">${txt}</button>`).join('')}</div>`;
}

// ================= VISTA PÚBLICA =================
function vistaPublica() {
  const t = torneo();
  if (!t) return `<div class="card vacio">Todavía no hay torneos. Entra a <a href="#/admin">Administrar</a> para crear el primero.</div>`;
  const cab = `<div class="fila entre"><div><h1>${esc(t.nombre)}</h1>
    <div class="muted">${[t.categoria, t.temporada, t.sede].filter(Boolean).map(esc).join(' · ')}</div></div>${selectorTorneo()}</div>`;
  const pestañas = tabs([['calendario', 'Calendario'], ['tabla', 'Tabla'], ['goleo', 'Goleo'], ['disciplina', 'Disciplina'], ['equipos', 'Equipos']], st.tabPub, 'tabPub');
  const cuerpo = { calendario: pubCalendario, tabla: pubTabla, goleo: pubGoleo, disciplina: pubDisciplina, equipos: pubEquipos }[st.tabPub](t);
  return cab + pestañas + cuerpo;
}

function filaPartido(p, eq) {
  const L = eq.get(p.local_id), V = eq.get(p.visita_id);
  const jugado = p.estado === 'jugado' && p.goles_local != null;
  const marc = jugado ? `<div class="marcador">${p.goles_local} – ${p.goles_visita}</div>`
    : `<div class="marcador pend">${p.estado === 'suspendido' ? 'Susp.' : (fmtHora(p.hora) || 'vs')}</div>`;
  const meta = [fmtFecha(p.fecha), jugado ? fmtHora(p.hora) : '', p.cancha].filter(Boolean).map(esc).join(' · ');
  return `<div class="partido"><div class="loc">${esc(L?.nombre || '¿?')}</div>${marc}<div class="vis">${esc(V?.nombre || '¿?')}</div>
    <div class="meta">${meta}${p.notas ? ' · ' + esc(p.notas) : ''}</div></div>`;
}

function pubCalendario(t) {
  const ps = partidosDe(t.id);
  if (!ps.length) return `<div class="card vacio">Aún no hay jornadas programadas.</div>`;
  const eq = mapa(equiposDe(t.id));
  const porJ = new Map();
  ps.forEach(p => { if (!porJ.has(p.jornada)) porJ.set(p.jornada, []); porJ.get(p.jornada).push(p); });
  return [...porJ.entries()].map(([j, lista]) => {
    const juegan = new Set(lista.flatMap(p => [p.local_id, p.visita_id]));
    const descansan = [...eq.values()].filter(e => !juegan.has(e.id)).map(e => e.nombre);
    return `<div class="card"><div class="fila entre"><h3 style="margin:0">Jornada ${j}</h3>
      ${descansan.length ? `<span class="muted" style="font-size:13px">Descansa: ${descansan.map(esc).join(', ')}</span>` : ''}</div>
      ${lista.map(p => filaPartido(p, eq)).join('')}</div>`;
  }).join('');
}

function tablaHTML(filas) {
  return `<div class="tabla-wrap"><table><thead><tr><th>#</th><th class="izq">Equipo</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>DIF</th><th>PTS</th><th>Últimos</th></tr></thead><tbody>
  ${filas.map((f, i) => `<tr><td>${i + 1}</td><td class="izq">${esc(f.equipo.nombre)}</td><td>${f.pj}</td><td>${f.g}</td><td>${f.e}</td><td>${f.p}</td>
  <td>${f.gf}</td><td>${f.gc}</td><td>${f.dif > 0 ? '+' : ''}${f.dif}</td><td class="pts">${f.pts}</td>
  <td class="forma">${f.forma.map(x => `<span class="${x}">${x}</span>`).join('')}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function pubTabla(t) {
  const eqs = equiposDe(t.id);
  if (!eqs.length) return `<div class="card vacio">Aún no hay equipos.</div>`;
  const ps = partidosDe(t.id);
  const gs = grupos(eqs);
  const pie = `<p class="muted" style="font-size:13px">Victoria ${t.pts_victoria} pts · Empate ${t.pts_empate} pt. Desempate: diferencia de goles, goles a favor.</p>`;
  if (!gs.length) return `<div class="card">${tablaHTML(tablaPosiciones(t, eqs, ps))}</div>${pie}`;
  return gs.map(g => {
    const de = eqs.filter(e => (e.grupo || '').trim() === g);
    const ids = new Set(de.map(e => e.id));
    return `<div class="card"><h3 style="margin-top:0">Grupo ${esc(g)}</h3>${tablaHTML(tablaPosiciones(t, de, ps.filter(p => ids.has(p.local_id) && ids.has(p.visita_id))))}</div>`;
  }).join('') + pie;
}

function pubGoleo(t) {
  const eqs = equiposDe(t.id);
  const filas = tablaGoleo(eventosDeTorneo(t.id), mapa(D().jugadores), mapa(eqs));
  if (!filas.length) return `<div class="card vacio">Todavía no hay goles registrados.</div>`;
  return `<div class="card tabla-wrap"><table><thead><tr><th>#</th><th class="izq">Jugador</th><th class="izq">Equipo</th><th>Goles</th></tr></thead><tbody>
  ${filas.map((f, i) => `<tr><td>${i + 1}</td><td class="izq">${esc(f.jugador.nombre)}</td><td class="izq">${esc(f.equipo?.nombre)}</td><td class="pts">${f.goles}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function pubDisciplina(t) {
  const eqs = equiposDe(t.id);
  const filas = tablaDisciplina(t, eventosDeTorneo(t.id), mapa(D().jugadores), mapa(eqs));
  if (!filas.length) return `<div class="card vacio">Sin tarjetas registradas.</div>`;
  return `<div class="card tabla-wrap"><table><thead><tr><th class="izq">Jugador</th><th class="izq">Equipo</th>
    <th><span class="tarjeta amarilla"></span>Amarillas</th><th><span class="tarjeta roja"></span>Rojas</th><th><span class="tarjeta azul"></span>Azules</th><th>Multas</th></tr></thead><tbody>
  ${filas.map(f => `<tr><td class="izq">${esc(f.jugador.nombre)}</td><td class="izq">${esc(f.equipo?.nombre)}</td><td>${f.amarilla}</td><td>${f.roja}</td><td>${f.azul}</td><td>$${f.multa}</td></tr>`).join('')}
  </tbody></table></div><p class="muted" style="font-size:13px">Multas: amarilla $${t.multa_amarilla} · roja $${t.multa_roja} · azul $${t.multa_azul}.</p>`;
}

function pubEquipos(t) {
  const eqs = equiposDe(t.id);
  if (!eqs.length) return `<div class="card vacio">Aún no hay equipos.</div>`;
  return `<div class="grid">${eqs.map(e => {
    const js = jugadoresDe(e.id).filter(j => j.activo !== false);
    return `<div class="card"><div class="fila entre"><strong>${esc(e.nombre)}</strong>${e.grupo ? `<span class="badge">Grupo ${esc(e.grupo)}</span>` : ''}</div>
      <div class="muted" style="font-size:13px;margin:4px 0 8px">${js.length} jugador${js.length === 1 ? '' : 'es'}</div>
      <ol style="margin:0;padding-left:0;list-style:none">${js.map(j => `<li><span class="muted" style="display:inline-block;width:28px">${j.numero ?? ''}</span>${esc(j.nombre)}</li>`).join('')}</ol></div>`;
  }).join('')}</div>`;
}

// ================= VISTA ADMIN =================
function vistaAdmin() {
  if (db.modo === 'supabase' && !db.esAdmin) {
    return `<div class="card" style="max-width:380px;margin:20px auto"><h1>Entrar como administrador</h1>
      <form data-form="login"><div class="campo"><label>Correo</label><input name="email" type="email" required autocomplete="username"></div>
      <div class="campo"><label>Contraseña</label><input name="password" type="password" required autocomplete="current-password"></div>
      <button class="btn" type="submit">Entrar</button></form></div>`;
  }
  const t = torneo();
  const cab = `<div class="fila entre"><h1>Administrar${t ? ': ' + esc(t.nombre) : ''}</h1><div class="fila">${selectorTorneo()}
    ${db.modo === 'supabase' ? `<button class="btn sec chico" data-act="salir">Cerrar sesión</button>` : ''}</div></div>`;
  const lista = t
    ? [['resultados', 'Resultados'], ['equipos', 'Equipos y jugadores'], ['generar', 'Generar jornadas'], ['torneos', 'Torneos'], ['respaldo', 'Respaldo']]
    : [['torneos', 'Torneos'], ['respaldo', 'Respaldo']];
  if (!lista.some(([id]) => id === st.tabAdmin)) st.tabAdmin = 'torneos';
  const cuerpo = { resultados: admResultados, equipos: admEquipos, generar: admGenerar, torneos: admTorneos, respaldo: admRespaldo }[st.tabAdmin](t);
  return cab + tabs(lista, st.tabAdmin, 'tabAdmin') + cuerpo;
}

// ----- Torneos -----
function formTorneo(t = {}) {
  const v = k => esc(t[k] ?? '');
  return `<form data-form="torneo" data-id="${t.id || ''}"><div class="form-grid">
    <div class="campo" style="grid-column:1/-1"><label>Nombre del torneo</label><input name="nombre" required value="${v('nombre')}" placeholder="Ej. Liga Libre F7 – Clausura 2027"></div>
    <div class="campo"><label>Categoría</label><input name="categoria" value="${v('categoria')}" placeholder="Juvenil, Libre, Veteranos…"></div>
    <div class="campo"><label>Temporada</label><input name="temporada" value="${v('temporada')}" placeholder="2026-2027"></div>
    <div class="campo"><label>Sede</label><input name="sede" value="${v('sede')}" placeholder="Cancha F7 Lomas"></div>
    <div class="campo"><label>Puntos por victoria</label><input name="pts_victoria" type="number" min="0" value="${t.pts_victoria ?? 3}"></div>
    <div class="campo"><label>Puntos por empate</label><input name="pts_empate" type="number" min="0" value="${t.pts_empate ?? 1}"></div>
    <div class="campo"><label>Multa amarilla ($)</label><input name="multa_amarilla" type="number" min="0" value="${t.multa_amarilla ?? 30}"></div>
    <div class="campo"><label>Multa roja ($)</label><input name="multa_roja" type="number" min="0" value="${t.multa_roja ?? 50}"></div>
    <div class="campo"><label>Multa azul ($)</label><input name="multa_azul" type="number" min="0" value="${t.multa_azul ?? 10}"></div>
  </div><button class="btn" type="submit">${t.id ? 'Guardar cambios' : 'Crear torneo'}</button></form>`;
}

function admTorneos(t) {
  const lista = D().torneos.map(x => `<div class="fila entre" style="padding:6px 0;border-bottom:1px solid var(--borde)">
    <div><strong>${esc(x.nombre)}</strong> <span class="muted">${esc(x.categoria || '')}</span> ${x.id === st.torneoId ? '<span class="badge">seleccionado</span>' : ''}</div>
    <div class="fila">${x.id !== st.torneoId ? `<button class="btn sec chico" data-act="elegir-torneo" data-id="${x.id}">Seleccionar</button>` : ''}
    <button class="btn peligro chico" data-act="borrar-torneo" data-id="${x.id}">Borrar</button></div></div>`).join('');
  return `${t ? `<div class="card"><h2 style="margin-top:0">Editar torneo seleccionado</h2>${formTorneo(t)}</div>` : ''}
    <div class="card"><h2 style="margin-top:0">Torneos</h2>${lista || '<p class="muted">Sin torneos.</p>'}</div>
    <div class="card"><h2 style="margin-top:0">Nuevo torneo</h2>${formTorneo()}</div>`;
}

// ----- Equipos y jugadores -----
function admEquipos(t) {
  const eqs = equiposDe(t.id);
  const priv = mapa(D().jugadores_privado);
  const tarjetas = eqs.map(e => {
    const abierto = st.equipoAbierto === e.id;
    const js = jugadoresDe(e.id);
    return `<div class="card">
      <form data-form="equipo" data-id="${e.id}"><div class="form-grid">
        <div class="campo"><label>Equipo</label><input name="nombre" required value="${esc(e.nombre)}"></div>
        <div class="campo"><label>Grupo (opcional)</label><input name="grupo" value="${esc(e.grupo || '')}" placeholder="A, B…"></div>
        <div class="campo"><label>Delegado</label><input name="delegado" value="${esc(e.delegado || '')}"></div>
        <div class="campo"><label>Teléfono</label><input name="telefono" value="${esc(e.telefono || '')}"></div>
      </div><div class="fila"><button class="btn chico" type="submit">Guardar</button>
      <button class="btn sec chico" type="button" data-act="plantilla" data-id="${e.id}">${abierto ? 'Ocultar' : 'Ver'} jugadores (${js.length})</button>
      <button class="btn peligro chico" type="button" data-act="borrar-equipo" data-id="${e.id}">Borrar equipo</button></div></form>
      ${abierto ? `<h3>Jugadores</h3>
        ${js.length ? `<div class="tabla-wrap"><table><thead><tr><th>Núm.</th><th class="izq">Nombre</th><th class="izq">CURP (privado)</th><th>Nacimiento (privado)</th><th class="izq">Revisión</th><th>Activo</th><th></th></tr></thead><tbody>
        ${js.map(j => filaJugador(j, priv.get(j.id) || {}, t)).join('')}
        </tbody></table></div>` : '<p class="muted">Sin jugadores todavía.</p>'}
        <form data-form="jugador" data-equipo="${e.id}" style="margin-top:10px"><div class="form-grid">
          <div class="campo"><label>Nombre completo</label><input name="nombre" required></div>
          <div class="campo"><label>Número</label><input name="numero" type="number" min="0"></div>
          <div class="campo"><label>CURP (privado)</label><input name="curp" maxlength="18" style="text-transform:uppercase"></div>
          <div class="campo"><label>Fecha de nacimiento (privado)</label><input name="fecha_nac" type="date"></div>
        </div><button class="btn chico" type="submit">Agregar jugador</button></form>
        <form data-form="jugadores-lote" data-equipo="${e.id}" style="margin-top:10px">
          <label>Agregar varios a la vez: uno por renglón, "número, nombre" (el número es opcional)</label>
          <textarea name="lista" rows="3" placeholder="10, Juan Pérez López&#10;7, Luis García"></textarea>
          <button class="btn sec chico" type="submit" style="margin-top:6px">Agregar lista</button></form>` : ''}
    </div>`;
  }).join('');
  return `<div class="card"><h2 style="margin-top:0">Nuevo equipo</h2>
    <form data-form="equipo-nuevo"><div class="form-grid">
      <div class="campo"><label>Nombre del equipo</label><input name="nombre" required></div>
      <div class="campo"><label>Grupo (opcional)</label><input name="grupo" placeholder="A, B…"></div>
      <div class="campo"><label>Delegado</label><input name="delegado"></div>
      <div class="campo"><label>Teléfono</label><input name="telefono"></div>
    </div><button class="btn" type="submit">Agregar equipo</button></form></div>
    ${resumenRevision(t, eqs, priv)}
    <p class="muted">${eqs.length} equipos. La CURP y la fecha de nacimiento solo las ve el administrador; nunca aparecen en la página pública.</p>${tarjetas}`;
}

function filaJugador(j, p, t) {
  if (st.jugadorEditando === j.id) {
    const f = `form="ej-${j.id}"`;
    return `<tr><td><input ${f} class="num" name="numero" type="number" min="0" value="${j.numero ?? ''}"></td>
      <td class="izq"><input ${f} name="nombre" required value="${esc(j.nombre)}" style="min-width:180px"></td>
      <td class="izq"><input ${f} name="curp" maxlength="18" value="${esc(p.curp || '')}" style="text-transform:uppercase;min-width:190px"></td>
      <td><input ${f} name="fecha_nac" type="date" value="${esc(p.fecha_nac || '')}"></td>
      <td class="izq muted" style="white-space:normal;font-size:12px">Si dejas la fecha vacía se toma la de la CURP.</td>
      <td></td>
      <td><form id="ej-${j.id}" data-form="jugador-editar" data-id="${j.id}" class="fila" style="flex-wrap:nowrap">
        <button class="btn chico" type="submit">Guardar</button><button class="btn sec chico" type="button" data-act="editar-jugador" data-id="">Cancelar</button></form></td></tr>`;
  }
  const avisos = revisarJugador(p, t.categoria);
  return `<tr><td>${j.numero ?? ''}</td><td class="izq">${esc(j.nombre)}</td><td class="izq">${esc(p.curp || '')}</td><td>${esc(p.fecha_nac || '')}</td>
    <td class="izq" style="white-space:normal;font-size:12px;${avisos.length ? 'color:var(--rojo)' : 'color:var(--verde)'}">${avisos.length ? avisos.map(esc).join('<br>') : '✓ OK'}</td>
    <td><input type="checkbox" data-act="activo-jugador" data-id="${j.id}" ${j.activo !== false ? 'checked' : ''}></td>
    <td class="fila" style="flex-wrap:nowrap"><button class="btn sec chico" data-act="editar-jugador" data-id="${j.id}">Editar</button>
    <button class="btn peligro chico" data-act="borrar-jugador" data-id="${j.id}">Quitar</button></td></tr>`;
}

function resumenRevision(t, eqs, priv) {
  const problemas = eqs.flatMap(e => jugadoresDe(e.id).filter(j => j.activo !== false).map(j => ({ e, j, avisos: revisarJugador(priv.get(j.id) || {}, t.categoria) })))
    .filter(x => x.avisos.length);
  if (!problemas.length) return '';
  return `<div class="card" style="border-color:var(--rojo)"><h2 style="margin-top:0">Revisión de edades y CURP: ${problemas.length} jugador${problemas.length === 1 ? '' : 'es'} con avisos</h2>
    <div class="tabla-wrap"><table><tbody>${problemas.map(x => `<tr><td class="izq">${esc(x.j.nombre)}</td><td class="izq muted">${esc(x.e.nombre)}</td>
      <td class="izq" style="white-space:normal;color:var(--rojo);font-size:13px">${x.avisos.map(esc).join(' · ')}</td>
      <td><button class="btn sec chico" data-act="ir-jugador" data-id="${x.j.id}" data-equipo="${x.e.id}">Corregir</button></td></tr>`).join('')}</tbody></table></div>
    <p class="muted" style="font-size:13px">Verifica con la consulta gratuita de CURP en gob.mx o con el acta de nacimiento.</p></div>`;
}

// ----- Generar jornadas -----
function admGenerar(t) {
  const eqs = equiposDe(t.id);
  const ps = partidosDe(t.id);
  const pendientes = ps.filter(p => p.estado !== 'jugado').length;
  const maxJ = Math.max(0, ...ps.map(p => p.jornada));
  const gs = grupos(eqs);
  const eq = mapa(eqs);
  const prev = st.vistaPrevia;
  let htmlPrev = '';
  if (prev) {
    const porJ = new Map();
    prev.forEach(p => { if (!porJ.has(p.jornada)) porJ.set(p.jornada, []); porJ.get(p.jornada).push(p); });
    const sinHorario = prev.filter(p => !p.fecha).length;
    htmlPrev = `<div class="card"><div class="fila entre"><h2 style="margin:0">Vista previa: ${porJ.size} jornadas, ${prev.length} partidos</h2>
      <div class="fila"><button class="btn" data-act="guardar-jornadas">Guardar en el calendario</button><button class="btn sec" data-act="descartar-jornadas">Descartar</button></div></div>
      ${sinHorario ? `<p style="color:var(--rojo)">${sinHorario} partidos no cupieron en los horarios de su semana; quedarán "por definir" y puedes asignarles fecha en Resultados. Agrega más días u horarios si quieres evitarlo.</p>` : ''}
      ${[...porJ.entries()].map(([j, l]) => `<h3>Jornada ${j}</h3>${l.map(p => filaPartido({ ...p, estado: 'programado' }, eq)).join('')}`).join('')}</div>`;
  }
  const lunes = (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  return `<div class="card"><h2 style="margin-top:0">Generar rol "todos contra todos"</h2>
    <p class="muted">${eqs.length} equipos${gs.length ? ` en ${gs.length} grupos (${gs.map(esc).join(', ')})` : ''}. ${eqs.length % 2 ? 'Como son impares, en cada jornada descansa un equipo.' : ''}
    ${ps.length ? `Ya hay ${ps.length} partidos (${pendientes} sin jugar); los nuevos empezarán en la jornada ${maxJ + 1}.` : ''}</p>
    <form data-form="generar"><div class="form-grid">
      <div class="campo"><label>Semana de inicio (fecha de la jornada 1)</label><input name="inicio" type="date" required value="${lunes}"></div>
      <div class="campo"><label>Horarios (separados por coma)</label><input name="horas" value="19:00, 20:00, 21:00"></div>
      <div class="campo"><label>Cancha</label><input name="cancha" value="${esc(t.sede || '')}"></div>
      <div class="campo"><label>Semanas entre jornadas</label><input name="semanas" type="number" min="1" value="1"></div>
    </div>
    <div class="campo"><label>Días de juego</label><div class="chips">${DIAS.map((d, i) => `<label><input type="checkbox" name="dias" value="${i}" ${i === 1 || i === 2 ? 'checked' : ''}> ${d}</label>`).join('')}</div></div>
    <div class="chips" style="margin-bottom:12px">
      <label><input type="checkbox" name="vuelta"> Ida y vuelta</label>
      ${gs.length ? `<label><input type="checkbox" name="porGrupo" checked> Solo partidos dentro de cada grupo</label>` : ''}
    </div>
    <button class="btn" type="submit" ${eqs.length < 2 ? 'disabled' : ''}>Ver vista previa</button></form></div>
    ${htmlPrev}
    <div class="card"><h2 style="margin-top:0">Agregar un partido suelto</h2>
      <form data-form="partido-manual"><div class="form-grid">
        <div class="campo"><label>Jornada</label><input name="jornada" type="number" min="1" required value="${Math.max(1, maxJ)}"></div>
        <div class="campo"><label>Local</label><select name="local_id" required>${eqs.map(e => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('')}</select></div>
        <div class="campo"><label>Visitante</label><select name="visita_id" required>${eqs.map((e, i) => `<option value="${e.id}" ${i === 1 ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></div>
        <div class="campo"><label>Fecha</label><input name="fecha" type="date"></div>
        <div class="campo"><label>Hora</label><input name="hora" type="time"></div>
      </div><button class="btn" type="submit">Agregar partido</button></form></div>
    ${pendientes ? `<div class="card"><h2 style="margin-top:0">Rehacer el rol</h2><p class="muted">Borra los ${pendientes} partidos que aún no se juegan (los jugados se conservan).</p>
      <button class="btn peligro" data-act="borrar-pendientes">Borrar partidos sin jugar</button></div>` : ''}`;
}

// ----- Resultados -----
function admResultados(t) {
  const ps = partidosDe(t.id);
  if (!ps.length) return `<div class="card vacio">No hay partidos. Ve a <a href="#/admin" data-act="tab" data-clave="tabAdmin" data-id="generar">Generar jornadas</a>.</div>`;
  const jornadas = [...new Set(ps.map(p => p.jornada))];
  if (!jornadas.includes(st.jornadaAdmin)) {
    st.jornadaAdmin = (ps.find(p => p.estado === 'programado') || ps[ps.length - 1]).jornada;
  }
  const eq = mapa(equiposDe(t.id));
  const lista = ps.filter(p => p.jornada === st.jornadaAdmin);
  const selJ = `<div class="fila"><label style="margin:0">Jornada</label><select data-cambio="jornada" style="width:auto">${jornadas.map(j =>
    `<option value="${j}" ${j === st.jornadaAdmin ? 'selected' : ''}>Jornada ${j}${ps.filter(p => p.jornada === j).every(p => p.estado === 'jugado') ? ' ✓' : ''}</option>`).join('')}</select></div>`;
  return selJ + lista.map(p => {
    const L = eq.get(p.local_id), V = eq.get(p.visita_id);
    const abierto = st.abierto === p.id;
    const evs = D().eventos.filter(e => e.partido_id === p.id);
    const jug = mapa(D().jugadores);
    const golesL = evs.filter(e => e.tipo === 'gol' && e.equipo_id === p.local_id).length;
    const golesV = evs.filter(e => e.tipo === 'gol' && e.equipo_id === p.visita_id).length;
    const descuadre = evs.some(e => e.tipo === 'gol') && p.goles_local != null && (golesL !== Number(p.goles_local) || golesV !== Number(p.goles_visita));
    const opcionesJug = [L, V].filter(Boolean).map(e => `<optgroup label="${esc(e.nombre)}">${jugadoresDe(e.id).filter(j => j.activo !== false).map(j =>
      `<option value="${j.id}">${j.numero != null ? j.numero + ' · ' : ''}${esc(j.nombre)}</option>`).join('')}</optgroup>`).join('');
    return `<div class="card">
      <form data-form="resultado" data-id="${p.id}">
        <div class="fila" style="justify-content:center;font-weight:600">
          <span style="flex:1;text-align:right;min-width:90px">${esc(L?.nombre)}</span>
          <input class="num" name="goles_local" type="number" min="0" value="${p.goles_local ?? ''}" aria-label="Goles ${esc(L?.nombre)}">
          <span>–</span>
          <input class="num" name="goles_visita" type="number" min="0" value="${p.goles_visita ?? ''}" aria-label="Goles ${esc(V?.nombre)}">
          <span style="flex:1;min-width:90px">${esc(V?.nombre)}</span>
        </div>
        <div class="form-grid" style="margin-top:8px">
          <div class="campo"><label>Fecha</label><input name="fecha" type="date" value="${esc(p.fecha || '')}"></div>
          <div class="campo"><label>Hora</label><input name="hora" type="time" value="${esc(p.hora || '')}"></div>
          <div class="campo"><label>Estado</label><select name="estado">${['programado', 'jugado', 'suspendido'].map(s => `<option ${s === p.estado ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="campo"><label>Notas</label><input name="notas" value="${esc(p.notas || '')}" placeholder="Ej. ganado por default"></div>
        </div>
        <div class="fila"><button class="btn chico" type="submit">Guardar resultado</button>
          <button class="btn sec chico" type="button" data-act="detalles" data-id="${p.id}">${abierto ? 'Ocultar' : 'Goles y tarjetas'} (${evs.length})</button>
          <button class="btn peligro chico" type="button" data-act="borrar-partido" data-id="${p.id}">Borrar partido</button></div>
      </form>
      ${descuadre ? `<p style="color:var(--rojo);font-size:13px">Ojo: los goles capturados por jugador (${golesL}–${golesV}) no coinciden con el marcador.</p>` : ''}
      ${abierto ? `<ul class="eventos">${evs.map(e => `<li>${e.tipo === 'gol' ? '⚽' : `<span class="tarjeta ${e.tipo}"></span>`} ${esc(jug.get(e.jugador_id)?.nombre || '¿?')}
          <span class="muted">(${esc(eq.get(e.equipo_id)?.nombre || '')}${e.minuto != null ? ', min ' + e.minuto : ''})</span>
          <button class="btn peligro chico" data-act="borrar-evento" data-id="${e.id}">x</button></li>`).join('') || '<li class="muted">Sin goles ni tarjetas.</li>'}</ul>
        ${opcionesJug.includes('<option') ? `<form data-form="evento" data-partido="${p.id}"><div class="form-grid">
          <div class="campo"><label>Tipo</label><select name="tipo"><option value="gol">⚽ Gol</option><option value="amarilla">Tarjeta amarilla</option><option value="roja">Tarjeta roja</option><option value="azul">Tarjeta azul</option></select></div>
          <div class="campo"><label>Jugador</label><select name="jugador_id" required>${opcionesJug}</select></div>
          <div class="campo"><label>Minuto (opcional)</label><input name="minuto" type="number" min="0" max="120"></div>
          <div class="campo"><button class="btn" type="submit">Agregar</button></div></div></form>`
        : '<p class="muted">Registra jugadores en "Equipos y jugadores" para capturar goles y tarjetas.</p>'}` : ''}
    </div>`;
  }).join('');
}

// ----- Respaldo -----
function admRespaldo() {
  return `<div class="card"><h2 style="margin-top:0">Respaldo</h2>
    <p class="muted">Descarga un archivo con todos los datos. Sirve como copia de seguridad y para pasar los datos del modo demo a Supabase.</p>
    <div class="fila"><button class="btn" data-act="exportar">Descargar respaldo (.json)</button>
    <label class="btn sec" style="margin:0;color:var(--verde)">Importar respaldo<input type="file" accept=".json,application/json" data-cambio="importar" hidden></label></div>
    <p class="muted" style="font-size:13px">Importar solo agrega lo que no existe; no borra nada.</p></div>
    ${db.modo === 'demo' ? `<div class="card"><h2 style="margin-top:0">Reiniciar demo</h2><p class="muted">Borra todo lo capturado en este navegador y vuelve a los 10 equipos de ejemplo.</p>
      <button class="btn peligro" data-act="reiniciar">Reiniciar datos demo</button></div>` : ''}`;
}

// ================= EVENTOS =================
const datosForm = f => Object.fromEntries(new FormData(f).entries());
const numONull = v => (v === '' || v == null ? null : Number(v));

$app.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  const { act, id } = b.dataset;
  if (b.tagName === 'A') ev.preventDefault();
  const acciones = {
    tab: () => { st[b.dataset.clave] = id; st.vistaPrevia = st.tabAdmin === 'generar' ? st.vistaPrevia : null; render(); },
    'elegir-torneo': () => { st.torneoId = id; guardarPref(); render(); },
    'borrar-torneo': () => confirm('¿Borrar este torneo con TODOS sus equipos, jugadores y partidos? No se puede deshacer.') &&
      seguro(async () => { await borrar('torneos', id); st.torneoId = null; toast('Torneo borrado'); }),
    plantilla: () => { st.equipoAbierto = st.equipoAbierto === id ? null : id; render(); },
    'borrar-equipo': () => confirm('¿Borrar el equipo, sus jugadores y sus partidos?') && seguro(async () => { await borrar('equipos', id); toast('Equipo borrado'); }),
    'editar-jugador': () => { st.jugadorEditando = id || null; render(); },
    'ir-jugador': () => { st.equipoAbierto = b.dataset.equipo; st.jugadorEditando = id; render();
      document.getElementById('ej-' + id)?.closest('tr')?.scrollIntoView({ block: 'center' }); },
    'borrar-jugador': () => confirm('¿Quitar a este jugador? También se borran sus goles y tarjetas.') && seguro(() => borrar('jugadores', id)),
    'activo-jugador': () => seguro(() => actualizar('jugadores', id, { activo: b.checked })),
    'guardar-jornadas': () => seguro(async () => {
      await insertar('partidos', st.vistaPrevia.map(p => ({ ...p, torneo_id: st.torneoId, estado: 'programado' })));
      toast(`${st.vistaPrevia.length} partidos guardados`); st.vistaPrevia = null; st.tabAdmin = 'resultados'; st.jornadaAdmin = null;
    }),
    'descartar-jornadas': () => { st.vistaPrevia = null; render(); },
    'borrar-pendientes': () => confirm('¿Borrar todos los partidos que no se han jugado?') && seguro(async () => {
      await borrar('partidos', partidosDe(st.torneoId).filter(p => p.estado !== 'jugado').map(p => p.id)); toast('Partidos sin jugar borrados');
    }),
    detalles: () => { st.abierto = st.abierto === id ? null : id; render(); },
    'borrar-partido': () => confirm('¿Borrar este partido?') && seguro(() => borrar('partidos', id)),
    'borrar-evento': () => seguro(() => borrar('eventos', id)),
    exportar: () => {
      const blob = new Blob([exportarJSON()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `respaldo-liga-f7-${hoyISO()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    reiniciar: () => confirm('¿Borrar todo lo capturado en este navegador?') && (reiniciarDemo(), st.torneoId = null, render()),
    salir: () => seguro(async () => { await salir(); toast('Sesión cerrada'); }),
  };
  acciones[act]?.();
});

$app.addEventListener('change', ev => {
  const el = ev.target.closest('[data-cambio]');
  if (!el) return;
  const c = el.dataset.cambio;
  if (c === 'torneo') { st.torneoId = el.value; st.jornadaAdmin = null; st.vistaPrevia = null; guardarPref(); render(); }
  if (c === 'jornada') { st.jornadaAdmin = Number(el.value); st.abierto = null; render(); }
  if (c === 'importar' && el.files[0]) {
    el.files[0].text().then(txt => seguro(async () => {
      const r = await importarJSON(txt);
      toast(`Importado: ${r.torneos} torneos, ${r.equipos} equipos, ${r.jugadores} jugadores, ${r.partidos} partidos, ${r.eventos} eventos`);
    }));
  }
});

$app.addEventListener('submit', ev => {
  const f = ev.target.closest('form[data-form]');
  if (!f) return;
  ev.preventDefault();
  const tipo = f.dataset.form;
  const d = datosForm(f);
  const formularios = {
    login: () => seguro(async () => { await entrar(d.email, d.password); toast('Bienvenido'); }),
    torneo: () => seguro(async () => {
      const fila = { nombre: d.nombre.trim(), categoria: d.categoria, temporada: d.temporada, sede: d.sede,
        pts_victoria: Number(d.pts_victoria), pts_empate: Number(d.pts_empate),
        multa_amarilla: Number(d.multa_amarilla), multa_roja: Number(d.multa_roja), multa_azul: Number(d.multa_azul) };
      if (f.dataset.id) { await actualizar('torneos', f.dataset.id, fila); toast('Torneo guardado'); }
      else { const [n] = await insertar('torneos', { ...fila, activo: true }); st.torneoId = n.id; guardarPref(); st.tabAdmin = 'equipos'; toast('Torneo creado; ahora agrega equipos'); }
    }),
    'equipo-nuevo': () => seguro(async () => {
      await insertar('equipos', { torneo_id: st.torneoId, nombre: d.nombre.trim(), grupo: d.grupo.trim().toUpperCase(), delegado: d.delegado, telefono: d.telefono });
      toast('Equipo agregado');
    }),
    equipo: () => seguro(async () => {
      await actualizar('equipos', f.dataset.id, { nombre: d.nombre.trim(), grupo: d.grupo.trim().toUpperCase(), delegado: d.delegado, telefono: d.telefono });
      toast('Equipo guardado');
    }),
    jugador: () => seguro(async () => {
      const [j] = await insertar('jugadores', { equipo_id: f.dataset.equipo, nombre: d.nombre.trim(), numero: numONull(d.numero), activo: true });
      const curp = (d.curp || '').trim().toUpperCase();
      await guardarPrivado(j.id, { curp, fecha_nac: d.fecha_nac || fechaDeCurp(curp) || '' });
      toast('Jugador agregado');
    }),
    'jugador-editar': () => seguro(async () => {
      const id = f.dataset.id;
      const v = Object.fromEntries([...document.querySelectorAll(`[form="ej-${id}"]`)].map(el => [el.name, el.value]));
      const curp = (v.curp || '').trim().toUpperCase();
      await actualizar('jugadores', id, { nombre: v.nombre.trim(), numero: numONull(v.numero) });
      await guardarPrivado(id, { curp, fecha_nac: v.fecha_nac || fechaDeCurp(curp) || '' });
      st.jugadorEditando = null; toast('Jugador actualizado');
    }),
    'jugadores-lote': () => seguro(async () => {
      const filas = d.lista.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        const m = l.match(/^(\d+)\s*[,.\-\s]\s*(.+)$/);
        return { equipo_id: f.dataset.equipo, numero: m ? Number(m[1]) : null, nombre: (m ? m[2] : l).trim(), activo: true };
      });
      await insertar('jugadores', filas); toast(`${filas.length} jugadores agregados`);
    }),
    generar: () => {
      const fd = new FormData(f);
      const dias = fd.getAll('dias').map(Number);
      const horas = d.horas.split(',').map(h => h.trim()).filter(h => /^\d{1,2}:\d{2}$/.test(h)).map(h => h.padStart(5, '0'));
      if (!dias.length || !horas.length) { toast('Elige al menos un día y un horario válido (ej. 19:00)', true); return; }
      const eqs = equiposDe(st.torneoId);
      const gs = grupos(eqs);
      const vuelta = fd.has('vuelta');
      let jornadas;
      if (gs.length && fd.has('porGrupo')) {
        const sinGrupo = eqs.filter(e => !(e.grupo || '').trim());
        if (sinGrupo.length) { toast(`Hay equipos sin grupo: ${sinGrupo.map(e => e.nombre).join(', ')}`, true); return; }
        jornadas = unirGrupos(gs.map(g => todosContraTodos(eqs.filter(e => e.grupo.trim() === g).map(e => e.id), vuelta)));
      } else {
        // Revuelve el orden para que el rol no salga siempre alfabético.
        const ids = eqs.map(e => e.id).sort(() => Math.random() - 0.5);
        jornadas = todosContraTodos(ids, vuelta);
      }
      const maxJ = Math.max(0, ...partidosDe(st.torneoId).map(p => p.jornada));
      st.vistaPrevia = calendarizar(jornadas, { inicio: d.inicio, dias, horas, cancha: d.cancha, semanasEntreJornadas: Number(d.semanas) || 1, jornadaInicial: maxJ + 1 });
      render();
    },
    'partido-manual': () => {
      if (d.local_id === d.visita_id) { toast('Local y visitante deben ser distintos', true); return; }
      seguro(async () => {
        await insertar('partidos', { torneo_id: st.torneoId, jornada: Number(d.jornada), local_id: d.local_id, visita_id: d.visita_id,
          fecha: d.fecha, hora: d.hora, cancha: torneo()?.sede || '', estado: 'programado' });
        toast('Partido agregado');
      });
    },
    resultado: () => seguro(async () => {
      const gl = numONull(d.goles_local), gv = numONull(d.goles_visita);
      let estado = d.estado;
      if (gl != null && gv != null && estado === 'programado') estado = 'jugado';
      if (estado === 'jugado' && (gl == null || gv == null)) throw new Error('Para marcarlo como jugado escribe los goles de ambos equipos.');
      await actualizar('partidos', f.dataset.id, { goles_local: gl, goles_visita: gv, fecha: d.fecha, hora: d.hora, estado, notas: d.notas });
      toast('Resultado guardado');
    }),
    evento: () => seguro(async () => {
      const j = D().jugadores.find(x => x.id === d.jugador_id);
      await insertar('eventos', { partido_id: f.dataset.partido, jugador_id: d.jugador_id, equipo_id: j.equipo_id, tipo: d.tipo, minuto: numONull(d.minuto) });
    }),
  };
  formularios[tipo]?.();
});

window.addEventListener('hashchange', render);

// ---------- arranque ----------
document.getElementById('nombre-liga').textContent = NOMBRE_LIGA;
iniciar().then(render).catch(e => {
  console.error(e);
  $app.innerHTML = `<div class="card"><h1>No se pudo conectar</h1><p>${esc(e.message)}</p><p class="muted">Revisa js/config.js y que hayas corrido supabase/schema.sql.</p></div>`;
});
