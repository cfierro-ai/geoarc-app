import type { XY } from '../geo/local'
import type { HeightGrid } from '../dem/grid'

export interface Isoline {
  level: number
  points: XY[]
  closed: boolean
}

/** ¿La cota es de curva maestra (múltiplo de `indexInterval`)? */
export const isIndexLevel = (level: number, indexInterval: number) =>
  Math.abs(level / indexInterval - Math.round(level / indexInterval)) < 1e-6

/** Niveles múltiplos de `interval` dentro de [min, max]. */
export function contourLevels(min: number, max: number, interval: number): number[] {
  if (!(interval > 0) || !Number.isFinite(min) || !Number.isFinite(max)) return []
  const out: number[] = []
  const start = Math.ceil(min / interval) * interval
  for (let v = start; v <= max + 1e-9; v += interval) out.push(Math.round(v / interval) * interval)
  return out
}

// Bordes de la celda: 0 = sur (v0–v1), 1 = este (v1–v2), 2 = norte (v3–v2), 3 = oeste (v0–v3)
// Esquinas: v0 = SO, v1 = SE, v2 = NE, v3 = NO. Bit k encendido si v_k >= nivel.
const CASES: Record<number, [number, number][]> = {
  1: [[3, 0]],
  2: [[0, 1]],
  3: [[3, 1]],
  4: [[1, 2]],
  6: [[0, 2]],
  7: [[3, 2]],
  8: [[2, 3]],
  9: [[0, 2]],
  11: [[1, 2]],
  12: [[3, 1]],
  13: [[0, 1]],
  14: [[3, 0]],
}

/**
 * Isolíneas por marching squares con interpolación lineal y cosido de segmentos.
 * Puntos de silla resueltos con el promedio de las 4 esquinas.
 */
export function isolines(g: HeightGrid, levels: number[]): Isoline[] {
  const { nx, ny, cell, x0, y0, z } = g
  const out: Isoline[] = []

  for (const level of levels) {
    // id de borde → punto; segmentos como pares de ids
    const pts = new Map<string, XY>()
    const segs: [string, string][] = []

    const edgePoint = (id: string, ax: number, ay: number, av: number, bx: number, by: number, bv: number) => {
      if (!pts.has(id)) {
        const t = (level - av) / (bv - av)
        pts.set(id, { x: ax + (bx - ax) * t, y: ay + (by - ay) * t })
      }
      return id
    }

    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const v0 = z[j * nx + i]
        const v1 = z[j * nx + i + 1]
        const v2 = z[(j + 1) * nx + i + 1]
        const v3 = z[(j + 1) * nx + i]
        if (Number.isNaN(v0) || Number.isNaN(v1) || Number.isNaN(v2) || Number.isNaN(v3)) continue
        const idx = (v0 >= level ? 1 : 0) | (v1 >= level ? 2 : 0) | (v2 >= level ? 4 : 0) | (v3 >= level ? 8 : 0)
        if (idx === 0 || idx === 15) continue

        const xa = x0 + i * cell
        const xb = xa + cell
        const ya = y0 + j * cell
        const yb = ya + cell
        const edge = (e: number): string => {
          switch (e) {
            case 0: return edgePoint(`h${i},${j}`, xa, ya, v0, xb, ya, v1)
            case 1: return edgePoint(`v${i + 1},${j}`, xb, ya, v1, xb, yb, v2)
            case 2: return edgePoint(`h${i},${j + 1}`, xa, yb, v3, xb, yb, v2)
            default: return edgePoint(`v${i},${j}`, xa, ya, v0, xa, yb, v3)
          }
        }

        let pairs = CASES[idx]
        if (idx === 5 || idx === 10) {
          const centerAbove = (v0 + v1 + v2 + v3) / 4 >= level
          // 5: SO y NE arriba. 10: SE y NO arriba.
          const separateSE_NO: [number, number][] = [[0, 1], [2, 3]]
          const separateSO_NE: [number, number][] = [[3, 0], [1, 2]]
          if (idx === 5) pairs = centerAbove ? separateSE_NO : separateSO_NE
          else pairs = centerAbove ? separateSO_NE : separateSE_NO
        }
        for (const [a, b] of pairs) segs.push([edge(a), edge(b)])
      }
    }

    // Cosido: cada borde pertenece a lo sumo a 2 segmentos → cadenas abiertas o anillos.
    const adj = new Map<string, number[]>()
    segs.forEach(([a, b], k) => {
      ;(adj.get(a) ?? adj.set(a, []).get(a)!).push(k)
      ;(adj.get(b) ?? adj.set(b, []).get(b)!).push(k)
    })
    const used = new Uint8Array(segs.length)

    const walk = (startId: string): Isoline => {
      const ids = [startId]
      let cur = startId
      for (;;) {
        const next = (adj.get(cur) ?? []).find((k) => !used[k])
        if (next === undefined) break
        used[next] = 1
        const [a, b] = segs[next]
        cur = a === cur ? b : a
        ids.push(cur)
      }
      const closed = ids.length > 2 && ids[0] === ids[ids.length - 1]
      if (closed) ids.pop()
      return { level, points: ids.map((id) => pts.get(id)!), closed }
    }

    for (const [id, ks] of adj) if (ks.length === 1 && !used[ks[0]]) out.push(walk(id))
    for (let k = 0; k < segs.length; k++) if (!used[k]) out.push(walk(segs[k][0]))
  }
  return out
}
