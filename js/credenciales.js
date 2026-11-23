// Credenciales con QR: estado del jugador, perfil público al escanear y hoja imprimible.
import { db, actualizar, tokenDe, perfilPorToken } from './db.js';

const D = () => db.data;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const ramaDe = t => (t && /femen/i.test(`${t.nombre} ${t.categoria || ''}`) ? 'femenil' : 'varonil');
const LIGA = {
  varonil: { nombre: 'Liga Juvenil Varonil', corto: 'LIGA JUVENIL VARONIL', logo: 'img/logo-varonil.png', c: '#019859', c2: '#e6f5ee', pre: 'LJV' },
  femenil: { nombre: 'Liga Juvenil Femenil', corto: 'LIGA JUVENIL FEMENIL', logo: 'img/logo-femenil.png', c: '#a769d0', c2: '#f3ebf9', pre: 'LJF' },
};

export function contexto(j) {
  const e = D().equipos.find(x => x.id === j.equipo_id);
  const t = e && D().torneos.find(x => x.id === e.torneo_id);
  return { e, t, liga: LIGA[ramaDe(t)] };
}

export function folioTxt(j) {
  if (!j.folio) return '—';
  return `${contexto(j).liga.pre}-${String(j.folio).padStart(4, '0')}`;
}

// Suspensión vigente: cuenta los partidos jugados por su equipo después del partido de origen (o de la fecha).
export function suspensionActiva(j) {
  const ps = D().partidos.filter(p => p.estado === 'jugado' && (p.local_id === j.equipo_id || p.visita_id === j.equipo_id));
  for (const s of D().suspensiones.filter(x => x.jugador_id === j.id)) {
    const origen = s.partido_id && D().partidos.find(p => p.id === s.partido_id);
    const cumplidos = ps.filter(p => origen ? p.jornada > origen.jornada : (p.fecha && p.fecha > s.fecha)).length;
    const restantes = Number(s.partidos || 0) - cumplidos;
    if (restantes > 0) return { s, restantes };
  }
  return null;
}

export function estadoPagos(j) {
  const pg = D().pagos.filter(g => g.jugador_id === j.id);
  const pendientes = pg.filter(g => !g.pagado);
  return {
    registro: pg.some(g => g.concepto === 'registro' && g.pagado),
    adeudo: pendientes.reduce((a, g) => a + Number(g.monto || 0), 0),
    pendientes,
  };
}

export function tarjetasDe(j) {
  const r = { gol: 0, amarilla: 0, roja: 0, azul: 0 };
  D().eventos.forEach(ev => { if (ev.jugador_id === j.id) r[ev.tipo]++; });
  return r;
}

// ---------- Perfil público (#/j/CODIGO) ----------
export function vistaPerfil(token) {
  setTimeout(() => llenarPerfil(token), 0);
  return `<div id="perfil" class="perfil-j"><div class="card vacio">Validando credencial…</div></div>`;
}

async function llenarPerfil(token) {
  const cont = document.getElementById('perfil');
  if (!cont) return;
  let info = null, error = '';
  try { info = await perfilPorToken(token); } catch (e) { error = e.message; }
  const j = info && D().jugadores.find(x => x.id === info.jugador_id);
  if (!document.getElementById('perfil')) return;
  if (!j) {
    cont.innerHTML = `<div class="card perfil-estado rojo">✗ CREDENCIAL NO VÁLIDA</div>
      <div class="card vacio">${error ? esc(error) : 'Este código no corresponde a ningún jugador registrado. Pide al jugador una credencial vigente.'}</div>`;
    return;
  }
  const { e, t, liga } = contexto(j);
  document.body.dataset.tema = ramaDe(t);
  const susp = suspensionActiva(j);
  const tj = tarjetasDe(j);
  let estado, clase;
  if (j.activo === false) { estado = '✗ JUGADOR DADO DE BAJA'; clase = 'rojo'; }
  else if (susp) { estado = `✗ SUSPENDIDO · ${susp.restantes === 1 ? 'falta 1 partido' : `faltan ${susp.restantes} partidos`}`; clase = 'rojo'; }
  else if (!info.registro_pagado) { estado = '! REGISTRO PENDIENTE'; clase = 'ambar'; }
  else { estado = '✓ JUGADOR ACTIVO · PUEDE JUGAR'; clase = 'verde'; }
  const si = (ok, a, b) => `<span class="${ok ? 'ok' : 'warn'}">${ok ? a : b}</span>`;
  const ahora = new Date().toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  cont.innerHTML = `
    <div class="card perfil-cab"><img src="${liga.logo}" alt="" width="64" height="64">
      <div><div class="num-grande">${j.numero ?? ''}</div></div>
      <div style="flex:1;min-width:0"><h1>${esc(j.nombre)}</h1>
        <div class="muted">${esc(e?.nombre)} · ${liga.nombre}<br>Folio ${folioTxt(j)} · ${esc(t?.temporada || t?.nombre || '')}</div></div></div>
    <div class="card perfil-estado ${clase}">${estado}</div>
    <div class="card perfil-cifras"><div><b>${tj.gol}</b><span>Goles</span></div><div><b>${tj.amarilla}</b><span>Amarillas</span></div>
      <div><b>${tj.roja}</b><span>Rojas</span></div><div><b>${tj.azul}</b><span>Azules</span></div></div>
    <div class="card perfil-lineas">
      <div><span>Registro</span>${si(info.registro_pagado, 'Pagado', 'Pendiente')}</div>
      <div><span>Adeudos</span>${si(!info.con_adeudo, 'Al corriente', 'Con adeudo')}</div>
      <div><span>Suspensión</span>${si(!susp, 'Ninguna', susp?.restantes === 1 ? 'Falta 1 partido' : `Faltan ${susp?.restantes} partidos`)}</div>
      <div><span>Documentos</span>${si(j.docs_verificados, 'Verificados', 'Pendientes')}</div>
    </div>
    <p class="muted" style="text-align:center;font-size:13px">Consultado: ${esc(ahora)} · myligateocal.com</p>`;
}

