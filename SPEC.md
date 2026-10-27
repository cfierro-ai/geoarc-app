# SPEC — GEO·ARC v0.2

Derivada del handoff GEO·ARC v1.2 (prototipo previo en SVG/D3, sin código disponible) y de las decisiones del
2026-10-08 al 2026-10-13 (`docs/decisiones.md`).

## Objetivo

Apoyar la **etapa inicial del taller de diseño**: que un estudiante de Arquitectura, partiendo de **un sitio real**
(Temuco, cualquier lugar de Chile o del mundo), **extraiga las curvas de nivel y el contexto** (edificaciones y vías) y
**se los lleve** a CAD/BIM. El Estudio de sombras le muestra, además, cómo la norma y la topografía construyen la
envolvente edificable.

Flujo: **ubicar → área → curvas y contexto → descargar.**

Principio docente: **transparencia**. La app no entrega una caja negra; muestra qué dato sostiene cada curva, qué
restricción manda en cada punto y desde dónde nace cada rasante.

## Estructura: inicio y dos módulos

| Ruta | Pantalla |
|---|---|
| `/` | Inicio: dos tarjetas, «Curvas de nivel» y «Estudio de sombras». |
| `/curvas` | Módulo Curvas de nivel. |
| `/sombras` | Módulo Estudio de sombras. |

- **Estado compartido** (store común, `src/app/store.ts`): el **sitio**, el **terreno** (área o polígono, fuente,
  grilla) y el **contexto** (edificaciones y vías). Lo que se descarga en un módulo sirve al otro. Cada módulo guarda
  además su propio estado, que se conserva al cambiar de ruta.
- **Cada módulo funciona solo**: ninguno necesita que el otro se haya usado antes.
- `.geoarc` (v4) guarda las dos partes: sitio, área (rectángulo o polígono), fuente, equidistancia, el contexto
  descargado (al abrir la escena no se vuelve a pedir) y el origen de exportación; terreno del estudio, lote y norma. Abre v1, v2 y v3.
- GitHub Pages no reescribe rutas: el build copia `index.html` en `curvas/`, `sombras/` y `404.html`.

## Módulo 1 · Curvas de nivel

Flujo: **ubicar el sitio → dibujar el área → las curvas y el contexto aparecen → descargar.** El profesor no elige ni
carga un DEM (salvo la ladera sintética, sin internet).

| Paso | Qué hace | Estado |
|---|---|---|
| 1. Sitio | Búsqueda por dirección (Nominatim, con respaldo a Photon) o «lat, lon», o clic en mapa (OpenFreeMap; OSM raster y satélite como alternativas). Marco UTM automático. | Hecho |
| 2. Área y curvas | **Rectángulo** de dos clics (alineado con la cuadrícula UTM) o **polígono** (clics + doble clic), con tamaño en m y ha. Con polígono, el terreno se calcula sobre su rectángulo envolvente y las curvas (y la malla del dato) se recortan al polígono. Celda automática (~250 celdas en el lado menor; tope 2 000 por lado). Al cerrar el área, Terrarium/SRTM se descarga solo y aparecen las curvas. | Hecho |
| · Uso del dato | Etiqueta informativa según la resolución («dato de ~30 m: útil para ladera y barrio, no para el lote»). Equidistancia mínima confiable: ≥ 20 m → 5 m; 5–20 m → 2 m; < 5 m → 1 m. Preselección: la menor de {0,5; 1; 2; 5; 10; 20; 50} que sea ≥ la mínima y dé 5–20 curvas según el desnivel. Las menores siguen disponibles con la advertencia de precisión aparente. | Hecho (criterio de Chris, 2026-10-10) |
| · Malla del dato | Capa opcional sobre el mapa con celdas del tamaño real del dato. | Hecho |
| · Fuente | En «Opciones avanzadas» (plegado): Terrarium (automático), ladera sintética (sin conexión), Copernicus GLO-30 visible y deshabilitado («requiere proxy»). | Hecho |
| 3. Contexto | Edificaciones y vías de OpenStreetMap del área + 50 m, sin botón. Fuente principal: Overpass API (un edificio por entidad; altura = `height`, o `building:levels` × 3 m, o 3 m sin dato). Respaldo: teselas vectoriales de OpenFreeMap. Capas «Edificaciones» y «Vías» activables en el mapa. Sobre 3 km por lado no se descarga. | Hecho |
| 4. Descargar | Dos tarjetas (**Plano DXF 2000** y **Malla 3D OBJ**), cada una con formato, unidades (metros), origen y el contenido real del archivo. **Origen** elegible: Local (esquina SO del área en 0,0; por defecto) o UTM absolutas. **DXF 2000 (AC1015)**: CURVAS, CURVAS_MAESTRAS, ETIQUETAS (un rótulo cada ~150 m, solo en maestras), AREA (POLYLINE 3D apoyada sobre el terreno, muestreada cada celda), EDIFICACIONES y EDIFICACIONES_SUPUESTAS (muros y techo en 3DFACE, sólidos, con las aristas interiores del techo invisibles; huella LWPOLYLINE), VIALIDAD (POLYLINE 3D), ATRIBUCION y REFERENCIA (barra de escala, norte, recuadro de metadatos; apoyadas a la cota mínima del terreno). **OBJ**: terreno recortado al área + edificios como sólidos cerrados + contorno del área sobre el terreno, en metros. | Hecho |
| · Medir | Herramienta en el mapa: clics → distancia acumulada; doble clic → área en m² y ha; Esc cancela. | Hecho |

