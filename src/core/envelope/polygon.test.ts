import { cleanRing } from './polygon'

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
