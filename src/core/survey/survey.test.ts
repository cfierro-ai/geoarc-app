import { createLocalFrame, type XYZ } from '../geo/local'
import { gridStats, sampleBilinear } from '../dem/grid'
import { defaultSurveyLayers, readSurveyDxf } from './dxfRead'
import { buildTin, densify, tinToGrid } from './tin'
import { looksLikeSiteUtm, surveyToGrid } from './survey'

const frame = createLocalFrame({ lon: -72.5985, lat: -38.739 })

// --- DXF sintético (pares código/valor) -------------------------------------------------------------------------
const P = (...a: (string | number)[]) => a.map(String).join('\n')
const circle = (cx: number, cy: number, r: number, n = 64) =>
  Array.from({ length: n }, (_, k) => ({ x: cx + r * Math.cos((2 * Math.PI * k) / n), y: cy + r * Math.sin((2 * Math.PI * k) / n) }))
const lwpolyline = (layer: string, pts: { x: number; y: number }[], z: number, closed = true, extra: (string | number)[] = []) =>
  P(0, 'LWPOLYLINE', 8, layer, 90, pts.length, 70, closed ? 1 : 0, 38, z, ...extra, ...pts.flatMap((p) => [10, p.x, 20, p.y]))
const polyline3d = (layer: string, pts: XYZ[], closed = true) =>
  P(0, 'POLYLINE', 8, layer, 66, 1, 10, 0, 20, 0, 30, 0, 70, closed ? 9 : 8, ...pts.flatMap((p) => [0, 'VERTEX', 8, layer, 10, p.x, 20, p.y, 30, p.z, 70, 32]), 0, 'SEQEND')
const lines = (layer: string, pts: XYZ[]) =>
  pts.map((a, k) => {
    const b = pts[(k + 1) % pts.length]
    return P(0, 'LINE', 8, layer, 10, a.x, 20, a.y, 30, a.z, 11, b.x, 21, b.y, 31, b.z)
  }).join('\n')
const dxf = (...ents: string[]) => [P(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 0, 'ENDSEC'), P(0, 'SECTION', 2, 'ENTITIES'), ...ents, P(0, 'ENDSEC', 0, 'EOF')].join('\n') + '\n'

/** Tres curvas concéntricas en coordenadas arbitrarias del levantamiento, una por tipo de entidad. */
const C = { x: 1000, y: 2000 }
const curvas = [
  { r: 30, z: 100, ent: lwpolyline('CN_100', circle(C.x, C.y, 30), 100) },
  { r: 20, z: 102, ent: polyline3d('CN_3D', circle(C.x, C.y, 20).map((p) => ({ ...p, z: 102 }))) },
  { r: 10, z: 104, ent: lines('CN_LINEAS', circle(C.x, C.y, 10).map((p) => ({ ...p, z: 104 }))) },
]
const tresCurvas = dxf(...curvas.map((c) => c.ent))

describe('lector DXF de levantamiento', () => {
  it('LWPOLYLINE (cota en 38), POLYLINE 3D y LINE con Z; capas y rango de cotas', () => {
    const d = readSurveyDxf(tresCurvas)
    expect(d.features.map((f) => [f.kind, f.layer, f.points.length, f.closed])).toEqual([
      ['LWPOLYLINE', 'CN_100', 64, true],
      ['POLYLINE', 'CN_3D', 64, true],
      ...Array.from({ length: 64 }, () => ['LINE', 'CN_LINEAS', 2, false]),
    ])
    expect(d.layers.map((l) => [l.name, l.entities, l.zMin, l.zMax])).toEqual([
      ['CN_100', 1, 100, 100],
      ['CN_3D', 1, 102, 102],
      ['CN_LINEAS', 64, 104, 104],
    ])
    expect([d.zMin, d.zMax]).toEqual([100, 104])
    expect(d.bbox!.minX).toBeCloseTo(C.x - 30, 9)
  })

  it('POLYLINE 2D toma la cota del encabezado; mallas, espacio papel y textos se informan como ignorados', () => {
    const d = readSurveyDxf(
      dxf(
        P(0, 'POLYLINE', 8, 'CN2D', 66, 1, 10, 0, 20, 0, 30, 55.5, 70, 0, 0, 'VERTEX', 8, 'CN2D', 10, 1, 20, 2, 30, 0, 0, 'VERTEX', 8, 'CN2D', 10, 3, 20, 4, 30, 0, 0, 'SEQEND'),
        P(0, 'POLYLINE', 8, 'MALLA', 66, 1, 70, 16, 0, 'VERTEX', 8, 'MALLA', 10, 0, 20, 0, 30, 1, 0, 'SEQEND'),
        P(0, 'POINT', 8, 'PTS', 67, 1, 10, 0, 20, 0, 30, 9),
        P(0, 'TEXT', 8, 'TXT', 10, 0, 20, 0, 30, 0, 40, 1, 1, 'hola'),
        P(0, 'POINT', 8, 'PTS', 10, 5, 20, 6, 30, 57),
      ),
    )
    expect(d.features.map((f) => [f.kind, f.points])).toEqual([
      ['POLYLINE', [{ x: 1, y: 2, z: 55.5 }, { x: 3, y: 4, z: 55.5 }]],
      ['POINT', [{ x: 5, y: 6, z: 57 }]],
    ])
    expect(d.ignored).toEqual({ 'POLYLINE (malla)': 1, 'POINT (espacio papel)': 1, TEXT: 1 })
  })

  it('extrusión (0, 0, −1) de dibujos espejados: x y la cota cambian de signo', () => {
    const d = readSurveyDxf(dxf(lwpolyline('E', [{ x: 10, y: 5 }, { x: 12, y: 5 }], -80, false, [230, -1])))
    expect(d.features[0].points).toEqual([{ x: -10, y: 5, z: 80 }, { x: -12, y: 5, z: 80 }])
  })

  it('acepta finales de línea CRLF', () => {
    expect(readSurveyDxf(tresCurvas.replace(/\n/g, '\r\n')).features).toHaveLength(66)
  })

  it('capas por defecto: sin las que están enteras a cota 0 si otras tienen cota', () => {
    const d = readSurveyDxf(dxf(curvas[0].ent, lwpolyline('DESLINDE', circle(C.x, C.y, 25), 0)))
    expect(defaultSurveyLayers(d)).toEqual(['CN_100'])
  })
})

