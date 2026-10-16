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
- Actualizar la nota de CORS en `CLAUDE.md` (Trampas conocidas) y el estado del paso 2 en `SPEC.md`. → Hecho el 2026-10-09.
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

## 2026-10-09 · Riesgo del redibujo bajo demanda en la vista 3D (Chris)

- Hallazgo: con los planos de rasante desactivados, la vista 3D quedaba **congelada**. Seguía mostrando los planos y no
  mostraba el resaltado del lado. Había dos causas:
  1. El resaltado cambia colores del `InstancedMesh` en un efecto, fuera de las props de React. No pedía cuadro.
  2. **R3F 9.8.1 no pide cuadro al desmontar objetos**: `removeChild` anula `child.parent` y luego llama a
     `invalidateInstance(child)`, que retorna de inmediato si no hay `parent`. Desactivar los planos, borrar el lote
     o perder la envolvente no redibujaban.
- Corrección en `Scene3D.tsx`: `invalidate()` en el efecto de matrices y colores del `InstancedMesh` y en `CameraFit`,
  más `RedrawOnUpdate`, que pide un cuadro tras cada actualización de la escena (incluye desmontajes y cambio de vista).
- Prueba: `e2e/resaltado.spec.ts` lee el buffer del canvas. Exige que desactivar los planos cambie el cuadro y que,
  al resaltar el lado 2, los píxeles verdes del lado 4 caigan (medido: 4.482 → 6). Falló antes de la corrección.

## 2026-10-09 · Uso en clase: mapa base y buscador con respaldo (Chris)

- **Mapa base:** OpenFreeMap, estilo vectorial «Liberty» (`tiles.openfreemap.org`, CORS `*`, sin clave), por
  defecto. OSM raster y Satélite (Esri) son alternativas en el selector. Las tres conviven en un solo estilo y se
  alternan por visibilidad, así las curvas y el lote no se pierden al cambiar de mapa base.
- Si el estilo de OpenFreeMap no carga (red de la sala, bloqueo), el mapa queda en OSM raster y «Mapa» se deshabilita
  (`e2e/mapa-base.spec.ts`).
- Las etiquetas de cota usan «Noto Sans Regular»: la fuente por defecto de MapLibre (Open Sans) da 404 en OpenFreeMap.
- **Buscador:** Nominatim; si falla o limita (HTTP de error, red, 8 s sin respuesta) se consulta Photon
  (`photon.komoot.io`, CORS `*`). Una respuesta vacía no es falla. Photon no admite `lang=es` (400): se usa su idioma
  por defecto. Tests unitarios con fetch simulado y e2e con Nominatim respondiendo 429.
- **Atribuciones:** el mapa muestra la del mapa base activo (control no compacto), la lista de resultados indica qué
  buscador respondió, y el README las detalla todas.

## 2026-10-10 · v0.2 · Módulo Curvas de nivel (Chris)

### Pedido
- Flujo del profesor: **ubicar el sitio → dibujar el área → las curvas aparecen**. El terreno se descarga solo
  (Terrarium). El profesor no elige ni carga un DEM, salvo «ladera sintética» si no hay internet (o un levantamiento
  DXF, todavía pendiente). El selector de fuente queda en «Opciones avanzadas», plegado.

### Decisiones de implementación
- **Área de extracción:** rectángulo de dos clics alineado con la cuadrícula **UTM** del sitio, no con el norte
  geográfico, para que el DXF quede alineado con los ejes del CAD. En el mapa se ve girado según la convergencia de
  meridianos (~1,5° en Temuco, huso 18). La vista previa muestra el tamaño en metros y hectáreas. Lado mínimo 10 m;
  máximo 20 km (tope de cordura, no pedido; `MAX_AREA_SIDE`). Esc cancela.
- **Celda automática** (`src/core/dem/area.ts`): «~250 celdas por lado» se interpreta sobre el lado **menor**, y
  «cap 2 000 × 2 000» como tope de celdas por lado de la grilla (pesa en áreas de proporción mayor a 8:1). La celda se
  redondea a la serie 1–1,25–1,5–2–2,5–3–4–5–6–8 y nunca baja de 0,25 m. Si el tope quería decir 2 000 × 2 000 **m**
  de área máxima, basta cambiar `MAX_AREA_SIDE`.
