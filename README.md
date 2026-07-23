# ValidaSRI

Plataforma web para **validar masivamente comprobantes electronicos del SRI de Ecuador** a partir
de un archivo TXT con claves de acceso. Sube el archivo, el sistema analiza y valida las claves,
crea un lote y un worker en segundo plano consulta cada clave en el Web Service oficial del SRI.
Los resultados se visualizan en una tabla filtrable y se exportan a Excel o CSV.

> **Aviso:** Esta plataforma no pertenece al Servicio de Rentas Internas. La informacion presentada
> depende de la disponibilidad y respuesta de los servicios oficiales del SRI.

---

## Caracteristicas

- Inicio de sesion y recuperacion de contrasena.
- Carga de TXT con analisis en el navegador (validas / invalidas / duplicadas) y **revalidacion
  completa en el servidor**.
- Procesamiento en segundo plano mediante un **worker separado** con concurrencia, timeout,
  control de velocidad y reintentos con backoff exponencial.
- Consulta al **Web Service SOAP oficial** del SRI, con adaptador aislado y **proveedor mock**
  para demostracion sin dependencia de la red.
- Tabla de resultados con busqueda, filtros, paginacion desde el servidor y exportacion a
  Excel/CSV (clave de acceso como texto, sin notacion cientifica).
- Historial de lotes, reintento de fallidos, limites mensuales por plan.
- Arquitectura **SaaS multiempresa** con aislamiento por organizacion.

## Arquitectura

Monorepo con **npm workspaces**:

```
apps/
  web/                 Aplicacion Next.js (App Router) — se despliega en Vercel
  worker/              Worker de procesamiento Node.js — se despliega con Docker
packages/
  shared/              Tipos, estados, utilidades de clave de acceso y fechas (Ecuador)
  validation/          Parser y validacion del TXT + esquemas Zod
  sri-client/          Adaptador SOAP del SRI + proveedor mock + normalizador
  database/            Interfaz de repositorio con drivers intercambiables (local / supabase)
  export/              Generador de Excel (ExcelJS) y CSV
supabase/
  migrations/          Esquema PostgreSQL, RLS y seed
data/
  ejemplo-claves.txt   Claves ficticias que disparan cada caso del mock
```

**Regla de capas:** los componentes visuales nunca acceden directamente a `sri-client` ni a
`database`; pasan por `apps/web/src/server/*`. El worker usa `database` + `sri-client`, nunca `web`.

### Capa de datos intercambiable

`packages/database` expone la interfaz `ValidaSriRepository` con dos implementaciones
seleccionadas por la variable `DATA_PROVIDER`:

- **`local`** — SQLite (`node:sqlite`, incluido en Node ≥ 22). No requiere Supabase. Pensado para
  desarrollo y demostracion. Autenticacion propia con hash `scrypt` y cookie de sesion firmada.
- **`supabase`** — PostgreSQL + Supabase Auth + RLS + Realtime (reservado para produccion).

El esquema SQLite replica el esquema PostgreSQL columna por columna, de modo que migrar es cambiar
una variable de entorno.

## Tecnologias

Next.js 15 · React 19 · TypeScript (modo estricto) · Tailwind CSS 4 · Radix UI · TanStack Table ·
React Hook Form · Zod · ExcelJS · `soap` · Vitest · Playwright · Node.js `node:sqlite`.

## Requisitos

- **Node.js ≥ 22** (necesario para `node:sqlite`).
- npm ≥ 10.
- Docker (solo para desplegar el worker; opcional en desarrollo).

## Instalacion local

```bash
git clone <repositorio>
cd "VALIDEZ DE COMPROBANTES"
npm install
cp .env.example .env
```

Genera un secreto de sesion y colocalo en `.env` (`LOCAL_SESSION_SECRET`):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Crea la base de datos local y el primer usuario/organizacion:

```bash
npm run db:setup
```

Esto crea `.data/validasri.db` y siembra:

