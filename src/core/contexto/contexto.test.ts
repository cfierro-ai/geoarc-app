import { PbfWriter } from 'pbf'
import { createLocalFrame, type XY } from '../geo/local'
import { area as polyArea, bbox } from '../envelope/polygon'
import {
  ALTURA_PISO,
  alturaEdificacion,
  conteoAlturas,
  consultaOverpass,
  contextoDesdeOverpass,
  MARGEN_CONTEXTO,
  rectContexto,
  recortarContexto,
  unirTramos,
  type OverpassRespuesta,
} from './contexto'
import { contextoDesdeTeselas, teselaALonLat, teselasDeBBox } from './teselas'

const TEMUCO = { lon: -72.5985, lat: -38.739 }
const frame = createLocalFrame(TEMUCO)
/** Geometría Overpass ({lat, lon}) a partir de coordenadas locales. */
const geo = (pts: XY[]) => pts.map((p) => {
  const g = frame.toLonLat(p)
  return { lat: g.lat, lon: g.lon }
})
const cuadrado = (x: number, y: number, l: number): XY[] => [
  { x, y }, { x: x + l, y }, { x: x + l, y: y + l }, { x, y: y + l }, { x, y },
]
const cerca = (a: XY, b: XY, tol = 1e-3) => Math.hypot(a.x - b.x, a.y - b.y) < tol

describe('altura de una edificación (OSM)', () => {
  it('height manda; si no, building:levels × 3 m; si no hay dato, un piso (3 m)', () => {
    expect(ALTURA_PISO).toBe(3)
    expect(alturaEdificacion({ height: '12' })).toEqual({ altura: 12, fuente: 'height' })
    expect(alturaEdificacion({ height: '7,5 m', 'building:levels': '4' })).toEqual({ altura: 7.5, fuente: 'height' })
    expect(alturaEdificacion({ 'building:levels': '4' })).toEqual({ altura: 12, fuente: 'pisos' })
    expect(alturaEdificacion({ height: 'alto', 'building:levels': '2;3' })).toEqual({ altura: 6, fuente: 'pisos' })
    expect(alturaEdificacion({ building: 'yes' })).toEqual({ altura: 3, fuente: 'defecto' })
    expect(alturaEdificacion({ 'building:levels': '0' })).toEqual({ altura: 3, fuente: 'defecto' })
  })
})

describe('conteo de alturas (conocidas vs supuestas)', () => {
  const ed = (alturaFuente: 'height' | 'pisos' | 'defecto' | 'tesela') => ({ id: 'x', anillo: [], huecos: [], altura: 3, alturaFuente })
  it('con altura conocida = height o pisos; el resto, supuesta (3 m si todas son por defecto)', () => {
    expect(conteoAlturas([ed('height'), ed('pisos'), ed('defecto')])).toEqual({ total: 3, conocida: 2, supuesta: 1, supuesta3m: true })
    expect(conteoAlturas([ed('tesela'), ed('tesela')])).toEqual({ total: 2, conocida: 0, supuesta: 2, supuesta3m: false })
    expect(conteoAlturas([ed('height')])).toEqual({ total: 1, conocida: 1, supuesta: 0, supuesta3m: false })
    expect(conteoAlturas([ed('defecto'), ed('tesela')])).toEqual({ total: 2, conocida: 0, supuesta: 2, supuesta3m: false })
  })
})

