import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import type { LocalFrame, LonLat, XY } from '../geo/local'
import { lonLatToTile } from '../dem/terrarium'
import { clipPolyline } from '../contours/clip'
import { agruparAnillos, area } from '../envelope/polygon'
import { unirTramos, type BBoxLonLat, type Contexto, type Edificacion, type Via } from './contexto'

/**
 * Respaldo del contexto: teselas vectoriales de OpenFreeMap (esquema OpenMapTiles, z14).
 * Lo medido en el spike (2026-10-13, Temuco): las vías traen el id OSM y una vía partida entre teselas conserva su id,
 * así que se une por id. Los edificios, en cambio, vienen FUSIONADOS por altura (`render_height`): una entidad reúne
 * cientos de edificios y su id no identifica a ninguno. Ese multipolígono se separa en edificios individuales por
 * contención (`agruparAnillos`) antes de triangular — nunca se trata un conjunto de anillos disjuntos como un solo
 * polígono —, recortado al borde de su tesela: un edificio que cruza el borde queda en dos piezas.
 */
export const ZOOM_TESELAS = 14

export interface TeselaMvt {
  z: number
  x: number
  y: number
  data: Uint8Array
}

/** lon/lat de un punto dentro de la tesela (fx, fy ∈ [0, 1], y hacia el sur). */
export function teselaALonLat(z: number, x: number, y: number, fx: number, fy: number): LonLat {
  const n = 2 ** z
  const lon = ((x + fx) / n) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + fy)) / n))) * 180) / Math.PI
  return { lon, lat }
}

/** Teselas (x, y) del zoom `z` que cubren el bbox. */
export function teselasDeBBox(b: BBoxLonLat, z = ZOOM_TESELAS): { z: number; x: number; y: number }[] {
  const nw = lonLatToTile({ lon: b.west, lat: b.north }, z)
  const se = lonLatToTile({ lon: b.east, lat: b.south }, z)
  const out: { z: number; x: number; y: number }[] = []
  for (let x = Math.floor(nw.x); x <= Math.floor(se.x); x++) for (let y = Math.floor(nw.y); y <= Math.floor(se.y); y++) out.push({ z, x, y })
  return out
}

/** Sutherland–Hodgman contra el cuadrado [0, E]²: recorta el búfer que comparten las teselas vecinas. */
function recortarAnillo(r: XY[], E: number): XY[] {
  const lados: [(p: XY) => boolean, (a: XY, b: XY) => XY][] = [
    [(p) => p.x >= 0, (a, b) => ({ x: 0, y: a.y + ((b.y - a.y) * (0 - a.x)) / (b.x - a.x) })],
    [(p) => p.x <= E, (a, b) => ({ x: E, y: a.y + ((b.y - a.y) * (E - a.x)) / (b.x - a.x) })],
    [(p) => p.y >= 0, (a, b) => ({ x: a.x + ((b.x - a.x) * (0 - a.y)) / (b.y - a.y), y: 0 })],
    [(p) => p.y <= E, (a, b) => ({ x: a.x + ((b.x - a.x) * (E - a.y)) / (b.y - a.y), y: E })],
  ]
  let pts = r
  for (const [dentro, corte] of lados) {
    const out: XY[] = []
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k]
      const b = pts[(k + 1) % pts.length]
      if (dentro(a)) out.push(a)
      if (dentro(a) !== dentro(b)) out.push(corte(a, b))
    }
    pts = out
    if (!pts.length) break
  }
  // sin vértices repetidos, tampoco el de cierre (MVT entrega el anillo cerrado)
  const out = pts.filter((p, k) => k === 0 || p.x !== pts[k - 1].x || p.y !== pts[k - 1].y)
  while (out.length > 1 && out[0].x === out[out.length - 1].x && out[0].y === out[out.length - 1].y) out.pop()
  return out
}

export function contextoDesdeTeselas(teselas: TeselaMvt[], frame: LocalFrame, fecha = new Date().toISOString()): Contexto {
  const edificaciones: Edificacion[] = []
  const tramos = new Map<string, { clase: string; partes: XY[][] }>()
  for (const t of teselas) {
    const vt = new VectorTile(new PbfReader(t.data))
    const aLocal = (E: number) => (p: XY) => frame.toLocal(teselaALonLat(t.z, t.x, t.y, p.x / E, p.y / E))

    const b = vt.layers.building
    if (b) {
      const toL = aLocal(b.extent)
      for (let i = 0; i < b.length; i++) {
        const f = b.feature(i)
        if (f.type !== 3) continue
        const altura = Number(f.properties.render_height) || 0
        // el multipolígono (edificios fusionados por altura) se recorta al borde de la tesela, se lleva al marco local y
        // se separa en edificios individuales por contención ANTES de triangular (nunca anillos disjuntos como uno solo)
        const anillos = f
          .loadGeometry()
          .map((r) => recortarAnillo(r.map((p) => ({ x: p.x, y: p.y })), b.extent))
          .filter((r) => r.length >= 3)
          .map((r) => r.map(toL))
        agruparAnillos(anillos).forEach((ed, k) => {
          if (area(ed.anillo) < 1) return
          edificaciones.push({
            id: `t${t.z}/${t.x}/${t.y}-${f.id ?? i}-${k + 1}`,
            anillo: ed.anillo,
            huecos: ed.huecos.filter((h) => area(h) >= 1),
            altura: altura > 0 ? altura : 3,
            alturaFuente: 'tesela',
          })
        })
      }
    }

    const tr = vt.layers.transportation
    if (tr) {
      const E = tr.extent
      const borde: XY[] = [{ x: 0, y: 0 }, { x: E, y: 0 }, { x: E, y: E }, { x: 0, y: E }]
      const toL = aLocal(E)
      for (let i = 0; i < tr.length; i++) {
        const f = tr.feature(i)
        if (f.type !== 2) continue // las áreas peatonales (polígonos) no son ejes de vía
        const id = String(f.id ?? `${t.x}/${t.y}-${i}`)
        const reg = tramos.get(id) ?? { clase: String(f.properties.class ?? ''), partes: [] }
        for (const linea of f.loadGeometry())
          for (const pedazo of clipPolyline(linea.map((p) => ({ x: p.x, y: p.y })), false, borde)) reg.partes.push(pedazo.map(toL))
        tramos.set(id, reg)
      }
    }
  }
  const vias: Via[] = []
  for (const [id, { clase, partes }] of tramos) {
    const unidas = unirTramos(partes)
    unidas.forEach((linea, k) => vias.push({ id: unidas.length > 1 ? `t${id}-${k + 1}` : `t${id}`, linea, clase }))
  }
  return { fuente: 'teselas', fecha, edificaciones, vias }
}
