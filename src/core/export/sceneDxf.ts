import type { LocalFrame, XY, XYZ } from '../geo/local'
import { isIndexLevel, type Isoline } from '../contours/isolines'
import type { EnvelopeResult } from '../envelope/envelope'
import { rectCorners, rectSize, type Rect } from '../dem/area'
import { cotaLabel } from '../contours/escala'
import { labelHeight, labelPlacements } from '../contours/labels'
import { bbox, densificarAnillo, pointInPolygon } from '../envelope/polygon'
import { Dxf2000Writer } from './dxf2000'
import { murosEdificio, techoCaras } from './solido'
import { elementosReferencia, longitudEscala } from './referencia'
import { ATRIBUCION_OSM, esAlturaConocida, type Contexto, type Edificacion } from '../contexto/contexto'

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
  /** Origen de las coordenadas XY: 'utm' (absolutas) o 'local' (esquina SO del área en 0,0). Z siempre es la cota real. */
  origin?: 'utm' | 'local'
  /** Fuente y resolución del terreno, para el recuadro de la capa REFERENCIA (p. ej. «Terrarium · ~30 m»). */
  demInfo?: string
  /** Fecha para el recuadro de REFERENCIA (por defecto, la de hoy en es-CL). */
  fecha?: string
  /** Lado de la celda del DEM (m): paso con que se muestrea el contorno del área sobre el terreno. */
  demCell?: number
}

/** «Origen local = UTM 18S E 708617 N 5709343» para el TEXT de referencia en modo local. */
export function origenLocalTexto(frame: LocalFrame, utm: XY): string {
  return `Origen local = UTM ${frame.zone}${frame.south ? 'S' : 'N'} E ${Math.round(utm.x)} N ${Math.round(utm.y)}`
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
  // origen local: la esquina SO del área (o el sitio, si no hay área) pasa a (0,0). Z queda en cota real.
  const local = s.origin === 'local'
  const shift: XY = local ? (s.area ? { x: s.area.minX, y: s.area.minY } : { x: 0, y: 0 }) : { x: 0, y: 0 }
  const U = (p: XY): XY => (local ? { x: p.x - shift.x, y: p.y - shift.y } : s.frame.toUTM(p))
  // cota real del terreno en coordenadas locales (0 si no hay terreno); la Z nunca se desplaza
  const base = (p: XY): number => {
    const z = s.cotaBase ? s.cotaBase(p) : 0
    return Number.isFinite(z) ? z : 0
  }

  const span = s.area
    ? Math.max(rectSize(s.area).w, rectSize(s.area).h)
    : (() => {
        const pts = s.contours.flatMap((c) => c.points)
        if (!pts.length) return 0
        const b = bbox(pts)
        return Math.max(b.maxX - b.minX, b.maxY - b.minY)
      })()
  const th = span > 0 ? labelHeight(span) : 1
  // paso para muestrear el contorno del área sobre el terreno: la celda del DEM, o ~span/200 si no se conoce
  const paso = s.demCell && s.demCell > 0 ? s.demCell : Math.max(1, span / 200)
  // cota a la que se apoyan las anotaciones de plano (REFERENCIA y ATRIBUCION): la mínima del terreno en el área,
  // redondeada hacia abajo (no z=0, que quedaría decenas de metros bajo el terreno). Sin terreno, z = 0.
  const zRef = s.cotaBase && s.area ? Math.floor(minBaseArea(s.area, s.areaPolygon ?? null, base, paso)) : 0

  for (const c of s.contours) {
    const isIndex = isIndexLevel(c.level, s.indexInterval)
    w.lwpolyline(isIndex ? 'CURVAS_MAESTRAS' : 'CURVAS', c.points.map(U), c.closed, c.level)
    if (isIndex) for (const l of labelPlacements(c, th)) w.text('ETIQUETAS', { ...U(l), z: c.level }, th, cotaLabel(c.level), l.angleDeg)
  }

  // AREA como POLILÍNEA 3D apoyada sobre el terreno (una cota por vértice, muestreada cada celda); plana (z=0) sin terreno
  if (s.area) {
    const ring = s.areaPolygon ?? rectCorners(s.area)
    const denso = s.cotaBase ? densificarAnillo(ring, true, paso) : ring
    w.polyline3d('AREA', denso.map((q): XYZ => ({ ...U(q), z: base(q) })), true)
  }

  const ctx = s.contexto
  if (ctx && (ctx.edificaciones.length || ctx.vias.length)) {
    const conocidas = ctx.edificaciones.filter((e) => esAlturaConocida(e.alturaFuente))
    const supuestas = ctx.edificaciones.filter((e) => !esAlturaConocida(e.alturaFuente))
    if (conocidas.length) w.addLayer('EDIFICACIONES', 9)
    if (supuestas.length) w.addLayer('EDIFICACIONES_SUPUESTAS', 8) // altura supuesta (3 m por defecto o tesela)
    w.addLayer('VIALIDAD', 6).addLayer('ATRIBUCION', 7)
    for (const e of conocidas) edificacionDxf(w, 'EDIFICACIONES', e, base, U)
    for (const e of supuestas) edificacionDxf(w, 'EDIFICACIONES_SUPUESTAS', e, base, U)
    for (const v of ctx.vias) w.polyline3d('VIALIDAD', v.linea.map((p): XYZ => ({ ...U(p), z: base(p) })), false)
    const b = s.area ?? bbox([...ctx.edificaciones.flatMap((e) => e.anillo), ...ctx.vias.flatMap((v) => v.linea)])
    w.text('ATRIBUCION', { ...U({ x: (b.minX + b.maxX) / 2, y: b.minY - 2 * th }), z: zRef }, th, ATRIBUCION_OSM)
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

  // capa REFERENCIA: barra de escala, flecha de norte de cuadrícula y recuadro con los metadatos
  w.addLayer('REFERENCIA', 7)
  const refPts: XY[] = [
    ...s.contours.flatMap((c) => c.points),
    ...(s.lot ?? []),
    ...(s.contexto?.edificaciones.flatMap((e) => e.anillo) ?? []),
    ...(s.contexto?.vias.flatMap((v) => v.linea) ?? []),
  ]
  const bb = s.area ?? (refPts.length ? bbox(refPts) : { minX: 0, minY: 0, maxX: 0, maxY: 0 })
  const refSpan = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) || 100
  const refTh = th > 0 ? th : 1
  const lineas = [
    'GEO·ARC · unidades: metros',
    local ? origenLocalTexto(s.frame, s.frame.toUTM({ x: shift.x, y: shift.y })) : `Origen: UTM ${s.frame.zone}${s.frame.south ? 'S' : 'N'} absolutas`,
    ...(s.demInfo ? [`Elevación: ${s.demInfo}`] : []),
    `Fecha: ${s.fecha ?? new Date().toLocaleDateString('es-CL')}`,
  ]
  const ref = elementosReferencia(bb.minX, bb.minY - 6 * refTh, refTh, longitudEscala(refSpan), lineas)
  for (const seg of ref.segmentos) w.lwpolyline('REFERENCIA', seg.map(U), false, zRef)
  for (const t of ref.textos) w.text('REFERENCIA', { ...U(t.p), z: zRef }, t.altura, t.texto)

  return w.toString()
}

