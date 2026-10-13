import type { LocalFrame, LonLat } from '../geo/local'
import type { HeightGrid } from './grid'
import type { Rect } from './area'
import { localRectBBox, resampleToLocal, type GeoSampler } from './resample'

/**
 * Terrarium (AWS Terrain Tiles / Mapzen). Global, PNG RGB.
 * En Chile el dato subyacente es esencialmente SRTM (~30 m), aunque el zoom 15 tenga píxeles de ~4 m.
 */
export const TERRARIUM_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768
}

/** Coordenada de tesela (fraccionaria) Web Mercator. */
export function lonLatToTile(p: LonLat, z: number): { x: number; y: number } {
  const n = 2 ** z
  const x = ((p.lon + 180) / 360) * n
  const latRad = (p.lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  return { x, y }
}

async function loadTileRGBA(z: number, x: number, y: number): Promise<Uint8ClampedArray> {
  const url = TERRARIUM_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
  const res = await fetch(url, { mode: 'cors' })
  if (!res.ok) throw new Error(`Terrarium ${res.status} en ${url}`)
  const bmp = await createImageBitmap(await res.blob())
  const canvas = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D no disponible')
  ctx.drawImage(bmp, 0, 0)
  return ctx.getImageData(0, 0, bmp.width, bmp.height).data
}

const EARTH_CIRCUMFERENCE = 40075016.686
/** Zoom máximo que se pide: en Chile el dato es ~30 m y z14 ya da píxeles de ~7 m. */
export const TERRARIUM_MAX_ZOOM = 14
/** Resolución del dato de origen en Chile (SRTM 1″). */
const TERRARIUM_DATA_RES = 30

/** Tamaño en terreno (m) de un píxel de tesela de 256 px al zoom z y latitud dada. */
export function terrariumPixelSize(z: number, lat: number): number {
  return (EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** z)
}

/**
 * Zoom más bajo cuyo píxel no es mayor que la celda pedida (tope TERRARIUM_MAX_ZOOM). Así un área grande pide pocas
 * teselas y la cantidad de descargas queda acotada para cualquier área.
 */
export function terrariumZoom(cell: number, lat: number): number {
  const z = Math.ceil(Math.log2((EARTH_CIRCUMFERENCE * Math.cos((lat * Math.PI) / 180)) / (256 * cell)) - 1e-9)
  return Math.min(TERRARIUM_MAX_ZOOM, Math.max(1, z))
}

/** Carga Terrarium para el área local y la remuestrea a la grilla métrica. Solo navegador. */
export async function loadTerrariumGrid(
  frame: LocalFrame,
  area: Rect,
  cell: number,
  zoom = terrariumZoom(cell, frame.origin.lat),
): Promise<HeightGrid> {
  const px = terrariumPixelSize(zoom, frame.origin.lat)
  const bb = localRectBBox(frame, area, 2 * px)
  const tl = lonLatToTile({ lon: bb.west, lat: bb.north }, zoom)
  const br = lonLatToTile({ lon: bb.east, lat: bb.south }, zoom)
  const tx0 = Math.floor(tl.x)
  const ty0 = Math.floor(tl.y)
  const tx1 = Math.floor(br.x)
  const ty1 = Math.floor(br.y)
  const tiles = new Map<string, Uint8ClampedArray>()
  const jobs: Promise<void>[] = []
  for (let tx = tx0; tx <= tx1; tx++)
    for (let ty = ty0; ty <= ty1; ty++)
      jobs.push(loadTileRGBA(zoom, tx, ty).then((d) => void tiles.set(`${tx}/${ty}`, d)))
  await Promise.all(jobs)

  /** Elevación del píxel global (i, j) del mosaico al zoom dado. */
  const val = (i: number, j: number): number => {
    const tx = Math.floor(i / 256)
    const ty = Math.floor(j / 256)
    const d = tiles.get(`${tx}/${ty}`)
    if (!d) return NaN
    const k = ((j - ty * 256) * 256 + (i - tx * 256)) * 4
    return decodeTerrarium(d[k], d[k + 1], d[k + 2])
  }

  const sampler: GeoSampler = (p) => {
    const t = lonLatToTile(p, zoom)
    // el valor de cada píxel corresponde a su centro
    const gx = t.x * 256 - 0.5
    const gy = t.y * 256 - 0.5
    const i0 = Math.floor(gx)
    const j0 = Math.floor(gy)
    const fx = gx - i0
    const fy = gy - j0
    const a = val(i0, j0)
    const b = val(i0 + 1, j0)
    const c = val(i0, j0 + 1)
    const d = val(i0 + 1, j0 + 1)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
  }

  return resampleToLocal(frame, sampler, area, cell, {
    source: 'Terrarium (AWS Terrain Tiles)',
    kind: 'DSM',
    // si el área es grande se piden teselas más gruesas que el dato: manda el píxel
    nominalResolutionM: Math.max(TERRARIUM_DATA_RES, Math.round(px)),
    notes: `En Chile ≈ SRTM 1″ (~30 m). Teselas z${zoom} (~${Math.round(px)} m/píxel). Mezcla de fuentes; sin actualización activa. Uso referencial.`,
  })
}
