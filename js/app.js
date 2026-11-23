import { db, iniciar, insertar, actualizar, actualizarVarios, borrar, entrar, salir, exportarJSON, importarJSON, reiniciarDemo, guardarPrivado, tokenDe, sincronizar, usuarios } from './db.js';
import { vistaPerfil, vistaCredenciales, estadoPagos, suspensionActiva, folioTxt } from './credenciales.js';
import { vistaCedula } from './cedula.js';
import { unirGrupos, calendarizar, enfrentamientos, acomodarEnJornadas, equilibrarLocalia } from './roundrobin.js';
const claveP = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
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
  pagosAbierto: null,     // jugador con pagos/suspensiones abiertos
  credTodos: false,       // credenciales: incluir sin registro pagado
  cap: null,              // captura de resultado en curso
  pagosEquipo: null,      // equipo con pagos (fianza) abiertos
  vistaPrevia: null,      // partidos generados sin guardar
  usuarios: null,         // panel de control: { cargando, lista, yo, error }
  passDe: null,           // usuario al que se le cambia la contraseña
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
const ramaDe = t => (/femen/i.test(`${t.nombre} ${t.categoria || ''}`) ? 'femenil' : 'varonil');
const torneosDe = rama => D().torneos.filter(t => !rama || ramaDe(t) === rama);
// Torneo seleccionado, limitado a la rama (varonil/femenil) que se está viendo.
const torneo = (rama = st.rama) => {
  const ts = torneosDe(rama);
  return ts.find(t => t.id === st.torneoId) || ts[0] || null;
};
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
function ruta() {
  const h = location.hash;
  if (h.startsWith('#/admin')) return 'admin';
  if (h.startsWith('#/j/')) return 'perfil';
  if (h.startsWith('#/credenciales/')) return 'credenciales';
  if (h.startsWith('#/cedula/')) return 'cedula';
  if (h.startsWith('#/varonil')) return 'varonil';
  if (h.startsWith('#/femenil')) return 'femenil';
  return 'inicio';
}

function render() {
  const r = ruta();
  st.rama = r === 'varonil' || r === 'femenil' ? r : null;
  const t = torneo();
  if (t) st.torneoId = t.id;
  document.body.dataset.tema = st.rama || (r === 'admin' ? 'admin' : 'inicio');
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('activo', a.dataset.nav === r));
  pintarSesion(r);
  const aviso = document.getElementById('aviso');
  if (db.modo === 'demo') {
    aviso.hidden = false;
    aviso.textContent = 'Modo demo: los datos se guardan solo en este navegador. Conecta Supabase (ver LEEME) para guardarlos en la nube y publicarlos.';
  } else aviso.hidden = true;
  if (r === 'perfil') { $app.innerHTML = vistaPerfil(decodeURIComponent(location.hash.slice(4))); return; }
  if (r === 'cedula') { $app.innerHTML = db.esAdmin ? vistaCedula(location.hash.slice('#/cedula/'.length)) : vistaAdmin(); return; }
  if (r === 'credenciales') {
    $app.innerHTML = db.esAdmin ? vistaCredenciales(location.hash.slice('#/credenciales/'.length), st.credTodos) : vistaAdmin();
    return;
  }
  $app.innerHTML = r === 'admin' ? vistaAdmin() : r === 'inicio' ? vistaInicio() : vistaPublica();
}