- **Usuario:** `demo@validasri.ec`
- **Contrasena:** `ValidaSRI2026`
- **Organizacion:** «Empresa Demostracion» (plan Profesional, 10 000 validaciones/mes)

Personaliza el seed con las variables `SEED_EMAIL`, `SEED_PASSWORD`, `SEED_ORG_NAME`,
`SEED_ORG_RUC`, `SEED_ORG_PLAN`.

Levanta la aplicacion y, en otra terminal, el worker:

```bash
npm run dev            # web en http://localhost:3000
npm run dev:worker     # worker de procesamiento
```

Inicia sesion, ve a **Nueva validacion** y sube `data/ejemplo-claves.txt`.

## Variables de entorno

Ver [`.env.example`](.env.example). Las principales:

| Variable | Descripcion |
| --- | --- |
| `DATA_PROVIDER` | `local` (SQLite) o `supabase` |
| `LOCAL_DB_PATH` | Ruta del archivo SQLite en modo local |
| `LOCAL_SESSION_SECRET` | Secreto para firmar la sesion local (≥ 32 caracteres) |
| `SRI_PROVIDER` | `mock` (demostracion) o `soap` (servicio real) |
| `SRI_ENVIRONMENT` | `test` o `production` |
| `SRI_TEST_WSDL_URL` / `SRI_PRODUCTION_WSDL_URL` | WSDL del SRI por entorno |
| `MAX_TXT_SIZE_MB` / `MAX_KEYS_PER_BATCH` | Limites de carga |
| `WORKER_CONCURRENCY` | Consultas simultaneas del worker |
| `SRI_REQUEST_TIMEOUT_MS` | Timeout por consulta |
| `SRI_MAX_RETRIES` | Reintentos ante errores temporales |
| `SRI_REQUEST_DELAY_MS` | Pausa entre consultas (control de velocidad) |
| `WORKER_POLL_INTERVAL_MS` | Intervalo de sondeo de la cola |

Las claves privadas de Supabase (`SUPABASE_SERVICE_ROLE_KEY`) son **solo de servidor** y nunca
deben llegar al navegador.

## Modo de demostracion (mock)

Con `SRI_PROVIDER=mock` el sistema no consulta la red. El resultado depende del **ultimo digito**
de la clave de acceso:

| Ultimo digito | Resultado |
| --- | --- |
| 0–4 | Autorizado |
| 5 | No autorizado |
| 6 | Anulado |
| 7 | Anulacion en proceso |
| 8 | No encontrado |
| 9 | Error temporal (se reintenta y termina en error) |

El archivo [`data/ejemplo-claves.txt`](data/ejemplo-claves.txt) contiene 20 claves validas (que
cubren todos los casos), 2 duplicadas, 3 invalidas y lineas vacias.

## Servicio real del SRI

Con `SRI_PROVIDER=soap` el worker consume el Web Service SOAP oficial:

- **Pruebas:** `https://celcer.sri.gob.ec/comprobantes-electronicos-ws/ConsultaComprobante?wsdl`
- **Produccion:** `https://cel.sri.gob.ec/comprobantes-electronicos-ws/ConsultaComprobante?wsdl`

Operacion `consultarEstadoAutorizacionComprobante`, parametro `claveAcceso`. La interpretacion de
la respuesta esta aislada en `packages/sri-client/src/normalizer.ts`. Si el servicio de pruebas no
responde, usa el modo mock: el sistema **nunca simula un exito** que no pudo ejecutarse.

## Ejecucion del worker

```bash
npm run dev:worker                 # modo continuo, con recarga
npm run start --workspace apps/worker      # modo continuo
npm run process-once --workspace apps/worker   # un solo ciclo y termina
```

El worker: libera bloqueos de workers caidos, reclama un lote acotado de claves de forma atomica,
consulta cada una con concurrencia y pausa configurables, aplica backoff exponencial ante errores
temporales, actualiza el progreso del lote y lo cierra cuando no quedan pendientes.

## Pruebas

