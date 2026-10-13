import type { XY } from '../geo/local'
import { bbox, pointInPolygon } from '../envelope/polygon'
import type { Isoline } from './isolines'

/** Parámetros t ∈ (0, 1), ordenados, donde el tramo a→b cruza los lados del polígono. */
function crossings(a: XY, b: XY, poly: XY[]): number[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const ts: number[] = []
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k]
    const q = poly[(k + 1) % poly.length]
    const ex = q.x - p.x
    const ey = q.y - p.y
    const den = dx * ey - dy * ex
    if (den === 0) continue // paralelos: si son colineales, el punto medio de cada pedazo decide
    const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den
    const u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t)
  }
  return ts.sort((m, n) => m - n)
}

const lerp = (a: XY, b: XY, t: number): XY => (t === 0 ? a : t === 1 ? b : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/**
 * Recorta una polilínea a un polígono simple (convexo o cóncavo, cualquier sentido). Cada tramo se parte en los
 * cruces con los lados y se conserva cada pedazo cuyo punto medio queda dentro. Devuelve los pedazos interiores y si
 * una polilínea cerrada quedó entera dentro (sigue cerrada).
 */
function clip(points: XY[], closed: boolean, poly: XY[]): { pieces: XY[][]; whole: boolean } {
  const n = points.length
  const segs = closed ? n : n - 1
  const pb = bbox(poly)
  const inside = (p: XY) => p.x >= pb.minX && p.x <= pb.maxX && p.y >= pb.minY && p.y <= pb.maxY && pointInPolygon(p, poly)
  const pieces: XY[][] = []
  let cur: XY[] | null = null
  let firstIn = false
  let lastIn = false
  let anyOut = false
  for (let s = 0; s < segs; s++) {
    const a = points[s]
    const b = points[(s + 1) % n]
    const ts = [0, ...crossings(a, b, poly), 1]
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k]
      const t1 = ts[k + 1]
      if (t1 - t0 < 1e-12) continue
      const isIn = inside(lerp(a, b, (t0 + t1) / 2))
      if (s === 0 && k === 0) firstIn = isIn
      lastIn = isIn
      if (isIn) {
        if (!cur) cur = [lerp(a, b, t0)]
        cur.push(lerp(a, b, t1))
      } else {
        anyOut = true
        if (cur) pieces.push(cur)
        cur = null
      }
    }
  }
  if (cur) pieces.push(cur)
  if (closed && !anyOut && pieces.length) return { pieces: [points], whole: true }
  // anillo cortado: el pedazo final y el inicial se tocan en el primer vértice → son uno solo
  if (closed && firstIn && lastIn && pieces.length > 1) pieces[0] = [...pieces.pop()!, ...pieces[0].slice(1)]
  return { pieces, whole: false }
}

/** Pedazos de la polilínea que quedan dentro del polígono (un anillo entero dentro se devuelve tal cual). */
export function clipPolyline(points: XY[], closed: boolean, poly: XY[]): XY[][] {
  if (points.length < 2 || poly.length < 3) return []
  return clip(points, closed, poly).pieces
}

/** Curvas de nivel recortadas al polígono del área: cada pedazo interior es una curva abierta de la misma cota. */
export function clipIsolines(lines: Isoline[], poly: XY[]): Isoline[] {
  if (poly.length < 3) return lines
  const out: Isoline[] = []
  for (const c of lines) {
    if (c.points.length < 2) continue
    const { pieces, whole } = clip(c.points, c.closed, poly)
    if (whole) out.push(c)
    else for (const p of pieces) if (p.length > 1) out.push({ level: c.level, points: p, closed: false })
  }
  return out
}