describe('contexto desde Overpass', () => {
  it('el área de descarga es el área + 50 m por lado', () => {
    expect(MARGEN_CONTEXTO).toBe(50)
    expect(rectContexto({ minX: 0, minY: -10, maxX: 100, maxY: 90 })).toEqual({ minX: -50, minY: -60, maxX: 150, maxY: 140 })
  })

  it('consulta: edificios (vías y relaciones) y vías, con geometría, en el bbox sur,oeste,norte,este', () => {
    const q = consultaOverpass({ south: -38.75, west: -72.61, north: -38.73, east: -72.59 })
    expect(q).toContain('[out:json]')
    expect(q).toContain('way["building"](-38.75,-72.61,-38.73,-72.59)')
    expect(q).toContain('relation["building"]["type"="multipolygon"](-38.75,-72.61,-38.73,-72.59)')
    expect(q).toContain('way["highway"](-38.75,-72.61,-38.73,-72.59)')
    expect(q).toMatch(/out tags geom;\s*$/)
  })

  it('edificios (con altura), multipolígono con patio y vías, en el marco local', () => {
    const r: OverpassRespuesta = {
      elements: [
        { type: 'way', id: 11, tags: { building: 'yes', 'building:levels': '3' }, geometry: geo(cuadrado(0, 0, 10)) },
        { type: 'way', id: 12, tags: { building: 'house' }, geometry: geo(cuadrado(20, 0, 8)) },
        {
          type: 'relation',
          id: 21,
          tags: { type: 'multipolygon', building: 'school', height: '9' },
          members: [
            // el anillo exterior viene en dos tramos, uno de ellos al revés
            { type: 'way', ref: 1, role: 'outer', geometry: geo([{ x: 50, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 30 }]) },
            { type: 'way', ref: 2, role: 'outer', geometry: geo([{ x: 50, y: 0 }, { x: 50, y: 30 }, { x: 80, y: 30 }]) },
            { type: 'way', ref: 3, role: 'inner', geometry: geo(cuadrado(60, 10, 10)) },
          ],
        },
        { type: 'way', id: 31, tags: { highway: 'residential' }, geometry: geo([{ x: -20, y: -5 }, { x: 100, y: -5 }]) },
        { type: 'way', id: 32, tags: { highway: 'proposed' }, geometry: geo([{ x: -20, y: 40 }, { x: 100, y: 40 }]) },
      ],
    }
    const c = contextoDesdeOverpass(r, frame, '2026-10-13T12:00:00Z')
    expect(c.fuente).toBe('overpass')
    expect(c.fecha).toBe('2026-10-13T12:00:00Z')
    expect(c.edificaciones.map((e) => [e.id, e.altura, e.alturaFuente, e.anillo.length, e.huecos.length])).toEqual([
      ['w11', 9, 'pisos', 4, 0],
      ['w12', 3, 'defecto', 4, 0],
      ['r21', 9, 'height', 4, 1],
    ])
    expect(cerca(c.edificaciones[0].anillo[2], { x: 10, y: 10 })).toBe(true)
    // colegio: 30 × 30 con patio de 10 × 10
    const colegio = c.edificaciones[2]
    expect(polyArea(colegio.anillo)).toBeCloseTo(900, 1)
    expect(polyArea(colegio.huecos[0])).toBeCloseTo(100, 1)
    // una sola vía: la proyectada no es contexto
    expect(c.vias.map((v) => [v.id, v.clase, v.linea.length])).toEqual([['w31', 'residential', 2]])
    expect(cerca(c.vias[0].linea[1], { x: 100, y: -5 })).toBe(true)
  })

  it('recorte al área + 50 m: vías cortadas en el borde; edificios enteros si tocan el recuadro, fuera si no', () => {
    const r = { minX: -100, minY: -100, maxX: 100, maxY: 100 }
    const ed = (id: string, x: number, y: number) => ({ id, anillo: cuadrado(x, y, 20).slice(0, -1), huecos: [], altura: 3, alturaFuente: 'defecto' as const })
    const c = recortarContexto(
      {
        fuente: 'teselas',
        fecha: 'f',
        edificaciones: [ed('dentro', 0, 0), ed('borde', 90, 0), ed('lejos', 500, 500)],
        vias: [
          { id: 'avenida', linea: [{ x: -2000, y: 10 }, { x: 2000, y: 10 }], clase: 'primary' },
          { id: 'lejana', linea: [{ x: -2000, y: 900 }, { x: 2000, y: 900 }], clase: 'primary' },
          // entra, sale y vuelve a entrar: dos tramos
          { id: 'zeta', linea: [{ x: -50, y: 50 }, { x: -50, y: 300 }, { x: 50, y: 300 }, { x: 50, y: 50 }], clase: 'service' },
        ],
      },
      r,
    )
    expect(c.edificaciones.map((e) => e.id)).toEqual(['dentro', 'borde'])
    expect(c.edificaciones[1].anillo).toHaveLength(4) // entero, aunque salga del recuadro
    expect(c.vias.map((v) => [v.id, v.linea.map((p) => [p.x, p.y])])).toEqual([
      ['avenida', [[-100, 10], [100, 10]]],
      ['zeta-1', [[-50, 50], [-50, 100]]],
      ['zeta-2', [[50, 100], [50, 50]]],
    ])
  })

  it('unir tramos por sus extremos (en cualquier sentido)', () => {
    const t = unirTramos([
      [{ x: 10, y: 0 }, { x: 20, y: 0 }],
      [{ x: 30, y: 0 }, { x: 20, y: 0 }], // al revés
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 100, y: 0 }, { x: 110, y: 0 }], // aparte
    ])
    expect(t.map((l) => l.map((p) => p.x))).toEqual([[0, 10, 20, 30], [100, 110]])
  })
})

