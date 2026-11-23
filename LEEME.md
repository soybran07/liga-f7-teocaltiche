# Página de la Liga de Fútbol 7 Teocaltiche

Página web propia para llevar todas las ligas municipales de fútbol 7: torneos, equipos, jugadores, rol de juegos automático, resultados, tabla de posiciones, goleo y disciplina (tarjetas y multas). Costo: **$0** (Supabase gratis + GitHub Pages gratis).

## Qué hace

**Página pública** (la ve cualquiera, ideal para mandar el link por WhatsApp):
- Calendario por jornada, con fecha, hora, cancha y quién descansa.
- Tabla de posiciones (por grupos si los usas), con PJ, G, E, P, GF, GC, DIF, PTS y últimos 5.
- Tabla de goleo y de disciplina (amarillas, rojas, azules y multa acumulada).
- Plantillas de cada equipo (solo nombre y número).

**Panel de administración** (solo tú, con correo y contraseña):
- Varios torneos a la vez (Juvenil, Libre, Apertura, Clausura…), cada uno con sus puntos y multas.
- Equipos con grupo, delegado y teléfono. Jugadores uno por uno o en lista.
- CURP y fecha de nacimiento guardadas en una tabla privada que el público nunca puede leer.
- **Generador de rol "todos contra todos"**: eliges semana de inicio, días (lun/mar), horarios (7, 8 y 9 pm) y si es ida y vuelta; te muestra la vista previa y la guardas. Si son impares, descansa uno por jornada.
- Captura de marcador, goles por jugador y tarjetas. Cambiar fecha/hora o suspender un partido.
- Respaldo: descargar e importar todos los datos en un archivo .json.

## Probarla ya (modo demo)

Abre la carpeta en una terminal y corre un servidor local:

```
python -m http.server 8000
```

y entra a http://localhost:8000. En modo demo los datos se guardan solo en ese navegador (ya trae los 10 equipos del Apertura).

> No funciona con doble clic en `index.html` porque los navegadores bloquean los módulos JavaScript desde archivos locales.

## Ponerla en internet (una sola vez, ~20 minutos)

### 1. Base de datos en Supabase (gratis)
1. Crea una cuenta en https://supabase.com y un proyecto nuevo (región: la más cercana, p. ej. `East US`). Guarda la contraseña de la base.
2. Ve a **SQL Editor > New query**, pega todo el contenido de `supabase/schema.sql` y dale **Run**.
3. Ve a **Authentication > Users > Add user > Create new user**, pon tu correo y una contraseña, y marca **Auto Confirm User**.
4. De nuevo en **SQL Editor**, corre esta línea con tu correo:
   ```sql
   insert into admins (user_id) select id from auth.users where email = 'TU_CORREO';
   ```
5. Recomendado: en **Authentication > Sign In / Providers** desactiva **Allow new users to sign up**, para que nadie más pueda crear usuarios.
6. En **Project Settings > API** copia el **Project URL** y la **anon public key**, y pégalos en `js/config.js`.

### 2. Publicar la página en GitHub Pages (gratis)
1. En GitHub crea un repositorio (p. ej. `liga-f7-teocaltiche`) y sube todos los archivos de esta carpeta.
2. En el repositorio: **Settings > Pages > Source: Deploy from a branch > main / (root) > Save**.
3. En un par de minutos queda en `https://TU_USUARIO.github.io/liga-f7-teocaltiche/`.
4. El panel está en esa misma dirección agregando `#/admin`.

(También funciona igual en Netlify o Cloudflare Pages arrastrando la carpeta.)

### 3. Pasar lo del modo demo a la nube (opcional)
En el modo demo ve a **Administrar > Respaldo > Descargar respaldo**. Ya con Supabase conectado, entra como administrador y usa **Importar respaldo**.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `styles.css` | La página y su diseño (se adapta a celular y a modo oscuro). |
| `js/config.js` | Aquí pegas los datos de Supabase y el nombre de la liga. |
| `js/app.js` | Pantallas pública y de administración. |
| `js/db.js` | Guardar y leer datos (Supabase o modo demo). |
| `js/roundrobin.js` | Generador del rol de juegos. |
| `js/stats.js` | Tabla de posiciones, goleo y disciplina. |
| `supabase/schema.sql` | Tablas y reglas de seguridad de la base de datos. |

## Credenciales con QR
- Corre una vez `supabase/migracion-002-credenciales.sql` en Supabase.
- En **Equipos y jugadores** marca "Registro pagado" y "Docs verificados", revisa pagos y suspensiones con el botón **Pagos**.
- Botón **🪪 Credenciales** del equipo (o **Imprimir** por jugador): hoja carta con tiras de 17.2 × 5.4 cm para doblar (8.6 × 5.4 cm). Imprime a escala 100% en opalina.
- El QR abre `#/j/CODIGO`: estado (activo, suspendido, registro pendiente), goles, tarjetas, "al corriente / con adeudo" y documentos. Nunca muestra montos ni CURP.
- Las multas por tarjeta y la suspensión por roja o doble amarilla se generan solas al capturar el partido.

## Siguientes ideas
- Imagen del rol semanal lista para compartir en WhatsApp.
- Control de pagos (inscripción $350, registro $50, arbitraje por partido) y adeudos por equipo.
- Suspensiones automáticas por tarjetas.
- Liguilla (cuartos, semis y final) al terminar la fase regular.
