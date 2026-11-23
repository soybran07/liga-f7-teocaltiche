// Pantalla de carga: balón pateado a la portería; al entrar a la red salen los dos logos.
// Se muestra una vez por sesión; se puede saltar con un toque. Respeta "reducir movimiento".

const intro = document.getElementById('intro');
let listoDatos = false, listoAnim = false, cerrada = false;

function cerrar() {
  if (cerrada || !intro) return;
  cerrada = true;
  intro.classList.add('intro-fuera');
  setTimeout(() => intro.remove(), 700);
}
function intentarCerrar() { if (listoDatos && listoAnim) cerrar(); }

window.addEventListener('f7:listo', () => { listoDatos = true; intentarCerrar(); });

function yaVista() { try { return sessionStorage.getItem('f7-intro') === '1'; } catch { return false; } }
function marcarVista() { try { sessionStorage.setItem('f7-intro', '1'); } catch { } }

const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

if (!intro) {
  // nada
} else if (yaVista() || reducir || location.hash.startsWith('#/admin')) {
  intro.classList.add('intro-simple');
  listoAnim = true;
} else {
  marcarVista();
  intro.addEventListener('click', () => { listoAnim = true; listoDatos = true; cerrar(); });
  correr();
}
// Nunca dejar la pantalla puesta más de 9 s.
setTimeout(() => { listoAnim = true; listoDatos = true; cerrar(); }, 9000);

function correr() {
  const escena = intro.querySelector('.intro-escena');
  const balon = intro.querySelector('.intro-balon');
  const giro = intro.querySelector('.intro-balon svg');
  const sombra = intro.querySelector('.intro-sombra');
  const red = intro.querySelector('.intro-red');
  const flash = intro.querySelector('.intro-flash');
  const logos = intro.querySelectorAll('.intro-logo');
  const texto = intro.querySelector('.intro-texto');
  const ease = 'cubic-bezier(.45,.05,.35,1)';

  // Posiciones relativas a la pantalla: el balón sale abajo al centro; la portería está arriba al centro.
  const T = { patada: 450, subida: 1050, bajada: 1000 };
  const t1 = T.patada, t2 = t1 + T.subida, t3 = t2 + T.bajada;

  // Cámara: se acerca al balón y luego sigue hacia la portería.
  escena.animate([
    { transform: 'scale(1) translateY(0)' },
    { transform: 'scale(1) translateY(0)', offset: t1 / t3 },
    { transform: 'scale(1.18) translateY(4%)', offset: t2 / t3 },
    { transform: 'scale(1.06) translateY(-2%)' },
  ], { duration: t3, easing: ease, fill: 'forwards' });

  // Balón: pequeño "golpe", despega y crece (cámara encima), luego se va haciendo chico hacia la red.
  balon.animate([
    { transform: 'translate(-50%, 0) translateY(0) scale(1)' },
    { transform: 'translate(-50%, 0) translateY(4px) scale(1.06, .92)', offset: (t1 - 120) / t3 },
    { transform: 'translate(-50%, 0) translateY(0) scale(1)', offset: t1 / t3 },
    { transform: 'translate(-50%, 0) translateY(-26vh) scale(2.7)', offset: t2 / t3 },
    { transform: 'translate(-50%, 0) translateY(-58vh) scale(.42)' },
  ], { duration: t3, easing: ease, fill: 'forwards' });
  giro.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(0deg)', offset: t1 / t3 }, { transform: 'rotate(900deg)' }],
    { duration: t3, easing: 'linear', fill: 'forwards' });
  sombra.animate([
    { opacity: .55, transform: 'translateX(-50%) scale(1)' },
    { opacity: .55, transform: 'translateX(-50%) scale(1)', offset: t1 / t3 },
    { opacity: 0, transform: 'translateX(-50%) scale(.4)', offset: (t1 + 500) / t3 },
    { opacity: 0, transform: 'translateX(-50%) scale(.4)' },
  ], { duration: t3, fill: 'forwards' });

  // Gol: la red se infla y el balón desaparece dentro.
  setTimeout(() => {
    balon.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' });
    red.animate([
      { transform: 'scale(1,1)' }, { transform: 'scale(1.08,1.14) translateY(-3%)' },
      { transform: 'scale(.97,.95)' }, { transform: 'scale(1.02,1.03)' }, { transform: 'scale(1,1)' },
    ], { duration: 700, easing: 'ease-out' });
    flash.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.2)' }, { opacity: .9, offset: .3 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(2.4)' }],
      { duration: 700, easing: 'ease-out', fill: 'forwards' });
    if (navigator.vibrate) try { navigator.vibrate(40); } catch { }
  }, t3 - 40);

  // De la red salen los logos, girando en 3D, hacia izquierda y derecha.
  logos.forEach((logo, i) => {
    const dir = i === 0 ? -1 : 1;
    logo.animate([
      { opacity: 0, transform: 'translate(-50%,-50%) translate(0,0) scale(.15) rotateY(0deg)' },
      { opacity: 1, transform: `translate(-50%,-50%) translate(${dir * 9}vw, 6vh) scale(.7) rotateY(${dir * 300}deg)`, offset: .55 },
      { opacity: 1, transform: `translate(-50%,-50%) translate(${dir * 15}vw, 16vh) scale(1) rotateY(${dir * 360}deg)` },
    ], { duration: 1000, delay: t3 + 120 + i * 90, easing: 'cubic-bezier(.2,.8,.2,1.15)', fill: 'forwards' });
  });
  texto.animate([{ opacity: 0, transform: 'translate(-50%, 12px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }],
    { duration: 600, delay: t3 + 700, easing: 'ease-out', fill: 'forwards' });

  setTimeout(() => { listoAnim = true; intentarCerrar(); }, t3 + 2300);
}