/** Codifica una tesela MVT mínima (una capa por nombre) para probar el respaldo sin red. */
type FeatMvt = { id: number; type: 2 | 3; rings: [number, number][][]; props: Record<string, number | string> }
const zz = (n: number) => (n << 1) ^ (n >> 31)
function teselaMvt(capas: Record<string, FeatMvt[]>, extent = 4096): Uint8Array {
  const pbf = new PbfWriter()
  for (const [nombre, feats] of Object.entries(capas)) {
    pbf.writeMessage(3, () => {
      const keys: string[] = []
      const vals: (string | number)[] = []
      pbf.writeVarintField(15, 2)
      pbf.writeStringField(1, nombre)
      for (const f of feats) {
        pbf.writeMessage(2, () => {
          pbf.writeVarintField(1, f.id)
          const tags: number[] = []
          for (const [k, v] of Object.entries(f.props)) {
            const ki = keys.includes(k) ? keys.indexOf(k) : keys.push(k) - 1
            const vi = vals.includes(v) ? vals.indexOf(v) : vals.push(v) - 1
            tags.push(ki, vi)
          }
          pbf.writePackedVarint(2, tags)
          pbf.writeVarintField(3, f.type)
          const g: number[] = []
          let cx = 0
          let cy = 0
          for (const ring of f.rings) {
            const pts = f.type === 3 ? ring.slice(0, -1) : ring // MVT no repite el primer vértice
            g.push(1 | (1 << 3), zz(pts[0][0] - cx), zz(pts[0][1] - cy))
            ;[cx, cy] = pts[0]
            g.push(2 | ((pts.length - 1) << 3))
            for (const [x, y] of pts.slice(1)) {
              g.push(zz(x - cx), zz(y - cy))
              cx = x
              cy = y
            }
            if (f.type === 3) g.push(7 | (1 << 3))
          }
          pbf.writePackedVarint(4, g)
        }, undefined)
      }
      for (const k of keys) pbf.writeStringField(3, k)
      for (const v of vals) pbf.writeMessage(4, () => (typeof v === 'string' ? pbf.writeStringField(1, v) : pbf.writeDoubleField(3, v)), undefined)
      pbf.writeVarintField(5, extent)
    }, undefined)
  }
  return pbf.finish()
}

describe('contexto desde teselas OpenFreeMap (respaldo)', () => {
  it('teselas z14 que cubren un bbox', () => {
    const ts = teselasDeBBox({ south: -38.741, west: -72.6005, north: -38.737, east: -72.5965 }, 14)
    expect(ts.length).toBeGreaterThanOrEqual(1)
    expect(ts.every((t) => t.z === 14)).toBe(true)
    const a = teselaALonLat(14, ts[0].x, ts[0].y, 0, 0)
    expect(a.lon).toBeLessThanOrEqual(-72.6005)
    expect(a.lat).toBeGreaterThanOrEqual(-38.737)
  })

  it('vía partida entre dos teselas se une por id; edificio recortado al borde de su tesela, con render_height', () => {
    const x = 4887
    const y = 10107
    const E = 4096
    const A = teselaMvt({
      // vía id 7: entra al búfer de la tesela vecina (x > 4096)
      transportation: [
        { id: 7, type: 2, rings: [[[3000, 2000], [4200, 2000]]], props: { class: 'primary' } },
        { id: 8, type: 3, rings: [[[100, 100], [200, 100], [200, 200], [100, 200], [100, 100]]], props: { class: 'path' } }, // área peatonal: no es vía
      ],
      // edificio que cruza el borde este: se recorta en x = 4096
      building: [{ id: 50, type: 3, rings: [[[3900, 1000], [4300, 1000], [4300, 1400], [3900, 1400], [3900, 1000]]], props: { render_height: 12, render_min_height: 0 } }],
    })
    const B = teselaMvt({ transportation: [{ id: 7, type: 2, rings: [[[-104, 2000], [1000, 2000]]], props: { class: 'primary' } }] })
    const c = contextoDesdeTeselas(
      [
        { z: 14, x, y, data: A },
        { z: 14, x: x + 1, y, data: B },
      ],
      frame,
      '2026-10-13T12:00:00Z',
    )
    expect(c.fuente).toBe('teselas')
    const loc = (tx: number, gx: number, gy: number) => frame.toLocal(teselaALonLat(14, tx, y, gx / E, gy / E))

    expect(c.vias).toHaveLength(1)
    const v = c.vias[0]
    expect(v.clase).toBe('primary')
    const ext = [v.linea[0], v.linea[v.linea.length - 1]].sort((p, q) => p.x - q.x)
    expect(cerca(ext[0], loc(x, 3000, 2000))).toBe(true)
    expect(cerca(ext[1], loc(x + 1, 1000, 2000))).toBe(true)

    expect(c.edificaciones).toHaveLength(1)
    const e = c.edificaciones[0]
    expect([e.altura, e.alturaFuente, e.anillo.length]).toEqual([12, 'tesela', 4])
    // vértices: las esquinas del edificio recortado en x = 4096, el borde de la tesela (la grilla UTM está girada
    // respecto de Mercator, así que se comparan vértices y no el rectángulo envolvente)
    const esquinas = [[3900, 1000], [E, 1000], [E, 1400], [3900, 1400]].map(([gx, gy]) => loc(x, gx, gy))
    for (const q of esquinas) expect(e.anillo.some((p) => cerca(p, q))).toBe(true)
    expect(bbox(e.anillo).maxX).toBeLessThan(loc(x + 1, 0, 1000).x + 1e-6) // nada pasa a la tesela vecina
  })
})
