# GEO·ARC

Envolvente normativa sobre terreno real — herramienta docente de META|Lab, Universidad Autónoma de Chile.

Sitio real (cualquier parte del mundo) → área → curvas de nivel → lote → norma → envolvente 3D → DXF georreferenciado.

Curvas de nivel en tres pasos: ubica el sitio, dibuja el área en el mapa (dos clics) y las curvas aparecen. El terreno
se descarga solo; el panel indica la escala que el dato sostiene y preselecciona la equidistancia mínima sugerida.

## Uso local

```bash
npm install
npm run dev
```

Abre la URL que indica la consola. Para clases sin conexión, elige **Ladera sintética** en «Opciones avanzadas» del
paso 2 y dibuja el área.

## Pruebas

```bash
npm test             # núcleo geométrico (Vitest)
npm run typecheck
npm run e2e          # flujo completo en navegador (Playwright)
```

## Publicación

Es un sitio estático (`npm run build` → `dist/`). El flujo `.github/workflows/pages.yml` lo publica en GitHub Pages
al hacer push a `main` (activar Pages → “GitHub Actions” en la configuración del repo).

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
