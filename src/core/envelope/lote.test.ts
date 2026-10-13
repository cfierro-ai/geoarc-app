import { flatTerrain, flatGrid } from '../dem/plano'
import { gridStats } from '../dem/grid'
import { PERFIL_OGUC, reglaPorRol } from '../normativa/perfiles'
import { computeEnvelope, evaluateAt, GOV_MAX_HEIGHT, prepare } from './envelope'
import { envelopeInputFor, lotFromDimensions, terrainAreaForLot } from './lote'
import { area } from './polygon'

const T70 = Math.tan((70 * Math.PI) / 180)
const deslindes = (n: number) => Array.from({ length: n }, () => reglaPorRol(PERFIL_OGUC, 'deslinde'))

describe('lote por dimensiones', () => {
  it('ancho × fondo centrado en el sitio; el giro es antihorario y conserva la superficie', () => {
    expect(lotFromDimensions(20, 30)).toEqual([
      { x: -10, y: -15 },
      { x: 10, y: -15 },
      { x: 10, y: 15 },
      { x: -10, y: 15 },
    ])
    const g = lotFromDimensions(20, 30, 90)
    expect(g[0].x).toBeCloseTo(15, 9) // (−10, −15) girado 90° → (15, −10)
    expect(g[0].y).toBeCloseTo(-10, 9)
    expect(area(lotFromDimensions(20, 35, 15))).toBeCloseTo(700, 9)
  })

  it('área de terreno alrededor del lote: caja + max(30 m, medio lado mayor)', () => {
    expect(terrainAreaForLot(lotFromDimensions(20, 30))).toEqual({ minX: -40, minY: -45, maxX: 40, maxY: 45 })
    expect(terrainAreaForLot(lotFromDimensions(100, 40))).toEqual({ minX: -100, minY: -70, maxX: 100, maxY: 70 })
  })
})

describe('estudio de sombras en plano (cota 0)', () => {
  it('coincide con el caso dorado «lote plano 20×20, rasante 70°»: centro = 10·tan 70°', () => {
    // lote por dimensiones 20 × 20 sin giro, 4 deslindes con la rasante del perfil (70°), sin altura máxima
    const input = envelopeInputFor(lotFromDimensions(20, 20, 0), deslindes(4), 0, flatTerrain)
    expect(PERFIL_OGUC.anguloRasante.valor).toBe(70)
    const e = evaluateAt(prepare(input), { x: 0, y: 0 })
    expect(e.top).toBeCloseTo(10 * T70, 2)
    expect(e.ground).toBe(0)
  })

  it('altura máxima alcanzable, refinada bajo la celda: 20×20 a 70° → 10·tan 70° = 27,47 m (no 27,13 de la celda)', () => {
    // la grilla de cálculo (0,25 m) no tiene un centro de celda en el centro del lote: el más cercano está a
    // (0,125; 0,125) → 9,875·tan 70° = 27,13 m. El refinamiento parte de esa celda y llega al máximo verdadero.
    const T = 10 * T70
    expect(T).toBeCloseTo(27.47, 2)
    for (const [giro, c] of [[0, { x: 0, y: 0 }], [0, { x: 0.37, y: -0.21 }], [30, { x: 0, y: 0 }]] as const) {
      const r = computeEnvelope(envelopeInputFor(lotFromDimensions(20, 20, giro, c), deslindes(4), 0, flatTerrain))
      expect(r.stats.maxRel).toBeCloseTo(T, 2) // ±0,005 m
      expect(Math.hypot(r.stats.maxAt.x - c.x, r.stats.maxAt.y - c.y)).toBeLessThan(0.005)
    }
  })

  it('con altura máxima 14 m manda la altura máxima en el centro', () => {
    const input = envelopeInputFor(lotFromDimensions(20, 20, 0), deslindes(4), 14, flatTerrain)
    const r = computeEnvelope(input)
    expect(r.stats.maxRel).toBeCloseTo(14, 6)
    expect(r.stats.lotArea).toBeCloseTo(400, 9)
    expect(evaluateAt(prepare(input), { x: 0, y: 0 }).governing).toBe(GOV_MAX_HEIGHT)
  })

  it('la grilla plana es cota 0 en toda el área', () => {
    const g = flatGrid(terrainAreaForLot(lotFromDimensions(20, 20)), 1)
    expect(gridStats(g)).toEqual({ min: 0, max: 0 })
    expect(g.meta.kind).toBe('plano')
  })
})
