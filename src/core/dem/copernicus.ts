import { fromUrl } from 'geotiff'
import type { LocalFrame, LonLat } from '../geo/local'
import type { HeightGrid } from './grid'
import type { Rect } from './area'
import { localRectBBox, rasterSampler, resampleToLocal, type GeoSampler } from './resample'

/**
 * Copernicus DEM GLO-30 (AWS Open Data, COG). Global, ~30 m.
 * Es un DSM: incluye dosel arbóreo y edificios. En sitios con bosque sobrestima el terreno.
 */
const BASE = 'https://copernicus-dem-30m.s3.amazonaws.com'

/** Nombre de la tesela de 1°×1° que contiene el punto. La tesela se nombra por su esquina SUR-OESTE. */
export function copernicusTileName(p: LonLat): string {
  const lat = Math.floor(p.lat)
  const lon = Math.floor(p.lon)
  const ns = lat < 0 ? 'S' : 'N'
  const ew = lon < 0 ? 'W' : 'E'
  const la = String(Math.abs(lat)).padStart(2, '0')
  const lo = String(Math.abs(lon)).padStart(3, '0')
  return `Copernicus_DSM_COG_10_${ns}${la}_00_${ew}${lo}_00_DEM`
}

export function copernicusTileUrl(p: LonLat): string {
  const n = copernicusTileName(p)
  return `${BASE}/${n}/${n}.tif`
}

interface LoadedTile {
  key: string
  sampler: GeoSampler
}

async function loadWindow(url: string, bb: { west: number; east: number; south: number; north: number }): Promise<GeoSampler> {
  const tiff = await fromUrl(url)
  const img = await tiff.getImage()
  const [ox, oy] = img.getOrigin()
  const [rx, ry] = img.getResolution() // ry < 0
  const W = img.getWidth()
  const H = img.getHeight()
  // GTRasterTypeGeoKey: 1 = PixelIsArea (origen en esquina), 2 = PixelIsPoint (origen en centro).
  const keys = img.getGeoKeys() as Record<string, unknown> | null
  const isPoint = keys?.GTRasterTypeGeoKey === 2
  const half = isPoint ? 0 : 0.5
  const col = (lon: number) => (lon - ox) / rx - half
  const row = (lat: number) => (lat - oy) / ry - half
  const c0 = Math.max(0, Math.floor(col(bb.west)) - 2)
  const c1 = Math.min(W - 1, Math.ceil(col(bb.east)) + 2)
  const r0 = Math.max(0, Math.floor(row(bb.north)) - 2)
  const r1 = Math.min(H - 1, Math.ceil(row(bb.south)) + 2)
  if (c1 <= c0 || r1 <= r0) return () => NaN
  const rasters = await img.readRasters({ window: [c0, r0, c1 + 1, r1 + 1], samples: [0] })
  const data = rasters[0] as unknown as ArrayLike<number>
  const nd = img.getGDALNoData()
  const lon0 = ox + (c0 + half) * rx
  const lat0 = oy + (r0 + half) * ry
  return rasterSampler(data, c1 - c0 + 1, r1 - r0 + 1, lon0, lat0, rx, -ry, nd ?? undefined)
}

/**
 * Carga Copernicus para el área local (puede tocar varias teselas de 1°) y remuestrea. Solo navegador.
 * Hoy el navegador bloquea su lectura (el bucket no tiene CORS): requiere proxy. Ver docs/decisiones.md.
 */
export async function loadCopernicusGrid(frame: LocalFrame, area: Rect, cell: number): Promise<HeightGrid> {
  const bb = localRectBBox(frame, area)
  const tiles: LoadedTile[] = []
  for (let lat = Math.floor(bb.south); lat <= Math.floor(bb.north); lat++)
    for (let lon = Math.floor(bb.west); lon <= Math.floor(bb.east); lon++) {
      const p = { lon: lon + 0.5, lat: lat + 0.5 }
      tiles.push({ key: `${Math.floor(p.lat)}/${Math.floor(p.lon)}`, sampler: await loadWindow(copernicusTileUrl(p), bb) })
    }
  const sampler: GeoSampler = (p) => {
    const t = tiles.find((tt) => tt.key === `${Math.floor(p.lat)}/${Math.floor(p.lon)}`)
    return t ? t.sampler(p) : NaN
  }
  return resampleToLocal(frame, sampler, area, cell, {
    source: 'Copernicus DEM GLO-30',
    kind: 'DSM',
    nominalResolutionM: 30,
    notes: 'Superficie (DSM): incluye copas de árboles y techos. En terreno con bosque puede sobrestimar 10–25 m.',
  })
}
