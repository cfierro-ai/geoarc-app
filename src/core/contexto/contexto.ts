import type { LocalFrame, XY } from '../geo/local'
import type { Rect } from '../dem/area'
import { pointInPolygon } from '../envelope/polygon'
import { clipPolyline } from '../contours/clip'

/**
 * Contexto del área para la descarga: edificaciones y vías de OpenStreetMap (© OpenStreetMap contributors, ODbL).
 * Fuente principal: Overpass API, que entrega cada edificio con su id y sus etiquetas (height, building:levels).
 * Respaldo: teselas vectoriales de OpenFreeMap (ver teselas.ts). Todo en el marco local del sitio.
 */

/** Margen alrededor del área (m): trae completos los edificios y calles que cruzan su borde. */
export const MARGEN_CONTEXTO = 50
/** Altura por piso (m) cuando OSM solo indica building:levels, y altura de un edificio sin dato (un piso). */
export const ALTURA_PISO = 3
/** Sobre este lado (m) no se descarga contexto: Overpass respondería miles de entidades. */
export const MAX_LADO_CONTEXTO = 3000
export const ATRIBUCION_OSM = '© OpenStreetMap contributors (ODbL)'

export type AlturaFuente = 'height' | 'pisos' | 'defecto' | 'tesela'

export interface Edificacion {
  id: string
  /** Anillo exterior (sin repetir el primer vértice). */
  anillo: XY[]
  /** Patios interiores. */
  huecos: XY[][]
  /** Altura sobre el suelo (m). */
  altura: number
  alturaFuente: AlturaFuente
}

export interface Via {
  id: string
  linea: XY[]
  /** Clase OSM (highway=…) o de OpenMapTiles en el respaldo. */
  clase: string
}

export interface Contexto {
  fuente: 'overpass' | 'teselas'
  /** Fecha del dato (Overpass: timestamp_osm_base) o de la descarga. */
  fecha: string
  edificaciones: Edificacion[]
  vias: Via[]
}

/** ¿La altura viene de un dato de OSM (height o building:levels)? Si no, es supuesta (3 m por defecto, o tesela). */
export const esAlturaConocida = (f: AlturaFuente) => f === 'height' || f === 'pisos'

/** Conteo de alturas para el panel: total, con altura conocida y supuestas (y si todas las supuestas son el 3 m por defecto). */
export function conteoAlturas(edificaciones: Edificacion[]): { total: number; conocida: number; supuesta: number; supuesta3m: boolean } {
  const conocida = edificaciones.filter((e) => esAlturaConocida(e.alturaFuente)).length
  const supuestas = edificaciones.filter((e) => !esAlturaConocida(e.alturaFuente))
  return { total: edificaciones.length, conocida, supuesta: supuestas.length, supuesta3m: supuestas.length > 0 && supuestas.every((e) => e.alturaFuente === 'defecto') }
}

export function rectContexto(area: Rect, margen = MARGEN_CONTEXTO): Rect {
  return { minX: area.minX - margen, minY: area.minY - margen, maxX: area.maxX + margen, maxY: area.maxY + margen }
}

/**
 * Deja el contexto dentro del recuadro (el área + 50 m): las vías se cortan en su borde (Overpass las entrega enteras y
 * una avenida puede medir kilómetros; las teselas cubren ~2 km); un edificio que toca el recuadro se conserva entero.
 */
export function recortarContexto(c: Contexto, r: Rect): Contexto {
  const borde: XY[] = [{ x: r.minX, y: r.minY }, { x: r.maxX, y: r.minY }, { x: r.maxX, y: r.maxY }, { x: r.minX, y: r.maxY }]
  // La huella toca el recuadro si recortarla a él deja algo (un vértice dentro o un lado que lo cruza) o si el
  // recuadro queda contenido en ella. El traslape de bounding boxes dejaba pasar edificios en diagonal cuya caja
  // roza una esquina sin que la huella entre.
  const toca = (pts: XY[]) => clipPolyline(pts, true, borde).length > 0 || borde.some((c) => pointInPolygon(c, pts))
  const vias: Via[] = []
  for (const v of c.vias) {
    const tramos = clipPolyline(v.linea, false, borde).filter((t) => t.length > 1)
    tramos.forEach((linea, k) => vias.push({ ...v, id: tramos.length > 1 ? `${v.id}-${k + 1}` : v.id, linea }))
  }
  return { ...c, edificaciones: c.edificaciones.filter((e) => toca(e.anillo)), vias }
}

const numero = (s: string | undefined, entero: RegExp) => {
  const m = s?.match(entero)
  return m ? parseFloat(m[1].replace(',', '.')) : NaN
}

