# GEO·ARC

Terreno real y norma para el taller — herramienta docente de META|Lab, Universidad Autónoma de Chile.

La pantalla de inicio ofrece dos módulos. Cada uno funciona solo; el sitio y el terreno se comparten entre ambos.

- **Curvas de nivel** (`/curvas`): ubica el sitio, dibuja el área en el mapa (dos clics) y las curvas aparecen. El
  terreno se descarga solo. El panel dice para qué sirve el dato («dato de ~30 m: útil para ladera y barrio, no para el
  lote») y preselecciona la equidistancia según la resolución y el desnivel. Exporta un DXF georreferenciado (UTM) con
  cotas.
- **Estudio de sombras** (`/sombras`): define el lote (dibujado, de ejemplo o por ancho, fondo y giro) y aplica
  rasantes, distanciamientos y altura máxima. Se calcula en plano (cota 0, por defecto) o sobre el terreno del sitio.
  Muestra qué restricción manda en cada punto; vista 3D, DXF y PNG.

## Uso local

```bash
npm install
npm run dev
```

Abre la URL que indica la consola. Sin conexión: el Estudio de sombras en plano funciona tal cual; para curvas, elige
**Ladera sintética** en «Opciones avanzadas» y dibuja el área.

## Pruebas

```bash
npm test             # núcleo geométrico (Vitest)
npm run typecheck
npm run e2e          # navegación y flujos de ambos módulos en navegador (Playwright)
```

## Publicación

Es un sitio estático (`npm run build` → `dist/`). El flujo `.github/workflows/pages.yml` lo publica en GitHub Pages
al hacer push a `main` (activar Pages → “GitHub Actions” en la configuración del repo). Como Pages no reescribe rutas,
el build copia `index.html` en `curvas/`, `sombras/` y `404.html`: los enlaces directos a cada módulo funcionan.

## Datos y atribuciones

- Mapa base (por defecto): [OpenFreeMap](https://openfreemap.org), estilo Liberty ·
  [© OpenMapTiles](https://www.openmaptiles.org/) · datos [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
- Mapa base alternativo «OSM»: teselas raster de OpenStreetMap · © OpenStreetMap contributors.
- Imagen satelital: Esri World Imagery · © Esri, Maxar, Earthstar Geographics.
- Elevación: AWS Terrain Tiles / Terrarium (Mapzen/Tilezen; fuentes SRTM, GMTED, ETOPO1 y otras), fuente por defecto.
  Copernicus DEM GLO-30 (© DLR e.V. / Airbus, provisto bajo el programa Copernicus de la Unión Europea y la ESA).
- Búsqueda: [Nominatim](https://nominatim.org) y, como respaldo, [Photon](https://photon.komoot.io) (komoot) ·
  datos © OpenStreetMap contributors.

El mapa muestra las atribuciones del mapa base activo (esquina inferior derecha), y la lista de resultados indica qué
buscador respondió.

Resultados con fines docentes: no reemplazan un levantamiento topográfico ni el certificado de informaciones previas.

Documentación para desarrollo: `CLAUDE.md`, `SPEC.md`, `docs/decisiones.md`.