/** Cota mínima del terreno dentro del área (muestreada en una grilla acotada), para apoyar la REFERENCIA. */
function minBaseArea(area: Rect, poly: XY[] | null, base: (p: XY) => number, paso: number): number {
  const step = Math.max(paso, Math.max(area.maxX - area.minX, area.maxY - area.minY) / 100)
  let m = Infinity
  for (let y = area.minY; y <= area.maxY + 1e-9; y += step)
    for (let x = area.minX; x <= area.maxX + 1e-9; x += step) {
      const p = { x, y }
      if (!poly || pointInPolygon(p, poly)) {
        const z = base(p)
        if (z < m) m = z
      }
    }
  return Number.isFinite(m) ? m : 0
}

/** Edificio en el DXF: huella (y patios) a su cota base como LWPOLYLINE, muros y techo como 3DFACE (sólido). */
export function edificacionDxf(w: Dxf2000Writer, layer: string, e: Edificacion, base: (p: XY) => number, U: (p: XY) => XY): void {
  const z0 = Math.min(...e.anillo.map(base))
  const anilloU = e.anillo.map(U)
  const huecosU = e.huecos.map((h) => h.map(U))
  for (const r of [anilloU, ...huecosU]) w.lwpolyline(layer, r, true, z0)
  for (const q of murosEdificio(anilloU, huecosU, z0, e.altura)) w.face3d(layer, q[0], q[1], q[2], q[3])
  // techo: 3DFACE con las aristas interiores invisibles (en planta se ve solo el contorno, no la triangulación)
  for (const { tri, ocultas } of techoCaras(anilloU, huecosU, z0, e.altura)) w.face3d(layer, tri[0], tri[1], tri[2], undefined, ocultas)
}
