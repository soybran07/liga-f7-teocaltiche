// Cédula arbitral imprimible (#/cedula/PARTIDO). Solo salen los jugadores que pueden jugar:
// activos, con registro pagado, sin multas de amarilla o roja pendientes y sin suspensión vigente.
// Una multa de tarjeta azul pendiente NO impide jugar.
import { db } from './db.js';
import { contexto, estadoPagos, suspensionActiva, es17 } from './credenciales.js';

const D = () => db.data;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fecha = iso => { if (!iso) return ''; const [a, m, d] = iso.split('-').map(Number); return `${d} de ${MESES[m - 1]} de ${a}`; };
const hora = h => { if (!h) return ''; const [H, M] = h.split(':').map(Number); return `${((H + 11) % 12) + 1}:${String(M).padStart(2, '0')} ${H < 12 ? 'am' : 'pm'}`; };

// Tipo de tarjeta de una multa (por su evento o por la nota).
function tarjetaDeMulta(g) {
  const ev = g.evento_id && D().eventos.find(e => e.id === g.evento_id);
  if (ev) return ev.tipo;
  const m = /amarilla|roja|azul/i.exec(g.notas || '');
  return m ? m[0].toLowerCase() : null;
}

// ¿Puede jugar? Devuelve { ok, motivos[] , avisos[] }.
export function puedeJugar(j) {
  const motivos = [], avisos = [];
  if (j.activo === false) motivos.push('dado de baja');
  const ep = estadoPagos(j);
  if (!ep.registro) motivos.push('registro sin pagar');
  for (const g of ep.pendientes.filter(x => x.concepto === 'multa')) {
    const t = tarjetaDeMulta(g);
    if (t === 'amarilla' || t === 'roja') motivos.push(`debe multa de ${t} ($${g.monto})`);
    else if (t === 'azul') avisos.push(`debe azul ($${g.monto})`);
    else avisos.push(`debe multa ($${g.monto})`);
  }
  const s = suspensionActiva(j);
  if (s) motivos.push(`suspendido (${s.restantes === 1 ? 'falta 1 partido' : `faltan ${s.restantes} partidos`})`);
  return { ok: !motivos.length, motivos, avisos };
}

function plantilla(eqId) {
  const js = D().jugadores.filter(j => j.equipo_id === eqId)
    .sort((a, b) => (a.numero ?? 999) - (b.numero ?? 999) || a.nombre.localeCompare(b.nombre, 'es'));
  const si = [], no = [];
  js.forEach(j => { const r = puedeJugar(j); (r.ok ? si : no).push({ j, ...r }); });
  return { si, no };
}

const balon = `<svg viewBox="0 0 20 20" width="11" height="11"><circle cx="10" cy="10" r="9" fill="#fff" stroke="#000" stroke-width="1.4"/><path d="M10 5.6l3.3 2.4-1.3 3.9H8l-1.3-3.9z" fill="#000"/><path d="M10 5.6V1.2M13.3 8l4.2-1.4M12 11.9l2.6 3.6M8 11.9l-2.6 3.6M6.7 8L2.5 6.6" stroke="#000" stroke-width="1.1"/></svg>`;

// Casillas de faltas: shootout en la 6ª y luego cada 3 (9, 12, 15, 18…).
function casillasFaltas(n = 18) {
  let h = '';
  for (let i = 1; i <= n; i++) {
    const shoot = i >= 6 && (i - 6) % 3 === 0;
    h += `<span class="ced-falta${shoot ? ' shoot' : ''}">${shoot ? `<i>${balon}</i>` : ''}</span>`;
  }
  return h;
}

function bloqueEquipo(e, lista, filas) {
  const rows = [];
  for (let i = 0; i < filas; i++) {
    const x = lista[i];
    rows.push(`<tr><td class="ced-n">${x ? (x.j.numero ?? '') : i + 1}</td><td class="ced-nom">${x ? esc(x.j.nombre) + (es17(x.j) ? ' <span class="ced-17">17</span>' : '') : ''}</td><td></td><td></td></tr>`);
  }
  return `<div class="ced-eq">
    <div class="ced-eqcab"><div class="ced-linea"><b>EQUIPO:</b><span class="ced-valor">${esc(e?.nombre)}</span></div>
      <div class="ced-faltas"><b>FALTAS:</b><div class="ced-casillas">${casillasFaltas()}</div></div></div>
    <table class="ced-tabla"><thead><tr><th class="ced-n">#</th><th>NOMBRE JUGADOR</th><th>GOLES</th><th>FALTAS</th></tr></thead><tbody>${rows.join('')}</tbody></table>
    <div class="ced-firma"><b>FIRMA DEL CAPITÁN</b></div></div>`;
}