```bash
npm run test          # pruebas unitarias (Vitest)
npm run test:e2e      # prueba end-to-end del flujo principal (Playwright)
npm run typecheck     # TypeScript estricto (paquetes, worker y web)
npm run lint          # ESLint de la web
```

Cobertura: validacion del TXT (49 digitos, letras, corta, larga, vacias, duplicados, archivo
invalido), normalizacion de la respuesta SOAP, reintentos y backoff, calculo del progreso, limites
mensuales, **aislamiento entre organizaciones** y exportacion sin notacion cientifica. La E2E
recorre login → carga → analisis → creacion del lote → procesamiento con mock → resultados →
descarga.

## Despliegue

### Web en Vercel

1. Importa el repositorio en Vercel.
2. **Root Directory:** `apps/web`.
3. Configura las variables de entorno (usa `DATA_PROVIDER=supabase` en produccion).
4. Vercel detecta Next.js y despliega automaticamente.

> No proceses cientos o miles de claves dentro de una funcion de Vercel: la web solo crea el lote;
> el worker lo procesa aparte.

### Worker con Docker

```bash
docker compose up --build
```

El [`docker-compose.yml`](docker-compose.yml) y el [`apps/worker/Dockerfile`](apps/worker/Dockerfile)
ejecutan el worker en un VPS. Configura las variables (Supabase + SRI) por entorno.

### Usar Supabase (produccion)

El driver `supabase` esta **implementado**. Para operar sobre Supabase:

1. Crea un proyecto en Supabase.
2. Aplica las migraciones de [`supabase/migrations/`](supabase/migrations/) en orden:
   `0001`, `0002`, `0004`, `0005`, `0006`. **Omite `0003_seed.sql`** (el seed lo hace el script del
   paso 4). Puedes pegarlas en el **SQL Editor** o usar la CLI de Supabase.
3. En `.env` define:
   ```
   DATA_PROVIDER=supabase
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...        # Settings -> API -> service_role secret
   ```
4. Siembra el primer usuario y organizacion:
   ```
   npm run db:setup:supabase
   ```
   (crea el usuario en Supabase Auth y la organizacion demo; personalizable con `SEED_*`).
5. Arranca la web y el worker igual que en local.

**Notas del driver Supabase:**
- El servidor y el worker usan la **service_role**; el aislamiento entre empresas se garantiza
  filtrando por `organization_id` en cada consulta (el RLS de `0002` es defensa en profundidad).
- La sesion es un token opaco propio en la tabla `app_sessions` (12 h); las credenciales se validan
  con Supabase Auth y la recuperacion de contrasena envia el correo real de Supabase.
- En Vercel, usa **Node 22** (runtime de las funciones) por `node:sqlite`, que se carga de forma
  perezosa y solo se usa en modo local.

## Medidas de seguridad

- Row Level Security en todas las tablas (PostgreSQL) y filtrado obligatorio por `organization_id`
  en cada consulta del repositorio (doble barrera de aislamiento).
- Revalidacion integra en el servidor: nunca se confia en el navegador.
- Rate limiting en endpoints sensibles (login, creacion de lotes, reintentos).
- Sanitizacion de nombres de archivo y rechazo de contenido binario.
- Cabeceras de seguridad (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`).
- Logs con la clave de acceso enmascarada; los errores tecnicos del SRI no se muestran al usuario.
- Los operadores no pueden modificar la configuracion de la organizacion.

## Limitaciones conocidas

- El rate limiting es en memoria (suficiente para una instancia); en multi-instancia se sustituye
  por un store compartido.
- El progreso del detalle del lote se actualiza por *polling* cada 3 s (no se usa Realtime de
  Supabase todavia).
- La sesion del modo Supabase dura 12 h (tabla `app_sessions`); no hay refresco automatico.
- En modo local no hay envio real de correo para la recuperacion de contrasena.
- `node:sqlite` es una API experimental de Node; se usa solo para el modo local/demostracion.

## Licencia

Uso interno / evaluacion. Ajustar segun corresponda antes de distribuir.