/** Altura según OSM: `height` (m) manda; si no, `building:levels` × 3 m; sin dato, un piso. */
export function alturaEdificacion(tags: Record<string, string>): { altura: number; fuente: AlturaFuente } {
  const h = numero(tags.height, /^\s*(\d+(?:[.,]\d+)?)\s*(?:m|metros?)?\s*$/i)
  if (h > 0) return { altura: h, fuente: 'height' }
  // OSM también trae alturas en pies (p. ej. "82'" o "82 ft"); sin esto caían a building:levels o a 3 m.
  const pies = numero(tags.height, /^\s*(\d+(?:[.,]\d+)?)\s*(?:'|ft|feet|pies?)/i)
  if (pies > 0) return { altura: pies * 0.3048, fuente: 'height' }
  const n = numero(tags['building:levels'], /^\s*(\d+(?:[.,]\d+)?)/)
  if (n > 0) return { altura: n * ALTURA_PISO, fuente: 'pisos' }
  return { altura: ALTURA_PISO, fuente: 'defecto' }
}

export interface BBoxLonLat {
  south: number
  west: number
  north: number
  east: number
}

/** Consulta Overpass QL: edificios (vías y multipolígonos) y vías, con etiquetas y geometría. */
export function consultaOverpass(b: BBoxLonLat): string {
  const bb = `(${b.south},${b.west},${b.north},${b.east})`
  return [
    '[out:json][timeout:25];',
    '(',
    `  way["building"]${bb};`,
    `  relation["building"]["type"="multipolygon"]${bb};`,
    `  way["highway"]${bb};`,
    ');',
    'out tags geom;',
  ].join('\n')
}

type Geom = { lat: number; lon: number }[]
export interface OverpassRespuesta {
  osm3s?: { timestamp_osm_base?: string }
  remark?: string
  elements: {
    type: 'node' | 'way' | 'relation'
    id: number
    tags?: Record<string, string>
    geometry?: Geom
    members?: { type: string; ref: number; role: string; geometry?: Geom }[]
  }[]
}

/** Vías que no son contexto construido. */
const VIAS_EXCLUIDAS = new Set(['proposed', 'razed', 'abandoned'])

const mismo = (a: XY, b: XY, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol

/** Une polilíneas que comparten extremos (en cualquier sentido). Sirve para anillos en tramos y vías partidas. */
export function unirTramos(tramos: XY[][], tol = 0.05): XY[][] {
  const libres = tramos.filter((t) => t.length > 1).map((t) => [...t])
  const out: XY[][] = []
  while (libres.length) {
    let cad = libres.shift()!
    for (let cambio = true; cambio; ) {
      cambio = false
      for (let k = 0; k < libres.length; k++) {
        const t = libres[k]
        const ini = cad[0]
        const fin = cad[cad.length - 1]
        if (mismo(fin, t[0], tol)) cad = [...cad, ...t.slice(1)]
        else if (mismo(fin, t[t.length - 1], tol)) cad = [...cad, ...[...t].reverse().slice(1)]
        else if (mismo(ini, t[t.length - 1], tol)) cad = [...t.slice(0, -1), ...cad]
        else if (mismo(ini, t[0], tol)) cad = [...[...t].reverse().slice(0, -1), ...cad]
        else continue
        libres.splice(k, 1)
        cambio = true
        break
      }
    }
    out.push(cad)
  }
  return out
}

/** Anillo cerrado (sin repetir el primer vértice), o null si la cadena no cierra. */
function anillo(cad: XY[], tol = 0.05): XY[] | null {
  if (cad.length < 4 || !mismo(cad[0], cad[cad.length - 1], tol)) return null
  return cad.slice(0, -1)
}

export function contextoDesdeOverpass(r: OverpassRespuesta, frame: LocalFrame, fecha = r.osm3s?.timestamp_osm_base ?? new Date().toISOString()): Contexto {
  const loc = (g: Geom) => g.map((p) => frame.toLocal({ lon: p.lon, lat: p.lat }))
  const edificaciones: Edificacion[] = []
  const vias: Via[] = []
  for (const e of r.elements) {
    const tags = e.tags ?? {}
    if (tags.building && e.type === 'way' && e.geometry) {
      const a = anillo(loc(e.geometry))
      if (a) edificaciones.push({ id: `w${e.id}`, anillo: a, huecos: [], ...alturaDe(tags) })
    } else if (tags.building && e.type === 'relation' && e.members) {
      const rol = (role: string) => unirTramos(e.members!.filter((m) => m.role === role && m.geometry).map((m) => loc(m.geometry!))).map((c) => anillo(c)).filter((c): c is XY[] => !!c)
      const exteriores = rol('outer')
      const interiores = rol('inner')
      // Cada patio se asigna a UN solo exterior: el primero que contiene su centroide (no su primer vértice, que puede
      // caer sobre el borde y dar un resultado indefinido en pointInPolygon, perdiendo el patio o duplicándolo).
      const centroide = (ring: XY[]) => ring.reduce((s, q) => ({ x: s.x + q.x / ring.length, y: s.y + q.y / ring.length }), { x: 0, y: 0 })
      const huecosDe = (ext: XY[]) => interiores.filter((h) => exteriores.find((e2) => pointInPolygon(centroide(h), e2)) === ext)
      exteriores.forEach((ext, k) =>
        edificaciones.push({
          id: exteriores.length > 1 ? `r${e.id}-${k + 1}` : `r${e.id}`,
          anillo: ext,
          huecos: huecosDe(ext),
          ...alturaDe(tags),
        }),
      )
    } else if (tags.highway && e.type === 'way' && e.geometry && !VIAS_EXCLUIDAS.has(tags.highway)) {
      vias.push({ id: `w${e.id}`, linea: loc(e.geometry), clase: tags.highway })
    }
  }
  return { fuente: 'overpass', fecha, edificaciones, vias }
}

function alturaDe(tags: Record<string, string>) {
  const { altura, fuente } = alturaEdificacion(tags)
  return { altura, alturaFuente: fuente }
}