export function vistaCedula(id) {
  const p = D().partidos.find(x => x.id === id);
  if (!p) return `<div class="card vacio">No se encontró el partido. <a href="#/admin">Volver</a></div>`;
  const eL = D().equipos.find(e => e.id === p.local_id), eV = D().equipos.find(e => e.id === p.visita_id);
  const t = D().torneos.find(x => x.id === p.torneo_id);
  const pl = plantilla(p.local_id), pv = plantilla(p.visita_id);
  const filas = Math.max(12, pl.si.length, pv.si.length);
  const { liga } = contexto({ equipo_id: p.local_id });
  const fem = liga.pre === 'LJF';
  const listaNo = (e, x) => x.no.length ? `<div><b>${esc(e?.nombre)}</b>: ${x.no.map(n => `${esc(n.j.nombre)} <span class="muted">(${n.motivos.join(', ')})</span>`).join('; ')}</div>` : '';
  const avisos = [...pl.si, ...pv.si].filter(x => x.avisos.length);
  return `<div class="no-print card"><div class="fila entre"><div><h1 style="margin:0">Cédula arbitral</h1>
      <p class="muted" style="margin:4px 0 0">Imprime en hoja carta <b>horizontal</b>, a escala 100%. Solo aparecen los jugadores que pueden jugar.</p></div>
      <div class="fila"><a class="btn sec" href="#/admin">← Volver</a><button class="btn" data-act="imprimir">Imprimir cédula</button></div></div>
    ${pl.no.length || pv.no.length ? `<div class="ced-fuera"><b>No pueden jugar (no salen en la cédula):</b>${listaNo(eL, pl)}${listaNo(eV, pv)}</div>` : '<p class="muted">Todos los jugadores de los dos equipos pueden jugar.</p>'}
    ${avisos.length ? `<p class="muted" style="font-size:13px">Sí juegan, pero tienen pendiente: ${avisos.map(x => `${esc(x.j.nombre)} (${x.avisos.join(', ')})`).join('; ')}.</p>` : ''}</div>
  <style>@media print { @page { size: letter landscape; margin: 8mm; } }</style>
  <div class="ced-hoja${filas > 12 ? ' ced-apretada' : ''}" style="--ced:${liga.c}">
    <h1 class="ced-titulo">CÉDULA ARBITRAL</h1>
    <div class="ced-datos">
      <div class="ced-linea"><b>FECHA:</b><span class="ced-valor">${esc(fecha(p.fecha))}${p.hora ? ' · ' + esc(hora(p.hora)) : ''}</span></div>
      <div class="ced-linea"><b>JORNADA:</b><span class="ced-valor">${p.jornada ?? ''}</span></div>
      <div class="ced-linea"><b>CATEGORÍA:</b><span class="ced-valor">${fem ? 'JUVENIL FEMENIL' : 'JUVENIL'} - FÚTBOL RÁPIDO</span></div>
    </div>
    <div class="ced-cuerpo">
      ${bloqueEquipo(eL, pl.si, filas)}
      <div class="ced-centro"><b>MARCADOR FINAL</b>
        <div class="ced-marcador"><span></span><i></i><span></span></div>
        <img src="${liga.logo}" alt="">
        <div class="ced-regla">${balon} Shootout en la falta 6 y después cada 3 (9, 12, 15…)</div>
        <div class="ced-regla"><span class="ced-17">17</span> Jugador de 17 años: solo uno en la cancha por equipo</div>
      </div>
      ${bloqueEquipo(eV, pv.si, filas)}
    </div>
    <div class="ced-pie">
      <div class="ced-obs"><b>OBSERVACIONES Y/O REPORTES:</b><span></span><span></span><span></span></div>
      <div class="ced-firmas"><div class="ced-linea"><b>FIRMA DEL ÁRBITRO:</b><span class="ced-valor"></span></div>
        <div class="ced-linea"><b>MESA DE CONTROL:</b><span class="ced-valor"></span></div></div>
    </div>
  </div>`;
}
