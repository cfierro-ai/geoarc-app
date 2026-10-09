# GEO·ARC — Decisiones y diagnóstico

## 2026-10-08 · Arranque

### Decisiones de producto (Chris)
- No hay código fuente previo: el handoff v1.2 se usa como especificación funcional. **Reescritura desde cero.**
- Núcleo: **envolvente normativa sobre terreno real** (topografía + rasantes/cabida en pendiente + salida CAD/BIM).
- Usuario de corto plazo: **docencia META|Lab** (estudiantes de Arquitectura).
- El estudiante parte **siempre desde un sitio real**: Temuco, cualquier lugar de Chile o del mundo.

### Implicancias técnicas
- DEM global, leído desde el navegador, sin backend:
  - Copernicus GLO-30 (COG en AWS Open Data) — **DSM**: incluye dosel y edificios.
  - Terrarium (AWS Terrain Tiles) — en Chile ≈ SRTM 30 m; referencial.
  - Ladera sintética para clases sin conexión y tests.
  - Más adelante: levantamiento DXF, fotogrametría propia, FABDEM (DTM) pre-procesado para Chile.
- Riesgo Araucanía: en sitios con bosque el DSM puede sobrestimar 10–25 m. Mitigación: metadatos y advertencias
  visibles + importación de levantamiento + comparación DSM/DTM como contenido de clase.
- Proyección: UTM automática según el sitio (cualquier huso, ambos hemisferios).
- Perfiles normativos intercambiables: “OGUC Chile” y “Personalizado” (sitios fuera de Chile).
- Sitio estático (GitHub Pages), sin login.

### Diagnóstico del prototipo anterior (handoff v1.2)
- Motor isométrico SVG/D3 hecho a mano = techo técnico (sin z-buffer, rendimiento, rasantes inclinadas son un problema 3D).
- Bug del dibujo libre: transformaciones de pantalla calculadas a mano; además la inversa isométrica asumía z = 0
  (desfase proporcional a la cota). **Se elimina por diseño**: el lote se dibuja en el mapa, en coordenadas geográficas.
- `insetPolygonBisector`: falla en polígonos cóncavos y supone distanciamiento uniforme (la norma no lo es).
- OSM no aporta cotas ni predios en Chile.
- Grupo normativo por latitud: incorrecto; la OGUC asigna por región administrativa.
- Valores 51°/57°/63° y regla “> 10,5 m (Art. 2.6.12)”: **no verificados**.
- Referente: geonorma.cl (norma, cabida, 3D; según su web, sin topografía, curvas ni exportación).

### Decisiones de implementación v0.1
- Stack: React + TypeScript + Vite + Tailwind; MapLibre (mapa/dibujo); React-Three-Fiber (3D); proj4; geotiff.js; Vitest; Playwright.
- Curvas: marching squares propio (necesitamos isolíneas abiertas/cerradas para DXF; d3-contour entrega polígonos de banda).
- Envolvente como **campo de alturas** con rasantes trazadas desde cada punto del deslinde a su cota natural; se
  registra la restricción gobernante por celda. No se usa offset de polígonos (Clipper) en v0.1.
- DXF R12 propio (máxima compatibilidad), en UTM absolutas.
- Valores normativos solo en `src/core/normativa/perfiles.ts`, con `verificado`/`fuente`. Todos los OGUC están en `false`.

### Pendientes abiertos
- Verificar CORS de Copernicus y Terrarium en navegador real (el entorno de desarrollo bloqueó la prueba).
  → Resuelto el 2026-10-09 (ver abajo).
- Chris: fijar valores OGUC verificados.

## 2026-10-09 · Publicación y verificación de CORS

### Publicación
- Repo público: https://github.com/Chris-Fierro/geoarc
- GitHub Pages con GitHub Actions como fuente (`build_type=workflow`): https://chris-fierro.github.io/geoarc/

### CORS de las fuentes de elevación
Verificado con `curl` desde la red de Chris y con `fetch()` en navegador real (Chromium) sobre el sitio publicado.
Origin: `https://chris-fierro.github.io`.

| Fuente | Petición | Estado | `Access-Control-Allow-Origin` |
|---|---|---|---|
| Copernicus GLO-30 (`copernicus-dem-30m.s3.amazonaws.com`) | GET/HEAD con `Range: bytes=0-1023` | 206 | **ausente** |
| Copernicus GLO-30 | OPTIONS (preflight) | **403** — `CORSResponse: CORS is not enabled for this bucket.` | — |
| Copernicus GLO-30, endpoint regional (`…s3.eu-central-1.amazonaws.com`) | GET / OPTIONS | 206 / 403, mismo mensaje | ausente |
| Copernicus GLO-30 | `fetch()` en navegador | **bloqueado** — `No 'Access-Control-Allow-Origin' header is present` | — |
| Terrarium (`s3.amazonaws.com/elevation-tiles-prod`) | GET | 200 | `*` (métodos: GET) |
| Terrarium | HEAD | 200 | ausente (la regla CORS del bucket cubre solo GET; la app usa GET) |
| Terrarium | OPTIONS (preflight) | 200 | `*` |
| Terrarium | `fetch()` en navegador | 200, 38 032 bytes | — |

