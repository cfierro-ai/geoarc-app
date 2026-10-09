import { useEffect, useRef, useState } from 'react'
import {
  Map as MlMap,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type GeoJSONSource,
  type LayerSpecification,
  type MapMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl'
import type { Feature, FeatureCollection } from 'geojson'
// MapLibre v6 carga su worker como módulo aparte: Vite debe empaquetarlo y entregar su URL.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
setWorkerUrl(maplibreWorkerUrl)
import type { LocalFrame, LonLat, XY } from '../../core/geo/local'
import type { Isoline } from '../../core/contours/isolines'
import { edgeColor, type MapMode } from '../model'

/** OpenFreeMap, estilo vectorial «Liberty». Sus atribuciones vienen en el TileJSON y MapLibre las muestra. */
const OFM_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

type Basemap = 'ofm' | 'osm' | 'sat'
const BASEMAPS: { id: Basemap; label: string; title: string }[] = [
  { id: 'ofm', label: 'Mapa', title: 'OpenFreeMap · estilo Liberty (vectorial)' },
  { id: 'osm', label: 'OSM', title: 'OpenStreetMap estándar (raster)' },
  { id: 'sat', label: 'Satélite', title: 'Esri World Imagery' },
]

const RASTER_SOURCES: StyleSpecification['sources'] = {
  osm: {
    type: 'raster',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    maxzoom: 19,
    attribution: '© OpenStreetMap contributors',
  },
  sat: {
    type: 'raster',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: 256,
    maxzoom: 19,
    attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics',
  },
}

const rasterLayers = (visible: Basemap): LayerSpecification[] => [
  { id: 'osm', type: 'raster', source: 'osm', layout: { visibility: visible === 'osm' ? 'visible' : 'none' } },
  { id: 'sat', type: 'raster', source: 'sat', layout: { visibility: visible === 'sat' ? 'visible' : 'none' } },
]

/**
 * Estilo base: OpenFreeMap con las capas raster de OSM y satélite debajo, ocultas. Cambiar de mapa base es cambiar
 * visibilidades, así las capas propias (curvas, lote) nunca se pierden. Si OpenFreeMap no responde (red de la sala,
 * bloqueo), queda solo OSM raster y el mapa y el dibujo siguen funcionando.
 */
async function loadBaseStyle(): Promise<{ style: StyleSpecification; vectorLayerIds: string[] }> {
  try {
    const r = await fetch(OFM_STYLE_URL, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) throw new Error(`OpenFreeMap ${r.status}`)
    const s = (await r.json()) as StyleSpecification
    return {
      style: { ...s, sources: { ...s.sources, ...RASTER_SOURCES }, layers: [...rasterLayers('ofm'), ...s.layers] },
      vectorLayerIds: s.layers.map((l) => l.id),
    }
  } catch {
    return { style: { version: 8, sources: RASTER_SOURCES, layers: rasterLayers('osm') }, vectorLayerIds: [] }
  }
}

type FC = FeatureCollection
const empty: FC = { type: 'FeatureCollection', features: [] }

interface Props {
  frame: LocalFrame
  site: LonLat
  areaSize: number
  contours: Isoline[]
  indexInterval: number
  lot: XY[]
  draft: XY[]
  mode: MapMode
  onPick: (p: LonLat) => void
  onFinishLot: () => void
  visible: boolean
}

export function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const [ready, setReady] = useState(false)
  const [basemap, setBasemap] = useState<Basemap>('ofm')
  /** Capas del estilo de OpenFreeMap; vacío si no cargó (solo OSM raster); null mientras se carga. */
  const [vectorIds, setVectorIds] = useState<string[] | null>(null)
  const cb = useRef(p)
  cb.current = p

  useEffect(() => {
    let m: MlMap | undefined
    let cancelled = false
    loadBaseStyle().then(({ style, vectorLayerIds }) => {
      if (cancelled || !el.current) return
      const site = cb.current.site
      m = createMap(el.current, style, site, vectorLayerIds.length > 0)
      if (!vectorLayerIds.length) setBasemap('osm')
      setVectorIds(vectorLayerIds)
      map.current = m
      marker.current = new Marker({ color: '#0f172a' }).setLngLat([site.lon, site.lat]).addTo(m)
    })
    return () => {
      cancelled = true
      m?.remove()
      map.current = null
    }
  }, [])

  function createMap(container: HTMLDivElement, style: StyleSpecification, site: LonLat, ofmGlyphs: boolean) {
    const m = new MlMap({
      container,
      style,
      center: [site.lon, site.lat],
      zoom: 17,
      attributionControl: { compact: false },
    })
    m.addControl(new NavigationControl({ visualizePitch: false }), 'top-right')
    m.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left')
    // 'style.load' y no 'load': las capas propias solo necesitan el estilo; 'load' espera además todas las teselas
    // del mapa base (vectoriales, con edificios 3D), y en una red lenta curvas y lote tardarían en aparecer.
    m.once('style.load', () => {
      m.addSource('area', { type: 'geojson', data: empty })
      m.addSource('contours', { type: 'geojson', data: empty })
      m.addSource('lot', { type: 'geojson', data: empty })
      m.addSource('draft', { type: 'geojson', data: empty })
      m.addLayer({ id: 'area', type: 'line', source: 'area', paint: { 'line-color': '#334155', 'line-dasharray': [2, 2], 'line-width': 1 } })
      m.addLayer({
        id: 'contours',
        type: 'line',
        source: 'contours',
        paint: {
          'line-color': '#8b4513',
          'line-width': ['case', ['get', 'index'], 1.6, 0.6],
          'line-opacity': 0.85,
        },
      })
      m.addLayer({
        id: 'contour-labels',
        type: 'symbol',
        source: 'contours',
        filter: ['get', 'index'],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'label'],
          'text-size': 10,
          // OpenFreeMap sirve Noto Sans; la fuente por defecto de MapLibre (Open Sans) da 404 allí
          ...(ofmGlyphs ? { 'text-font': ['Noto Sans Regular'] } : {}),
        },
        paint: { 'text-color': '#5b2c0a', 'text-halo-color': '#fff', 'text-halo-width': 1.2 },
      })
      m.addLayer({ id: 'lot-fill', type: 'fill', source: 'lot', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#0ea5e9', 'fill-opacity': 0.12 } })
      m.addLayer({ id: 'lot-edges', type: 'line', source: 'lot', filter: ['==', '$type', 'LineString'], paint: { 'line-color': ['get', 'color'], 'line-width': 3.5 } })
      m.addLayer({ id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-color': '#0ea5e9', 'line-width': 2, 'line-dasharray': [1, 1] } })
      m.addLayer({ id: 'draft-pts', type: 'circle', source: 'draft', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 4, 'circle-color': '#0ea5e9', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } })
      setReady(true)
    })
    // mapa en reposo (datos procesados y dibujados): señal para las capturas de e2e
    m.on('idle', () => container.setAttribute('data-idle', 'true'))
    m.on('click', (e: MapMouseEvent) => {
      const mode = cb.current.mode
      if (mode !== 'none') cb.current.onPick({ lon: e.lngLat.lng, lat: e.lngLat.lat })
    })
    m.on('dblclick', (e: MapMouseEvent) => {
      if (cb.current.mode === 'lot') {
        e.preventDefault()
        cb.current.onFinishLot()
      }
    })
    return m
  }

  // redimensionar al volver visible
  useEffect(() => {
    if (p.visible) map.current?.resize()
  }, [p.visible])

  useEffect(() => {
    const m = map.current
    if (!m) return
    marker.current?.setLngLat([p.site.lon, p.site.lat])
    if (p.mode !== 'lot') m.easeTo({ center: [p.site.lon, p.site.lat] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.site.lon, p.site.lat])

  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    m.getCanvas().style.cursor = p.mode === 'none' ? '' : 'crosshair'
    if (p.mode === 'lot') m.doubleClickZoom.disable()
    else m.doubleClickZoom.enable()
  }, [p.mode, ready])

  useEffect(() => {
    const m = map.current
    if (!m || !ready || !vectorIds) return
    for (const id of vectorIds) m.setLayoutProperty(id, 'visibility', basemap === 'ofm' ? 'visible' : 'none')
    m.setLayoutProperty('osm', 'visibility', basemap === 'osm' ? 'visible' : 'none')
    m.setLayoutProperty('sat', 'visibility', basemap === 'sat' ? 'visible' : 'none')
  }, [basemap, ready, vectorIds])

  useEffect(() => {
    const m = map.current
    if (!m || !ready) return
    const ll = (q: XY) => {
      const g = p.frame.toLonLat(q)
      return [g.lon, g.lat]
    }
    const h = p.areaSize / 2
    m.getContainer().removeAttribute('data-idle')
    ;(m.getSource('area') as GeoJSONSource).setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [ll({ x: -h, y: -h }), ll({ x: h, y: -h }), ll({ x: h, y: h }), ll({ x: -h, y: h }), ll({ x: -h, y: -h })] },
    })
    ;(m.getSource('contours') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: p.contours.map((c) => {
        const isIndex = Math.abs(c.level / p.indexInterval - Math.round(c.level / p.indexInterval)) < 1e-6
        const coords = c.points.map(ll)
        if (c.closed && coords.length) coords.push(coords[0])
        return {
          type: 'Feature',
          properties: { level: c.level, index: isIndex, label: `${Math.round(c.level * 10) / 10} m` },
          geometry: { type: 'LineString', coordinates: coords },
        }
      }),
    })
    const lotFeatures: Feature[] = []
    if (p.lot.length > 2) {
      lotFeatures.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...p.lot.map(ll), ll(p.lot[0])]] } })
      p.lot.forEach((a, k) => {
        const b = p.lot[(k + 1) % p.lot.length]
        lotFeatures.push({ type: 'Feature', properties: { color: edgeColor(k) }, geometry: { type: 'LineString', coordinates: [ll(a), ll(b)] } })
      })
    }
    ;(m.getSource('lot') as GeoJSONSource).setData({ type: 'FeatureCollection', features: lotFeatures })
    const dr: Feature[] = p.draft.map((q) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: ll(q) } }))
    if (p.draft.length > 1) dr.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: p.draft.map(ll) } })
    ;(m.getSource('draft') as GeoJSONSource).setData({ type: 'FeatureCollection', features: dr })
  }, [p.frame, p.areaSize, p.contours, p.indexInterval, p.lot, p.draft, ready])

  return (
    <div className="absolute inset-0">
      {/* estilo en línea: la hoja de MapLibre fuerza position: relative en .maplibregl-map */}
      <div ref={el} style={{ position: "absolute", inset: 0 }} data-testid="map" data-ready={ready || undefined} />
      <div className="absolute left-2 top-2 flex overflow-hidden rounded-md border border-slate-300 bg-white text-xs shadow" role="group" aria-label="Mapa base">
        {BASEMAPS.map((b) => {
          const off = b.id === 'ofm' && vectorIds?.length === 0
          return (
            <button
              key={b.id}
              onClick={() => setBasemap(b.id)}
              disabled={off}
              title={off ? 'OpenFreeMap no disponible en esta red' : b.title}
              aria-pressed={basemap === b.id}
              className={`px-2 py-1 disabled:opacity-40 ${basemap === b.id ? 'bg-slate-800 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              {b.label}
            </button>
          )
        })}
      </div>
      {p.mode !== 'none' && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md bg-sky-600 px-3 py-1 text-xs text-white shadow">
          {p.mode === 'site' ? 'Haz clic en el mapa para fijar el sitio' : 'Clic: agregar vértice · Doble clic: cerrar lote'}
        </div>
      )}
    </div>
  )
}
