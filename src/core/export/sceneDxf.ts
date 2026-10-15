import type { LocalFrame, XY, XYZ } from '../geo/local'
import { isIndexLevel, type Isoline } from '../contours/isolines'
import type { EnvelopeResult } from '../envelope/envelope'
import { rectCorners, rectSize, type Rect } from '../dem/area'
import { cotaLabel } from '../contours/escala'
import { labelHeight, labelPlacements } from '../contours/labels'
import { bbox } from '../envelope/polygon'
import { Dxf2000Writer } from './dxf2000'
import { murosEdificio, techoEdificio } from './solido'
import { ATRIBUCION_OSM, type Contexto, type Edificacion } from '../contexto/contexto'

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
  /** Cota del terreno para apoyar el contexto (por defecto 0), en coordenadas LOCALES. */
  cotaBase?: (p: XY) => number
}

/**
 * DXF 2000 (AC1015) georreferenciado en UTM (huso del sitio, WGS84), metros ($INSUNITS 6).
 * Capas: CURVAS, CURVAS_MAESTRAS (LWPOLYLINE a la cota), ETIQUETAS (TEXT) y AREA (LWPOLYLINE cerrada) con terreno;
 * EDIFICACIONES (muros y techo en 3DFACE, sólidos cerrados, más la huella como LWPOLYLINE a su cota base),
 * VIALIDAD (POLYLINE 3D sobre el terreno) y ATRIBUCION (© OpenStreetMap contributors, ODbL) con contexto;
 * LOTE (POLYLINE 3D) y ENVOLVENTE (3DFACE) con lote. Un estudio en plano no lleva curvas.
 */
export function sceneToDxf(s: SceneForDxf): string {
  const w = new Dxf2000Writer()
  if (s.contours.length || s.area) w.addLayer('CURVAS', 8).addLayer('CURVAS_MAESTRAS', 7).addLayer('ETIQUETAS', 7)
  if (s.area) w.addLayer('AREA', 3)
  const U = (p: XY): XY => s.frame.toUTM(p)

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
    w.lwpolyline(isIndex ? 'CURVAS_MAESTRAS' : 'CURVAS', c.points.map(U), c.closed, c.level)
    if (isIndex) for (const l of labelPlacements(c, th)) w.text('ETIQUETAS', { ...U(l), z: c.level }, th, cotaLabel(c.level), l.angleDeg)
  }

  if (s.area) w.lwpolyline('AREA', (s.areaPolygon ?? rectCorners(s.area)).map(U), true, 0)

  const ctx = s.contexto
  if (ctx && (ctx.edificaciones.length || ctx.vias.length)) {
    const base = (p: XY) => {
      const z = s.cotaBase ? s.cotaBase(p) : 0
      return Number.isFinite(z) ? z : 0
    }
    w.addLayer('EDIFICACIONES', 9).addLayer('VIALIDAD', 6).addLayer('ATRIBUCION', 7)
    for (const e of ctx.edificaciones) edificacionDxf(w, 'EDIFICACIONES', e, base, U)
    for (const v of ctx.vias) w.polyline3d('VIALIDAD', v.linea.map((p): XYZ => ({ ...U(p), z: base(p) })), false)
    const b = s.area ?? bbox([...ctx.edificaciones.flatMap((e) => e.anillo), ...ctx.vias.flatMap((v) => v.linea)])
    w.text('ATRIBUCION', { ...U({ x: (b.minX + b.maxX) / 2, y: b.minY - 2 * th }), z: 0 }, th, ATRIBUCION_OSM)
  }

  if (s.lot && s.lot.length > 2) {
    w.addLayer('LOTE', 1).polyline3d('LOTE', [...s.lot, s.lot[0]].map((p): XYZ => ({ ...U(p), z: s.lotZ ? s.lotZ(p) : 0 })), false)
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
        w.face3d('ENVOLVENTE', { ...U({ x: cx - h, y: cy - h }), z: t }, { ...U({ x: cx + h, y: cy - h }), z: t }, { ...U({ x: cx + h, y: cy + h }), z: t }, { ...U({ x: cx - h, y: cy + h }), z: t })
      }
  }
  return w.toString()
}

/** Edificio en el DXF: huella (y patios) a su cota base como LWPOLYLINE, muros y techo como 3DFACE (sólido). */
export function edificacionDxf(w: Dxf2000Writer, layer: string, e: Edificacion, base: (p: XY) => number, U: (p: XY) => XY): void {
  const z0 = Math.min(...e.anillo.map(base))
  const anilloU = e.anillo.map(U)
  const huecosU = e.huecos.map((h) => h.map(U))
  for (const r of [anilloU, ...huecosU]) w.lwpolyline(layer, r, true, z0)
  for (const q of murosEdificio(anilloU, huecosU, z0, e.altura)) w.face3d(layer, q[0], q[1], q[2], q[3])
  for (const t of techoEdificio(anilloU, huecosU, z0, e.altura)) w.face3d(layer, t[0], t[1], t[2])
}