- **Carga sin botón:** al cerrar el área, al cambiar de fuente o al abrir una escena. Cada carga lleva un número de
  secuencia y una respuesta vieja se descarta. Si falla, el panel ofrece «Reintentar».
- **Terrarium con zoom adaptativo:** se pide el zoom más bajo cuyo píxel no supera la celda (tope z14). Un área grande
  pide pocas teselas. Si el píxel supera 30 m, `nominalResolutionM` pasa a ser el tamaño del píxel.
- **Escala confiable** — *reemplazado el mismo día por el criterio de Chris (sección siguiente)*
  (`src/core/contours/escala.ts`, único lugar del criterio; es cartográfico y docente, no normativo):
  - Escala: regla de Tobler (1987): denominador = 2 000 × resolución. Un dato de 30 m ⇒ **1:60.000**.
  - Equidistancia mínima sugerida: ≈ denominador / 2 500 (series topográficas usuales: 1:25.000 → 10 m;
    1:50.000 → 20 m), redondeada hacia arriba en la serie 1–2–2,5–5. Para Terrarium ⇒ **25 m**.
  - Se preselecciona al cargar el dato, y solo se vuelve a preseleccionar si cambia la resolución. Las equidistancias
    menores siguen en el selector, marcadas «aparente», y se muestra el aviso de precisión aparente.
  - **Por revisar con Chris:** con Terrarium, 25 m deja pocas curvas en un área del tamaño de un sitio. Es el mensaje
    docente, pero puede preferir otro factor.
- **Malla del dato:** líneas cada `nominalResolutionM`, en múltiplos desde el origen del marco. Muestra el **tamaño**
  de la celda del dato, no la posición exacta de sus píxeles (SRTM es una grilla de 1″ en lon/lat).
- **DXF de curvas:** capas CURVAS, CURVAS_MAESTRAS, ETIQUETAS (TEXT centrado con la cota, alineado a la curva y
  siempre legible) y AREA (polilínea 2D cerrada a cota 0). LOTE y ENVOLVENTE solo se agregan si hay lote. La altura de
  texto es de 2,5 mm al imprimir el lado mayor del área en 400 mm (A3), es decir, lado / 160. Va un rótulo cada
  ~40 alturas de texto. Se validó con ezdxf 1.4.4 (lectura estricta y auditoría: 0 errores, 0 arreglos). **Falta
  abrirlo en AutoCAD LT / Revit.**
- **Copernicus:** visible y deshabilitado («requiere proxy»). Una escena `.geoarc` que lo use se abre con Terrarium y
  se avisa. `loadDem` conserva el respaldo Copernicus → Terrarium para cuando exista el proxy. Ya no cambia el
  selector: la carga ahora se dispara al cambiar de fuente.
- **`.geoarc` v2:** el área se guarda como esquinas SO y NE en lon/lat (igual que el lote) y la celda ya no se guarda.
  Los archivos v1 se siguen abriendo (su cuadrado centrado pasa a rectángulo).
- **e2e:** `respaldo.spec.ts` (elegir Copernicus en el selector) deja de tener sentido. Lo reemplaza `curvas.spec.ts`,
  que intercepta Terrarium con un plano inclinado continuo entre teselas y verifica que Copernicus no se pida nunca.

