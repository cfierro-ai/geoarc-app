import type { LocalFrame, XY, XYZ } from '../geo/local'
import type { HeightGrid } from '../dem/grid'
import { autoCell, type Rect } from '../dem/area'
import type { SurveyDrawing } from './dxfRead'
import { buildTin, densify, tinToGrid } from './tin'

/**
 * Coordenadas del dibujo:
 * - 'local' (por defecto): coordenadas arbitrarias del levantamiento; el centro del dibujo se lleva al sitio.
 * - 'utm': el dibujo ya está en UTM (huso y hemisferio del sitio), y se ubica donde corresponde.
 */
export type SurveyCoords = 'local' | 'utm'

export interface SurveyInfo {
  fileName: string
  coords: SurveyCoords
  layers: string[]
  points: number
  triangles: number
  zMin: number
  zMax: number
}

export interface SurveyTerrain {
  grid: HeightGrid
  area: Rect
  info: SurveyInfo
}

/** Extensión de una nube de puntos (con un bucle: `Math.min(...p)` desborda la pila con cientos de miles de puntos). */
function extent(pts: XYZ[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, zMin = Infinity, zMax = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
    if (p.z < zMin) zMin = p.z
    if (p.z > zMax) zMax = p.z
  }
  return { minX, minY, maxX, maxY, zMin, zMax }
}

/** ¿El dibujo parece estar en UTM del sitio? (su centro a menos de 50 km del origen del marco) */
export function looksLikeSiteUtm(d: SurveyDrawing, frame: LocalFrame): boolean {
  if (!d.bbox) return false
  const cx = (d.bbox.minX + d.bbox.maxX) / 2
  const cy = (d.bbox.minY + d.bbox.maxY) / 2
  return Math.hypot(cx - frame.originE, cy - frame.originN) < 50_000
}

/** Transformación del dibujo al marco local del sitio. */
export function surveyToLocal(d: SurveyDrawing, coords: SurveyCoords, frame: LocalFrame, layers: string[]): (p: XYZ) => XYZ {
  if (coords === 'utm') return (p) => ({ x: p.x - frame.originE, y: p.y - frame.originN, z: p.z })
  // centro de lo que se usa (las capas elegidas), no de todo el dibujo
  const e = extent(d.features.filter((f) => layers.includes(f.layer)).flatMap((f) => f.points))
  const c: XY = { x: (e.minX + e.maxX) / 2, y: (e.minY + e.maxY) / 2 }
  return (p) => ({ x: p.x - c.x, y: p.y - c.y, z: p.z })
}

/**
 * Levantamiento → grilla de terreno (`meta.kind = 'levantamiento'`). Las polilíneas y líneas se densifican (tramos de
 * hasta 2 celdas, entre 0,25 y 2 m) para que el TIN siga las curvas; luego TIN y muestreo por triángulo.
 */
export function surveyToGrid(d: SurveyDrawing, opts: { fileName: string; coords: SurveyCoords; layers: string[]; frame: LocalFrame }): SurveyTerrain {
  const feats = d.features.filter((f) => opts.layers.includes(f.layer))
  if (!feats.length) throw new Error('No hay entidades con cota en las capas elegidas.')
  const tf = surveyToLocal(d, opts.coords, opts.frame, opts.layers)
  const local = feats.map((f) => ({ ...f, points: f.points.map(tf) }))
  const e = extent(local.flatMap((f) => f.points))
  const area: Rect = { minX: e.minX, minY: e.minY, maxX: e.maxX, maxY: e.maxY }
  if (area.maxX - area.minX < 1 || area.maxY - area.minY < 1) throw new Error('El levantamiento mide menos de 1 m por lado.')
  const cell = autoCell(area)
  const step = Math.min(2, Math.max(0.25, 2 * cell))
  const tin = buildTin(local.flatMap((f) => (f.points.length > 1 ? densify(f.points, f.closed, step) : f.points)))
  const info: SurveyInfo = {
    fileName: opts.fileName,
    coords: opts.coords,
    layers: opts.layers,
    points: tin.pts.length,
    triangles: tin.triangles.length / 3,
    zMin: e.zMin,
    zMax: e.zMax,
  }
  const grid = tinToGrid(tin, area, cell, {
    source: `Levantamiento (${opts.fileName})`,
    kind: 'levantamiento',
    // separación típica entre datos (en un TIN de curvas, la distancia entre curvas), no la celda de la grilla
    nominalResolutionM: Math.round(tin.spacing * 100) / 100,
    notes: `TIN de ${info.points} puntos y ${info.triangles} triángulos; capas: ${opts.layers.join(', ')}. Coordenadas ${opts.coords === 'utm' ? 'UTM del sitio' : 'locales, centradas en el sitio'}.`,
  })
  return { grid, area, info }
}