function selectorTorneo() {
  const ts = torneosDe(st.rama);
  if (ts.length < 2) return '';
  return `<select data-cambio="torneo" style="max-width:320px">${ts.map(t =>
    `<option value="${t.id}" ${t.id === st.torneoId ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select>`;
}

function tabs(lista, actual, clave) {
  return `<div class="tabs">${lista.map(([id, txt]) =>
    `<button data-act="tab" data-clave="${clave}" data-id="${id}" class="${id === actual ? 'activo' : ''}">${txt}</button>`).join('')}</div>`;
}

// ================= VISTA PÚBLICA =================
const LIGAS = {
  varonil: { nombre: 'Liga Juvenil Varonil', logo: 'img/logo-varonil.png' },
  femenil: { nombre: 'Liga Juvenil Femenil', logo: 'img/logo-femenil.png' },
};

function cifrasDe(rama) {
  const ts = new Set(torneosDe(rama).filter(t => t.activo !== false).map(t => t.id));
  const eqs = D().equipos.filter(e => ts.has(e.torneo_id));
  const eqIds = new Set(eqs.map(e => e.id));
  const ps = D().partidos.filter(p => ts.has(p.torneo_id));
  const psIds = new Set(ps.map(p => p.id));
  return {
    equipos: eqs.length,
    jugadores: D().jugadores.filter(j => eqIds.has(j.equipo_id) && j.activo !== false).length,
    jugados: ps.filter(p => p.estado === 'jugado').length,
    goles: D().eventos.filter(e => e.tipo === 'gol' && psIds.has(e.partido_id)).length,
  };
}

function vistaInicio() {
  const tarjetaLiga = rama => {
    const L = LIGAS[rama], c = cifrasDe(rama), hay = torneosDe(rama).length > 0;
    return `<a class="liga-card liga-${rama}" href="#/${rama}">
      <img src="${L.logo}" alt="Logo ${L.nombre}" width="220" height="220">
      <h2>${L.nombre}</h2>
      ${hay ? `<div class="cifras"><div><b>${c.equipos}</b><span>equipos</span></div><div><b>${c.jugadores}</b><span>jugadores</span></div>
        <div><b>${c.jugados}</b><span>partidos jugados</span></div><div><b>${c.goles}</b><span>goles</span></div></div>`
        : `<p class="muted">Muy pronto: inscripciones y calendario.</p>`}
      <span class="liga-btn">Ver estadísticas →</span></a>`;
  };
  return `<section class="hero">
      <p class="hero-pre">Dirección de Ligas Juveniles · Teocaltiche, Jalisco</p>
      <h1>Bienvenido a la <span class="hero-f7">Liga Fútbol&nbsp;7</span></h1>
      <p class="hero-sub">Las ligas juveniles municipales de fútbol rápido de Teocaltiche. Aquí encuentras el calendario, los resultados, la tabla de posiciones y el goleo de cada liga, siempre al día.</p>
    </section>
    <section class="ligas">${tarjetaLiga('varonil')}${tarjetaLiga('femenil')}</section>
    <section class="card info">
      <h2>¿Qué es la Liga F7?</h2>
      <p>La Liga Juvenil de Fútbol 7 es un espacio deportivo comunitario de Teocaltiche para adolescentes y jóvenes de <b>11 a 17 años</b>. Nació para promover la convivencia sana, la actividad física y el juego limpio, y para alejar a los jóvenes de las adicciones y la violencia.</p>
      <p>La temporada 2026–2027 es la primera tras el re-empastado de la cancha, con dos ligas: la <b class="t-varonil">varonil</b> y la <b class="t-femenil">femenil</b>.</p>
      <div class="datos">
        <div><span class="ico">📍</span><b>Sede</b><span>Cancha de Fútbol 7 Lomas<br>Loma Bonita 728, Teocaltiche</span></div>
        <div><span class="ico">🗓️</span><b>Días de juego</b><span>Lunes y martes<br>7:00 a 10:00 pm</span></div>
        <div><span class="ico">⏱️</span><b>Partidos</b><span>Dos tiempos de 25 minutos<br>7 por lado (6 + portero)</span></div>
        <div><span class="ico">🛡️</span><b>Requisitos</b><span>Espinilleras desde el primer partido<br>Uniforme desde la jornada 5</span></div>
      </div>
    </section>`;
}

function vistaPublica() {
  const t = torneo();
  const L = LIGAS[st.rama];
  if (!t) return `<div class="card vacio proximamente"><img src="${L.logo}" alt="" width="160" height="160"><h1>${L.nombre}</h1>
    <p>Muy pronto publicaremos aquí el calendario, la tabla y el goleo de esta liga.</p><a class="btn" href="#/">Volver al inicio</a></div>`;
  const cab = `<div class="liga-cab"><img src="${L.logo}" alt="" width="72" height="72"><div style="flex:1;min-width:200px"><div class="hero-pre">${L.nombre}</div><h1>${esc(t.nombre)}</h1>
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
  const ps = partidosDe(t.id).filter(p => p.estado !== 'borrador');
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
  const ROLES = { admin: 'Administrador', finanzas: 'Finanzas', captura: 'Captura de resultados' };
  const cab = `<div class="fila entre"><h1>Administrar${t ? ': ' + esc(t.nombre) : ''} <span class="badge">${ROLES[db.rol] || ''}</span></h1><div class="fila">${selectorTorneo()}
</div></div>`;
  const porRol = {
    admin: t ? [['resultados', 'Capturar juegos'], ['equipos', 'Equipos y jugadores'], ['generar', 'Generar jornadas'], ['torneos', 'Torneos'], ['usuarios', 'Panel de control'], ['respaldo', 'Respaldo']]
      : [['torneos', 'Torneos'], ['usuarios', 'Panel de control'], ['respaldo', 'Respaldo']],
    captura: t ? [['resultados', 'Capturar juegos']] : [],
    finanzas: t ? [['equipos', 'Equipos y jugadores']] : [],
  };
  const lista = porRol[db.rol] || [];
  if (!lista.length) return cab + `<div class="card vacio">Todavía no hay torneos.</div>`;
  if (!lista.some(([id]) => id === st.tabAdmin)) st.tabAdmin = lista[0][0];
  const cuerpo = { resultados: admResultados, equipos: admEquipos, generar: admGenerar, torneos: admTorneos, usuarios: admUsuarios, respaldo: admRespaldo }[st.tabAdmin](t);
  const avisoRoles = db.faltaRoles && db.rol === 'admin' ? `<div class="card" style="border-color:#f5c518"><b>Falta un paso en Supabase:</b> para los usuarios de finanzas y captura, y las jornadas en borrador, corre <code>supabase/migracion-003-roles-borrador.sql</code>.</div>` : '';
  const aviso = avisoRoles + (db.faltaMigracion ? `<div class="card" style="border-color:#f5c518"><b>Falta un paso en Supabase:</b> para usar credenciales, pagos y suspensiones corre una vez el archivo <code>supabase/migracion-002-credenciales.sql</code> en Supabase &gt; SQL Editor.</div>` : '');
  return cab + aviso + tabs(lista, st.tabAdmin, 'tabAdmin') + cuerpo;
}

// ----- Torneos -----
function formTorneo(t = {}) {
  const v = k => esc(t[k] ?? '');
  return `<form data-form="torneo" data-id="${t.id || ''}"><div class="form-grid">
    <div class="campo" style="grid-column:1/-1"><label>Nombre del torneo (si dice "Femenil", sale en la pestaña Fútbol femenil; si no, en Fútbol varonil)</label><input name="nombre" required value="${v('nombre')}" placeholder="Ej. Liga Juvenil Femenil – Apertura 2026"></div>
    <div class="campo"><label>Categoría</label><input name="categoria" value="${v('categoria')}" placeholder="Juvenil, Libre, Veteranos…"></div>
    <div class="campo"><label>Temporada</label><input name="temporada" value="${v('temporada')}" placeholder="2026-2027"></div>
    <div class="campo"><label>Sede</label><input name="sede" value="${v('sede')}" placeholder="Cancha F7 Lomas"></div>
    <div class="campo"><label>Puntos por victoria</label><input name="pts_victoria" type="number" min="0" value="${t.pts_victoria ?? 3}"></div>
    <div class="campo"><label>Puntos por empate</label><input name="pts_empate" type="number" min="0" value="${t.pts_empate ?? 1}"></div>
    <div class="campo"><label>Multa amarilla ($)</label><input name="multa_amarilla" type="number" min="0" value="${t.multa_amarilla ?? 30}"></div>
    <div class="campo"><label>Multa roja ($)</label><input name="multa_roja" type="number" min="0" value="${t.multa_roja ?? 50}"></div>
    <div class="campo"><label>Multa azul ($)</label><input name="multa_azul" type="number" min="0" value="${t.multa_azul ?? 10}"></div>
    <div class="campo"><label>Registro por jugador ($)</label><input name="cuota_registro" type="number" min="0" value="${t.cuota_registro ?? 50}"></div>
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
    const esAdm = db.rol === 'admin';
    const botones = `<button class="btn sec chico" type="button" data-act="plantilla" data-id="${e.id}">${abierto ? 'Ocultar' : 'Ver'} jugadores (${js.length})</button>
      ${db.faltaMigracion ? '' : `<button class="btn sec chico" type="button" data-act="pagos-equipo" data-id="${e.id}">Fianza y pagos del equipo</button>
      <a class="btn sec chico" href="#/credenciales/${e.id}">🪪 Credenciales</a>`}`;
    return `<div class="card">
      ${esAdm ? '' : `<div class="fila entre"><h3 style="margin:0">${esc(e.nombre)}</h3><div class="fila">${botones}</div></div>`}
      ${db.faltaMigracion ? '' : resumenEquipo(e)}
      ${st.pagosEquipo === e.id ? panelPagosEquipo(e) : ''}
      ${!esAdm ? '' : `<form data-form="equipo" data-id="${e.id}"><div class="form-grid">
        <div class="campo"><label>Equipo</label><input name="nombre" required value="${esc(e.nombre)}"></div>
        <div class="campo"><label>Grupo (opcional)</label><input name="grupo" value="${esc(e.grupo || '')}" placeholder="A, B…"></div>
        <div class="campo"><label>Delegado</label><input name="delegado" value="${esc(e.delegado || '')}"></div>
        <div class="campo"><label>Teléfono</label><input name="telefono" value="${esc(e.telefono || '')}"></div>
      </div><div class="fila"><button class="btn chico" type="submit">Guardar</button>
      ${botones}
      <button class="btn peligro chico" type="button" data-act="borrar-equipo" data-id="${e.id}">Borrar equipo</button></div></form>`}
      ${abierto ? `<h3>Jugadores</h3>
        ${js.length ? `<div class="tabla-wrap"><table><thead><tr><th>Núm.</th><th class="izq">Nombre</th><th class="izq">CURP (privado)</th><th>Nacimiento (privado)</th><th class="izq">Revisión</th><th class="izq">Credencial y pagos</th><th>Activo</th><th></th></tr></thead><tbody>
        ${js.map(j => filaJugador(j, priv.get(j.id) || {}, t)).join('')}
        </tbody></table></div>` : '<p class="muted">Sin jugadores todavía.</p>'}
        ${!esAdm ? '' : `<form data-form="jugador" data-equipo="${e.id}" style="margin-top:10px"><div class="form-grid">
          <div class="campo"><label>Nombre completo</label><input name="nombre" required></div>
          <div class="campo"><label>Número</label><input name="numero" type="number" min="0"></div>
          <div class="campo"><label>CURP (privado)</label><input name="curp" maxlength="18" style="text-transform:uppercase"></div>
          <div class="campo"><label>Fecha de nacimiento (privado)</label><input name="fecha_nac" type="date"></div>
        </div><button class="btn chico" type="submit">Agregar jugador</button></form>
        <form data-form="jugadores-lote" data-equipo="${e.id}" style="margin-top:10px">
          <label>Agregar varios a la vez: uno por renglón, "número, nombre" (el número es opcional)</label>
          <textarea name="lista" rows="3" placeholder="10, Juan Pérez López&#10;7, Luis García"></textarea>
          <button class="btn sec chico" type="submit" style="margin-top:6px">Agregar lista</button></form>`}` : ''}
    </div>`;
  }).join('');
  return `${db.rol !== 'admin' ? '' : `<div class="card"><h2 style="margin-top:0">Nuevo equipo</h2>
    <form data-form="equipo-nuevo"><div class="form-grid">
      <div class="campo"><label>Nombre del equipo</label><input name="nombre" required></div>
      <div class="campo"><label>Grupo (opcional)</label><input name="grupo" placeholder="A, B…"></div>
      <div class="campo"><label>Delegado</label><input name="delegado"></div>
      <div class="campo"><label>Teléfono</label><input name="telefono"></div>
    </div><button class="btn" type="submit">Agregar equipo</button></form></div>`}
    ${resumenRevision(t, eqs, priv)}
    <p class="muted">${eqs.length} equipos. La CURP y la fecha de nacimiento solo las ve el administrador; nunca aparecen en la página pública.</p>${tarjetas}`;
}

function resumenEquipo(e) {
  const pg = D().pagos.filter(g => g.equipo_id === e.id && !g.jugador_id);
  const fz = pg.filter(g => g.concepto === 'fianza');
  const fianza = !fz.length ? '<span class="muted">sin registrar</span>'
    : fz.every(g => g.pagado) ? `<b style="color:var(--verde)">$${fz.reduce((a, g) => a + Number(g.monto), 0)} pagada</b>`
    : `<b style="color:#ffd166">$${fz.filter(g => !g.pagado).reduce((a, g) => a + Number(g.monto), 0)} pendiente</b>`;
  const debeEq = pg.filter(g => !g.pagado).reduce((a, g) => a + Number(g.monto), 0);
  const ids = new Set(jugadoresDe(e.id).map(j => j.id));
  const debeJug = D().pagos.filter(g => ids.has(g.jugador_id) && !g.pagado).reduce((a, g) => a + Number(g.monto), 0);
  const sinReg = jugadoresDe(e.id).filter(j => j.activo !== false && !estadoPagos(j).registro).length;
  return `<div class="fila" style="gap:14px;font-size:13px;margin:6px 0 8px">
    <span>Fianza: ${fianza}</span><span>Adeudo del equipo: <b>${debeEq ? '$' + debeEq : 'ninguno'}</b></span>
    <span>Adeudo de jugadores: <b>${debeJug ? '$' + debeJug : 'ninguno'}</b></span><span>Sin registro pagado: <b>${sinReg}</b></span></div>`;
}

function panelPagosEquipo(e) {
  const pg = D().pagos.filter(g => g.equipo_id === e.id && !g.jugador_id).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  return `<div class="card" style="margin:6px 0 10px"><h3 style="margin-top:0">Fianza y pagos de ${esc(e.nombre)}</h3>
    ${pg.length ? `<table><thead><tr><th class="izq">Concepto</th><th>Monto</th><th>Fecha</th><th>Pagado</th><th class="izq">Notas</th><th></th></tr></thead><tbody>
      ${pg.map(g => `<tr><td class="izq">${CONCEPTOS[g.concepto] || g.concepto}</td><td>$${g.monto}</td><td>${esc(g.fecha || '')}</td>
        <td><input type="checkbox" data-act="pago-pagado" data-id="${g.id}" ${g.pagado ? 'checked' : ''}></td><td class="izq">${esc(g.notas || '')}</td>
        <td><button class="btn peligro chico" data-act="borrar-pago" data-id="${g.id}">x</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Sin cargos del equipo.</p>'}
    <form data-form="pago-equipo" data-equipo="${e.id}" style="margin-top:8px"><div class="form-grid">
      <div class="campo"><label>Concepto</label><select name="concepto">${['fianza', 'inscripcion', 'arbitraje', 'otro'].map(k => `<option value="${k}">${CONCEPTOS[k]}</option>`).join('')}</select></div>
      <div class="campo"><label>Monto ($)</label><input name="monto" type="number" min="0" required></div>
      <div class="campo"><label>Notas</label><input name="notas" placeholder="Ej. fianza temporada 2026-27"></div>
      <div class="campo"><label style="display:flex;gap:5px;align-items:center"><input type="checkbox" name="pagado"> Ya pagado</label><button class="btn chico" type="submit">Agregar cargo</button></div>
    </div></form></div>`;
}

function filaJugador(j, p, t) {
  if (st.jugadorEditando === j.id) {
    const f = `form="ej-${j.id}"`;
    return `<tr><td><input ${f} class="num" name="numero" type="number" min="0" value="${j.numero ?? ''}"></td>
      <td class="izq"><input ${f} name="nombre" required value="${esc(j.nombre)}" style="min-width:180px"></td>
      <td class="izq"><input ${f} name="curp" maxlength="18" value="${esc(p.curp || '')}" style="text-transform:uppercase;min-width:190px"></td>
      <td><input ${f} name="fecha_nac" type="date" value="${esc(p.fecha_nac || '')}"></td>
      <td class="izq muted" style="white-space:normal;font-size:12px">Si dejas la fecha vacía se toma la de la CURP.</td>
      <td></td><td></td>
      <td><form id="ej-${j.id}" data-form="jugador-editar" data-id="${j.id}" class="fila" style="flex-wrap:nowrap">
        <button class="btn chico" type="submit">Guardar</button><button class="btn sec chico" type="button" data-act="editar-jugador" data-id="">Cancelar</button></form></td></tr>`;
  }
  const avisos = revisarJugador(p, t.categoria);
  return `<tr><td>${j.numero ?? ''}</td><td class="izq">${esc(j.nombre)}</td><td class="izq">${esc(p.curp || '')}</td><td>${esc(p.fecha_nac || '')}</td>
    <td class="izq" style="white-space:normal;font-size:12px;${avisos.length ? 'color:var(--rojo)' : 'color:var(--verde)'}">${avisos.length ? avisos.map(esc).join('<br>') : '✓ OK'}</td>
    <td class="izq">${celdaCredencial(j)}</td>
    <td><input type="checkbox" data-act="activo-jugador" data-id="${j.id}" ${j.activo !== false ? 'checked' : ''} ${db.rol === 'admin' ? '' : 'disabled'}></td>
    <td class="fila" style="flex-wrap:nowrap">${db.rol === 'admin' ? `<button class="btn sec chico" data-act="editar-jugador" data-id="${j.id}">Editar</button>
    <button class="btn peligro chico" data-act="borrar-jugador" data-id="${j.id}">Quitar</button>` : ''}</td></tr>
    ${st.pagosAbierto === j.id ? `<tr><td colspan="8" class="izq" style="white-space:normal">${panelPagos(j, t)}</td></tr>` : ''}`;
}

function celdaCredencial(j) {
  if (db.faltaMigracion) return '<span class="muted" style="font-size:12px">Falta migración</span>';
  const pg = estadoPagos(j), susp = suspensionActiva(j);
  return `<div style="display:flex;flex-direction:column;gap:3px;font-size:12px">
    <label style="margin:0;display:flex;gap:5px;align-items:center;color:inherit"><input type="checkbox" data-act="registro" data-id="${j.id}" ${pg.registro ? 'checked' : ''}> Registro pagado</label>
    <label style="margin:0;display:flex;gap:5px;align-items:center;color:inherit"><input type="checkbox" data-act="docs" data-id="${j.id}" ${j.docs_verificados ? 'checked' : ''}> Docs verificados</label>
    <span>${pg.adeudo ? `<b style="color:#ffd166">Debe $${pg.adeudo}</b>` : '<span style="color:var(--verde)">Sin adeudo</span>'}${susp ? ` · <b style="color:var(--rojo)">Susp. ${susp.restantes}</b>` : ''} · ${folioTxt(j)}</span>
    <div class="fila" style="gap:4px;flex-wrap:nowrap"><button class="btn sec chico" data-act="pagos" data-id="${j.id}">Pagos</button>
      <button class="btn sec chico" data-act="ver-perfil" data-id="${j.id}">Perfil</button>
      <a class="btn sec chico" href="#/credenciales/j/${j.id}">Imprimir</a></div></div>`;
}

const CONCEPTOS = { registro: 'Registro', inscripcion: 'Inscripción', arbitraje: 'Arbitraje', multa: 'Multa', fianza: 'Fianza', otro: 'Otro' };
function panelPagos(j, t) {
  const pg = D().pagos.filter(g => g.jugador_id === j.id).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const ss = D().suspensiones.filter(x => x.jugador_id === j.id);
  const susp = suspensionActiva(j);
  return `<div class="card" style="margin:6px 0">
    <h3 style="margin-top:0">Pagos y adeudos de ${esc(j.nombre)}</h3>
    ${pg.length ? `<table><thead><tr><th class="izq">Concepto</th><th>Monto</th><th>Fecha</th><th>Pagado</th><th class="izq">Notas</th><th></th></tr></thead><tbody>
      ${pg.map(g => `<tr><td class="izq">${CONCEPTOS[g.concepto] || g.concepto}</td><td>$${g.monto}</td><td>${esc(g.fecha || '')}</td>
        <td><input type="checkbox" data-act="pago-pagado" data-id="${g.id}" ${g.pagado ? 'checked' : ''}></td><td class="izq">${esc(g.notas || '')}</td>
        <td><button class="btn peligro chico" data-act="borrar-pago" data-id="${g.id}">x</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Sin cargos.</p>'}
    <form data-form="pago" data-jugador="${j.id}" style="margin-top:8px"><div class="form-grid">
      <div class="campo"><label>Concepto</label><select name="concepto">${Object.entries(CONCEPTOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="campo"><label>Monto ($)</label><input name="monto" type="number" min="0" required></div>
      <div class="campo"><label>Notas</label><input name="notas"></div>
      <div class="campo"><label style="display:flex;gap:5px;align-items:center"><input type="checkbox" name="pagado"> Ya pagado</label><button class="btn chico" type="submit">Agregar cargo</button></div>
    </div></form>
    <h3>Suspensiones ${susp ? `<span class="badge" style="background:rgba(255,80,80,.3)">vigente: faltan ${susp.restantes}</span>` : ''}</h3>
    ${ss.length ? `<ul style="margin:0 0 8px;padding-left:18px">${ss.map(x => `<li>${x.partidos} partido(s) · ${esc(x.motivo || '')} · desde ${esc(x.fecha || '')}
      <button class="btn peligro chico" data-act="borrar-susp" data-id="${x.id}">x</button></li>`).join('')}</ul>` : '<p class="muted">Sin suspensiones.</p>'}
    <form data-form="suspension" data-jugador="${j.id}"><div class="form-grid">
      <div class="campo"><label>Partidos de suspensión</label><input name="partidos" type="number" min="1" value="1" required></div>
      <div class="campo"><label>Motivo</label><input name="motivo" placeholder="Ej. agresión verbal"></div>
      <div class="campo"><button class="btn chico" type="submit">Agregar suspensión</button></div>
    </div></form>
    <p class="muted" style="font-size:12px">Las multas por tarjeta y las suspensiones por roja o doble amarilla se crean solas al capturar el partido. La suspensión se da por cumplida cuando su equipo juega esos partidos.</p>
  </div>`;
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
function siguienteLunes(desdeISO) {
  const d = desdeISO ? new Date(desdeISO + 'T12:00:00') : new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function admGenerar(t) {
  const eqs = equiposDe(t.id);
  const ps = partidosDe(t.id);
  const publicados = ps.filter(p => p.estado !== 'borrador');
  const borradores = ps.filter(p => p.estado === 'borrador');
  const cuenta = enfrentamientos(ps);
  let faltanIda = 0;
  for (let i = 0; i < eqs.length; i++) for (let k = i + 1; k < eqs.length; k++) if (!cuenta.get(claveP(eqs[i].id, eqs[k].id))) faltanIda++;
  const maxJ = Math.max(0, ...ps.map(p => p.jornada));
  const ultimaFecha = ps.map(p => p.fecha).filter(Boolean).sort().pop();
  const gs = grupos(eqs);
  const eq = mapa(eqs);
  const porJ = new Map();
  borradores.forEach(p => { if (!porJ.has(p.jornada)) porJ.set(p.jornada, []); porJ.get(p.jornada).push(p); });
  const htmlBorr = borradores.length ? `<div class="card" style="border-color:#f5c518">
      <div class="fila entre"><h2 style="margin:0">Borradores: ${porJ.size} jornadas, ${borradores.length} partidos</h2>
        <div class="fila"><button class="btn" data-act="publicar-todo">Publicar todas</button><button class="btn peligro" data-act="borrar-borradores">Borrar borradores</button></div></div>
      <p class="muted">Nadie más las ve hasta que las publiques. Revisa y corrige fechas y horarios; con ⇄ cambias quién es local.</p>
      ${[...porJ.entries()].map(([j, l]) => `<div class="card" style="margin:10px 0"><div class="fila entre"><h3 style="margin:0">Jornada ${j}</h3>
          <button class="btn chico" data-act="publicar-jornada" data-j="${j}">Publicar jornada ${j}</button></div>
        <div class="tabla-wrap"><table><tbody>${l.map(p => `<tr>
          <td class="izq">${esc(eq.get(p.local_id)?.nombre)}</td><td><button class="btn sec chico" data-act="b-invertir" data-id="${p.id}" title="Cambiar localía">⇄</button></td>
          <td class="izq">${esc(eq.get(p.visita_id)?.nombre)}</td>
          <td><input type="date" value="${esc(p.fecha || '')}" data-cambio="b-fecha" data-id="${p.id}"></td>
          <td><input type="time" value="${esc(p.hora || '')}" data-cambio="b-hora" data-id="${p.id}"></td>
          <td><button class="btn peligro chico" data-act="borrar-partido" data-id="${p.id}">x</button></td></tr>`).join('')}</tbody></table></div></div>`).join('')}
    </div>` : '';
  return `<div class="card"><h2 style="margin-top:0">Generar jornadas que faltan</h2>
    <p class="muted">${eqs.length} equipos · ${publicados.length} partidos publicados hasta la jornada ${Math.max(0, ...publicados.map(p => p.jornada))}.
      ${faltanIda ? `Faltan <b>${faltanIda}</b> cruces de la ida (equipos que todavía no se enfrentan).` : 'Ya se enfrentaron todos en la ida.'}
      Se arman jornadas con rivales que no se han enfrentado y, si marcas la vuelta, después se repite todo con la localía invertida. Todo queda en <b>borrador</b> hasta que lo publiques.</p>
    <form data-form="generar"><div class="form-grid">
      <div class="campo"><label>Fecha de la primera jornada nueva</label><input name="inicio" type="date" required value="${siguienteLunes(ultimaFecha)}"></div>
      <div class="campo"><label>Horarios (separados por coma)</label><input name="horas" value="19:00, 20:00, 21:00"></div>
      <div class="campo"><label>Cancha</label><input name="cancha" value="${esc(t.sede || '')}"></div>
      <div class="campo"><label>Semanas entre jornadas</label><input name="semanas" type="number" min="1" value="1"></div>
    </div>
    <div class="campo"><label>Días de juego</label><div class="chips">${DIAS.map((d, i) => `<label><input type="checkbox" name="dias" value="${i}" ${i === 1 || i === 2 ? 'checked' : ''}> ${d}</label>`).join('')}</div></div>
    <div class="chips" style="margin-bottom:12px">
      <label><input type="checkbox" name="vuelta" checked> Incluir la vuelta</label>
      ${gs.length ? `<label><input type="checkbox" name="porGrupo" checked> Solo partidos dentro de cada grupo</label>` : ''}
    </div>
    <button class="btn" type="submit" ${eqs.length < 2 ? 'disabled' : ''}>Generar en borrador</button>
    <span class="muted" style="margin-left:8px;font-size:13px">Las nuevas empiezan en la jornada ${maxJ + 1}.</span></form></div>
    ${htmlBorr}
    <div class="card"><h2 style="margin-top:0">Agregar un partido suelto</h2>
      <form data-form="partido-manual"><div class="form-grid">
        <div class="campo"><label>Jornada</label><input name="jornada" type="number" min="1" required value="${Math.max(1, maxJ)}"></div>
        <div class="campo"><label>Local</label><select name="local_id" required>${eqs.map(e => `<option value="${e.id}">${esc(e.nombre)}</option>`).join('')}</select></div>
        <div class="campo"><label>Visitante</label><select name="visita_id" required>${eqs.map((e, i) => `<option value="${e.id}" ${i === 1 ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></div>
        <div class="campo"><label>Fecha</label><input name="fecha" type="date"></div>
        <div class="campo"><label>Hora</label><input name="hora" type="time"></div>
      </div><button class="btn" type="submit">Agregar partido</button></form></div>`;
}

function generarJornadas(f, d) {
  const fd = new FormData(f);
  const dias = fd.getAll('dias').map(Number);
  const horas = d.horas.split(',').map(h => h.trim()).filter(h => /^\d{1,2}:\d{2}$/.test(h)).map(h => h.padStart(5, '0'));
  if (!dias.length || !horas.length) { toast('Elige al menos un día y un horario válido (ej. 19:00)', true); return; }
  const eqs = equiposDe(st.torneoId);
  const gs = grupos(eqs);
  const ps = partidosDe(st.torneoId);
  const cuenta = enfrentamientos(ps);
  let bloques = [eqs];
  if (gs.length && fd.has('porGrupo')) {
    const sinGrupo = eqs.filter(e => !(e.grupo || '').trim());
    if (sinGrupo.length) { toast(`Hay equipos sin grupo: ${sinGrupo.map(e => e.nombre).join(', ')}`, true); return; }
    bloques = gs.map(g => eqs.filter(e => e.grupo.trim() === g));
  }
  const paresDe = (be, filtro) => {
    const r = [];
    for (let i = 0; i < be.length; i++) for (let k = i + 1; k < be.length; k++) if (filtro(be[i].id, be[k].id)) r.push([be[i].id, be[k].id]);
    return r;
  };
  // 1) Ida: parejas que nunca se han enfrentado.
  const ida = equilibrarLocalia(unirGrupos(bloques.map(be => acomodarEnJornadas(paresDe(be, (a, b) => !cuenta.get(claveP(a, b))), be.length))), ps);
  // 2) Vuelta: todas las parejas otra vez con la localía invertida.
  let vuelta = [];
  if (fd.has('vuelta')) {
    const yaDoble = [...cuenta.values()].some(v => v >= 2);
    if (!yaDoble) {
      const porJ = new Map();
      ps.slice().sort((a, b) => a.jornada - b.jornada).forEach(p => { if (!porJ.has(p.jornada)) porJ.set(p.jornada, []); porJ.get(p.jornada).push([p.local_id, p.visita_id]); });
      vuelta = [...porJ.values(), ...ida].map(j => j.map(([a, b]) => [b, a]));
    } else {
      const previo = new Map();
      ps.forEach(p => previo.set(claveP(p.local_id, p.visita_id), [p.local_id, p.visita_id]));
      ida.flat().forEach(([a, b]) => previo.set(claveP(a, b), [a, b]));
      const pares = [];
      bloques.forEach(be => paresDe(be, (a, b) => (cuenta.get(claveP(a, b)) || 0) + (ida.flat().some(([x, y]) => claveP(x, y) === claveP(a, b)) ? 1 : 0) === 1)
        .forEach(([a, b]) => { const [l, v] = previo.get(claveP(a, b)); pares.push([v, l]); }));
      vuelta = acomodarEnJornadas(pares, eqs.length);
    }
  }
  const todas = [...ida, ...vuelta];
  if (!todas.length) { toast('No hay cruces pendientes por generar.'); return; }
  const maxJ = Math.max(0, ...ps.map(p => p.jornada));
  const nuevos = calendarizar(todas, { inicio: d.inicio, dias, horas, cancha: d.cancha, semanasEntreJornadas: Number(d.semanas) || 1, jornadaInicial: maxJ + 1 });
  seguro(async () => {
    await insertar('partidos', nuevos.map(p => ({ ...p, torneo_id: st.torneoId, estado: 'borrador' })));
    toast(`${todas.length} jornadas (${nuevos.length} partidos) creadas en borrador`);
  });
}

// ----- Capturar juegos -----
const TIPOS = ['gol', 'amarilla', 'roja', 'azul'];
const MAX_TIPO = { gol: 30, amarilla: 2, roja: 1, azul: 5 };

function admResultados(t) {
  if (st.cap) return pantallaCaptura();
  const ps = partidosDe(t.id).filter(p => p.estado !== 'borrador');
  if (!ps.length) return `<div class="card vacio">No hay partidos publicados.${db.rol === 'admin' ? ' Ve a "Generar jornadas".' : ''}</div>`;
  const eq = mapa(equiposDe(t.id));
  const hoy = hoyISO();
  const pend = ps.filter(p => p.estado === 'programado').sort((a, b) => String(a.fecha || '9').localeCompare(String(b.fecha || '9')) || String(a.hora || '').localeCompare(String(b.hora || '')));
  const porCapturar = pend.filter(p => !p.fecha || p.fecha <= hoy);
  const lista = porCapturar.length ? porCapturar : pend.slice(0, 5);
  const filaPend = p => `<div class="fila entre" style="padding:8px 0;border-bottom:1px solid var(--borde)">
      <div><b>${esc(eq.get(p.local_id)?.nombre)}</b> vs <b>${esc(eq.get(p.visita_id)?.nombre)}</b>
      <div class="muted" style="font-size:13px">Jornada ${p.jornada} · ${p.fecha === hoy ? '<b style="color:var(--verde)">HOY</b>' : fmtFecha(p.fecha)} ${fmtHora(p.hora)}</div></div>
      <div class="fila"><a class="btn sec" href="#/cedula/${p.id}">📝 Crear cédula</a><button class="btn" data-act="capturar" data-id="${p.id}">Capturar resultado</button></div></div>`;
  const cabPend = lista.length ? `<div class="card"><h2 style="margin-top:0">${porCapturar.length ? `Por capturar (${porCapturar.length})` : 'Próximos juegos'}</h2>${lista.map(filaPend).join('')}</div>` : '';
  const jornadas = [...new Set(ps.map(p => p.jornada))];
  if (!jornadas.includes(st.jornadaAdmin)) st.jornadaAdmin = (pend[0] || ps[ps.length - 1]).jornada;
  const enJ = ps.filter(p => p.jornada === st.jornadaAdmin);
  const selJ = `<div class="fila" style="margin:6px 0 10px"><h2 style="margin:0">Todos los juegos</h2><select data-cambio="jornada" style="width:auto">${jornadas.map(j =>
    `<option value="${j}" ${j === st.jornadaAdmin ? 'selected' : ''}>Jornada ${j}${ps.filter(p => p.jornada === j).every(p => p.estado === 'jugado') ? ' ✓' : ''}</option>`).join('')}</select></div>`;
  return cabPend + selJ + enJ.map(p => {
    const L = eq.get(p.local_id), V = eq.get(p.visita_id);
    const evs = D().eventos.filter(e => e.partido_id === p.id);
    const goles = evs.filter(e => e.tipo === 'gol').length, tarj = evs.length - goles;
    return `<div class="card">
      <div class="fila" style="justify-content:center;font-weight:600;gap:12px">
        <span style="flex:1;text-align:right;min-width:90px">${esc(L?.nombre)}</span>
        <span class="marcador">${p.estado === 'jugado' ? `${p.goles_local} – ${p.goles_visita}` : 'vs'}</span>
        <span style="flex:1;min-width:90px">${esc(V?.nombre)}</span></div>
      <div class="muted" style="text-align:center;font-size:13px;margin:4px 0 8px">${fmtFecha(p.fecha)} ${fmtHora(p.hora)} · ${p.estado}${evs.length ? ` · ${goles} goles y ${tarj} tarjetas capturados` : ''}</div>
      <div class="fila" style="justify-content:center">${p.estado === 'jugado' ? '' : `<a class="btn sec" href="#/cedula/${p.id}">📝 Crear cédula</a>`}<button class="btn" data-act="capturar" data-id="${p.id}">${p.estado === 'jugado' ? 'Corregir resultado' : 'Capturar resultado'}</button>
        <button class="btn sec chico" data-act="detalles" data-id="${p.id}">${st.abierto === p.id ? 'Ocultar' : 'Fecha, estado y notas'}</button>
        ${db.rol === 'admin' ? `<button class="btn peligro chico" data-act="borrar-partido" data-id="${p.id}">Borrar</button>` : ''}</div>
      ${st.abierto === p.id ? `<form data-form="resultado" data-id="${p.id}" style="margin-top:10px">
        <div class="form-grid">
          <div class="campo"><label>Goles ${esc(L?.nombre)}</label><input name="goles_local" type="number" min="0" value="${p.goles_local ?? ''}"></div>
          <div class="campo"><label>Goles ${esc(V?.nombre)}</label><input name="goles_visita" type="number" min="0" value="${p.goles_visita ?? ''}"></div>
          <div class="campo"><label>Fecha</label><input name="fecha" type="date" value="${esc(p.fecha || '')}"></div>
          <div class="campo"><label>Hora</label><input name="hora" type="time" value="${esc(p.hora || '')}"></div>
          <div class="campo"><label>Estado</label><select name="estado">${['programado', 'jugado', 'suspendido'].map(s => `<option ${s === p.estado ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
          <div class="campo"><label>Notas</label><input name="notas" value="${esc(p.notas || '')}" placeholder="Ej. ganado por default"></div>
        </div><button class="btn chico" type="submit">Guardar</button></form>` : ''}
    </div>`;
  }).join('');
}

function abrirCaptura(id) {
  const p = D().partidos.find(x => x.id === id);
  const c = {};
  D().eventos.filter(e => e.partido_id === id).forEach(e => { (c[e.jugador_id] ||= { gol: 0, amarilla: 0, roja: 0, azul: 0 })[e.tipo]++; });
  const golesEv = eqId => D().eventos.filter(e => e.partido_id === id && e.tipo === 'gol' && e.equipo_id === eqId).length;
  const manual = p.estado === 'jugado' && (Number(p.goles_local) !== golesEv(p.local_id) || Number(p.goles_visita) !== golesEv(p.visita_id));
  st.cap = { id, c, manual, gl: p.goles_local ?? 0, gv: p.goles_visita ?? 0 };
  window.scrollTo?.(0, 0);
}

function marcadorCaptura(p) {
  const cap = st.cap;
  if (cap.manual) return [Number(cap.gl) || 0, Number(cap.gv) || 0];
  const suma = eqId => jugadoresDe(eqId).reduce((a, j) => a + (cap.c[j.id]?.gol || 0), 0);
  return [suma(p.local_id), suma(p.visita_id)];
}

function pantallaCaptura() {
  const p = D().partidos.find(x => x.id === st.cap.id);
  if (!p) { st.cap = null; return ''; }
  const eq = mapa(D().equipos);
  const [gl, gv] = marcadorCaptura(p);
  const columna = eqId => {
    const js = jugadoresDe(eqId).filter(j => j.activo !== false || st.cap.c[j.id]);
    return `<div class="card"><h3 style="margin-top:0">${esc(eq.get(eqId)?.nombre)}</h3>
      ${js.length ? `<div class="tabla-wrap"><table class="cap-tabla"><thead><tr><th class="izq">Jugador</th><th>⚽ Goles</th><th><span class="tarjeta amarilla"></span></th><th><span class="tarjeta roja"></span></th><th><span class="tarjeta azul"></span></th></tr></thead><tbody>
      ${js.map(j => { const v = st.cap.c[j.id] || {}; return `<tr><td class="izq"><span class="muted">${j.numero ?? ''}</span> ${esc(j.nombre)}</td>
        ${TIPOS.map(tp => `<td><div class="paso"><button type="button" data-act="cap-menos" data-id="${j.id}" data-tipo="${tp}" ${!v[tp] ? 'disabled' : ''}>−</button>
          <b class="${v[tp] ? 'con' : ''}">${v[tp] || 0}</b><button type="button" data-act="cap-mas" data-id="${j.id}" data-tipo="${tp}">+</button></div></td>`).join('')}</tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muted">Este equipo no tiene jugadores registrados.</p>'}</div>`;
  };
  return `<div class="card cap-cab">
      <div class="muted" style="text-align:center">Jornada ${p.jornada} · ${fmtFecha(p.fecha)} ${fmtHora(p.hora)}</div>
      <div class="cap-marcador"><span>${esc(eq.get(p.local_id)?.nombre)}</span>
        ${st.cap.manual ? `<input class="num" type="number" min="0" value="${gl}" data-cambio="cap-gl"> – <input class="num" type="number" min="0" value="${gv}" data-cambio="cap-gv">`
          : `<b>${gl} – ${gv}</b>`}<span>${esc(eq.get(p.visita_id)?.nombre)}</span></div>
      <label style="display:flex;gap:6px;justify-content:center;align-items:center;margin:6px 0 0"><input type="checkbox" data-act="cap-manual" ${st.cap.manual ? 'checked' : ''}> Ajustar marcador a mano (default o autogol)</label>
    </div>
    <div class="cap-cols">${columna(p.local_id)}${columna(p.visita_id)}</div>
    <div class="fila" style="justify-content:center;margin:10px 0 20px"><button class="btn" data-act="cap-guardar">Guardar resultado</button><button class="btn sec" data-act="cap-cancelar">Cancelar</button></div>
    <p class="muted" style="text-align:center;font-size:13px">Cada tarjeta genera su multa; la roja o la segunda amarilla generan 1 partido de suspensión.</p>`;
}

// Registra un gol o tarjeta, con su multa y suspensión automática.
async function registrarEvento(p, j, tipo) {
  const [ev] = await insertar('eventos', { partido_id: p.id, jugador_id: j.id, equipo_id: j.equipo_id, tipo });
  if (tipo === 'gol' || db.faltaMigracion) return null;
  const tor = D().torneos.find(x => x.id === D().equipos.find(e => e.id === j.equipo_id)?.torneo_id);
  const monto = Number(tor?.['multa_' + tipo] ?? 0);
  const fecha = p.fecha || hoyISO();
  if (monto) await insertar('pagos', { jugador_id: j.id, evento_id: ev.id, concepto: 'multa', monto, pagado: false, fecha, notas: 'Tarjeta ' + tipo });
  const amarillas = D().eventos.filter(x => x.partido_id === p.id && x.jugador_id === j.id && x.tipo === 'amarilla').length;
  const motivo = tipo === 'roja' ? 'Tarjeta roja' : (tipo === 'amarilla' && amarillas === 2 ? 'Doble amarilla' : null);
  if (motivo && !D().suspensiones.some(s => s.jugador_id === j.id && s.partido_id === p.id && s.motivo === motivo)) {
    await insertar('suspensiones', { jugador_id: j.id, partido_id: p.id, partidos: 1, fecha, motivo });
  }
  return motivo;
}

async function guardarCaptura() {
  const p = D().partidos.find(x => x.id === st.cap.id);
  const [gl, gv] = marcadorCaptura(p);
  const js = [...jugadoresDe(p.local_id), ...jugadoresDe(p.visita_id)];
  const avisos = [];
  for (const j of js) {
    for (const tipo of TIPOS) {
      const ex = D().eventos.filter(e => e.partido_id === p.id && e.jugador_id === j.id && e.tipo === tipo);
      const quiero = st.cap.c[j.id]?.[tipo] || 0;
      for (let k = ex.length; k < quiero; k++) { const m = await registrarEvento(p, j, tipo); if (m) avisos.push(`${j.nombre}: ${m}`); }
      if (quiero < ex.length) await borrar('eventos', ex.slice(quiero).map(e => e.id));
    }
    const v = st.cap.c[j.id] || {};
    const quitar = D().suspensiones.filter(s => s.jugador_id === j.id && s.partido_id === p.id &&
      ((s.motivo === 'Tarjeta roja' && !v.roja) || (s.motivo === 'Doble amarilla' && (v.amarilla || 0) < 2)));
    if (quitar.length) await borrar('suspensiones', quitar.map(s => s.id));
  }
  await actualizar('partidos', p.id, { goles_local: gl, goles_visita: gv, estado: 'jugado' });
  st.cap = null;
  toast(`Resultado guardado: ${gl} – ${gv}${avisos.length ? ' · Suspensiones: ' + avisos.join(', ') : ''}`);
}

// ----- Panel de control: usuarios de la mesa de control -----
const CARGOS = { Presidente: 'admin', Secretario: 'captura', 'Tesorero(a)': 'finanzas', Vocal: 'captura', Otro: 'captura' };
const ROL_TXT = { admin: 'Administrador (todo)', finanzas: 'Finanzas (pagos, registro, fianzas, credenciales)', captura: 'Captura de resultados' };

function cargarUsuarios() {
  st.usuarios = { cargando: true, lista: [] };
  usuarios('listar').then(r => { st.usuarios = { lista: r.usuarios, yo: r.yo }; })
    .catch(e => { st.usuarios = { lista: [], error: e.message }; })
    .finally(() => { if (st.tabAdmin === 'usuarios') render(); });
}

function admUsuarios() {
  if (db.modo === 'demo') return `<div class="card vacio">El panel de control de usuarios funciona cuando la página está conectada a Supabase.</div>`;
  if (!st.usuarios) cargarUsuarios();
  const u = st.usuarios;
  const orden = ['Presidente', 'Secretario', 'Tesorero(a)', 'Vocal'];
  const lista = [...u.lista].sort((a, b) => ((orden.indexOf(a.cargo) + 1) || 9) - ((orden.indexOf(b.cargo) + 1) || 9) || String(a.nombre).localeCompare(String(b.nombre), 'es'));
  const opRol = sel => Object.entries(ROL_TXT).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
  const opCargo = sel => Object.keys(CARGOS).map(k => `<option ${k === sel ? 'selected' : ''}>${k}</option>`).join('');
  const filas = lista.map(x => {
    const soyYo = x.user_id === u.yo;
    return `<tr><td class="izq"><b>${esc(x.nombre || '—')}</b>${soyYo ? ' <span class="badge">tú</span>' : ''}<br><span class="muted" style="font-size:13px">${esc(x.email)}</span></td>
      <td><select data-cambio="u-cargo" data-id="${x.user_id}">${opCargo(x.cargo)}</select></td>
      <td><select data-cambio="u-rol" data-id="${x.user_id}" ${soyYo ? 'disabled' : ''}>${opRol(x.rol)}</select></td>
      <td class="muted" style="font-size:13px">${x.ultimo_acceso ? fmtFecha(x.ultimo_acceso.slice(0, 10)) : 'Nunca'}</td>
      <td class="fila" style="flex-wrap:nowrap"><button class="btn sec chico" data-act="u-pass" data-id="${x.user_id}">Contraseña</button>
        ${soyYo ? '' : `<button class="btn peligro chico" data-act="u-quitar" data-id="${x.user_id}" data-nombre="${esc(x.nombre || x.email)}">Quitar acceso</button>`}</td></tr>
      ${st.passDe === x.user_id ? `<tr><td colspan="5"><form data-form="u-pass" data-id="${x.user_id}" class="fila">
        <input name="password" type="password" minlength="8" required autocomplete="new-password" placeholder="Nueva contraseña (mínimo 8)" style="max-width:260px">
        <button class="btn chico" type="submit">Guardar contraseña</button><button class="btn sec chico" type="button" data-act="u-pass" data-id="">Cancelar</button></form></td></tr>` : ''}`;
  }).join('');
  return `<div class="card"><div class="fila entre"><h2 style="margin:0">Mesa de control</h2><button class="btn sec chico" data-act="u-recargar">Actualizar</button></div>
      <p class="muted">Cada integrante entra en <b>Iniciar sesión</b> con su correo y contraseña, y solo ve lo que le toca según su rol.</p>
      ${u.cargando ? '<p class="muted">Cargando usuarios…</p>' : u.error ? `<div class="card" style="border-color:#f5c518">${esc(u.error)}</div>`
      : `<div class="tabla-wrap"><table><thead><tr><th class="izq">Integrante</th><th>Cargo</th><th>Rol (qué puede hacer)</th><th>Último acceso</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`}
    </div>
    <div class="card"><h2 style="margin-top:0">Dar de alta un usuario</h2>
      <form data-form="u-crear"><div class="form-grid">
        <div class="campo"><label>Nombre</label><input name="nombre" required placeholder="Ej. Ana López"></div>
        <div class="campo"><label>Cargo</label><select name="cargo" data-cambio="u-cargo-nuevo">${opCargo('Tesorero(a)')}</select></div>
        <div class="campo"><label>Rol</label><select name="rol" id="u-rol-nuevo">${opRol('finanzas')}</select></div>
        <div class="campo"><label>Correo</label><input name="email" type="email" required autocomplete="off"></div>
        <div class="campo"><label>Contraseña (mínimo 8)</label><input name="password" type="password" minlength="8" required autocomplete="new-password"></div>
      </div><button class="btn" type="submit">Dar de alta</button>
      <p class="muted" style="font-size:13px">Pásale su contraseña en persona. Después la puedes cambiar aquí mismo con el botón "Contraseña".</p></form></div>`;
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
    tab: () => { st[b.dataset.clave] = id; st.cap = null; render(); },
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
    registro: () => seguro(async () => {
      const g = D().pagos.find(x => x.jugador_id === id && x.concepto === 'registro');
      if (g) await actualizar('pagos', g.id, { pagado: b.checked });
      else {
        const j = D().jugadores.find(x => x.id === id);
        const t = D().torneos.find(x => x.id === D().equipos.find(e => e.id === j.equipo_id)?.torneo_id);
        await insertar('pagos', { jugador_id: id, concepto: 'registro', monto: Number(t?.cuota_registro ?? 50), pagado: b.checked, fecha: hoyISO() });
      }
      toast(b.checked ? 'Registro marcado como pagado' : 'Registro pendiente');
    }),
    docs: () => seguro(() => actualizar('jugadores', id, { docs_verificados: b.checked })),
    pagos: () => { st.pagosAbierto = st.pagosAbierto === id ? null : id; render(); },
    'pago-pagado': () => seguro(() => actualizar('pagos', id, { pagado: b.checked })),
    'borrar-pago': () => confirm('¿Borrar este cargo?') && seguro(() => borrar('pagos', id)),
    'borrar-susp': () => confirm('¿Quitar esta suspensión?') && seguro(() => borrar('suspensiones', id)),
    'ver-perfil': () => seguro(async () => {
      const tk = await tokenDe(id);
      window.open(location.pathname + '#/j/' + tk, '_blank');
    }),
    imprimir: () => window.print(),
    'cred-todos': () => { st.credTodos = b.checked; render(); },
    'publicar-jornada': () => seguro(async () => {
      const j = Number(b.dataset.j);
      await actualizarVarios('partidos', partidosDe(st.torneoId).filter(p => p.estado === 'borrador' && p.jornada === j).map(p => p.id), { estado: 'programado' });
      toast(`Jornada ${j} publicada`);
    }),
    'publicar-todo': () => confirm('¿Publicar todas las jornadas en borrador? Ya las podrá ver todo mundo.') && seguro(async () => {
      const ids = partidosDe(st.torneoId).filter(p => p.estado === 'borrador').map(p => p.id);
      await actualizarVarios('partidos', ids, { estado: 'programado' }); toast(`${ids.length} partidos publicados`);
    }),
    'borrar-borradores': () => confirm('¿Borrar todas las jornadas en borrador?') && seguro(async () => {
      await borrar('partidos', partidosDe(st.torneoId).filter(p => p.estado === 'borrador').map(p => p.id)); toast('Borradores eliminados');
    }),
    'b-invertir': () => seguro(async () => {
      const p = D().partidos.find(x => x.id === id);
      await actualizar('partidos', id, { local_id: p.visita_id, visita_id: p.local_id });
    }),
    capturar: () => { abrirCaptura(id); render(); },
    'cap-mas': () => { const v = (st.cap.c[id] ||= { gol: 0, amarilla: 0, roja: 0, azul: 0 }); const tp = b.dataset.tipo; if ((v[tp] || 0) < MAX_TIPO[tp]) v[tp] = (v[tp] || 0) + 1; render(); },
    'cap-menos': () => { const v = st.cap.c[id]; const tp = b.dataset.tipo; if (v && v[tp] > 0) v[tp]--; render(); },
    'cap-manual': () => { const p = D().partidos.find(x => x.id === st.cap.id); const [gl, gv] = marcadorCaptura(p); st.cap.manual = b.checked; st.cap.gl = gl; st.cap.gv = gv; render(); },
    'cap-cancelar': () => { st.cap = null; render(); },
    'cap-guardar': () => seguro(guardarCaptura),
    'pagos-equipo': () => { st.pagosEquipo = st.pagosEquipo === id ? null : id; render(); },
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
    'u-recargar': () => { st.usuarios = null; render(); },
    'u-pass': () => { st.passDe = id || null; render(); },
    'u-quitar': () => confirm(`¿Quitarle el acceso a ${b.dataset.nombre}? Ya no podrá iniciar sesión. Lo puedes volver a dar de alta con el mismo correo.`) && seguro(async () => {
      await usuarios('quitar', { user_id: id }); st.usuarios = null; toast('Acceso quitado');
    }),
    sincronizar: () => seguro(async () => { const n = await sincronizar(); toast(db.offline ? 'Sigue sin internet' : `Listo${n ? `: ${n} cambios enviados` : ''}`); }),
  };
  acciones[act]?.();
});

$app.addEventListener('change', ev => {
  const el = ev.target.closest('[data-cambio]');
  if (!el) return;
  const c = el.dataset.cambio;
  if (c === 'torneo') { st.torneoId = el.value; st.jornadaAdmin = null; st.vistaPrevia = null; guardarPref(); render(); }
  if (c === 'u-cargo-nuevo') { const r = document.getElementById('u-rol-nuevo'); if (r) r.value = CARGOS[el.value]; }
  if (c === 'u-rol' || c === 'u-cargo') seguro(async () => {
    await usuarios('cambiar', { user_id: el.dataset.id, [c === 'u-rol' ? 'rol' : 'cargo']: el.value });
    const x = st.usuarios?.lista.find(y => y.user_id === el.dataset.id); if (x) x[c === 'u-rol' ? 'rol' : 'cargo'] = el.value;
    toast('Guardado');
  });
  if (c === 'jornada') { st.jornadaAdmin = Number(el.value); st.abierto = null; render(); }
  if (c === 'b-fecha' || c === 'b-hora') seguro(() => actualizar('partidos', el.dataset.id, { [c === 'b-fecha' ? 'fecha' : 'hora']: el.value }));
  if (c === 'cap-gl') st.cap.gl = Number(el.value) || 0;
  if (c === 'cap-gv') st.cap.gv = Number(el.value) || 0;
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
    'u-crear': () => seguro(async () => {
      const r = await usuarios('crear', { nombre: d.nombre, cargo: d.cargo, rol: d.rol, email: d.email, password: d.password });
      st.usuarios = null; toast(r.existente ? 'Ese correo ya existía: se le dieron los permisos (su contraseña no cambió)' : `${d.nombre} dado de alta`);
    }),
    'u-pass': () => seguro(async () => { await usuarios('password', { user_id: f.dataset.id, password: d.password }); st.passDe = null; toast('Contraseña cambiada'); }),
    torneo: () => seguro(async () => {
      const fila = { nombre: d.nombre.trim(), categoria: d.categoria, temporada: d.temporada, sede: d.sede,
        pts_victoria: Number(d.pts_victoria), pts_empate: Number(d.pts_empate),
        multa_amarilla: Number(d.multa_amarilla), multa_roja: Number(d.multa_roja), multa_azul: Number(d.multa_azul) };
      if (!db.faltaMigracion) fila.cuota_registro = Number(d.cuota_registro);
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
    generar: () => generarJornadas(f, d),
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
      const [ev] = await insertar('eventos', { partido_id: f.dataset.partido, jugador_id: d.jugador_id, equipo_id: j.equipo_id, tipo: d.tipo, minuto: numONull(d.minuto) });
      if (d.tipo === 'gol' || db.faltaMigracion) return;
      const t = torneo(null);
      const tor = D().torneos.find(x => x.id === D().equipos.find(e => e.id === j.equipo_id)?.torneo_id) || t;
      const monto = Number(tor?.['multa_' + d.tipo] ?? 0);
      const partido = D().partidos.find(p => p.id === f.dataset.partido);
      const fecha = partido?.fecha || hoyISO();
      if (monto) await insertar('pagos', { jugador_id: j.id, evento_id: ev.id, concepto: 'multa', monto, pagado: false, fecha, notas: 'Tarjeta ' + d.tipo });
      const amarillas = D().eventos.filter(x => x.partido_id === f.dataset.partido && x.jugador_id === j.id && x.tipo === 'amarilla').length;
      let motivo = null;
      if (d.tipo === 'roja') motivo = 'Tarjeta roja';
      else if (d.tipo === 'amarilla' && amarillas === 2) motivo = 'Doble amarilla';
      if (motivo) {
        await insertar('suspensiones', { jugador_id: j.id, partido_id: f.dataset.partido, partidos: 1, fecha, motivo });
        toast(`${motivo}: multa de $${monto} y 1 partido de suspensión (puedes ajustarlo en Pagos del jugador)`);
      } else if (monto) toast(`Multa de $${monto} registrada`);
    }),
    'pago-equipo': () => seguro(async () => {
      await insertar('pagos', { equipo_id: f.dataset.equipo, concepto: d.concepto, monto: Number(d.monto), pagado: !!d.pagado, notas: d.notas, fecha: hoyISO() });
      toast('Cargo del equipo agregado');
    }),
    pago: () => seguro(async () => {
      await insertar('pagos', { jugador_id: f.dataset.jugador, concepto: d.concepto, monto: Number(d.monto), pagado: !!d.pagado, notas: d.notas, fecha: hoyISO() });
      toast('Cargo agregado');
    }),
    suspension: () => seguro(async () => {
      await insertar('suspensiones', { jugador_id: f.dataset.jugador, partidos: Number(d.partidos), motivo: d.motivo, fecha: hoyISO() });
      toast('Suspensión agregada');
    }),
  };
  formularios[tipo]?.();
});

window.addEventListener('hashchange', () => { render(); window.scrollTo?.(0, 0); });

// ---------- Botón de sesión en la barra de arriba ----------
// Sin sesión: "Iniciar sesión". Con sesión: "Cerrar sesión" (y "Mi panel" cuando estás en la parte pública).
function pintarSesion(r) {
  const a = document.querySelector('.nav-admin');
  if (!a) return;
  const dentro = db.modo === 'supabase' && db.esAdmin;
  a.textContent = dentro ? 'Mi panel' : 'Iniciar sesión';
  a.hidden = dentro && r === 'admin';
  let b = document.getElementById('btn-salir');
  if (dentro && !b) {
    b = document.createElement('button');
    b.id = 'btn-salir'; b.type = 'button'; b.className = 'nav-salir'; b.textContent = 'Cerrar sesión';
    b.addEventListener('click', () => seguro(async () => { await salir(); toast('Sesión cerrada'); location.hash = '#/'; }));
    a.after(b);
  }
  if (!dentro && b) b.remove();
}

// ---------- Aviso de conexión y cambios pendientes ----------
function pintarSync() {
  const el = document.getElementById('sync');
  if (!el) return;
  const n = db.pendientes.length;
  let txt = '', clase = '';
  if (db.modo !== 'supabase') txt = '';
  else if (db.sincronizando && n) { txt = `Enviando ${n} cambio${n === 1 ? '' : 's'}…`; clase = 'enviando'; }
  else if (db.offline || n) {
    clase = 'sin-red';
    txt = n ? `Sin internet · ${n} cambio${n === 1 ? '' : 's'} guardado${n === 1 ? '' : 's'} en este teléfono. Se envían solos al volver la señal.`
      : `Sin internet · viendo los datos guardados en este teléfono.`;
  } else if (db.fallidos.length) { txt = `${db.fallidos.length} cambio(s) no se pudieron guardar en la nube: ${db.fallidos.slice(-1)[0].error}`; clase = 'error'; }
  el.hidden = !txt;
  el.className = 'sync ' + clase;
  el.innerHTML = txt ? `${esc(txt)}${navigator.onLine && n && !db.sincronizando ? ' <button data-sync>Enviar ahora</button>' : ''}${clase === 'error' ? ' <button data-sync-ok>Entendido</button>' : ''}` : '';
}
let estabaSincronizando = false;
db.alCambiarSync = () => {
  pintarSync();
  if (estabaSincronizando && !db.sincronizando) {
    const enUso = document.activeElement?.matches?.('input, select, textarea');
    if (!enUso) render();
  }
  estabaSincronizando = db.sincronizando;
};
document.getElementById('sync')?.addEventListener('click', ev => {
  if (ev.target.closest('[data-sync]')) sincronizar();
  if (ev.target.closest('[data-sync-ok]')) { db.fallidos = []; pintarSync(); }
});

// Guarda la página en el teléfono para poder abrirla sin internet.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Sin modo offline:', e));
}

// ---------- arranque ----------
document.getElementById('nombre-liga').textContent = NOMBRE_LIGA;
iniciar().then(() => { render(); pintarSync(); }).catch(e => {
  console.error(e);
  $app.innerHTML = `<div class="card"><h1>No se pudo conectar</h1><p>${esc(e.message)}</p><p class="muted">Revisa js/config.js y que hayas corrido supabase/schema.sql.</p></div>`;
});
