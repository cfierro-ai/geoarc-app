import { area, cleanRing, longitudPolilinea } from './polygon'

describe('medición en el mapa', () => {
  it('distancia acumulada de una polilínea (suma de los lados)', () => {
    expect(longitudPolilinea([])).toBe(0)
    expect(longitudPolilinea([{ x: 0, y: 0 }])).toBe(0)
    expect(longitudPolilinea([{ x: 0, y: 0 }, { x: 30, y: 0 }])).toBeCloseTo(30, 9)
    expect(longitudPolilinea([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 40 }])).toBeCloseTo(70, 9)
    expect(longitudPolilinea([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBeCloseTo(5, 9) // 3-4-5
  })

  it('área de una poligonal cerrada (|área firmada|)', () => {
    expect(area([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 35 }, { x: 0, y: 35 }])).toBeCloseTo(700, 9)
  })
})

describe('anillo dibujado en el mapa', () => {
  it('quita vértices repetidos (el doble clic agrega dos clics en el mismo punto) y el cierre duplicado', () => {
    const ring = cleanRing([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 10.1, y: 10.1 }, // segundo clic del doble clic
      { x: 10.1, y: 10.1 },
      { x: 0.2, y: 0 }, // vuelve sobre el primero
    ])
    expect(ring).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ])
  })
})
