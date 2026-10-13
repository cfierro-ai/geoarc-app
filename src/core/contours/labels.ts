import type { Isoline } from './isolines'
import { niceNearest, SERIE_CARTO } from '../nice'

export interface LabelPlacement {
  x: number
  y: number
  /** Giro del texto (°, antihorario desde el este), en (−90, 90]: siempre legible sin dar vuelta la hoja. */
  angleDeg: number
}

/**
 * Altura de texto (m) para rótulos de cota: 2,5 mm al imprimir el lado mayor del área en el ancho útil de una hoja A3
 * (~400 mm), es decir lado / 160, redondeada en la serie 1–2–2,5–5.
 */
export function labelHeight(maxSide: number): number {
  return niceNearest(maxSide / 160, SERIE_CARTO)
}

/**
 * Posiciones de rótulo a lo largo de una curva: una cada ~40 alturas de texto (≈ 10 cm en papel), repartidas
 * uniformemente, con el texto alineado a la curva. Curvas más cortas que 6 alturas no se rotulan.
 */
export function labelPlacements(line: Isoline, height: number): LabelPlacement[] {
  const pts = line.closed && line.points.length ? [...line.points, line.points[0]] : line.points
  if (pts.length < 2) return []
  const cum = [0]
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y))
  const L = cum[cum.length - 1]
  if (L < 6 * height) return []
  const n = Math.max(1, Math.floor(L / (40 * height)))
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
