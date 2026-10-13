import type { XY } from '../geo/local'
import { bbox, distToSegment, outwardNormal, pointInPolygon, toCCW, area } from './polygon'

/**
 * Regla aplicada a un lado del lote.
 * - rasante: si este lado genera rasante.
 * - angleDeg: ángulo de la rasante respecto de la horizontal.
 * - startHeight: altura sobre el suelo natural (en el punto de origen) donde arranca la rasante.
 * - setback: distanciamiento mínimo a este lado (m). Dentro de esa franja no se puede edificar.
 * - originOffset: desplaza el origen de la rasante hacia AFUERA del lote (p. ej. al eje de la calle).
 */
export interface EdgeRule {
  rasante: boolean
  angleDeg: number
  startHeight: number
  setback: number
  originOffset: number
}

export interface EnvelopeInput {
  /** Polígono del lote en coordenadas locales (cualquier sentido). */
  lot: XY[]
  /** Una regla por lado; el lado k va del vértice k al k+1 (en el orden entregado). */
  rules: EdgeRule[]
  /** Altura máxima sobre suelo natural, medida en cada punto (m). Infinity = sin límite. */
  maxHeight: number
  /** Elevación del terreno natural (m) en coordenadas locales; NaN si no hay dato. */
  terrain: (x: number, y: number) => number
  /** Tamaño de celda del cálculo (m). */
  cell: number
}

/** Código de la restricción que gobierna una celda. */
export const GOV_OUTSIDE = -1
export const GOV_MAX_HEIGHT = -2
export const GOV_SETBACK = -3

export interface EnvelopeResult {
  nx: number
  ny: number
  cell: number
  /** Centro de la celda (0,0). */
  x0: number
  y0: number
  /** Elevación absoluta del techo de la envolvente (NaN fuera del área edificable). */
  top: Float32Array
  /** Elevación del suelo natural en el centro de la celda. */
  ground: Float32Array
  /** Altura edificable sobre suelo natural (≥ 0; NaN fuera). */
  rel: Float32Array
  /** Índice del lado que gobierna, o GOV_* */
  governing: Int16Array
  stats: {
    lotArea: number
    footprintArea: number
    volume: number
    /** Altura máxima alcanzable sobre el suelo, refinada bajo la celda (ver refineMax). */
    maxRel: number
    /** Dónde se alcanza. */
    maxAt: XY
  }
}

/** Paso final del refinamiento de la altura máxima (m). */
export const REFINE_MIN_STEP = 0.001

/**
 * Altura máxima alcanzable con precisión bajo la celda: la grilla solo evalúa centros de celda (en un lote 20 × 20 a
 * 70°, el más cercano al centro da 27,13 m y no 27,47). Desde la mejor celda se prueba en 8 direcciones con un paso que
 * parte en media celda; si ninguna mejora, el paso se divide por 2 hasta REFINE_MIN_STEP (1 mm).
 */
export function refineMax(ctx: EnvelopeContext, start: XY, step: number): { p: XY; rel: number } {
  const rel = (p: XY) => {
    const r = evaluateAt(ctx, p)
    return Number.isNaN(r.top) ? -Infinity : r.top - r.ground
  }
  let p = start
  let best = rel(p)
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  for (let s = step; s >= REFINE_MIN_STEP; ) {
    let moved = false
    for (const [dx, dy] of dirs) {
      const q = { x: p.x + dx * s, y: p.y + dy * s }
      const v = rel(q)
      if (v > best + 1e-12) {
        best = v
        p = q
        moved = true
      }
    }
    if (!moved) s /= 2
  }
  return { p, rel: best }
}

interface PreparedEdge {
  index: number
  a: XY
  b: XY
  rule: EdgeRule
  tan: number
  /** Puntos de origen de la rasante a lo largo del lado (desplazados si hay originOffset) y su cota natural. */
  samples: { x: number; y: number; z: number }[]
}

export interface EnvelopeContext {
  lot: XY[]
  edges: PreparedEdge[]
  maxHeight: number
  terrain: (x: number, y: number) => number
}

/**
 * Prepara los lados: orienta el polígono, calcula normales exteriores y muestrea el origen de cada rasante.
 * Mantiene el índice del lado según el orden ENTREGADO por el usuario, aunque internamente se invierta el sentido.
 */