// ---------- Hoja de credenciales (#/credenciales/EQUIPO o #/credenciales/j/JUGADOR) ----------
export function vistaCredenciales(ruta, incluirSinRegistro) {
  setTimeout(() => llenarCredenciales(ruta, incluirSinRegistro), 0);
  return `<div class="no-print card"><div class="fila entre"><div><h1 style="margin:0">Credenciales</h1>
      <p class="muted" style="margin:4px 0 0">Imprime en opalina tamaño carta, a escala 100% (tamaño real). Recorta cada tira, dóblala por la línea punteada, pega la foto y firma el reverso.</p></div>
      <div class="fila"><a class="btn sec" href="#/admin">← Volver</a><button class="btn" data-act="imprimir">Imprimir</button></div></div>
      ${ruta.startsWith('j/') ? '' : `<label style="margin-top:8px;display:flex;gap:6px;align-items:center"><input type="checkbox" data-act="cred-todos" ${incluirSinRegistro ? 'checked' : ''}> Incluir también jugadores sin registro pagado</label>`}</div>
    <div id="hoja-cred" class="hoja-cred"><p class="muted">Preparando credenciales…</p></div>`;
}

async function llenarCredenciales(ruta, incluirSinRegistro) {
  const cont = document.getElementById('hoja-cred');
  if (!cont) return;
  let lista;
  if (ruta.startsWith('j/')) lista = D().jugadores.filter(j => j.id === ruta.slice(2));
  else lista = D().jugadores.filter(j => j.equipo_id === ruta && j.activo !== false && (incluirSinRegistro || estadoPagos(j).registro))
    .sort((a, b) => (a.numero ?? 999) - (b.numero ?? 999) || a.nombre.localeCompare(b.nombre, 'es'));
  if (!lista.length) {
    cont.innerHTML = `<div class="card vacio no-print">No hay jugadores con registro pagado en este equipo. Marca "Registro" en la lista de jugadores o activa la casilla de arriba.</div>`;
    return;
  }
  try {
    let max = Math.max(0, ...D().jugadores.map(j => Number(j.folio) || 0));
    for (const j of lista) {
      if (!j.folio && !db.faltaMigracion) await actualizar('jugadores', j.id, { folio: ++max });
    }
    const base = location.origin + location.pathname;
    const tiras = [];
    for (const j of lista) tiras.push(tira(j, base + '#/j/' + await tokenDe(j.id)));
    if (document.getElementById('hoja-cred')) cont.innerHTML = tiras.join('');
  } catch (e) {
    cont.innerHTML = `<div class="card vacio">No se pudieron preparar: ${esc(e.message)}</div>`;
  }
}

function qrSvg(url) {
  if (!window.qrcode) return '<div class="cred-sinqr">QR</div>';
  const q = window.qrcode(0, 'M');
  q.addData(url); q.make();
  return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
}

function tira(j, url) {
  const { e, t, liga } = contexto(j);
  return `<div class="cred-tira" style="--c:${liga.c};--c2:${liga.c2}">
    <div class="cred-cara cred-frente">
      <div class="cred-franja"><img src="${liga.logo}" alt=""><div><b>${liga.corto}</b><span>FÚTBOL 7 · TEOCALTICHE, JAL.</span></div><em>${esc(t?.temporada || '')}</em></div>
      <div class="cred-cuerpo">
        <div class="cred-foto">PEGAR<br>FOTO<small>2.5 × 3 cm</small></div>
        <div class="cred-datos">
          <label>Nombre</label><p class="cred-nom">${esc(j.nombre)}</p>
          <label>Equipo</label><p>${esc(e?.nombre)}</p>
          <div class="cred-fila"><div><label>Núm.</label><p class="cred-num">${j.numero ?? '—'}</p></div><div><label>Categoría</label><p>${esc((t?.categoria || '').replace(/^Juvenil\s*/i, '') || 'Juvenil')}</p></div></div>
          <div class="cred-fila"><div><label>Folio</label><p class="cred-mono">${folioTxt(j)}</p></div><div><label>Vigencia</label><p>${esc(t?.temporada || '')}</p></div></div>
        </div>
        <div class="cred-qr">${qrSvg(url)}<span>Escanea para validar</span></div>
      </div>
    </div>
    <div class="cred-doblez"></div>
    <div class="cred-cara cred-reverso">
      <img class="cred-agua" src="${liga.logo}" alt="">
      <img class="cred-logo" src="${liga.logo}" alt="">
      <div class="cred-firma"><div class="cred-linea"></div><b>Mtro. Brandon Josué Valdivia Ortiz</b><span>Presidente de la Liga</span></div>
      <p class="cred-leyenda">Credencial personal e intransferible. Preséntala en mesa antes de cada partido. Validez sujeta al código QR.</p>
    </div>
  </div>`;
}
