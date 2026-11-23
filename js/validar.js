// Revisión de CURP, fecha de nacimiento y edad de los jugadores.

const RE_CURP = /^[A-Z]{4}\d{6}[HMX][A-Z]{5}[0-9A-Z]\d$/;

// Fecha de nacimiento (AAAA-MM-DD) que trae la CURP, o null si la CURP no es válida.
export function fechaDeCurp(curp) {
  const c = String(curp || '').trim().toUpperCase();
  if (!RE_CURP.test(c)) return null;
  const yy = c.slice(4, 6), mm = c.slice(6, 8), dd = c.slice(8, 10);
  // El carácter 17 es un dígito para nacidos antes del 2000 y una letra del 2000 en adelante.
  const siglo = /\d/.test(c[16]) ? '19' : '20';
  const iso = `${siglo}${yy}-${mm}-${dd}`;
  return fechaValida(iso) ? iso : null;
}

function fechaValida(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

export function edad(iso, hoy = new Date()) {
  const [y, m, d] = iso.split('-').map(Number);
  let e = hoy.getFullYear() - y;
  if (hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d)) e--;
  return e;
}

// Rango de edad tomado de la categoría del torneo, p. ej. "Juvenil 11 a 17 años" → [11, 17].
export function rangoEdad(categoria) {
  const m = /(\d{1,2})\s*(?:a|-|–)\s*(\d{1,2})/.exec(categoria || '');
  return m ? [Number(m[1]), Number(m[2])] : null;
}

// Devuelve una lista de avisos (texto) para un jugador; vacía si todo está bien.
export function revisarJugador(priv = {}, categoria = '', hoy = new Date()) {
  const avisos = [];
  const curp = String(priv.curp || '').trim().toUpperCase();
  const fecha = priv.fecha_nac || '';
  if (curp && !RE_CURP.test(curp)) avisos.push('CURP con formato inválido');
  const fCurp = curp ? fechaDeCurp(curp) : null;
  if (!fecha) {
    avisos.push(fCurp ? 'Sin fecha (la CURP dice ' + fCurp + ')' : 'Sin fecha de nacimiento');
  } else if (!fechaValida(fecha) || Number(fecha.slice(0, 4)) < 1940 || new Date(fecha) > hoy) {
    avisos.push('Fecha imposible: ' + fecha);
  } else {
    if (fCurp && fCurp !== fecha) avisos.push(`La CURP dice ${fCurp}, no ${fecha}`);
    const r = rangoEdad(categoria);
    const e = edad(fecha, hoy);
    if (r && (e < r[0] || e > r[1])) avisos.push(`Tiene ${e} años (categoría ${r[0]} a ${r[1]})`);
  }
  return avisos;
}
