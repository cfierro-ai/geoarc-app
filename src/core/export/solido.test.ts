import type { XYZ } from '../geo/local'
import { agruparAnillos } from '../envelope/polygon'
import { edificioSolido, murosEdificio, techoCaras, techoEdificio, triangular, type Tri3 } from './solido'

const CUADRADO = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
const HUECO = [{ x: 4, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 6 }, { x: 4, y: 6 }]

/** Área total de una lista de triángulos XY. */
const areaTris = <T extends { x: number; y: number }>(tris: [T, T, T][]) =>
  tris.reduce((s, [a, b, c]) => s + Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2, 0)

/** ¿El sólido es cerrado? Cada arista no dirigida pertenece a exactamente 2 caras. */
function cerrado(caras: Tri3[]): boolean {
  const k = (p: XYZ) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`
  const cuenta = new Map<string, number>()
  for (const t of caras)
    for (let i = 0; i < 3; i++) {
      const a = k(t[i])
      const b = k(t[(i + 1) % 3])
      const e = a < b ? `${a}|${b}` : `${b}|${a}`
      cuenta.set(e, (cuenta.get(e) ?? 0) + 1)
    }
  return [...cuenta.values()].every((n) => n === 2)
}

describe('triangulación de polígonos (earcut)', () => {
  it('cuadrado 10×10 → 2 triángulos que suman 100 m²', () => {
    const t = triangular(CUADRADO)
    expect(t).toHaveLength(2)
    expect(areaTris(t)).toBeCloseTo(100, 6)
  })

  it('con un patio 2×2 → área 96 m², y ningún triángulo cae dentro del patio', () => {
    const t = triangular(CUADRADO, [HUECO])
    expect(areaTris(t)).toBeCloseTo(96, 6)
    const dentroDelPatio = t.some(([a, b, c]) => {
      const cx = (a.x + b.x + c.x) / 3
      const cy = (a.y + b.y + c.y) / 3
      return cx > 4 && cx < 6 && cy > 4 && cy < 6
    })
    expect(dentroDelPatio).toBe(false)
  })

  it('triangula aunque el anillo venga en sentido horario', () => {
    expect(areaTris(triangular([...CUADRADO].reverse()))).toBeCloseTo(100, 6)
  })
})

describe('sólido de un edificio', () => {
  it('muros: un cuadrilátero por arista del anillo (4), de la cota base a la cota base+altura', () => {
    const m = murosEdificio(CUADRADO, [], 100, 3)
    expect(m).toHaveLength(4)
    for (const q of m) {
      const zs = q.map((p) => p.z)
      expect(Math.min(...zs)).toBeCloseTo(100, 6)
      expect(Math.max(...zs)).toBeCloseTo(103, 6)
    }
  })

  it('techo: triángulos a la cota base+altura', () => {
    const t = techoEdificio(CUADRADO, [], 100, 3)
    expect(areaTris(t)).toBeCloseTo(100, 6)
    expect(t.every((tri) => tri.every((p) => Math.abs(p.z - 103) < 1e-6))).toBe(true)
  })

  it('caso dorado: un prisma 10×10×3 es un sólido cerrado (piso + 4 muros + techo = 12 triángulos)', () => {
    const s = edificioSolido(CUADRADO, [], 100, 3)
    expect(s).toHaveLength(12)
    expect(cerrado(s)).toBe(true)
    const zs = s.flat().map((p) => p.z)
    expect(Math.min(...zs)).toBeCloseTo(100, 6)
    expect(Math.max(...zs)).toBeCloseTo(103, 6)
  })

  it('con un patio pasante, el sólido sigue cerrado (muros exteriores + muros del patio)', () => {
    const s = edificioSolido(CUADRADO, [HUECO], 50, 6)
    expect(cerrado(s)).toBe(true)
    // paredes: 4 exteriores + 4 del patio = 8 cuadriláteros → 16 triángulos; piso y techo: 8 cada uno (96 m²)
    expect(s).toHaveLength(16 + 16)
  })
})

describe('edificios de un multipolígono (teselas fusionadas por altura)', () => {
  it('dos anillos disjuntos → dos edificios; ningún triángulo cruza el espacio entre ambos', () => {
    const A = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const B = [{ x: 20, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 20, y: 10 }]
    const edif = agruparAnillos([A, B])
    expect(edif).toHaveLength(2)
    expect(edif.every((e) => e.huecos.length === 0)).toBe(true)
    // triangular cada edificio por separado: ningún triángulo cae en el vacío entre ambos (10 < x < 20)
    const tris = edif.flatMap((e) => triangular(e.anillo, e.huecos))
    expect(tris.some(([a, b, c]) => (a.x + b.x + c.x) / 3 > 10 && (a.x + b.x + c.x) / 3 < 20)).toBe(false)
    expect(areaTris(tris)).toBeCloseTo(200, 6) // 2 × 100 m²
  })

  it('un anillo con un patio → un edificio con el hueco asignado por contención', () => {
    const edif = agruparAnillos([CUADRADO, HUECO])
    expect(edif).toHaveLength(1)
    expect(edif[0].huecos).toHaveLength(1)
    expect(areaTris(triangular(edif[0].anillo, edif[0].huecos))).toBeCloseTo(96, 6)
  })
})

describe('techo con aristas interiores invisibles (en planta se ve solo el contorno)', () => {
  // aristas reales visibles de un 3DFACE triangular = las de los bits 1, 2, 8 que NO están en la máscara `ocultas`
  const visiblesReales = (caras: { ocultas: number }[]) =>
    caras.reduce((s, { ocultas }) => s + [1, 2, 8].filter((b) => !(ocultas & b)).length, 0)

  it('cuadrado (2 triángulos): solo las 4 aristas del borde quedan visibles; la diagonal, oculta', () => {
    const caras = techoCaras(CUADRADO, [], 100, 3)
    expect(caras).toHaveLength(2)
    for (const { ocultas } of caras) expect(ocultas & 4).toBe(4) // la arista 3→4 (degenerada) siempre oculta
    expect(visiblesReales(caras)).toBe(4) // las 4 aristas del contorno del cuadrado
  })

  it('con un patio: visibles las 4 del contorno + las 4 del patio (8); las diagonales, ocultas', () => {
    expect(visiblesReales(techoCaras(CUADRADO, [HUECO], 100, 3))).toBe(8)
  })
})
