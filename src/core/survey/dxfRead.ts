import type { XYZ } from '../geo/local'

/**
 * Lector mínimo de DXF de levantamiento (texto ASCII, cualquier versión): toma de la sección ENTITIES, en espacio
 * modelo, las entidades con cota:
 * - LWPOLYLINE: vértices 10/20, cota en el código 38 (elevación), 70 bit 1 = cerrada.
 * - POLYLINE + VERTEX + SEQEND: 3D (70 bit 8: la cota es el 30 de cada vértice) o 2D (cota = 30 del encabezado).
 *   Las mallas (70 bits 16/64) se ignoran.
 * - LINE (10/20/30 → 11/21/31) y POINT (10/20/30).
 * Los arcos de polilínea (bulge, 42) se toman como tramos rectos. Unidades: metros.
 */
export type SurveyEntityKind = 'LWPOLYLINE' | 'POLYLINE' | 'LINE' | 'POINT'

export interface SurveyFeature {
  layer: string
  kind: SurveyEntityKind
  points: XYZ[]
  closed: boolean
}

export interface LayerSummary {
  name: string
  entities: number
  vertices: number
  zMin: number
  zMax: number
}

export interface SurveyDrawing {
  features: SurveyFeature[]
  layers: LayerSummary[]
  /** Entidades no usadas, por tipo (TEXT, INSERT, mallas…). */
  ignored: Record<string, number>
  bbox: { minX: number; minY: number; maxX: number; maxY: number } | null
  zMin: number
  zMax: number
}

type Pair = [number, string]

function toPairs(text: string): Pair[] {
  const lines = text.split(/\r?\n/)
  const out: Pair[] = []
  for (let k = 0; k + 1 < lines.length; k += 2) {
    const code = Number.parseInt(lines[k].trim(), 10)
    if (Number.isNaN(code)) throw new Error(`DXF no válido: se esperaba un código de grupo en la línea ${k + 1}.`)
    out.push([code, lines[k + 1].trim()])
  }
  return out
}

/** Entidades de la sección ENTITIES como listas de pares, cada una desde su código 0. */
function entityRecords(pairs: Pair[]): Pair[][] {
  const recs: Pair[][] = []
  let inEntities = false
  for (let k = 0; k < pairs.length; k++) {
    const [c, v] = pairs[k]
    if (c === 0 && v === 'SECTION' && pairs[k + 1]?.[0] === 2) {
      inEntities = pairs[k + 1][1] === 'ENTITIES'
      k++
      continue
    }
    if (!inEntities) continue
    if (c === 0) {
      if (v === 'ENDSEC') {
        inEntities = false
        continue
      }
      recs.push([[c, v]])
    } else recs[recs.length - 1]?.push([c, v])
  }
  return recs
}

const num = (rec: Pair[], code: number, dflt = 0) => {
  const p = rec.find(([c]) => c === code)
  return p ? Number.parseFloat(p[1]) : dflt
}
const str = (rec: Pair[], code: number, dflt = '0') => rec.find(([c]) => c === code)?.[1] ?? dflt

/**
 * Sistema de coordenadas de la entidad (OCS): con extrusión (0, 0, −1), habitual en dibujos espejados, el algoritmo de
 * eje arbitrario da WCS = (−x, y, −z). Otras extrusiones no se esperan en planos de levantamiento.
 */
const ocs = (rec: Pair[]) => (num(rec, 230, 1) < 0 ? (p: XYZ): XYZ => ({ x: -p.x, y: p.y, z: -p.z }) : (p: XYZ) => p)

