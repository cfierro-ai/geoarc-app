import type { LocalFrame, XY } from '../geo/local'
import { isIndexLevel, type Isoline } from '../contours/isolines'
import type { EnvelopeResult } from '../envelope/envelope'
import { rectCorners, rectSize, type Rect } from '../dem/area'
import { cotaLabel } from '../contours/escala'
import { labelHeight, labelPlacements } from '../contours/labels'
import { bbox } from '../envelope/polygon'
import { DxfWriter } from './dxf'
import { ATRIBUCION_OSM, type Contexto } from '../contexto/contexto'

export interface SceneForDxf {
  frame: LocalFrame
  contours: Isoline[]
  /** Curvas maestras cada este intervalo (m). */
  indexInterval: number
  /** Área de extracción del terreno (rectángulo de cálculo). */
  area?: Rect
  /** Polígono del área, si se dibujó así: AREA lleva sus vértices en vez del rectángulo. */
  areaPolygon?: XY[] | null
  lot?: XY[]
  lotZ?: (p: XY) => number
  envelope?: EnvelopeResult
  /** Edificaciones y vías de OpenStreetMap. */
  contexto?: Contexto | null
  /** Cota del terreno para apoyar el contexto (por defecto 0). */
  cotaBase?: (p: XY) => number
}

/**
 * DXF georreferenciado en UTM (huso del sitio, WGS84), metros.
 * Capas: CURVAS, CURVAS_MAESTRAS, ETIQUETAS (TEXT con la cota sobre las maestras) y AREA (rectángulo o polígono del
 * área, cota 0) cuando hay terreno; EDIFICACIONES (huella a la cota más baja del terreno bajo ella, con la altura como
 * espesor), VIALIDAD (ejes 3D sobre el terreno) y ATRIBUCION (© OpenStreetMap contributors, ODbL) cuando hay contexto;
 * LOTE y ENVOLVENTE (malla 3DFACE) cuando hay lote. Un estudio en plano no lleva curvas.
 */
export function sceneToDxf(s: SceneForDxf): string {
  const w = new DxfWriter()
  if (s.contours.length || s.area) w.addLayer('CURVAS', 8).addLayer('CURVAS_MAESTRAS', 7).addLayer('ETIQUETAS', 7)
  if (s.area) w.addLayer('AREA', 3)
  const U = (p: XY, z: number) => ({ ...s.frame.toUTM(p), z })

  // altura de texto según el tamaño del área (o de las curvas si no hay área)
  const span = s.area
    ? Math.max(rectSize(s.area).w, rectSize(s.area).h)
    : (() => {
        const pts = s.contours.flatMap((c) => c.points)
        if (!pts.length) return 0
        const b = bbox(pts)
        return Math.max(b.maxX - b.minX, b.maxY - b.minY)
      })()
  const th = span > 0 ? labelHeight(span) : 1

  for (const c of s.contours) {
    const isIndex = isIndexLevel(c.level, s.indexInterval)
    w.polyline3d(isIndex ? 'CURVAS_MAESTRAS' : 'CURVAS', c.points.map((p) => U(p, c.level)), c.closed)
    if (isIndex) for (const l of labelPlacements(c, th)) w.text('ETIQUETAS', U(l, c.level), th, cotaLabel(c.level), l.angleDeg)
  }

  if (s.area) w.polyline2d('AREA', (s.areaPolygon ?? rectCorners(s.area)).map((p) => s.frame.toUTM(p)), true)

  const ctx = s.contexto
  if (ctx && (ctx.edificaciones.length || ctx.vias.length)) {
    const base = (p: XY) => {
      const z = s.cotaBase ? s.cotaBase(p) : 0
      return Number.isFinite(z) ? z : 0
    }
    w.addLayer('EDIFICACIONES', 9).addLayer('VIALIDAD', 6).addLayer('ATRIBUCION', 7)
    for (const e of ctx.edificaciones) {
      const z0 = Math.min(...e.anillo.map(base))
      for (const r of [e.anillo, ...e.huecos]) w.polyline2d('EDIFICACIONES', r.map((p) => s.frame.toUTM(p)), true, z0, e.altura)
    }
    for (const v of ctx.vias) w.polyline3d('VIALIDAD', v.linea.map((p) => U(p, base(p))), false)
    // atribución bajo el área (ODbL): «© OpenStreetMap contributors (ODbL)»
    const b = s.area ?? bbox([...ctx.edificaciones.flatMap((e) => e.anillo), ...ctx.vias.flatMap((v) => v.linea)])
    w.text('ATRIBUCION', U({ x: (b.minX + b.maxX) / 2, y: b.minY - 2 * th }, 0), th, ATRIBUCION_OSM)
  }

  if (s.lot && s.lot.length > 2) {
    w.addLayer('LOTE', 1).polyline3d('LOTE', s.lot.map((p) => U(p, s.lotZ ? s.lotZ(p) : 0)), true)
  }

  const e = s.envelope
  if (e) {
    w.addLayer('ENVOLVENTE', 5)
    const h = e.cell / 2
    for (let j = 0; j < e.ny; j++)
      for (let i = 0; i < e.nx; i++) {
        const k = j * e.nx + i
        const t = e.top[k]
        if (Number.isNaN(t) || !(e.rel[k] > 0)) continue
        const cx = e.x0 + i * e.cell
        const cy = e.y0 + j * e.cell
        w.face3d(
          'ENVOLVENTE',
          U({ x: cx - h, y: cy - h }, t),
          U({ x: cx + h, y: cy - h }, t),
          U({ x: cx + h, y: cy + h }, t),
          U({ x: cx - h, y: cy + h }, t),
        )
      }
  }
  return w.toString()
}
