import Delaunator from 'delaunator'
import type { XYZ } from '../geo/local'
import { createGrid, type DemMeta, type HeightGrid } from '../dem/grid'
import { gridCells, rectCenter, type Rect } from '../dem/area'

/**
 * Terreno a partir de un levantamiento: TIN (triangulación de Delaunay de los puntos con cota) y muestreo por triángulo
 * hacia una grilla regular.
 */

/** Agrega puntos intermedios a una polilínea para que ningún tramo supere `step` (m). */
export function densify(points: XYZ[], closed: boolean, step: number): XYZ[] {
  if (points.length < 2) return points
  const out: XYZ[] = []
  const n = closed ? points.length : points.length - 1
  for (let k = 0; k < n; k++) {
    const a = points[k]
    const b = points[(k + 1) % points.length]
    const m = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
    for (let s = 0; s < m; s++) out.push({ x: a.x + ((b.x - a.x) * s) / m, y: a.y + ((b.y - a.y) * s) / m, z: a.z + ((b.z - a.z) * s) / m })
  }
  if (!closed) out.push(points[points.length - 1])
  return out
}

export interface Tin {
  pts: XYZ[]
  /** Índices de vértices, de a tres, de los triángulos que se conservan. */
  triangles: Uint32Array
  /**
   * Separación típica entre datos: mediana de la arista MAYOR de cada triángulo. En un TIN de curvas es la distancia
   * entre curvas vecinas; la mediana de todas las aristas no sirve, porque la densificación la llena de tramos cortos
   * a lo largo de cada curva.
   */
  spacing: number
}

/**
 * Triangula los puntos (los repetidos en planta se descartan: queda el primero) y pela el borde: quita, desde el
 * contorno convexo hacia adentro, los triángulos cuya arista mayor supera `peelFactor` × la separación típica. Así un
 * levantamiento cóncavo (en L, con entrantes) no se rellena con triángulos largos que inventan terreno.
 */
export function buildTin(input: XYZ[], peelFactor = 5): Tin {
  const seen = new Set<string>()
  const pts: XYZ[] = []
  for (const p of input) {
    const key = `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`
    if (!seen.has(key)) {
      seen.add(key)
      pts.push(p)
    }
  }
  if (pts.length < 3) throw new Error('El levantamiento tiene menos de 3 puntos con cota distintos.')
  const coords = new Float64Array(pts.length * 2)
  pts.forEach((p, i) => coords.set([p.x, p.y], 2 * i))
  const d = new Delaunator(coords)
  const tri = d.triangles
  const T = tri.length / 3
  if (T === 0) throw new Error('Los puntos del levantamiento están alineados: no forman superficie.')

  const len = (e: number) => {
    const a = pts[tri[e]]
    const b = pts[tri[e % 3 === 2 ? e - 2 : e + 1]]
    return Math.hypot(b.x - a.x, b.y - a.y)
  }
  const longestEdge = new Float64Array(T)
  for (let t = 0; t < T; t++) longestEdge[t] = Math.max(len(3 * t), len(3 * t + 1), len(3 * t + 2))
  const spacing = Float64Array.from(longestEdge).sort()[Math.floor(T / 2)]
  const maxEdge = peelFactor * spacing
  const longest = (t: number) => longestEdge[t]

  const removed = new Uint8Array(T)
  const queue: number[] = []
  for (let e = 0; e < tri.length; e++) if (d.halfedges[e] === -1) queue.push(Math.floor(e / 3))
  while (queue.length) {
    const t = queue.pop()!
    if (removed[t] || longest(t) <= maxEdge) continue
    removed[t] = 1
    for (let j = 0; j < 3; j++) {
      const opp = d.halfedges[3 * t + j]
      if (opp >= 0 && !removed[Math.floor(opp / 3)]) queue.push(Math.floor(opp / 3))
    }
  }
  const kept: number[] = []
  for (let t = 0; t < T; t++) if (!removed[t]) kept.push(tri[3 * t], tri[3 * t + 1], tri[3 * t + 2])
  return { pts, triangles: Uint32Array.from(kept), spacing }
}

/**
 * Muestrea el TIN en una grilla sobre `area`: cada triángulo asigna la cota (interpolación lineal) a los nodos que
 * contiene. Los nodos a menos de 1,5 celdas por fuera del TIN se extrapolan con el triángulo vecino, acotados a sus
 * cotas, para que el borde del levantamiento quede utilizable (la interpolación bilineal en un punto del borde usa nodos
 * hasta √2 celdas afuera); más lejos quedan sin dato (NaN).
 */
export function tinToGrid(tin: Tin, area: Rect, cell: number, meta: DemMeta): HeightGrid {
  const tol = 1.5 * cell
  const { nx, ny } = gridCells(area, cell)
  const c = rectCenter(area)
  const g = createGrid(nx + 1, ny + 1, cell, c.x - (nx * cell) / 2, c.y - (ny * cell) / 2, meta, () => NaN)
  const inside = new Float32Array(g.z.length).fill(NaN)
  const margin = new Float32Array(g.z.length).fill(NaN)
  const { pts, triangles } = tin
  for (let t = 0; t < triangles.length; t += 3) {
    const a = pts[triangles[t]]
    const b = pts[triangles[t + 1]]
    const p = pts[triangles[t + 2]]
    const det = (b.y - p.y) * (a.x - p.x) + (p.x - b.x) * (a.y - p.y)
    if (Math.abs(det) < 1e-12) continue // triángulo degenerado
    // altura de cada vértice sobre el lado opuesto: convierte la tolerancia (m) en coordenadas baricéntricas
    const h = [Math.abs(det) / Math.hypot(b.x - p.x, b.y - p.y), Math.abs(det) / Math.hypot(p.x - a.x, p.y - a.y), Math.abs(det) / Math.hypot(a.x - b.x, a.y - b.y)]
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x, p.x) - g.x0) / cell) - 2)
    const i1 = Math.min(g.nx - 1, Math.ceil((Math.max(a.x, b.x, p.x) - g.x0) / cell) + 2)
    const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y, p.y) - g.y0) / cell) - 2)
    const j1 = Math.min(g.ny - 1, Math.ceil((Math.max(a.y, b.y, p.y) - g.y0) / cell) + 2)
    for (let j = j0; j <= j1; j++) {
      const y = g.y0 + j * cell
      for (let i = i0; i <= i1; i++) {
        const x = g.x0 + i * cell
        const l1 = ((b.y - p.y) * (x - p.x) + (p.x - b.x) * (y - p.y)) / det
        const l2 = ((p.y - a.y) * (x - p.x) + (a.x - p.x) * (y - p.y)) / det
        const l3 = 1 - l1 - l2
        const z = l1 * a.z + l2 * b.z + l3 * p.z
        const k = j * g.nx + i
        if (l1 >= -1e-9 && l2 >= -1e-9 && l3 >= -1e-9) inside[k] = z
        // fuera del TIN: extrapolación acotada a las cotas del triángulo (no se inventan cotas fuera de los datos)
        else if (Number.isNaN(margin[k]) && l1 >= -tol / h[0] && l2 >= -tol / h[1] && l3 >= -tol / h[2])
          margin[k] = Math.min(Math.max(a.z, b.z, p.z), Math.max(Math.min(a.z, b.z, p.z), z))
      }
    }
  }
  for (let k = 0; k < g.z.length; k++) g.z[k] = Number.isNaN(inside[k]) ? margin[k] : inside[k]
  return g
}