### Conclusiones
- **Terrarium funciona desde el navegador.** Flujo probado en producción (Temuco): curvas, metadatos y advertencias OK.
- **Copernicus NO funciona desde el navegador.** El bucket entrega los bytes (curl recibe 206), pero no tiene CORS
  habilitado y el navegador bloquea la respuesta. No depende del origen ni del endpoint; falla igual en `localhost`.
  No es un problema del despliegue.
- La app falla con gracia: `loadDem` muestra «No se pudo cargar el terreno (copernicus). Failed to fetch. Prueba otra
  fuente…». Pero Copernicus es la fuente **por defecto** (`App.tsx`), así que el primer intento del estudiante falla.

### Decisión (Chris)
- Publicar tal cual y solo documentar. Quedan por decidir:
  - Cambiar la fuente por defecto a Terrarium.
  - Proxy liviano para Copernicus (p. ej. Cloudflare Worker que reenvíe `Range` y agregue CORS). Por la regla 4 de
    `CLAUDE.md`, se documenta aquí antes de implementarlo.

### Pendientes abiertos
- Decidir fuente por defecto y proxy de Copernicus (arriba).
- Actualizar la nota de CORS en `CLAUDE.md` (Trampas conocidas) y el estado del paso 2 en `SPEC.md`.
- Chris: fijar valores OGUC verificados.

## 2026-10-09 · Traslado a la cuenta docente y fallo de e2e en runner privado

### Repositorio (Chris)
- El proyecto vive en la cuenta universitaria: **https://github.com/cfierro-ai/geoarc-app** (público).
  Sitio: **https://cfierro-ai.github.io/geoarc-app/**.
- Se creó privado. El plan gratuito no permite Pages en repos privados (`422: Your current plan does not support
  GitHub Pages for this repository`), así que se hizo público. Se descartó GitHub Education porque su beneficio
  docente es GitHub Team para una *organización*: habría obligado a crear una organización y transferir el repo.
- Commits firmados con el correo universitario. `Chris-Fierro/geoarc` se mantiene hasta confirmar el sitio nuevo.
- El CORS medido arriba sigue valiendo: Terrarium responde `Access-Control-Allow-Origin: *` (cualquier origen) y
  Copernicus no tiene CORS para ningún origen.

### Fallo de `e2e/flujo.spec.ts` solo en el repo privado
- Síntoma: `locator.hover` sobre «Rol lado 1» agota los 60 s esperando que el elemento esté «visible y estable».
- Diferencia de entorno: los runners de repos privados tienen 2 vCPU (Playwright corre con 1 worker) y los de repos
  públicos tienen 4 vCPU (2 workers). El mismo commit pasaba en el repo público.
- Causa raíz: la vista 3D usaba `frameloop='always'` y redibujaba sin pausa una escena estática, con sombras. Con
  WebGL por software (SwiftShader en CI; también en equipos sin GPU) cada cuadro costaba ~0,6 s. Playwright necesita
  cuadros consecutivos estables para el `hover`.
- Corrección: `frameloop='demand'`, para dibujar solo cuando algo cambia, e `invalidate()` en `CameraFit` al mover
  la cámara. No se subió el timeout del test.
- Verificación local con 2 núcleos y 1 worker: cuadro en reposo 610 ms → 7 ms; `hover` 1,7 s → 0,1 s; la órbita y el
  resaltado por lado siguen redibujando (capturas revisadas). En CI, runner privado: e2e 103 s con fallo → 26 s,
  2/2 pasados.
- Regla: todo cambio imperativo en la escena 3D (fuera de las props de React) debe llamar a `invalidate()`.

## 2026-10-09 · Elevación: Terrarium por defecto y respaldo automático (Chris)

### Diagnóstico de la falla de Copernicus (antes de tocar código)
Desde https://cfierro-ai.github.io/geoarc-app/ con fuente Copernicus, y con `curl` usando `Origin: https://cfierro-ai.github.io`:
- **Consola del navegador:** `Access to fetch at 'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_S39_00_W073_00_DEM/…tif'
  from origin 'https://cfierro-ai.github.io' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is
  present on the requested resource.` Después `net::ERR_FAILED`. La app muestra «Failed to fetch».
- **GET con `Range: bytes=0-65535`** (lo que pide geotiff.js): `206 Partial Content`, `Content-Range: bytes 0-65535/45689974`,
  **sin** `Access-Control-Allow-Origin`.
- **Preflight `OPTIONS`:** `403` — `CORSResponse: CORS is not enabled for this bucket.`
- **Causa exacta:** el bucket S3 `copernicus-dem-30m` no tiene configuración CORS. El navegador no hace preflight (un
  `Range` simple es cabecera permitida), recibe los bytes, pero bloquea la respuesta porque falta
  `Access-Control-Allow-Origin`. No depende del origen ni de la red del usuario, y no se corrige del lado de la app.
- **Consecuencia para el código:** JavaScript no puede distinguir un bloqueo CORS de una caída de red (ambos llegan como
  `TypeError: Failed to fetch`). Por eso el respaldo se activa ante **cualquier** error del cargador de Copernicus.
- Terrarium, mismo origen: `200` con `Access-Control-Allow-Origin: *`.

### Decisión
- Terrarium pasa a ser la fuente por defecto.
- Si Copernicus falla, la app carga Terrarium sola, cambia el selector a Terrarium y avisa en el panel
  («Copernicus no disponible; se usó Terrarium»). Si Terrarium también falla, se informa el error de ambas fuentes.
- Copernicus queda en el selector para cuando exista un proxy (pendiente en el backlog).
