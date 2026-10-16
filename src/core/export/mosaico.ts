import type { LonLat } from '../geo/local'

/**
 * Mosaico de teselas raster (Web Mercator, teselas de 256 px) para texturar el modelo 3D. La imagen NO se reproyecta:
 * cada vértice del terreno se mapea con su lon/lat al píxel que le corresponde en el mosaico y se usa como coordenada UV.
 * Fuentes: satélite (Esri World Imagery) o mapa (OpenStreetMap). Todo aquí es puro (sin red ni canvas): se prueba en Node.
 */

/** Lado mayor del mosaico, en píxeles: se elige el zoom para quedar en este rango (si la fuente llega a ese zoom). */
export const TEXTURA_PX_MIN = 2048
export const TEXTURA_PX_MAX = 4096

export interface BBoxLL {
  west: number
  east: number
  south: number
  north: number
}

/** Fracción del mundo (0..1) en Web Mercator. */
export const lonFrac = (lon: number) => (lon + 180) / 360
export const latFrac = (lat: number) => {
  const r = (lat * Math.PI) / 180
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2
}

/**
 * Zoom para que el lado mayor del mosaico quede entre `pxMin` y `pxMax` píxeles, sin pasar de `maxZoom` (el zoom máximo
 * con imagen de la fuente). Si el ideal supera `maxZoom`, se usa `maxZoom` (el mosaico queda más chico, con imagen real).
 */
export function zoomMosaico(bb: BBoxLL, maxZoom: number, pxMax = TEXTURA_PX_MAX): number {
  const spanX = Math.abs(lonFrac(bb.east) - lonFrac(bb.west))
  const spanY = Math.abs(latFrac(bb.south) - latFrac(bb.north))
  const span = Math.max(spanX, spanY) || 1e-12
  // el mayor zoom con el lado mayor ≤ pxMax; al duplicarse por nivel, queda > pxMax/2 = TEXTURA_PX_MIN (rango [2048, 4096])
  const z = Math.floor(Math.log2(pxMax / (span * 256)))
  return Math.max(0, Math.min(maxZoom, z))
}

export interface MosaicoInfo {
  zoom: number
  /** Índice de la tesela superior-izquierda (NO). */
  x0: number
  y0: number
  /** Teselas a lo ancho y alto. */
  nx: number
  ny: number
  anchoPx: number
  altoPx: number
  /** Píxel global de la esquina superior-izquierda del mosaico. */
  origenPx: { x: number; y: number }
}

/** Teselas que cubren el bbox al zoom dado, y las dimensiones del mosaico resultante. */
export function infoMosaico(bb: BBoxLL, zoom: number): MosaicoInfo {
  const n = 2 ** zoom
  const x0 = Math.floor(lonFrac(bb.west) * n)
  const x1 = Math.floor(lonFrac(bb.east) * n)
  const y0 = Math.floor(latFrac(bb.north) * n)
  const y1 = Math.floor(latFrac(bb.south) * n)
  const nx = x1 - x0 + 1
  const ny = y1 - y0 + 1
  return { zoom, x0, y0, nx, ny, anchoPx: nx * 256, altoPx: ny * 256, origenPx: { x: x0 * 256, y: y0 * 256 } }
}

/** Píxel dentro del mosaico (origen arriba-izquierda) de un lon/lat. */
export function pixelDeLonLat(p: LonLat, m: MosaicoInfo): { x: number; y: number } {
  const n = 2 ** m.zoom
  return { x: lonFrac(p.lon) * n * 256 - m.origenPx.x, y: latFrac(p.lat) * n * 256 - m.origenPx.y }
}

/** Coordenada UV (glTF: u a la derecha, v hacia abajo desde arriba) de un lon/lat. */
export function uvDeLonLat(p: LonLat, m: MosaicoInfo): { u: number; v: number } {
  const px = pixelDeLonLat(p, m)
  return { u: px.x / m.anchoPx, v: px.y / m.altoPx }
}
