// Generador de jornadas "todos contra todos" (método del círculo).

// Devuelve una lista de jornadas; cada jornada es una lista de [localId, visitaId].
export function todosContraTodos(ids, idaYVuelta = false) {
  const t = [...ids];
  if (t.length < 2) return [];
  if (t.length % 2) t.push(null); // null = descansa
  const n = t.length;
  const jornadas = [];
  let arr = [...t];
  for (let r = 0; r < n - 1; r++) {
    const pares = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      if (a === null || b === null) continue;
      // Alterna la localía para que nadie sea siempre local.
      const invertir = i === 0 ? r % 2 === 1 : (r + i) % 2 === 1;
      pares.push(invertir ? [b, a] : [a, b]);
    }
    jornadas.push(pares);
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  if (idaYVuelta) return [...jornadas, ...jornadas.map(j => j.map(([a, b]) => [b, a]))];
  return jornadas;
}

// Une las jornadas de varios grupos: la jornada 1 de cada grupo forma la jornada 1 general, etc.
export function unirGrupos(listas) {
  const max = Math.max(0, ...listas.map(l => l.length));
  return Array.from({ length: max }, (_, i) => listas.flatMap(l => l[i] || []));
}

const pad = n => String(n).padStart(2, '0');
const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Asigna fecha y hora a cada partido.
// opciones: inicio 'AAAA-MM-DD' (semana de la jornada 1), dias [0..6] (0=domingo), horas ['19:00', ...],
// semanasEntreJornadas (normalmente 1). Una jornada por semana; si no caben, los sobrantes quedan sin horario.
export function calendarizar(jornadas, { inicio, dias, horas, cancha = '', semanasEntreJornadas = 1, jornadaInicial = 1 }) {
  const [y, m, d] = inicio.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  const diaBase = base.getDay();
  const offsets = [...dias].map(Number).map(dia => (dia - diaBase + 7) % 7).sort((a, b) => a - b);
  const huecos = offsets.flatMap(off => horas.map(h => ({ off, hora: h })));
  const partidos = [];
  jornadas.forEach((pares, j) => {
    pares.forEach(([local, visita], k) => {
      const hueco = huecos[k];
      let fecha = null, hora = null;
      if (hueco) {
        const f = new Date(base);
        f.setDate(base.getDate() + j * 7 * semanasEntreJornadas + hueco.off);
        fecha = isoLocal(f); hora = hueco.hora;
      }
      partidos.push({ jornada: jornadaInicial + j, local_id: local, visita_id: visita, fecha, hora, cancha });
    });
  });
  return partidos;
}

const clave = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Cuántas veces se ha enfrentado cada pareja (en cualquier estado: jugado, programado o borrador).
export function enfrentamientos(partidos) {
  const m = new Map();
  partidos.forEach(p => { const k = clave(p.local_id, p.visita_id); m.set(k, (m.get(k) || 0) + 1); });
  return m;
}

// Acomoda en jornadas los cruces de "pares" (lista de [a, b]) sin que un equipo juegue dos veces en la misma jornada,
// buscando el menor número de jornadas (cada jornada lo más llena posible).
export function acomodarEnJornadas(pares, nEquipos) {
  if (!pares.length) return [];
  const grado = new Map();
  pares.forEach(([a, b]) => { grado.set(a, (grado.get(a) || 0) + 1); grado.set(b, (grado.get(b) || 0) + 1); });
  const minimo = Math.max(Math.max(...grado.values()), Math.ceil(pares.length / Math.max(1, Math.floor(nEquipos / 2))));
  let mejor = null;
  for (let intento = 0; intento < 600; intento++) {
    let resto = [...pares];
    const jornadas = [];
    while (resto.length) {
      const g = new Map();
      resto.forEach(([a, b]) => { g.set(a, (g.get(a) || 0) + 1); g.set(b, (g.get(b) || 0) + 1); });
      const orden = resto.map(e => ({ e, w: g.get(e[0]) + g.get(e[1]) + Math.random() * 1.5 })).sort((x, y) => y.w - x.w);
      const usados = new Set(), jornada = [];
      for (const { e } of orden) {
        if (usados.has(e[0]) || usados.has(e[1])) continue;
        jornada.push(e); usados.add(e[0]); usados.add(e[1]);
      }
      jornadas.push(jornada);
      const puestos = new Set(jornada);
      resto = resto.filter(e => !puestos.has(e));
    }
    if (!mejor || jornadas.length < mejor.length) mejor = jornadas;
    if (mejor.length <= minimo) break;
  }
  return mejor;
}

// Decide localía equilibrando cuántas veces ha sido local cada equipo.
export function equilibrarLocalia(jornadas, partidosPrevios) {
  const casa = new Map();
  partidosPrevios.forEach(p => casa.set(p.local_id, (casa.get(p.local_id) || 0) + 1));
  return jornadas.map(j => j.map(([a, b]) => {
    const [l, v] = (casa.get(a) || 0) <= (casa.get(b) || 0) ? [a, b] : [b, a];
    casa.set(l, (casa.get(l) || 0) + 1);
    return [l, v];
  }));
}
