import { rectGrid, gridStats } from '../dem/grid'
import { contourLevels, isolines } from './isolines'
import {
  contarNiveles,
  cotaLabel,
  curvasPorDesnivel,
  equidistanciaMinimaConfiable,
  preseleccionEquidistancia,
  usoDelDato,
} from './escala'
import { labelHeight, labelPlacements } from './labels'

const TERRARIUM = { kind: 'DSM' as const, nominalResolutionM: 30 }
const dato = (r: number) => ({ kind: 'DSM' as const, nominalResolutionM: r })
const LEV = { kind: 'levantamiento' as const, nominalResolutionM: 0.5 }

describe('equidistancia mínima confiable según la resolución del dato', () => {
  it('≥ 20 m → 5 m; 5–20 m → 2 m; < 5 m → 1 m; levantamiento → 0,5 m', () => {
    expect(equidistanciaMinimaConfiable(TERRARIUM)).toBe(5)
    expect(equidistanciaMinimaConfiable(dato(20))).toBe(5)
    expect(equidistanciaMinimaConfiable(dato(19.9))).toBe(2)
    expect(equidistanciaMinimaConfiable(dato(5))).toBe(2)
    expect(equidistanciaMinimaConfiable(dato(4.9))).toBe(1)
    expect(equidistanciaMinimaConfiable(LEV)).toBe(0.5)
  })
})

describe('preselección: la menor ≥ mínima confiable que dé entre 5 y 20 curvas', () => {
  it('caso de control: área de 5 ha con 25 m de desnivel sobre Terrarium → 5 m, 5 curvas', () => {
    // 250 × 200 m = 5 ha; plano que sube 25 m hacia el norte, de 100,3 a 125,3 m
    const g = rectGrid({ minX: 0, minY: 0, maxX: 250, maxY: 200 }, 2, { source: 'Terrarium', ...TERRARIUM }, (_x, y) => 100.3 + (25 * y) / 200)
    const { min, max } = gridStats(g)
    expect(max - min).toBeCloseTo(25, 4)
    expect(preseleccionEquidistancia(g.meta, max - min)).toEqual({ equidistancia: 5, curvas: 5 })
    expect(isolines(g, contourLevels(min, max, 5))).toHaveLength(5) // 105, 110, 115, 120, 125
  })

  it('casos dorados por desnivel', () => {
    expect(preseleccionEquidistancia(TERRARIUM, 300)).toEqual({ equidistancia: 20, curvas: 15 }) // 5 → 60, 10 → 30
    expect(preseleccionEquidistancia(dato(10), 14)).toEqual({ equidistancia: 2, curvas: 7 })
    expect(preseleccionEquidistancia(dato(1), 14.2)).toEqual({ equidistancia: 1, curvas: 14 })
    expect(preseleccionEquidistancia(LEV, 4)).toEqual({ equidistancia: 0.5, curvas: 8 })
    expect(preseleccionEquidistancia(LEV, 30)).toEqual({ equidistancia: 2, curvas: 15 }) // 0,5 → 60, 1 → 30
  })

  it('sin candidata en 5–20: casi plano → la mínima confiable; desnivel enorme → la mayor', () => {
    expect(preseleccionEquidistancia(TERRARIUM, 3)).toEqual({ equidistancia: 5, curvas: 0 })
    expect(preseleccionEquidistancia(TERRARIUM, 2000)).toEqual({ equidistancia: 50, curvas: 40 })
  })

  it('curvas según el desnivel', () => {
    expect(curvasPorDesnivel(25, 5)).toBe(5)
    expect(curvasPorDesnivel(24.9, 5)).toBe(4)
  })
})

describe('uso del dato (etiqueta informativa)', () => {
  it('textos por tipo y resolución', () => {
    expect(usoDelDato(TERRARIUM)).toBe('dato de ~30 m: útil para ladera y barrio, no para el lote')
    expect(usoDelDato(dato(10))).toMatch(/^dato de ~10 m: útil para barrio y manzana/)
    expect(usoDelDato(dato(2))).toBe('dato de ~2 m: útil para manzana y lote')
    expect(usoDelDato(LEV)).toMatch(/^levantamiento topográfico/)
    expect(usoDelDato({ kind: 'sintético', nominalResolutionM: 0.4 })).toMatch(/^terreno inventado \(~0,4 m\)/)
  })
})

describe('niveles y rótulos', () => {
  it('cuenta curvas como contourLevels', () => {
    expect(contarNiveles(101.3, 104.9, 1)).toBe(3) // 102, 103, 104
    expect(contarNiveles(0, 1, 0.5)).toBe(3)
    expect(contarNiveles(101.3, 101.9, 1)).toBe(0)
  })

  it('rótulo de cota en español de Chile, sin separador de miles', () => {
    expect(cotaLabel(125)).toBe('125')
    expect(cotaLabel(122.5)).toBe('122,5')
    expect(cotaLabel(1250)).toBe('1250')
    expect(cotaLabel(0.1 * 3)).toBe('0,3')
  })
})

describe('rótulos de curvas maestras', () => {
  it('altura de texto: 2,5 mm con el lado mayor en ~400 mm (lado / 160)', () => {
    expect(labelHeight(300)).toBe(2) // 1,875 → 2
    expect(labelHeight(2000)).toBe(10) // 12,5 → 10
    expect(labelHeight(100)).toBe(0.5) // 0,625 → 0,5
  })

  it('recta de 100 m, texto de 1 m: un rótulo cada ~40 m, repartidos', () => {
    const ls = labelPlacements({ level: 100, closed: false, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, 1)
    expect(ls).toEqual([
      { x: 25, y: 0, angleDeg: 0 },
      { x: 75, y: 0, angleDeg: 0 },
    ])
  })

  it('el texto queda siempre legible: giro en (−90°, 90°]', () => {
    const abajo = labelPlacements({ level: 1, closed: false, points: [{ x: 0, y: 100 }, { x: 0, y: 0 }] }, 1)
    expect(abajo.map((l) => [l.x, l.y, l.angleDeg])).toEqual([[0, 75, 90], [0, 25, 90]]) // −90° → 90°
    const izq = labelPlacements({ level: 1, closed: false, points: [{ x: 100, y: 0 }, { x: 0, y: 0 }] }, 1)
    expect(izq.map((l) => [l.x, l.angleDeg])).toEqual([[75, 0], [25, 0]]) // 180° → 0°
  })

  it('curva cerrada: recorre también el tramo de cierre', () => {
    // rectángulo 30 × 20 (perímetro 100): rótulos en s = 25 (lado sur) y s = 75 (lado norte, recorrido al oeste)
    const ls = labelPlacements(
      { level: 1, closed: true, points: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 0, y: 20 }] },
      1,
    )
    expect(ls.map((l) => [l.x, l.y, l.angleDeg])).toEqual([[25, 0, 0], [5, 20, 0]])
  })

  it('curvas cortas (< 6 alturas de texto) no se rotulan', () => {
    expect(labelPlacements({ level: 1, closed: false, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }, 1)).toEqual([])
  })
})