export function readSurveyDxf(text: string): SurveyDrawing {
  const recs = entityRecords(toPairs(text))
  const features: SurveyFeature[] = []
  const ignored: Record<string, number> = {}
  const skip = (type: string) => (ignored[type] = (ignored[type] ?? 0) + 1)

  for (let k = 0; k < recs.length; k++) {
    const rec = recs[k]
    const type = rec[0][1]
    if (str(rec, 67, '0') === '1') {
      skip(`${type} (espacio papel)`)
      continue
    }
    const layer = str(rec, 8)
    if (type === 'LWPOLYLINE') {
      const z = num(rec, 38)
      const tf = ocs(rec)
      const pts: XYZ[] = []
      for (const [c, v] of rec) {
        if (c === 10) pts.push({ x: Number.parseFloat(v), y: NaN, z })
        else if (c === 20 && pts.length) pts[pts.length - 1].y = Number.parseFloat(v)
      }
      features.push({ layer, kind: 'LWPOLYLINE', points: pts.map(tf), closed: (num(rec, 70) & 1) === 1 })
    } else if (type === 'POLYLINE') {
      const flags = num(rec, 70)
      const verts: Pair[][] = []
      while (recs[k + 1] && recs[k + 1][0][1] === 'VERTEX') verts.push(recs[++k])
      if (recs[k + 1]?.[0][1] === 'SEQEND') k++
      if (flags & (16 | 64)) {
        skip('POLYLINE (malla)')
        continue
      }
      const is3d = (flags & 8) === 8
      const elev = num(rec, 30)
      const tf = is3d ? (p: XYZ) => p : ocs(rec)
      const pts = verts
        .filter((v) => !(num(v, 70) & 128) || v.some(([c]) => c === 10)) // 128 sin coordenadas = registro de cara
        .map((v) => tf({ x: num(v, 10), y: num(v, 20), z: is3d ? num(v, 30) : elev }))
      features.push({ layer, kind: 'POLYLINE', points: pts, closed: (flags & 1) === 1 })
    } else if (type === 'LINE') {
      features.push({
        layer,
        kind: 'LINE',
        points: [
          { x: num(rec, 10), y: num(rec, 20), z: num(rec, 30) },
          { x: num(rec, 11), y: num(rec, 21), z: num(rec, 31) },
        ],
        closed: false,
      })
    } else if (type === 'POINT') {
      features.push({ layer, kind: 'POINT', points: [{ x: num(rec, 10), y: num(rec, 20), z: num(rec, 30) }], closed: false })
    } else if (type !== 'VERTEX' && type !== 'SEQEND') skip(type)
  }

  const finite = (p: XYZ) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
  const valid = features.map((f) => ({ ...f, points: f.points.filter(finite) })).filter((f) => f.points.length > 0)
  const byLayer = new Map<string, LayerSummary>()
  let bbox: SurveyDrawing['bbox'] = null
  let zMin = Infinity
  let zMax = -Infinity
  for (const f of valid) {
    const s = byLayer.get(f.layer) ?? { name: f.layer, entities: 0, vertices: 0, zMin: Infinity, zMax: -Infinity }
    s.entities++
    s.vertices += f.points.length
    for (const p of f.points) {
      s.zMin = Math.min(s.zMin, p.z)
      s.zMax = Math.max(s.zMax, p.z)
      bbox = bbox
        ? { minX: Math.min(bbox.minX, p.x), minY: Math.min(bbox.minY, p.y), maxX: Math.max(bbox.maxX, p.x), maxY: Math.max(bbox.maxY, p.y) }
        : { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y }
    }
    zMin = Math.min(zMin, s.zMin)
    zMax = Math.max(zMax, s.zMax)
    byLayer.set(f.layer, s)
  }
  return { features: valid, layers: [...byLayer.values()].sort((a, b) => a.name.localeCompare(b.name)), ignored, bbox, zMin, zMax }
}

/**
 * Capas que se usan por defecto: todas, salvo las que están enteras a cota 0 cuando otras tienen cota (suelen ser
 * deslindes, ejes o textos dibujados en planta, que hundirían el terreno).
 */
export function defaultSurveyLayers(d: SurveyDrawing): string[] {
  const flat = (l: LayerSummary) => l.zMin === 0 && l.zMax === 0
  const anyZ = d.layers.some((l) => !flat(l))
  return d.layers.filter((l) => !anyZ || !flat(l)).map((l) => l.name)
}
