import { contarNiveles, cotaLabel, escalaConfiable, opcionesEquidistancia } from './escala'
import { labelHeight, labelPlacements } from './labels'

describe('escala confiable del dato (Tobler: 1:2 000 × resolución)', () => {
  it('casos dorados', () => {
    expect(escalaConfiable(30)).toEqual({ denominador: 60_000, equidistanciaMinima: 25 }) // 60 000 / 2 500 = 24 → 25
    expect(escalaConfiable(60)).toEqual({ denominador: 120_000, equidistanciaMinima: 50 }) // 48 → 50
    expect(escalaConfiable(12.5)).toEqual({ denominador: 25_000, equidistanciaMinima: 10 })
    expect(escalaConfiable(5)).toEqual({ denominador: 10_000, equidistanciaMinima: 5 }) // 4 → 5
    expect(escalaConfiable(1)).toEqual({ denominador: 2_000, equidistanciaMinima: 1 }) // 0,8 → 1
    expect(escalaConfiable(0.5)).toEqual({ denominador: 1_000, equidistanciaMinima: 0.5 }) // 0,4 → 0,5
    expect(escalaConfiable(1.23)).toEqual({ denominador: 2_500, equidistanciaMinima: 1 }) // 2 460 → 2 500 (2 cifras)
  })

  it('el selector incluye la mínima sugerida aunque no esté en la lista base', () => {
    expect(opcionesEquidistancia(25)).toEqual([0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100])
    expect(opcionesEquidistancia(0.2)[0]).toBe(0.2)
  })

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