### Pendientes
- Importar levantamiento DXF (backlog alta #4).
- Chris: confirmar el criterio de escala y equidistancia, y la interpretación del tope 2 000 × 2 000.
  → Criterio reemplazado (sección siguiente). El tope 2 000 × 2 000 sigue sin confirmar.

## 2026-10-10 · v0.2 · Criterio de equidistancia, navegación y Estudio de sombras (Chris)

### Criterio de equidistancia (reemplaza a Tobler)
- Con Tobler, Terrarium daba 1:60.000 y 25 m: casi sin curvas en un área de sitio. Chris lo cambia por:
  - **Equidistancia mínima confiable** según la resolución real del dato: ≥ 20 m (SRTM/Terrarium) → 5 m;
    5–20 m → 2 m; < 5 m → 1 m; levantamiento → 0,5 m.
  - **Preselección:** la menor de {0,5; 1; 2; 5; 10; 20; 50} que sea ≥ la mínima confiable y dé entre 5 y 20 curvas
    según el desnivel del área (curvas = desnivel / equidistancia). Caso de control: 5 ha, 25 m de desnivel,
    Terrarium → 5 m, 5 curvas.
  - Las equidistancias menores siguen disponibles, con la advertencia de precisión aparente de v0.1.
  - La etiqueta de escala pasa a ser **informativa**: «dato de ~30 m: útil para ladera y barrio, no para el lote».
- Implementación: `src/core/contours/escala.ts`. Si ninguna candidata da 5–20 curvas, se toma la primera que no pasa de
  20 (en un área casi plana, la mínima confiable); si todas pasan de 20, la mayor (50 m).
- La preselección se recalcula **en cada carga** de terreno, porque depende del desnivel del área (antes solo cuando
  cambiaba la resolución). Al abrir una escena manda la equidistancia guardada.
- **Textos propuestos, por confirmar con Chris** (solo dio el de ≥ 20 m): 5–20 m «útil para barrio y manzana; para el
  lote, solo como referencia»; < 5 m «útil para manzana y lote»; levantamiento «útil para el lote y el proyecto»;
  ladera sintética «terreno inventado: sirve para practicar, no describe un lugar real».

### Navegación y estado compartido
- Inicio con dos tarjetas («Curvas de nivel», «Estudio de sombras») y rutas `/curvas` y `/sombras`. El enrutador es
  propio (`src/app/router.ts`, History API con la base del despliegue); no se agregó dependencia.
- GitHub Pages no reescribe rutas: un plugin de `vite.config.ts` copia `index.html` en `curvas/index.html`,
  `sombras/index.html` (responden 200) y `404.html` (respaldo). El favicon pasó a ruta absoluta (`/favicon.svg`, Vite
  le antepone la base); con la relativa fallaba desde `/curvas/`.
- **Store común** (`src/app/store.ts`, `useSyncExternalStore`, sin dependencias): `site` y `terrain` son compartidos;
  `curvas` y `sombras` son de cada módulo y se conservan al cambiar de ruta. La lógica de carga (secuencia contra
  respuestas viejas, preselección) vive en el store y se prueba en Node con cargadores simulados.
- Cambiar de sitio limpia el terreno y el lote (están en el marco local del sitio).
- `.geoarc` pasa a v3 (agrega el terreno del estudio). Un v2 con lote y área se abre sobre el terreno del sitio, que
  era como se calculaba; sin lote, en plano.

### Estudio de sombras
- Es el antiguo flujo lote → norma → envolvente, ahora como módulo propio.
- **Terreno:** «Plano (cota 0)» por defecto (sin red); «Terreno del sitio» reutiliza el terreno compartido si cubre el
  lote con 10 m de holgura, y si no, lo descarga solo alrededor del lote (su caja + max(30 m, medio lado mayor));
  «Levantamiento importado» se muestra deshabilitado («próximamente») hasta el importador DXF.
- Si el lote queda fuera del área dibujada en Curvas, el estudio descarga terreno nuevo alrededor del lote y ese pasa a
  ser el terreno compartido (Curvas mostrará esa área).
- **Lote por dimensiones:** ancho (frente, lado 1), fondo y giro antihorario, centrado en el sitio. El lote de ejemplo
  es el mismo constructor (20 × 35, 15°).
- **Caso dorado:** en plano, lote por dimensiones 20 × 20 con 4 deslindes a 70° y sin altura máxima → techo al centro =
  10·tan 70°, igual que el test del núcleo (`lote.test.ts`). En la UI se ve 27,1 m: es la celda de cálculo más central
  (a 0,125 m del centro), 9,875·tan 70° (`e2e/sombras.spec.ts`).
- Vista 3D: el encuadre considera también la altura de la envolvente (sin altura máxima quedaba cortada). Solo se
  reencuadra al cambiar lote o terreno, o si la envolvente crece y quedaría cortada; editar la norma no reinicia la órbita.
- DXF del estudio: en plano no lleva capas de curvas ni AREA; sobre el terreno del sitio, sí.

### Ramas y PR
- El PR #1 seguía abierto (CI en verde) cuando se pidió continuar. La mezcla sin revisión quedó bloqueada por los
  permisos de la sesión, así que este trabajo va en `v0.2-sombras`, apilado sobre `v0.2-modulos`: mezclar #1 antes que #2.

## 2026-10-12 · Simplificación y maqueta (Chris)
- La app es apoyo a la etapa inicial de taller de diseño: extraer curvas de nivel y contexto, y descargar.
  Un alumno no tiene levantamiento propio (eso exige LiDAR/fotogrametría en sitio).
- Se elimina la importación de DXF (PR #3, cerrado sin mezclar). Se conserva en la etiqueta de git
  `archivo/importador-dxf`. Nada de código dormido.
- Estudio de sombras: terreno "Plano" o "Terreno del sitio" solamente.
- Se mantienen: área como polígono, edificaciones y vías (como contexto para la descarga), altura máxima sub-celda.
- Los estudiantes de Taller III hacen maqueta de terreno → en el PR #5 se agregan dos descargas: Maqueta
  (corte láser) y Malla 3D (OBJ).
- Plan: PR #4 `v0.2-simplificar` → PR #5 `v0.2-maqueta`.

## 2026-10-13 · PR #4 `v0.2-simplificar`: implementación

### Importador
- Etiqueta `archivo/importador-dxf` en `cbe6dad` (último commit de `v0.2-levantamiento`), publicada en origin.
- En main no había lector DXF, TIN ni delaunator. Quedaban la opción «Levantamiento importado» (deshabilitada) y el
  tipo de dato `'levantamiento'` con su rama en `escala.ts` (equidistancia mínima 0,5 m y su texto): ninguna fuente lo
  produce, así que se eliminó. El criterio de Chris queda en ≥ 20 m → 5 m; 5–20 m → 2 m; < 5 m → 1 m. 0,5 m sigue en el
  selector (marcada «aparente» con los datos actuales).

### Área como polígono
- «Dibujar polígono» (clics + doble clic, o «Cerrar polígono»; Esc cancela) junto a «Dibujar rectángulo».
- Terreno y curvas se calculan sobre el rectángulo envolvente; las curvas y la malla del dato se recortan al polígono
  (`core/contours/clip.ts`: cada tramo se parte en los cruces con los lados y se conserva lo que queda dentro; sirve
  para polígonos cóncavos). Una curva cerrada que cruza el borde queda abierta y en una pieza (se une por la costura).
- No se cierra un polígono de menos de 3 vértices, sin superficie o cuyo rectángulo envolvente no cumple los límites
  de tamaño del área; el panel dice por qué.
- Las estadísticas (desnivel, preselección de equidistancia) siguen siendo las del rectángulo envolvente.
- El Estudio de sombras, si usa ese terreno, muestra el polígono y recorta sus curvas igual.

### Contexto (spike y decisión)
- Spike con datos reales (Temuco, teselas z14 de OpenFreeMap, `planet/20261011_080001_pt`):
  - `transportation`: todas las entidades traen id (id OSM); 85 de 1 067 ids aparecen en más de una tesela → una vía
    partida se puede unir por id.
  - `building`: **fusionado por altura**. Una tesela del centro trae 13 entidades con 804 anillos (una sola, de 5 m,
    reúne 760). El id no identifica un edificio y no sirve para unir pedazos.
  - Overpass (`overpass-api.de`) desde el navegador: 200 con CORS en 1,8 s; 34 edificios (11 con `building:levels`,
    ninguno con `height`) y 95 vías en ~300 m. Espejos probados: `overpass.private.coffee` sin respuesta en 20 s,
    `maps.mail.ru` 504. Desde Node sin User-Agent de navegador, Overpass responde 406.
- **Decisión:** Overpass es la fuente principal; las teselas, el respaldo (vías unidas por id; edificios como polígonos
  con `render_height`, recortados al borde de su tesela: un edificio que cruza el borde queda en dos piezas). El panel
  avisa cuando se usó el respaldo.
- Bbox = área + 50 m. Sobre 3 km por lado no se descarga (miles de entidades). Se descarga solo al definir un área;
  cambiar de fuente de elevación no lo vuelve a pedir. Si falla, el terreno igual carga y el panel ofrece «Reintentar».
- Altura: `height` (m); si no, `building:levels` × 3 m; sin dato, un piso (3 m). Se muestra el reparto en el panel.
  En el respaldo, `render_height` de OpenMapTiles (que usa otro criterio: 3,66 m por piso y 5 m sin dato).
- Vías: todo `highway` salvo `proposed`, `razed` y `abandoned`.
- Todo se recorta al área + 50 m (`recortarContexto`): las vías se cortan en el borde (Overpass entrega cada vía entera
  y una tesela z14 cubre ~2 km); un edificio que toca el recuadro se conserva entero.
- `.geoarc` v4 guarda el contexto en lon/lat con 7 decimales (~1 cm); al abrir la escena no se vuelve a pedir.

### DXF del contexto
- EDIFICACIONES: huella (y patios) como polilínea 2D cerrada a la cota más baja del terreno bajo la huella, con la
  altura como **espesor** (código 39): en AutoCAD se ve como volumen. VIALIDAD: ejes como polilíneas 3D con la cota del
  terreno en cada vértice. Fuera de la grilla (el contexto llega 50 m más allá) se usa la cota del borde más cercano.
- TEXT «© OpenStreetMap contributors (ODbL)» bajo el área, en una capa propia, **ATRIBUCION**, para que no se pierda al
  apagar las otras dos.
- R12 no declara la codificación del texto: «©» va como `\U+00A9` (escape de AutoCAD) y el archivo queda en ASCII.
  ezdxf 1.4.4: lectura y auditoría con 0 errores y 0 arreglos; `has_dxf_unicode` lo reconoce y `decode_dxf_unicode`
  da «©». **Falta abrirlo en AutoCAD LT / Revit** (sigue pendiente desde v0.2).

### Estudio de sombras
- Edificaciones del contexto extruidas en la vista 3D (con sombra), desde la cota más baja del terreno bajo la huella;
  solo las que caen dentro del terreno del estudio (en plano: el lote + 30 m). Casilla «Edificaciones del contexto».
- **Altura máxima alcanzable refinada bajo la celda:** desde la mejor celda, búsqueda en 8 direcciones con paso de
  media celda que se divide por 2 hasta 1 mm (`refineMax`). Caso dorado: 20 × 20 a 70° → 27,47 m en el panel (antes
  27,1 m, la celda más central). El panel muestra 2 decimales.

### Navegación de Curvas
- Pasos: 1 Sitio · 2 Área y curvas · 3 Contexto · 4 Descargar («Descargar DXF (UTM)»). El PR #5 agrega ahí «Maqueta»
  y «Malla 3D».

### Verificación con red real (build de producción local, Temuco, 253 × 190 m = 4,82 ha)
- Terreno: Terrarium en 1,7 s; desnivel 41,2 m; equidistancia 5 m (8 curvas).
- Contexto: Overpass respondió **504** (también desde un navegador normal, con cupos libres: el servidor estaba
  saturado; a las 12:42 había respondido en 1,8 s) y entró el respaldo por teselas en ~12 s. La primera corrida mostró
  1 180 edificaciones y 1 898 vías (teselas completas): de ahí el recorte. Con el recorte, 36 edificaciones y 75 vías.
- DXF de 193 KB (ezdxf: 0 errores, 0 arreglos); `.geoarc` de 44 KB con el contexto.
- Estudio de sombras sobre el terreno del sitio, lote de ejemplo: 14 edificaciones del contexto en la vista 3D.
- Producción (GitHub Pages) se publica desde `main`: este PR se verifica allí después de mezclarlo.

## 2026-10-15 · PR #5 `v0.2-exportacion`: exportación para CAD/BIM

### Diagnóstico de Chris (al abrir el DXF v0.2)
- **AutoCAD LT:** abre bien.
- **SketchUp:** importa pero no se ve nada. Exportando antes a DWG sí se ve, pero con los edificios **huecos**.
- Causas identificadas:
  1. R12 no declara unidades: SketchUp no sabía la escala y no mostraba la geometría.
  2. Coordenadas UTM lejos del origen (cientos de miles de metros): incómodas en CAD y problemáticas para algunos
     importadores.
  3. Edificios como polilínea con **espesor** (código 39): AutoCAD lo extruye, pero no es geometría de caras; SketchUp
     y otros lo ven hueco o no lo ven.

### Decisiones
1. **Escritor DXF 2000 (AC1015)** en `src/core/export/dxf2000.ts`, que reemplaza al R12 en todas las descargas:
   - HEADER con `$ACADVER AC1015`, `$INSUNITS 6` (metros), `$MEASUREMENT 1`, `$HANDSEED`, `$EXTMIN/$EXTMAX`; secciones
     CLASSES, TABLES (VPORT, LTYPE, LAYER, STYLE, VIEW, UCS, APPID, DIMSTYLE, BLOCK_RECORD), BLOCKS (*Model_Space,
     *Paper_Space), ENTITIES y OBJECTS (diccionario raíz y layouts), con handles únicos y subclases. El andamiaje se
     calcó de un AC1015 generado por ezdxf.
   - Entidades: LWPOLYLINE con elevación (curvas, área, huellas), POLYLINE 3D (vías), 3DFACE (muros y techos de
     edificios, caras de la envolvente), TEXT. Lo no ASCII va con el escape `\U+XXXX` (R2000 no admite UTF-8 en TEXT).
   - Edificios como **sólidos**: muros (cuadriláteros) + techo triangulado con earcut (patios incluidos) + la huella
     como LWPOLYLINE a la cota base. `src/core/export/solido.ts` arma el sólido cerrado (cada arista en 2 caras).
   - Validación: ezdxf 1.4.4 `readfile` (estricto) + `audit` con **0 errores y 0 arreglos**, en la muestra, una escena
     sintética y el DXF real de ~5 ha. Además se renderiza el DXF a PNG con el backend matplotlib de ezdxf para revisar
     que la geometría se ve (curvas, área, edificios como cajas con techo, vías, REFERENCIA).
2. **Origen de coordenadas** elegible en el paso Descargar: **Local (esquina SO del área en 0,0)** por defecto, o **UTM
   absolutas**. La Z siempre es la cota real. En modo local, el archivo lleva un TEXT «Origen local = UTM <huso> E <x>
   N <y>» (capa REFERENCIA) y el nombre de archivo termina en `_local` o `_UTM`. El `.geoarc` guarda la preferencia.
3. **Capa REFERENCIA** (siempre): barra de escala (50/100/500 m según el área), flecha de norte de cuadrícula (+Y) y un
   recuadro con «GEO·ARC · unidades: metros», el origen, «Elevación: <fuente · resolución>» y la fecha.
4. **Herramienta Medir** en el mapa (ambos módulos): clics → distancia acumulada; doble clic → área en m² y ha; Esc
   cancela. Cálculo en el marco métrico local (`longitudPolilinea`).
5. **Malla 3D (OBJ)** (`src/core/export/obj.ts`): terreno recortado al área (solo triángulos con los 3 vértices dentro)
   + edificios como sólidos cerrados; metros, mismo origen que el DXF; ejes x=este, y=norte, z=cota. Vértices
   compartidos por coordenada (estanco). Render 3D con matplotlib revisado.
6. **Paso Descargar** con dos tarjetas (Plano DXF 2000 / Malla 3D OBJ): formato, unidades, origen y el **contenido real**
   del archivo; sin prometer lo que no está.
7. **Alturas supuestas:** el panel distingue las edificaciones con altura conocida (OSM) de las supuestas (3 m); en el
   DXF van a una capa EDIFICACIONES_SUPUESTAS; en 3D, en un tono más claro.

### Pendiente de verificación por Chris (en su equipo, con los programas reales)
- **AutoCAD LT:** abrir el DXF 2000 local y UTM; comprobar unidades (metros), capas, los edificios como sólidos y la
  capa REFERENCIA (escala/norte/recuadro).
- **SketchUp:** importar el DXF 2000 (ver que ahora sí se ve la geometría, con edificios no huecos) y el OBJ.
- **Rhino:** abrir el DXF 2000 y el OBJ; verificar unidades y que los sólidos estén cerrados.

### Ramas y PR
- Trabajo apilado sobre `v0.2-simplificar` (PR #4), que seguía abierto. El PR #5 va con base en esa rama; cuando #4 se
  mezcle a `main`, su base se puede cambiar a `main`.

## 2026-10-15 · PR #5 · hallazgos de Chris en AutoCAD LT y SketchUp (11–15)

Chris abrió el DXF 2000 (origen local) en AutoCAD LT y SketchUp y reportó cinco cosas a corregir. Un commit por punto,
sobre la misma rama `v0.2-exportacion`.

11. **Z de AREA y REFERENCIA.** En 3D, el contorno del AREA y el recuadro de REFERENCIA quedaban en z = 0, decenas de
    metros bajo el terreno (que va a cota real). Ahora el AREA es una **POLYLINE 3D** apoyada sobre el terreno,
    muestreada cada celda del DEM (`densificarAnillo`), con la cota real en cada vértice; y la REFERENCIA (y la
    ATRIBUCION de OSM) se dibujan a la **cota mínima del terreno dentro del área, redondeada hacia abajo**. En el OBJ, el
    contorno del AREA va como polilínea `l` sobre el terreno; la REFERENCIA, por llevar texto, queda solo en el DXF.
    Test: ningún vértice de AREA ni de REFERENCIA queda más de 1 m bajo la cota mínima.
12. **Edificios del respaldo por teselas.** OpenFreeMap entrega los edificios fusionados por altura en un multipolígono.
    Antes se apoyaba en `classifyRings` de la librería (en coordenadas de tesela); ahora se separan en edificios
    individuales con `agruparAnillos` (por contención, en el marco local) **antes de triangular**, de modo que nunca se
    triangula un conjunto de anillos disjuntos como un solo polígono. Además, el **techo** marca invisibles sus aristas
    interiores (3DFACE código 70): en planta se ve solo el contorno del edificio y sus patios, no la malla de triángulos.
13. **Rótulos de cota.** Criterio único para el plano (DXF) y el mapa: solo curvas maestras, uno cada ~150 m de longitud
    de curva, al menos uno si la curva mide más de 30 m, ninguno en curvas más cortas que 30 m ni que el ancho del texto.
    `labelPlacements` lo implementa y el mapa dibuja los rótulos como puntos con esa misma función (no la colocación por
    línea de MapLibre, en píxeles).
14. **Preselección de equidistancia.** La preselección ya nunca bajaba de la mínima confiable (las candidatas se filtran
    a `≥ min`); se fija con un test (dato de 30 m, 12 m de desnivel → 5 m, 2 curvas) y, cuando resultan menos de 5 curvas,
    el panel avisa «poco desnivel para esta resolución: N curvas». **Por qué Chris vio 1 m con Terrarium:** no fue la
    preselección. Terrarium reporta su resolución como `máx(30 m SRTM, tamaño de píxel)` ≈ 30 m, así que la mínima
    confiable es 5 m y la preselección da 5 m. El 1 m solo se alcanza **eligiéndolo a mano** en el selector, que lo ofrece
    marcado «· aparente» y con el aviso «la precisión es aparente». Fue una elección manual, no un error de preselección.
15. **Verificación de escala en e2e.** En el DXF descargado, la barra de 100 m de la capa REFERENCIA mide 100,000 ± 0,001
    (1 unidad del DXF = 1 m) y el ancho del AREA coincide con el que muestra la app.

Cierre: unit + typecheck + e2e completo; ezdxf (`readfile` + `audit`) sobre el DXF real: 0 errores, 0 arreglos; el código
70 de los 3DFACE del techo es válido. Se dejan de nuevo los tres archivos de muestra (curvas, área-polígono, contexto).

## 2026-10-16 · PR #6 `v0.2-glb`: modelo 3D GLB con textura

Descarga **Modelo 3D (GLB)** con textura para SketchUp Pro, Blender y visores 3D sin instalar nada. Premisa de
interfaz: **una tarjeta por formato de descarga, todas visibles** (DXF 2000, GLB, OBJ), sin opciones escondidas. Un
commit por punto.

1. **Exportador GLB** (`glb.ts`, `GLTFExporter` de three, binario): terreno (malla recortada al área, con la densidad
   elegida, normales y UV), edificios como sólidos (los supuestos en gris más claro), vías y contorno del área como
   líneas (mode LINES). Metros; ejes Z-arriba→Y-arriba `(x,y,z)→(x,z,−y)`; origen local/UTM como el DXF.
   `asset.generator = "GEO·ARC"` y `asset.copyright` (textura + OSM), inyectados en el chunk JSON. `glbCore.ts` puro.
2. **Textura**: Satelital (Esri) / Mapa (OSM) / Sin textura (por defecto satelital). Mosaico de teselas del bbox del
   área + margen; zoom para que el lado mayor quede entre 2048 y 4096 px (tope: el zoom máximo con imagen de la fuente).
   UV por vértice (lon/lat → píxel del mosaico, Web Mercator) SIN reproyectar la imagen. Si una tesela falla, se rellena
   en gris y se avisa; no se aborta.
3. **Paso Descargar** con una tarjeta por formato; la del GLB lleva el selector de textura con atribución y una nota
   permanente «Se abre con: SketchUp Pro…» (en una sola constante `GLB_NOTA_APERTURA`).
4. **Verificación**: el GLB se abre con three (GLTFLoader) en Playwright headless y se renderiza (captura); el validador
   `gltf-validator` da **0 errores** sobre los archivos de muestra.
5. **e2e sin red**: teselas de textura simuladas (un color por tesela); el GLB descargado tiene magic «glTF», la malla,
   la textura embebida (JPEG) y `asset.copyright`.
6. Docs.

**Decisiones y supuestos a revisar (Chris):**
- **Rama apilada sobre `v0.2-exportacion` (PR #5), no sobre `main`.** Chris pidió «sobre main», pero #4 y #5 seguían
  abiertos y `main` no tiene el escritor de exportación ni el paso Descargar. Cuando se mezclen #4 y #5, la base de #6
  se puede cambiar a `main`.
- **Densidad «del punto 9» (Gruesa/Media/Fina):** no existía en el código ni en el backlog. Se creó aquí como
  infraestructura compartida (GLB y OBJ): objetivo de celdas en el lado mayor del área — Gruesa 60, Media 120, Fina 240
  (en `DENSIDADES`, `src/app/model.ts`, fácil de ajustar). Si el «punto 9» venía de otro plan, revisar los valores.
- **Calidad JPEG de la textura:** se pidió JPEG calidad 85, pero GLTFExporter re-codifica la textura y, para un
  `HTMLCanvasElement`, no acepta el parámetro de calidad: usa el valor por defecto del navegador (~0,92). Queda JPEG
  (chico), no PNG, pero algo por encima del 85. Para fijar 85 habría que re-codificar la imagen y re-empacar el GLB.
- **Términos de uso de Esri (World Imagery) para textura incrustada:** la app ya usa Esri como mapa base (igual que
  OpenStreetMap satelital en muchas herramientas docentes), pero **incrustar** las teselas satelitales dentro de un GLB
  que el alumno se lleva puede tener condiciones distintas a mostrarlas en pantalla. **Pendiente de verificar** los
  términos de Esri/ArcGIS Online para este uso; si no aplica, dejar «Mapa (OSM)» como textura por defecto o solo
  satelital para visualización en pantalla. La atribución va en pantalla y en `asset.copyright`.

### Pendiente de verificación por Chris (con los programas reales)
- **SketchUp Pro (escritorio):** Archivo → Importar el GLB; que se vea el terreno con textura y los edificios.
- **Blender (gratuito):** importar el GLB; comprobar orientación (Z/Y), textura y escala en metros.
- **Visor 3D de Windows:** abrir el GLB.
