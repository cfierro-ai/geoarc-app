import { areaProblem, autoCell, dataGridLines, gridCells, rectFromCorners, type Rect } from './area'
import { niceCeil, niceNearest, SERIE_CARTO } from '../nice'

const R = (w: number, h: number): Rect => ({ minX: 0, minY: 0, maxX: w, maxY: h })

describe('números redondos', () => {
  it('más cercano (escala logarítmica) y techo', () => {
    expect(niceNearest(1.6)).toBe(1.5) // |ln 1,6/1,5| = 0,065 < |ln 2/1,6| = 0,223
    expect(niceNearest(1.2)).toBe(1.25)
    expect(niceNearest(0.4)).toBe(0.4)
    expect(niceCeil(2)).toBe(2)
    expect(niceCeil(2.01)).toBe(2.5)
    expect(niceCeil(24, SERIE_CARTO)).toBe(25)
    expect(niceCeil(0.8, SERIE_CARTO)).toBe(1)
  })
})

describe('área de extracción', () => {
  it('rectángulo desde dos esquinas en cualquier orden', () => {
    expect(rectFromCorners({ x: 30, y: -5 }, { x: -10, y: 20 })).toEqual({ minX: -10, minY: -5, maxX: 30, maxY: 20 })
  })

  it('valida tamaño mínimo y máximo', () => {
    expect(areaProblem(R(100, 100))).toBeNull()
    expect(areaProblem(R(5, 100))).toMatch(/al menos 10 m/)
    expect(areaProblem(R(30_000, 100))).toMatch(/20 km/)
  })

  it('celda automática: ~250 celdas en el lado menor', () => {
    expect(autoCell(R(500, 500))).toBe(2) // 500 / 250
    expect(gridCells(R(500, 500), 2)).toEqual({ nx: 250, ny: 250 })
    expect(autoCell(R(300, 300))).toBe(1.25) // 1,2 → 1,25 (serie)
    expect(autoCell(R(1000, 400))).toBe(1.5) // 400 / 250 = 1,6 → 1,5
    expect(gridCells(R(1000, 400), 1.5)).toEqual({ nx: 667, ny: 267 })
  })

  it('celda automática: tope de 2 000 celdas por lado en áreas alargadas', () => {
    // 100 / 250 = 0,4 m daría 10 000 celdas en el lado largo → la celda sube a 4 000 / 2 000 = 2 m
    expect(autoCell(R(4000, 100))).toBe(2)
    expect(gridCells(R(4000, 100), 2)).toEqual({ nx: 2000, ny: 50 })
  })

  it('celda automática: nunca menor a 0,25 m', () => {
    expect(autoCell(R(20, 20))).toBe(0.25)
  })

  it('malla del dato: múltiplos del paso desde el origen del marco', () => {
    const ls = dataGridLines({ minX: 5, minY: 0, maxX: 95, maxY: 60 }, 30)!
    expect(ls.filter((l) => l.a.x === l.b.x).map((l) => l.a.x)).toEqual([30, 60, 90])
    expect(ls.filter((l) => l.a.y === l.b.y).map((l) => l.a.y)).toEqual([0, 30, 60])
    expect(ls[0]).toEqual({ a: { x: 30, y: 0 }, b: { x: 30, y: 60 } })
    expect(dataGridLines(R(1000, 1000), 1)).toBeNull() // 2 002 líneas: ilegible
  })
})
