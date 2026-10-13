import type { XY } from '../geo/local'
import { niceCeil, niceNearest } from '../nice'

/** Rectángulo alineado con la cuadrícula UTM del sitio, en coordenadas locales (m). */
export interface Rect {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Lado mínimo y máximo del área de extracción (m). */
export const MIN_AREA_SIDE = 10
export const MAX_AREA_SIDE = 20_000
/** Celdas objetivo en el lado MENOR del área. */
export const TARGET_CELLS = 250
/** Tope de celdas por lado de la grilla (áreas muy alargadas). */
export const MAX_CELLS = 2000
/** Bajo esta celda solo se sobremuestrea: ningún dato de la app es tan fino. */
export const MIN_CELL = 0.25

export function rectFromCorners(a: XY, b: XY): Rect {
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) }
}

/** Cuadrado de lado `size` centrado en `c` (por defecto, el origen del marco local). */
export function squareRect(size: number, c: XY = { x: 0, y: 0 }): Rect {
  const h = size / 2
  return { minX: c.x - h, minY: c.y - h, maxX: c.x + h, maxY: c.y + h }
}

export function rectSize(r: Rect): { w: number; h: number } {
  return { w: r.maxX - r.minX, h: r.maxY - r.minY }
}

export function rectCenter(r: Rect): XY {
  return { x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2 }
}

export function pointInRect(p: XY, r: Rect): boolean {
  return p.x >= r.minX && p.x <= r.maxX && p.y >= r.minY && p.y <= r.maxY
}

export function rectCorners(r: Rect): XY[] {
  return [
    { x: r.minX, y: r.minY },
    { x: r.maxX, y: r.minY },
    { x: r.maxX, y: r.maxY },
    { x: r.minX, y: r.maxY },
  ]
}

/** Motivo por el que el área no sirve, o null si sirve. */
export function areaProblem(r: Rect): string | null {
  const { w, h } = rectSize(r)
  if (Math.min(w, h) < MIN_AREA_SIDE) return `El área debe medir al menos ${MIN_AREA_SIDE} m por lado.`
  if (Math.max(w, h) > MAX_AREA_SIDE) return `El área no puede superar ${MAX_AREA_SIDE / 1000} km por lado.`
  return null
}

/**
 * Celda automática: ~TARGET_CELLS celdas en el lado menor, redondeada a un valor de la serie fina. Si el lado mayor
 * pasara de MAX_CELLS celdas, la celda crece lo justo para respetar el tope.
 */
export function autoCell(r: Rect): number {
  const { w, h } = rectSize(r)
  let cell = Math.max(MIN_CELL, niceNearest(Math.min(w, h) / TARGET_CELLS))
  if (Math.max(w, h) / cell > MAX_CELLS) cell = niceCeil(Math.max(w, h) / MAX_CELLS)
  return cell
}

/** Número de celdas (no nodos) por lado de la grilla que se construye sobre el área. */
export function gridCells(r: Rect, cell: number): { nx: number; ny: number } {
  const { w, h } = rectSize(r)
  return { nx: Math.max(1, Math.round(w / cell)), ny: Math.max(1, Math.round(h / cell)) }
}

/**
 * Líneas de una malla de paso `step` (múltiplos de `step` desde el origen del marco) que cruzan el área.
 * null si serían más de `max` líneas: a esa densidad la malla no se lee.
 */
export function dataGridLines(r: Rect, step: number, max = 400): { a: XY; b: XY }[] | null {
  if (!(step > 0)) return null
  const xs: number[] = []
  const ys: number[] = []
  for (let k = Math.ceil(r.minX / step); k * step <= r.maxX + 1e-9; k++) xs.push(k * step)
  for (let k = Math.ceil(r.minY / step); k * step <= r.maxY + 1e-9; k++) ys.push(k * step)
  if (xs.length + ys.length > max) return null
  return [
    ...xs.map((x) => ({ a: { x, y: r.minY }, b: { x, y: r.maxY } })),
    ...ys.map((y) => ({ a: { x: r.minX, y }, b: { x: r.maxX, y } })),
  ]
}
