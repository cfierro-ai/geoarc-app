# SPEC — GEO·ARC v0.2

Derivada del handoff GEO·ARC v1.2 (prototipo previo en SVG/D3, sin código disponible) y de las decisiones del
2026-10-08 al 2026-10-10 (`docs/decisiones.md`).

## Objetivo

Que un estudiante de Arquitectura, partiendo de **un sitio real** (Temuco, cualquier lugar de Chile o del mundo),
entienda **cómo la norma y la topografía construyen la envolvente edificable**, y pueda llevarse el resultado a CAD/BIM.

Principio docente: **transparencia**. La app no entrega una caja negra; muestra qué dato sostiene cada curva, qué
restricción manda en cada punto y desde dónde nace cada rasante.

## Estructura: inicio y dos módulos

| Ruta | Pantalla |
|---|---|
| `/` | Inicio: dos tarjetas, «Curvas de nivel» y «Estudio de sombras». |
| `/curvas` | Módulo Curvas de nivel. |
| `/sombras` | Módulo Estudio de sombras. |

- **Estado compartido** (store común, `src/app/store.ts`): el **sitio** y el **terreno** (área, fuente, grilla). El
  terreno que se descarga en un módulo sirve al otro. Cada módulo guarda además su propio estado, que se conserva al
  cambiar de ruta.
- **Cada módulo funciona solo**: ninguno necesita que el otro se haya usado antes.
- `.geoarc` (v3) guarda las dos partes: sitio, área, fuente, equidistancia; terreno del estudio, lote y norma.
- GitHub Pages no reescribe rutas: el build copia `index.html` en `curvas/`, `sombras/` y `404.html`.

## Módulo 1 · Curvas de nivel

Flujo del profesor: **ubicar el sitio → dibujar el área → las curvas aparecen.** El profesor no elige ni carga un DEM
(salvo ladera sintética sin internet o un levantamiento DXF propio).

| Paso | Qué hace | Estado |
|---|---|---|
| 1. Sitio | Búsqueda por dirección (Nominatim, con respaldo a Photon) o «lat, lon», o clic en mapa (OpenFreeMap; OSM raster y satélite como alternativas). Marco UTM automático. | Hecho |
| 2. Área y curvas | Rectángulo de dos clics (alineado con la cuadrícula UTM), con tamaño en m y ha. Celda automática (~250 celdas en el lado menor; tope 2 000 por lado). Al cerrarla, Terrarium/SRTM se descarga solo y aparecen las curvas. | Hecho |
| · Uso del dato | Etiqueta informativa según la resolución («dato de ~30 m: útil para ladera y barrio, no para el lote»). Equidistancia mínima confiable: ≥ 20 m → 5 m; 5–20 m → 2 m; < 5 m → 1 m; levantamiento → 0,5 m. Preselección: la menor de {0,5; 1; 2; 5; 10; 20; 50} que sea ≥ la mínima y dé 5–20 curvas según el desnivel. Las menores siguen disponibles con la advertencia de precisión aparente. | Hecho (criterio de Chris, 2026-10-10) |
| · Malla del dato | Capa opcional sobre el mapa con celdas del tamaño real del dato. | Hecho |
| · DXF | Capas CURVAS, CURVAS_MAESTRAS, ETIQUETAS (TEXT con la cota sobre las maestras) y AREA, en UTM absolutas. | Hecho |
| · Fuente | En «Opciones avanzadas» (plegado): Terrarium (automático), ladera sintética (sin conexión), Copernicus GLO-30 visible y deshabilitado («requiere proxy»). | Hecho |
| · Levantamiento | «Importar levantamiento DXF…»: LWPOLYLINE (cota en 38), POLYLINE/VERTEX 2D y 3D, LINE y POINT con Z. Informa capas, entidades y rango de cotas; las capas enteras a cota 0 quedan fuera por defecto. Coordenadas locales (centra el dibujo en el sitio, por defecto) o UTM del sitio. TIN (delaunator) → grilla con `meta.kind = 'levantamiento'`; pasa a ser el terreno compartido. | Hecho |

## Módulo 2 · Estudio de sombras

Envolvente por rasantes, distanciamientos y altura máxima.

| Paso | Qué hace | Estado |
|---|---|---|
| 1. Sitio | El mismo del módulo de curvas (compartido). | Hecho |
| 2. Terreno | **Plano (cota 0)** por defecto, sin red · **Terreno del sitio**: reutiliza el terreno compartido si cubre el lote; si no, lo descarga solo alrededor del lote · **Levantamiento importado**: el mismo importador DXF del módulo de curvas. | Hecho |
| 3. Lote | Dibujo en planta sobre el mapa (clic/doble clic), lote de ejemplo, o **por dimensiones** (ancho = frente, fondo, giro antihorario), centrado en el sitio. | Hecho |
| 4. Norma | Perfil OGUC Chile / Personalizado. Altura máxima. Por lado: rol (deslinde, frente, sin rasante), ángulo, arranque, distanciamiento, eje de calle. | Hecho (valores OGUC por verificar) |
| 5. Resultados | Superficie, huella, volumen, altura máx.; reparto de qué restricción gobierna; 3D con planos de rasante; DXF (UTM) y PNG. | Hecho |

Caso dorado: en plano, un lote por dimensiones 20 × 20 con rasante de 70° en los cuatro lados da el mismo techo que el
test del núcleo «lote plano 20×20, rasante 70°» (centro = 10·tan 70°).

## Correspondencia con el handoff v1.2

| Handoff v1.2 | v0.2 |
|---|---|
| Extracción de topografía desde OSM | Reemplazado: la topografía viene de DEM globales (OSM no tiene cotas). |
| Importación PLY/FBX | Backlog (prioridad media) — se priorizó DXF de levantamiento. |
| Vista planta + isométrica SVG | Reemplazado: mapa real (MapLibre) + 3D real (Three.js). |
| Panel OGUC bloques A/B/C con tooltips | Parcial: perfil + parámetros por lado. Tooltips/bloques en backlog. |
| Autoselección de grupo normativo por latitud | Descartado (error conceptual): debe ser por región administrativa → backlog. |
| Volumen extruido + `insetPolygonBisector` | Reemplazado por la envolvente como campo de alturas (soporta distanciamientos distintos por lado y pendiente). |
| Arrastre de volúmenes | Backlog (volumen propuesto vs envolvente). |
| Sombras astronómicas (Modo Solar) | Backlog — usar `suncalc`. |
| `.geoarc` | Hecho (JSON v3; abre v1 y v2). |
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
4. Importar del DXF arcos (bulge), CIRCLE, 3DFACE e INSERT de puntos; unidades distintas de metros; restricciones del TIN a lo largo de las curvas (líneas de quiebre).
5. Volumen propuesto (dibujado o importado) vs envolvente, con verificación visual de excesos.
6. Sombras con `suncalc`: envolvente vs volumen propuesto en fechas/horas definidas por norma.
7. FABDEM (DTM) pre-procesado solo para Chile, alojado como COG estático (licencia no comercial: uso docente).
8. Envolvente como malla suave (superficie + faldones) en vez de columnas; cálculo en Web Worker.
9. Exportar a Revit (Toposolid desde CSV de puntos) e IFC 4.3 (IfcSite).

**Baja**
10. Code-splitting de la vista 3D (bundle actual ~2,4 MB).
11. Modo “ejercicio” para docentes: escena precargada + preguntas.
12. Importar nubes/mallas de fotogrametría propia (PLY).

## Fuera de alcance v0.2

Validez legal de los resultados (es docencia); cálculo de constructibilidad/ocupación de suelo del PRC; edificación continua.
