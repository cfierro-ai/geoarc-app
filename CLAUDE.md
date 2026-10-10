# CLAUDE.md — GEO·ARC

Contexto de trabajo para Claude Code. Léelo completo antes de tocar código.

## Qué es

Herramienta **docente** de META|Lab (Universidad Autónoma de Chile) para estudiantes de Arquitectura:
a partir de un **sitio real** (cualquier lugar del mundo) obtiene el terreno, genera **curvas de nivel** y calcula la
**envolvente normativa** (rasantes, distanciamientos, altura máxima) **sobre el terreno real con pendiente**.
Especificación funcional: `SPEC.md`. Decisiones: `docs/decisiones.md`.

Responsable de producto y de la verdad normativa: Chris (arquitecto, experto OGUC).

## Comandos

```bash
npm install
npm run dev          # desarrollo
npm test             # Vitest (núcleo geométrico)
npm run typecheck    # tsc -b
npm run build        # producción (sitio estático en dist/)
npm run e2e          # Playwright; usa CHROMIUM_PATH si hay un Chromium local
```

Antes de dar una tarea por terminada: `npm test && npm run typecheck && npm run build`, y si tocaste UI, `npm run e2e`
**y revisa las capturas** en `e2e/capturas/` (ver el resultado, no suponerlo).

## Arquitectura

```
src/core/            lógica pura, sin React. Testeable en Node.
  geo/local.ts       marco métrico local: UTM automático según el sitio; (x,y) = (E−E0, N−N0)
  dem/               grilla de elevación, fuentes (Copernicus, Terrarium, sintética, plano), remuestreo
  dem/area.ts        área de extracción (rectángulo UTM) y celda automática (~250 celdas en el lado menor, tope 2 000)
  contours/          isolíneas por marching squares (cosido de segmentos, sillas resueltas), rótulos de cota
  contours/escala.ts equidistancia mínima confiable, preselección y uso del dato — ÚNICO lugar del criterio
  envelope/          envolvente como CAMPO DE ALTURAS + utilidades de polígono; lote.ts: lote por dimensiones
  export/            DXF R12 (curvas, lote, envolvente) en UTM absolutas
  survey/            importador de levantamiento DXF: lector, TIN (delaunator) → grilla 'levantamiento'
  normativa/         perfiles normativos — ÚNICO lugar con valores normativos
src/app/             piezas comunes de la UI
  store.ts           estado: sitio y terreno COMPARTIDOS + estado de cada módulo; carga de terreno
  router.ts          rutas / (inicio), /curvas, /sombras bajo la base del despliegue
  components/        mapa (MapLibre), vista 3D (React-Three-Fiber), inicio, paso Sitio, info del terreno, ui
src/modules/         un módulo por carpeta: curvas/ (Curvas de nivel), sombras/ (Estudio de sombras)
e2e/                 Playwright: navegación, ambos módulos, flujo completo y regresiones (ayudas en util.ts)
```

Cada módulo funciona solo. Lo compartido (sitio, terreno) pasa por el store; un módulo no importa del otro.

### Modelo de la envolvente (núcleo del producto)

Para cada punto p del lote:

```
techo(p) = min( suelo(p) + Hmax ,  min_lados_i  min_{q ∈ lado_i}  [ suelo(q) + h0_i + |p − q| · tan α_i ] )
```

- La rasante se traza desde **cada punto del deslinde, a su cota natural** (no desde la cota del punto evaluado).
- `originOffset` desplaza el origen hacia afuera (p. ej. eje de calle). `setback` excluye la franja junto al lado.
- Se registra **qué restricción gobierna** cada celda (lado i o altura máxima): es el contenido didáctico clave.

### Convenciones

- **Todo cálculo en el marco local métrico.** lon/lat solo en los bordes (mapa, carga de DEM, guardado de escena).
- Polígonos: el índice del lado k = vértice k → k+1 **en el orden del usuario**; la orientación (CW/CCW) se normaliza internamente.
- Three.js: local (x este, y norte, z cota) → three (X, Y arriba, Z = −y). Ver `useToThree` en `Scene3D.tsx`.
- DXF siempre en UTM absolutas del huso del sitio (georreferenciado), metros.
- Metadatos del DEM (`DemMeta`) siempre visibles al usuario: fuente, tipo (DSM/DTM/levantamiento/plano) y resolución
  **real** del dato (en un levantamiento, la separación típica entre datos, no la celda de la grilla).
- UI en español de Chile (sin voseo). Números con `fmt()` (formato es-CL).

## Reglas no negociables

1. **No inventar ni "recordar" valores normativos.** Viven solo en `src/core/normativa/perfiles.ts` con
   `verificado` y `fuente`. Solo Chris marca `verificado: true`, y cada valor verificado lleva un test que lo fija.
2. **Toda lógica geométrica nueva entra con un caso dorado** (resultado calculado a mano) en `*.test.ts`.
3. **Bugs de interacción o visuales se reproducen con Playwright y se verifican con captura** antes de declararlos resueltos.
4. Nada de backend: la app es un sitio estático. Si una fuente de datos exige proxy, se documenta en `docs/decisiones.md` antes.
5. Un DSM (Copernicus, Terrarium) **no es terreno natural**. Nunca presentarlo como tal en textos o etiquetas.

## Trampas conocidas

- MapLibre v6 necesita `setWorkerUrl` con `?worker&url` (ya resuelto en `MapView.tsx`) y su CSS fuerza
  `position: relative` en el contenedor: usar estilo en línea.
- El doble clic del mapa dispara dos clics antes: `cleanRing` en `App.tsx` elimina vértices repetidos.
- Lectura de Copernicus: respetar `GTRasterTypeGeoKey` (PixelIsPoint vs PixelIsArea); un error ahí desplaza ~15 m.
- CORS verificado (2026-10-09, `docs/decisiones.md`): Terrarium responde `Access-Control-Allow-Origin: *`; el bucket
  de Copernicus **no tiene CORS** y el navegador bloquea la lectura. Copernicus aparece deshabilitado en el selector
  («requiere proxy»); `loadDem` conserva el respaldo a Terrarium para cuando exista el proxy (backlog en `SPEC.md`).
- El terreno se carga sin botón (al cerrar el área, cambiar de fuente o abrir escena; en sombras, al definir el lote
  con «Terreno del sitio») y el selector de fuente está dentro de «Opciones avanzadas» (`<details>` plegado): en e2e
  hay que abrirlo antes (`usarLaderaSintetica` en `e2e/util.ts`). Para Terrarium sin red: `interceptarTerrarium`.
- Rutas: los e2e entran por `/curvas` o `/sombras`; `/` es la pantalla de inicio. Una ruta nueva va en
  `MODULE_ROUTES` (router.ts) **y** en `ROUTES` (vite.config.ts), o dará 404 en GitHub Pages.
- `useAppState(sel)`: el selector debe devolver algo que ya está en el estado. Un objeto nuevo en cada llamada hace
  que `useSyncExternalStore` vuelva a renderizar sin fin.
- El área es un rectángulo **UTM**: en el mapa se ve girado según la convergencia de meridianos. No es un error.
- Vista 3D con `frameloop='demand'`: todo cambio fuera de las props de React (matrices/colores de instancias, cámara)
  debe llamar a `invalidate()`. R3F 9.8.1 no redibuja al desmontar objetos; lo cubre `RedrawOnUpdate` en `Scene3D.tsx`.