describe('TIN', () => {
  it('densifica tramos largos', () => {
    expect(densify([{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }], false, 3).map((p) => p.x)).toEqual([0, 2.5, 5, 7.5, 10])
  })

  it('un plano se reproduce exacto en la grilla', () => {
    const pts: XYZ[] = []
    for (let x = 0; x <= 20; x += 5) for (let y = 0; y <= 20; y += 5) pts.push({ x, y, z: 10 + 0.5 * x - 0.2 * y })
    const g = tinToGrid(buildTin(pts), { minX: 0, minY: 0, maxX: 20, maxY: 20 }, 1, { source: 't', kind: 'levantamiento', nominalResolutionM: 5 })
    for (const [x, y] of [[3.3, 7.1], [12, 19], [0, 0], [20, 20]]) expect(sampleBilinear(g, x, y)).toBeCloseTo(10 + 0.5 * x - 0.2 * y, 6)
  })

  it('levantamiento en L: el entrante no se rellena con triángulos largos', () => {
    const pts: XYZ[] = []
    for (let x = 0; x <= 40; x += 2) for (let y = 0; y <= 40; y += 2) if (x <= 10 || y <= 10) pts.push({ x, y, z: x + y })
    const g = tinToGrid(buildTin(pts), { minX: 0, minY: 0, maxX: 40, maxY: 40 }, 1, { source: 't', kind: 'levantamiento', nominalResolutionM: 2 })
    expect(sampleBilinear(g, 5, 30)).toBeCloseTo(35, 6) // dentro de la L
    expect(Number.isNaN(sampleBilinear(g, 30, 30))).toBe(true) // en el entrante: sin dato
  })
})

describe('levantamiento → grilla', () => {
  it('caso dorado: DXF de 3 curvas → la grilla reproduce las cotas sobre las curvas con error < 0,05 m', () => {
    const d = readSurveyDxf(tresCurvas)
    const s = surveyToGrid(d, { fileName: 'tres.dxf', coords: 'local', layers: defaultSurveyLayers(d), frame })
    expect(s.grid.meta.kind).toBe('levantamiento')
    expect(s.grid.meta.source).toBe('Levantamiento (tres.dxf)')
    // coordenadas locales: el dibujo queda centrado en el sitio
    expect((s.area.minX + s.area.maxX) / 2).toBeCloseTo(0, 6)
    expect((s.area.minY + s.area.maxY) / 2).toBeCloseTo(0, 6)
    let maxErr = 0
    for (const c of curvas) {
      const poly = circle(0, 0, c.r)
      poly.forEach((a, k) => {
        const b = poly[(k + 1) % poly.length]
        for (let t = 0; t < 1; t += 0.1) {
          const z = sampleBilinear(s.grid, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
          maxErr = Math.max(maxErr, Math.abs(z - c.z))
        }
      })
    }
    expect(maxErr).toBeLessThan(0.05)
    console.info(`[levantamiento] error máximo sobre las 3 curvas: ${maxErr.toFixed(4)} m`)
    // dentro de la curva más alta, plano a 104; el borde extrapolado no baja de la curva más baja
    expect(gridStats(s.grid)).toEqual({ min: 100, max: 104 })
    expect(s.info).toMatchObject({ coords: 'local', zMin: 100, zMax: 104, layers: ['CN_100', 'CN_3D', 'CN_LINEAS'] })
  })

  it('«UTM del sitio»: el dibujo se ubica donde corresponde', () => {
    const E = frame.originE + 500
    const N = frame.originN + 300
    const d = readSurveyDxf(dxf(lwpolyline('CN', circle(E, N, 30), 100), lwpolyline('CN', circle(E, N, 15), 101)))
    expect(looksLikeSiteUtm(d, frame)).toBe(true)
    expect(looksLikeSiteUtm(readSurveyDxf(tresCurvas), frame)).toBe(false)
    const s = surveyToGrid(d, { fileName: 'utm.dxf', coords: 'utm', layers: ['CN'], frame })
    expect((s.area.minX + s.area.maxX) / 2).toBeCloseTo(500, 6)
    expect((s.area.minY + s.area.maxY) / 2).toBeCloseTo(300, 6)
  })

  it('sin entidades en las capas elegidas → error legible', () => {
    expect(() => surveyToGrid(readSurveyDxf(tresCurvas), { fileName: 'x', coords: 'local', layers: [], frame })).toThrow(/No hay entidades/)
  })
})
