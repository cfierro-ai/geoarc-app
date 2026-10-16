import type { Isoline } from './isolines'
import { niceNearest, SERIE_CARTO } from '../nice'

export interface LabelPlacement {
  x: number
  y: number
  /** Giro del texto (°, antihorario desde el este), en (−90, 90]: siempre legible sin dar vuelta la hoja. */
  angleDeg: number
}

/** Un rótulo de cota cada ~150 m de longitud de curva (criterio de Chris, 2026-10-15, para plano y mapa). */
export const ESPACIADO_ETIQUETA = 150
/** Bajo este largo (m) la curva no se rotula; sobre él, al menos un rótulo. */
export const LARGO_MIN_ETIQUETA = 30

/**
 * Altura de texto (m) para rótulos de cota: 2,5 mm al imprimir el lado mayor del área en el ancho útil de una hoja A3
 * (~400 mm), es decir lado / 160, redondeada en la serie 1–2–2,5–5.
 */
export function labelHeight(maxSide: number): number {
  return niceNearest(maxSide / 160, SERIE_CARTO)
}

/** Ancho aproximado (m) del texto `valor` a la altura `height` (≈ 0,6 de la altura por carácter). */
export function anchoTexto(valor: string, height: number): number {
  return Math.max(1, valor.length) * height * 0.6
}

/**
 * Posiciones de rótulo a lo largo de una curva maestra: una cada ~150 m de longitud de curva, repartidas
 * uniformemente y alineadas a la curva. Al menos una si la curva mide más de 30 m; ninguna en curvas más cortas que el
 * largo mínimo o que el ancho del propio texto (`valor`, la cota a rotular). Mismo criterio en el plano (DXF) y el mapa.
 */
export function labelPlacements(line: Isoline, height: number, valor = '0000'): LabelPlacement[] {
  const pts = line.closed && line.points.length ? [...line.points, line.points[0]] : line.points
  if (pts.length < 2) return []
  const cum = [0]
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y))
  const L = cum[cum.length - 1]
  if (L <= LARGO_MIN_ETIQUETA || L < anchoTexto(valor, height)) return []
  const n = Math.max(1, Math.round(L / ESPACIADO_ETIQUETA))
  const out: LabelPlacement[] = []
  let seg = 0
  for (let k = 0; k < n; k++) {
    const s = ((k + 0.5) * L) / n
    while (seg < pts.length - 2 && cum[seg + 1] < s) seg++
    const a = pts[seg]
    const b = pts[seg + 1]
    const len = cum[seg + 1] - cum[seg]
    const t = len > 0 ? (s - cum[seg]) / len : 0
    let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
    if (ang > 90) ang -= 180
    else if (ang <= -90) ang += 180
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angleDeg: ang })
  }
  return out
}
