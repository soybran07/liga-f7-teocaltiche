// Guarda la página en el teléfono para abrirla sin internet (en la cancha).
// Archivos propios: primero internet (para tener siempre lo más nuevo) y si no hay, la copia guardada.
// Librerías externas con versión fija: primero la copia guardada.
const CACHE = 'f7teo-v10';
const BASE = [
  './', 'index.html', 'styles.css', 'manifest.json',
  'js/app.js', 'js/db.js', 'js/config.js', 'js/credenciales.js', 'js/cedula.js', 'js/roundrobin.js', 'js/stats.js', 'js/validar.js', 'js/vendor/qrcode.js',
  'img/logo-varonil.png', 'img/logo-femenil.png', 'img/cancha.jpg',
];
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(BASE);
    try { await c.add(SUPABASE_JS); } catch { /* se guarda en la siguiente visita */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return; // los datos los maneja la app
  const externo = url.origin !== location.origin;
  if (externo && !/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) return;
  ev.respondWith(externo ? primeroCache(req) : primeroRed(req));
});

async function primeroRed(req) {
  const c = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r.ok) c.put(req, r.clone());
    return r;
  } catch {
    const g = await c.match(req, { ignoreSearch: true });
    if (g) return g;
    if (req.mode === 'navigate') return (await c.match('index.html')) || Response.error();
    return Response.error();
  }
}

async function primeroCache(req) {
  const c = await caches.open(CACHE);
  const g = await c.match(req);
  if (g) return g;
  try {
    const r = await fetch(req);
    if (r.ok || r.type === 'opaque') c.put(req, r.clone());
    return r;
  } catch { return Response.error(); }
}