export function prepare(input: EnvelopeInput, sampleStep?: number): EnvelopeContext {
  const n = input.lot.length
  const reversed = toCCW(input.lot) !== input.lot
  const step = sampleStep ?? Math.max(0.1, input.cell / 2)
  const edges: PreparedEdge[] = []
  for (let k = 0; k < n; k++) {
    const a = input.lot[k]
    const b = input.lot[(k + 1) % n]
    const rule = input.rules[k]
    // normal exterior: con polígono CW, la normal "derecha" apunta hacia adentro → invertir
    const nrm0 = outwardNormal(a, b)
    const nrm = reversed ? { x: -nrm0.x, y: -nrm0.y } : nrm0
    const off = rule.originOffset || 0
    const oa = { x: a.x + nrm.x * off, y: a.y + nrm.y * off }
    const ob = { x: b.x + nrm.x * off, y: b.y + nrm.y * off }
    const L = Math.hypot(ob.x - oa.x, ob.y - oa.y)
    const m = Math.max(1, Math.ceil(L / step))
    const samples: PreparedEdge['samples'] = []
    for (let s = 0; s <= m; s++) {
      const t = s / m
      const x = oa.x + (ob.x - oa.x) * t
      const y = oa.y + (ob.y - oa.y) * t
      let z = input.terrain(x, y)
      // si el origen desplazado (p. ej. eje de calle) cae fuera del DEM, usar la cota en el propio deslinde
      if (Number.isNaN(z)) z = input.terrain(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
      samples.push({ x, y, z })
    }
    edges.push({ index: k, a, b, rule, tan: Math.tan((rule.angleDeg * Math.PI) / 180), samples })
  }
  return { lot: input.lot, edges, maxHeight: input.maxHeight, terrain: input.terrain }
}

/**
 * Techo de la envolvente en un punto (cota absoluta) y qué lo gobierna.
 * Rasante de un lado = mínimo, sobre todos los puntos q del lado, de  z(q) + h0 + |p − q|·tan α
 * (es decir, se trazan rasantes desde CADA punto del deslinde, a su cota natural).
 */
export function evaluateAt(ctx: EnvelopeContext, p: XY): { top: number; ground: number; governing: number } {
  const ground = ctx.terrain(p.x, p.y)
  if (!pointInPolygon(p, ctx.lot) || Number.isNaN(ground)) return { top: NaN, ground, governing: GOV_OUTSIDE }
  for (const e of ctx.edges) {
    if (e.rule.setback > 0 && distToSegment(p, e.a, e.b) < e.rule.setback)
      return { top: NaN, ground, governing: GOV_SETBACK }
  }
  let top = Number.isFinite(ctx.maxHeight) ? ground + ctx.maxHeight : Infinity
  let governing = Number.isFinite(ctx.maxHeight) ? GOV_MAX_HEIGHT : GOV_OUTSIDE
  for (const e of ctx.edges) {
    if (!e.rule.rasante) continue
    let h = Infinity
    for (const q of e.samples) {
      if (Number.isNaN(q.z)) continue
      const v = q.z + e.rule.startHeight + Math.hypot(p.x - q.x, p.y - q.y) * e.tan
      if (v < h) h = v
    }
    if (h < top) {
      top = h
      governing = e.index
    }
  }
  if (!Number.isFinite(top)) return { top: NaN, ground, governing: GOV_OUTSIDE }
  return { top: Math.max(top, ground), ground, governing }
}

export function computeEnvelope(input: EnvelopeInput): EnvelopeResult {
  const ctx = prepare(input)
  const bb = bbox(input.lot)
  const cell = input.cell
  const nx = Math.max(1, Math.ceil((bb.maxX - bb.minX) / cell))
  const ny = Math.max(1, Math.ceil((bb.maxY - bb.minY) / cell))
  const x0 = bb.minX + cell / 2
  const y0 = bb.minY + cell / 2
  const N = nx * ny
  const top = new Float32Array(N).fill(NaN)
  const ground = new Float32Array(N).fill(NaN)
  const rel = new Float32Array(N).fill(NaN)
  const governing = new Int16Array(N).fill(GOV_OUTSIDE)
  let footprint = 0
  let volume = 0
  let maxRel = 0
  let maxAt: XY = { x: NaN, y: NaN }
  const cellArea = cell * cell
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      const r = evaluateAt(ctx, { x: x0 + i * cell, y: y0 + j * cell })
      governing[k] = r.governing
      ground[k] = r.ground
      if (Number.isNaN(r.top)) continue
      top[k] = r.top
      const h = r.top - r.ground
      rel[k] = h
      if (h > 0) {
        footprint += cellArea
        volume += h * cellArea
        if (h > maxRel) {
          maxRel = h
          maxAt = { x: x0 + i * cell, y: y0 + j * cell }
        }
      }
    }
  }
  if (maxRel > 0) ({ p: maxAt, rel: maxRel } = refineMax(ctx, maxAt, cell / 2))
  return {
    nx,
    ny,
    cell,
    x0,
    y0,
    top,
    ground,
    rel,
    governing,
    stats: { lotArea: area(input.lot), footprintArea: footprint, volume, maxRel, maxAt },
  }
}

/** Celda adaptativa: ~150 celdas en el lado mayor, nunca menor a 0,25 m. */
export function suggestedCell(lot: XY[]): number {
  const bb = bbox(lot)
  const span = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY)
  return Math.max(0.25, Math.round((span / 150) * 4) / 4)
}
