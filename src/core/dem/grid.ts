import { gridCells, rectCenter, type Rect } from './area'

/**
 * Grilla regular de elevaciones en el marco local (metros).
 * Celda (i, j) tiene su centro en (x0 + i·cell, y0 + j·cell). j crece hacia el norte.
 * Valores faltantes = NaN.
 */
export type DemKind = 'DSM' | 'DTM' | 'sintético' | 'levantamiento' | 'plano'

export interface DemMeta {
  /** Nombre legible de la fuente, p. ej. "Copernicus GLO-30". */
  source: string
  /** DSM = superficie (incluye dosel y edificios). DTM = terreno desnudo. */
  kind: DemKind
  /** Resolución real del dato de origen, no la de la grilla remuestreada. */
  nominalResolutionM: number
  notes?: string
}

export interface HeightGrid {
  nx: number
  ny: number
  cell: number
  x0: number
  y0: number
  z: Float32Array
  meta: DemMeta
}

export function createGrid(
  nx: number,
  ny: number,
  cell: number,
  x0: number,
  y0: number,
  meta: DemMeta,
  fn: (x: number, y: number) => number,
): HeightGrid {
  const z = new Float32Array(nx * ny)
  for (let j = 0; j < ny; j++) {
    const y = y0 + j * cell
    for (let i = 0; i < nx; i++) z[j * nx + i] = fn(x0 + i * cell, y)
  }
  return { nx, ny, cell, x0, y0, z, meta }
}

/** Grilla que cubre el rectángulo local `r`, centrada en él (puede excederlo en menos de media celda por borde). */
export function rectGrid(
  r: Rect,
  cell: number,
  meta: DemMeta,
  fn: (x: number, y: number) => number,
): HeightGrid {
  const { nx, ny } = gridCells(r, cell)
  const c = rectCenter(r)
  return createGrid(nx + 1, ny + 1, cell, c.x - (nx * cell) / 2, c.y - (ny * cell) / 2, meta, fn)
}

export function valueAt(g: HeightGrid, i: number, j: number): number {
  if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return NaN
  return g.z[j * g.nx + i]
}

/** Interpolación bilineal en coordenadas locales. NaN fuera de la grilla. */
export function sampleBilinear(g: HeightGrid, x: number, y: number): number {
  const fx = (x - g.x0) / g.cell
  const fy = (y - g.y0) / g.cell
  if (fx < 0 || fy < 0 || fx > g.nx - 1 || fy > g.ny - 1) return NaN
  const i = Math.min(Math.floor(fx), g.nx - 2)
  const j = Math.min(Math.floor(fy), g.ny - 2)
  const tx = fx - i
  const ty = fy - j
  const z00 = g.z[j * g.nx + i]
  const z10 = g.z[j * g.nx + i + 1]
  const z01 = g.z[(j + 1) * g.nx + i]
  const z11 = g.z[(j + 1) * g.nx + i + 1]
  return (z00 * (1 - tx) + z10 * tx) * (1 - ty) + (z01 * (1 - tx) + z11 * tx) * ty
}

export function gridStats(g: HeightGrid): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (const v of g.z) {
    if (Number.isNaN(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  return { min, max }
}
