import type { LocalFrame, XY } from '../geo/local'
import { isIndexLevel, type Isoline } from '../contours/isolines'
import type { EnvelopeResult } from '../envelope/envelope'
import { rectCorners, rectSize, type Rect } from '../dem/area'
import { cotaLabel } from '../contours/escala'
import { labelHeight, labelPlacements } from '../contours/labels'
import { bbox } from '../envelope/polygon'
import { DxfWriter } from './dxf'

export interface SceneForDxf {
  frame: LocalFrame
  contours: Isoline[]
  /** Curvas maestras cada este intervalo (m). */
  indexInterval: number
  /** Área de extracción del terreno. */
  area?: Rect
  lot?: XY[]
  lotZ?: (p: XY) => number
  envelope?: EnvelopeResult
}

/**
 * DXF georreferenciado en UTM (huso del sitio, WGS84), metros.
 * Capas: CURVAS, CURVAS_MAESTRAS, ETIQUETAS (TEXT con la cota sobre las maestras), AREA (rectángulo de extracción,
 * cota 0) y, si hay lote, LOTE y ENVOLVENTE (malla 3DFACE).
 */
export function sceneToDxf(s: SceneForDxf): string {
  const w = new DxfWriter().addLayer('CURVAS', 8).addLayer('CURVAS_MAESTRAS', 7).addLayer('ETIQUETAS', 7).addLayer('AREA', 3)
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

  if (s.area) w.polyline2d('AREA', rectCorners(s.area).map((p) => s.frame.toUTM(p)), true)

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
