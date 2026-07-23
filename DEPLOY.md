# Guia de despliegue — ValidaSRI

Arquitectura del despliegue (dos piezas que se comunican **a traves de Supabase**):

```
   Vercel (web Next.js)  ─┐
                          ├─►  Supabase (base de datos)  ◄─  VPS Hostinger (worker, Docker)
   usuarios navegan      ─┘
```

- **Web** → Vercel (crea los lotes).
- **Worker** → VPS Hostinger con Docker (procesa los lotes en segundo plano).
- Ambos apuntan al **mismo proyecto Supabase** (`validasri`).

Proyecto Supabase ya creado:
- URL: `https://ouorcwgmenhtqvmooscd.supabase.co`
- Migraciones aplicadas y usuario demo sembrado.

---

## Paso 0 — Subir el codigo a GitHub

El repositorio git ya esta inicializado con el primer commit. Falta crear el repo en GitHub y subirlo.

1. Entra a <https://github.com/new> y crea un repositorio **vacio** (sin README), por ejemplo `validasri`. Puede ser **privado**.
2. En la terminal, dentro de la carpeta del proyecto:

   ```bash
   git remote add origin https://github.com/TU_USUARIO/validasri.git
   git push -u origin main
   ```

   (Te pedira iniciar sesion en GitHub la primera vez.)

> El archivo `.env` con tus llaves **NO** se sube: esta protegido por `.gitignore`.

---

## Paso 1 — Web en Vercel

1. Entra a <https://vercel.com>, inicia sesion con GitHub e **importa** el repositorio `validasri`.
2. En la configuracion del proyecto:
   - **Root Directory:** `apps/web`  (importante, es un monorepo).
   - **Framework Preset:** Next.js (se detecta solo).
   - **Node.js Version:** 22.x (Settings → General).
3. Agrega las **variables de entorno** (Settings → Environment Variables). Copia los valores de tu `.env` local:

   | Variable | Valor |
   | --- | --- |
   | `DATA_PROVIDER` | `supabase` |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://ouorcwgmenhtqvmooscd.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (tu anon key) |
   | `SUPABASE_SERVICE_ROLE_KEY` | (tu service_role — **secreta**) |
   | `SRI_PROVIDER` | `mock` para probar, `soap` para el SRI real |
   | `SRI_ENVIRONMENT` | `test` o `production` |
   | `MAX_TXT_SIZE_MB` | `5` |
   | `MAX_KEYS_PER_BATCH` | `10000` |
   | `NEXT_PUBLIC_APP_URL` | la URL que te de Vercel (ej. `https://validasri.vercel.app`) |

4. **Deploy**. Cuando termine, abre la URL: deberias poder iniciar sesion con `demo@validasri.ec` / `ValidaSRI2026`.

> Con esto la web ya funciona, pero los lotes quedaran "en cola" hasta que el worker (paso 2) este corriendo.

---

## Paso 2 — Worker en el VPS de Hostinger (Docker)

El worker necesita estar **siempre encendido**. Se despliega con el `docker-compose.yml` de este repositorio.

### Convivencia con n8n (u otros proyectos Docker del VPS) — importante

Este worker **no afecta** a tu n8n existente:

- Vive en su **propia carpeta** (`validasri`) y su propio proyecto Docker (`name: validasri`).
  Los comandos `docker compose` **solo** actuan sobre los contenedores de la carpeta donde los
  ejecutas: pararse en `validasri/` nunca toca los contenedores de n8n.
- **No abre ningun puerto** (el worker solo hace llamadas salientes a Supabase y al SRI), asi que
  no puede chocar con el puerto de n8n.
- Reglas de oro para no romper nada:
  - Ejecuta los comandos Docker **siempre dentro de la carpeta `validasri`**.
  - Usa `docker compose up -d` / `logs` / `down` (que solo afectan a este proyecto).
  - **Nunca** uses `docker system prune -a` ni `docker compose down` fuera de esta carpeta:
    esos si podrian afectar a otros contenedores.

### Opcion A — SSH + Docker Compose (funciona en cualquier VPS)

1. Conectate a tu VPS por SSH (desde hPanel de Hostinger obtienes IP y credenciales):

   ```bash
   ssh root@TU_IP_DEL_VPS
   ```

2. Asegurate de tener Git y Docker. En VPS de Hostinger con la plantilla de Docker ya vienen; si no:

   ```bash
   apt update && apt install -y git
   # Docker: https://docs.docker.com/engine/install/  (o usa la plantilla Docker de Hostinger)
   ```

3. Clona el repositorio y entra:

   ```bash
   git clone https://github.com/TU_USUARIO/validasri.git
   cd validasri
   ```

4. Crea el archivo `.env` **en el VPS** (junto al `docker-compose.yml`) con tus valores reales:

   ```bash
   nano .env
   ```

   Pega esto y completa las llaves:

   ```env
   DATA_PROVIDER=supabase
   NEXT_PUBLIC_SUPABASE_URL=https://ouorcwgmenhtqvmooscd.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=TU_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
   SRI_PROVIDER=mock
   SRI_ENVIRONMENT=test
   WORKER_CONCURRENCY=3
   SRI_REQUEST_TIMEOUT_MS=20000
   SRI_MAX_RETRIES=3
   SRI_REQUEST_DELAY_MS=500
   WORKER_POLL_INTERVAL_MS=3000
   WORKER_CLAIM_SIZE=25
   WORKER_LOCK_TIMEOUT_MS=120000
   ```

   Guarda con `Ctrl+O`, `Enter`, y sal con `Ctrl+X`.

5. Levanta el worker:

   ```bash
   docker compose up -d --build
   ```

6. Verifica que este corriendo:

   ```bash
   docker compose logs -f worker
   ```

   Deberias ver `"Worker de ValidaSRI iniciado"` y, cuando haya lotes, `"Ciclo completado"`.

Para actualizarlo mas adelante (tras un `git push`):

```bash
git pull && docker compose up -d --build
```

### Opcion B — Docker Manager de hPanel

En **hPanel → VPS → Docker Manager** puedes crear un proyecto a partir del `docker-compose.yml`
(subiendolo o apuntando al repositorio) y definir las mismas variables de entorno del paso 4.
Es la misma idea con interfaz grafica.

---

## Poner el SRI real

Cuando quieras dejar de usar el modo demostracion y consultar al SRI de verdad, cambia en **ambos**
lados (Vercel y el `.env` del VPS):

```
SRI_PROVIDER=soap
SRI_ENVIRONMENT=test        # o production cuando estes listo
```

Y reinicia: en Vercel se redepliega solo al cambiar variables; en el VPS `docker compose up -d`.

---

## Seguridad

- La llave `service_role` es como una llave maestra: solo va en Vercel (variables) y en el `.env`
  del VPS. **Nunca** en GitHub.
- Si crees que se expuso, rotala en Supabase (Settings → API → Rotate) y actualiza los dos lugares.
