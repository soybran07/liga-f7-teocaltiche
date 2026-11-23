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
