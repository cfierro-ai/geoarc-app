# SPEC — GEO·ARC v0.1

Derivada del handoff GEO·ARC v1.2 (prototipo previo en SVG/D3, sin código disponible) y de las decisiones del 2026-10-08.

## Objetivo

Que un estudiante de Arquitectura, partiendo de **un sitio real** (Temuco, cualquier lugar de Chile o del mundo),
entienda **cómo la norma y la topografía construyen la envolvente edificable**, y pueda llevarse el resultado a CAD/BIM.

Principio docente: **transparencia**. La app no entrega una caja negra; muestra qué restricción manda en cada punto
y desde dónde nace cada rasante.

## Flujo (5 pasos)

| Paso | Qué hace | Estado v0.1 |
|---|---|---|
| 1. Sitio | Búsqueda por dirección (Nominatim, con respaldo a Photon) o «lat, lon», o clic en mapa (OpenFreeMap; OSM raster y satélite como alternativas). Marco UTM automático. | Hecho |
| 2. Área y curvas | Área de extracción libre (rectángulo de dos clics, en m y ha) con celda automática (~250 celdas en el lado menor; tope 2 000 por lado). Al cerrarla, Terrarium/SRTM se descarga solo y aparecen las curvas. Escala confiable del dato (Tobler) con la equidistancia mínima sugerida preseleccionada; malla del dato opcional; DXF de curvas (CURVAS, CURVAS_MAESTRAS, ETIQUETAS, AREA). Fuente en «Opciones avanzadas»: ladera sintética (sin conexión) y Copernicus GLO-30 deshabilitado («requiere proxy»). | Hecho (v0.2). Criterio de escala por confirmar con Chris |
| 3. Lote | Dibujo en planta sobre el mapa (clic/doble clic) o lote de ejemplo. | Hecho |
| 4. Norma | Perfil OGUC Chile / Personalizado. Altura máxima. Por lado: rol (deslinde, frente, sin rasante), ángulo, arranque, distanciamiento, eje de calle. | Hecho (valores OGUC por verificar) |
| 5. Resultados | Superficie, huella, volumen, altura máx.; reparto de qué restricción gobierna; 3D con planos de rasante; DXF (UTM) y PNG; guardar/abrir `.geoarc`. | Hecho |

## Correspondencia con el handoff v1.2

| Handoff v1.2 | v0.1 |
|---|---|
| Extracción de topografía desde OSM | Reemplazado: la topografía viene de DEM globales (OSM no tiene cotas). |
| Importación PLY/FBX | Backlog (prioridad media) — se priorizará DXF de levantamiento. |
| Vista planta + isométrica SVG | Reemplazado: mapa real (MapLibre) + 3D real (Three.js). |
| Panel OGUC bloques A/B/C con tooltips | Parcial: perfil + parámetros por lado. Tooltips/bloques en backlog. |
| Autoselección de grupo normativo por latitud | Descartado (error conceptual): debe ser por región administrativa → backlog. |
| Volumen extruido + `insetPolygonBisector` | Reemplazado por la envolvente como campo de alturas (soporta distanciamientos distintos por lado y pendiente). |
| Arrastre de volúmenes | Backlog (volumen propuesto vs envolvente). |
| Sombras astronómicas (Modo Solar) | Backlog — usar `suncalc`. |
| `.geoarc` | Hecho (JSON v1, lote en lon/lat). |
| Bug del dibujo libre | Resuelto por diseño (dibujo en coordenadas geográficas del mapa) + test de regresión `e2e/dibujo.spec.ts`. |
| Módulo 2 (rasantes reales por fachada) | Hecho en esencia: rasante por lado, desde la cota natural del deslinde, con arranque. |
| Módulo 3 / Feature C (sombras comparativas, reactivas) | Backlog. |

## Backlog priorizado

**Alta**
1. Proxy liviano para Copernicus (p. ej. Cloudflare Worker que reenvíe `Range` y agregue CORS), documentado antes en
   `docs/decisiones.md`. El CORS ya está verificado: Copernicus no tiene CORS (hoy aparece deshabilitado en el selector).
2. Perfil OGUC verificado por Chris: tabla de ángulos por región, arranque, distanciamientos, regla sobre 10,5 m (si aplica). Tests que lo fijen.
3. Asignación de región por point-in-polygon (límites regionales oficiales) en vez de manual.
4. Importar levantamiento topográfico DXF (curvas/puntos con cota → TIN → grilla). Es la otra excepción del módulo de
   curvas en la que el profesor carga su propio terreno.

**Media**
5. Volumen propuesto (dibujado o importado) vs envolvente, con verificación visual de excesos.
6. Sombras con `suncalc`: envolvente vs volumen propuesto en fechas/horas definidas por norma.
7. FABDEM (DTM) pre-procesado solo para Chile, alojado como COG estático (licencia no comercial: uso docente).
8. Envolvente como malla suave (superficie + faldones) en vez de columnas; cálculo en Web Worker.
9. Exportar a Revit (Toposolid desde CSV de puntos) e IFC 4.3 (IfcSite).

**Baja**
10. Code-splitting de la vista 3D (bundle actual ~2,4 MB).
11. Modo “ejercicio” para docentes: escena precargada + preguntas.
12. Importar nubes/mallas de fotogrametría propia (PLY).

## Fuera de alcance v0.1

Validez legal de los resultados (es docencia); cálculo de constructibilidad/ocupación de suelo del PRC; edificación continua.