## Módulo 2 · Estudio de sombras

Envolvente por rasantes, distanciamientos y altura máxima.

| Paso | Qué hace | Estado |
|---|---|---|
| 1. Sitio | El mismo del módulo de curvas (compartido). | Hecho |
| 2. Terreno | **Plano (cota 0)** por defecto, sin red · **Terreno del sitio**: reutiliza el terreno compartido si cubre el lote; si no, lo descarga solo alrededor del lote. | Hecho |
| 3. Lote | Dibujo en planta sobre el mapa (clic/doble clic), lote de ejemplo, o **por dimensiones** (ancho = frente, fondo, giro antihorario), centrado en el sitio. | Hecho |
| 4. Norma | Perfil OGUC Chile / Personalizado. Altura máxima. Por lado: rol (deslinde, frente, sin rasante), ángulo, arranque, distanciamiento, eje de calle. | Hecho (valores OGUC por verificar) |
| 5. Resultados | Superficie, huella, volumen, altura máx. alcanzable (refinada bajo la celda de cálculo, al milímetro); reparto de qué restricción gobierna; 3D con planos de rasante y las edificaciones del contexto extruidas (activables, en tono más claro las de altura supuesta); descargas DXF 2000 y OBJ (paso Descargar) y PNG. | Hecho |

Caso dorado: en plano, un lote por dimensiones 20 × 20 con rasante de 70° en los cuatro lados da el mismo techo que el
test del núcleo «lote plano 20×20, rasante 70°»: centro = 10·tan 70° = **27,47 m** en el panel (±0,01).

## Correspondencia con el handoff v1.2

| Handoff v1.2 | v0.2 |
|---|---|
| Extracción de topografía desde OSM | Reemplazado: la topografía viene de DEM globales (OSM no tiene cotas). De OSM se toma el contexto: edificaciones y vías. |
| Importación PLY/FBX | Backlog (prioridad media). |
| Vista planta + isométrica SVG | Reemplazado: mapa real (MapLibre) + 3D real (Three.js). |
| Panel OGUC bloques A/B/C con tooltips | Parcial: perfil + parámetros por lado. Tooltips/bloques en backlog. |
| Autoselección de grupo normativo por latitud | Descartado (error conceptual): debe ser por región administrativa → backlog. |
| Volumen extruido + `insetPolygonBisector` | Reemplazado por la envolvente como campo de alturas (soporta distanciamientos distintos por lado y pendiente). |
| Arrastre de volúmenes | Backlog (volumen propuesto vs envolvente). |
| Sombras astronómicas (Modo Solar) | Backlog — usar `suncalc`. |
| `.geoarc` | Hecho (JSON v4; abre v1, v2 y v3). |
| Bug del dibujo libre | Resuelto por diseño (dibujo en coordenadas geográficas del mapa) + test de regresión `e2e/dibujo.spec.ts`. |
| Módulo 2 (rasantes reales por fachada) | Hecho en esencia: rasante por lado, desde la cota natural del deslinde, con arranque. Es el Estudio de sombras. |
| Módulo 3 / Feature C (sombras comparativas, reactivas) | Backlog. |

## Backlog priorizado

**Alta**
1. Perfil OGUC verificado por Chris: tabla de ángulos por región, arranque, distanciamientos, regla sobre 10,5 m (si aplica). Tests que lo fijen.
2. Asignación de región por point-in-polygon (límites regionales oficiales) en vez de manual.
3. Proxy liviano para Copernicus (p. ej. Cloudflare Worker que reenvíe `Range` y agregue CORS), documentado antes en
   `docs/decisiones.md`. El CORS ya está verificado: Copernicus no tiene CORS (hoy aparece deshabilitado en el selector).

**Media**
5. Volumen propuesto (dibujado o importado) vs envolvente, con verificación visual de excesos.
6. Sombras con `suncalc`: envolvente y edificaciones del contexto en fechas/horas definidas por norma.
7. FABDEM (DTM) pre-procesado solo para Chile, alojado como COG estático (licencia no comercial: uso docente).
8. Envolvente como malla suave (superficie + faldones) en vez de columnas; cálculo en Web Worker.
9. Exportar a Revit (Toposolid desde CSV de puntos) e IFC 4.3 (IfcSite).

**Baja**
10. Code-splitting de la vista 3D (bundle actual ~2,4 MB).
11. Modo “ejercicio” para docentes: escena precargada + preguntas.

## Fuera de alcance v0.2

Validez legal de los resultados (es docencia); cálculo de constructibilidad/ocupación de suelo del PRC; edificación continua.
