// Cálculos: tabla de posiciones, goleo y disciplina.

export function tablaPosiciones(torneo, equipos, partidos) {
  const pv = Number(torneo.pts_victoria ?? 3), pe = Number(torneo.pts_empate ?? 1);
  const filas = new Map(equipos.map(e => [e.id, {
    equipo: e, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dif: 0, pts: 0, forma: [],
  }]));
  const jugados = partidos
    .filter(p => p.estado === 'jugado' && p.goles_local != null && p.goles_visita != null)
    .sort((a, b) => (a.jornada - b.jornada) || String(a.fecha).localeCompare(String(b.fecha)));
  for (const p of jugados) {
    const L = filas.get(p.local_id), V = filas.get(p.visita_id);
    if (!L || !V) continue;
    const gl = Number(p.goles_local), gv = Number(p.goles_visita);
    L.pj++; V.pj++; L.gf += gl; L.gc += gv; V.gf += gv; V.gc += gl;
    if (gl > gv) { L.g++; V.p++; L.pts += pv; L.forma.push('G'); V.forma.push('P'); }
    else if (gl < gv) { V.g++; L.p++; V.pts += pv; V.forma.push('G'); L.forma.push('P'); }
    else { L.e++; V.e++; L.pts += pe; V.pts += pe; L.forma.push('E'); V.forma.push('E'); }
  }
  const lista = [...filas.values()];
  lista.forEach(f => { f.dif = f.gf - f.gc; f.forma = f.forma.slice(-5); });
  lista.sort((a, b) => b.pts - a.pts || b.dif - a.dif || b.gf - a.gf
    || a.equipo.nombre.localeCompare(b.equipo.nombre, 'es'));
  return lista;
}

export function tablaGoleo(eventos, jugadoresPorId, equiposPorId) {
  const goles = new Map();
  for (const ev of eventos) {
    if (ev.tipo !== 'gol') continue;
    goles.set(ev.jugador_id, (goles.get(ev.jugador_id) || 0) + 1);
  }
  return [...goles.entries()]
    .map(([id, n]) => {
      const j = jugadoresPorId.get(id);
      return { jugador: j, equipo: j ? equiposPorId.get(j.equipo_id) : null, goles: n };
    })
    .filter(r => r.jugador)
    .sort((a, b) => b.goles - a.goles || a.jugador.nombre.localeCompare(b.jugador.nombre, 'es'));
}

export function tablaDisciplina(torneo, eventos, jugadoresPorId, equiposPorId) {
  const m = new Map();
  for (const ev of eventos) {
    if (ev.tipo === 'gol') continue;
    const r = m.get(ev.jugador_id) || { amarilla: 0, roja: 0, azul: 0 };
    r[ev.tipo]++;
    m.set(ev.jugador_id, r);
  }
  return [...m.entries()].map(([id, r]) => {
    const j = jugadoresPorId.get(id);
    const multa = r.amarilla * Number(torneo.multa_amarilla || 0) + r.roja * Number(torneo.multa_roja || 0)
      + r.azul * Number(torneo.multa_azul || 0);
    return { jugador: j, equipo: j ? equiposPorId.get(j.equipo_id) : null, ...r, multa };
  }).filter(r => r.jugador)
    .sort((a, b) => b.roja - a.roja || b.amarilla - a.amarilla || b.azul - a.azul);
}
