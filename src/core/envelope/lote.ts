import type { XY } from '../geo/local'
import type { Rect } from '../dem/area'
import { bbox } from './polygon'
import type { EdgeRule, EnvelopeInput } from './envelope'
import { suggestedCell } from './envelope'

/**
 * Lote rectangular por dimensiones, centrado en `c` (por defecto, el sitio).
 * Antes de girar: ancho (frente) a lo largo del eje este, fondo hacia el norte; el lado 1 es el frente (sur).
 * `giroDeg` gira el lote en sentido antihorario.
 */
export function lotFromDimensions(ancho: number, fondo: number, giroDeg = 0, c: XY = { x: 0, y: 0 }): XY[] {
  const a = (giroDeg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  return [
    { x: -ancho / 2, y: -fondo / 2 },
    { x: ancho / 2, y: -fondo / 2 },
    { x: ancho / 2, y: fondo / 2 },
    { x: -ancho / 2, y: fondo / 2 },
  ].map((p) => ({ x: c.x + p.x * cos - p.y * sin, y: c.y + p.x * sin + p.y * cos }))
}

/** Rectángulo que contiene el lote ampliado `margin` metros por lado. */
export function lotBox(lot: XY[], margin = 0): Rect {
  const b = bbox(lot)
  return { minX: b.minX - margin, minY: b.minY - margin, maxX: b.maxX + margin, maxY: b.maxY + margin }
}

/** Área de terreno a descargar alrededor de un lote: su caja más max(30 m, medio lado mayor), para ver el contexto. */
export function terrainAreaForLot(lot: XY[]): Rect {
  const b = bbox(lot)
  return lotBox(lot, Math.max(30, Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2))
}

/** Entrada de la envolvente: altura máxima 0 = sin límite; celda adaptada al lote. */
export function envelopeInputFor(lot: XY[], rules: EdgeRule[], maxHeight: number, terrain: (x: number, y: number) => number): EnvelopeInput {
  return { lot, rules, maxHeight: maxHeight > 0 ? maxHeight : Infinity, terrain, cell: suggestedCell(lot) }
}
