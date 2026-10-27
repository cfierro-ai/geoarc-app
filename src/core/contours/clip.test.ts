import type { XY } from '../geo/local'
import { rectGrid } from '../dem/grid'
import { bbox, distToSegment, pointInPolygon } from '../envelope/polygon'
import { clipIsolines, clipPolyline } from './clip'
import { contourLevels, isolines } from './isolines'

const TRI: XY[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 0, y: 100 },
]

/** ¿El punto está dentro del polígono o sobre su borde (a menos de `tol`)? */
const insideOrOn = (p: XY, poly: XY[], tol = 1e-6) =>
  pointInPolygon(p, poly) || poly.some((a, k) => distToSegment(p, a, poly[(k + 1) % poly.length]) < tol)

describe('recorte de curvas al polígono del área', () => {
  it('caso dorado: triángulo sobre un plano inclinado → ninguna curva sale del triángulo', () => {
    // plano que sube 20 % hacia el este: z = 100 + 0,2·x. Se calcula sobre el rectángulo envolvente (celda 2 m).
    const r = { minX: 0, minY: 0, maxX: 100, maxY: 100 }
    const g = rectGrid(r, 2, { source: 'plano inclinado', kind: 'DTM', nominalResolutionM: 2 }, (x) => 100 + 0.2 * x)
    const curvas = isolines(g, contourLevels(100, 120, 5)) // 100, 105, 110, 115, 120
    const recortadas = clipIsolines(curvas, TRI)

    for (const c of recortadas) {
      expect(c.closed).toBe(false)
      for (const p of c.points) expect(insideOrOn(p, TRI)).toBe(true)
      // también cada tramo: su punto medio queda dentro (un tramo no puede cruzar el borde)
      for (let k = 0; k + 1 < c.points.length; k++) {
        const a = c.points[k]
        const b = c.points[k + 1]
        expect(insideOrOn({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, TRI)).toBe(true)
      }
    }

    // a mano: la curva 105 es la recta x = 25; dentro del triángulo va de (25, 0) a (25, 75).
    // (la grilla guarda cotas en Float32: la curva interpolada cae a ~1e-5 m de x = 25)
    const c105 = recortadas.filter((c) => c.level === 105)
    expect(c105).toHaveLength(1)
    const ys = c105[0].points.map((p) => p.y)
    for (const p of c105[0].points) expect(p.x).toBeCloseTo(25, 4)
    expect(Math.min(...ys)).toBeCloseTo(0, 4)
    expect(Math.max(...ys)).toBeCloseTo(75, 4)
    // la curva 115 (x = 75) va de (75, 0) a (75, 25)
    const b115 = bbox(recortadas.find((c) => c.level === 115)!.points)
    for (const [v, esperado] of [[b115.minX, 75], [b115.maxX, 75], [b115.minY, 0], [b115.maxY, 25]]) expect(v).toBeCloseTo(esperado, 4)
  })

  it('polígono cóncavo: una recta que sale y vuelve a entrar queda en dos tramos', () => {
    // «U» de 30 × 20 con una muesca de 10 × 10 arriba al centro
    const U: XY[] = [
      { x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 20 }, { x: 20, y: 20 },
      { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 20 },
    ]
    const tramos = clipPolyline([{ x: -5, y: 15 }, { x: 35, y: 15 }], false, U)
    expect(tramos.map((t) => t.map((p) => [p.x, p.y]))).toEqual([
      [[0, 15], [10, 15]],
      [[20, 15], [30, 15]],
    ])
    // a y = 5 cruza entera por debajo de la muesca: un solo tramo
    expect(clipPolyline([{ x: -5, y: 5 }, { x: 35, y: 5 }], false, U)).toHaveLength(1)
  })

  it('curva cerrada: dentro queda cerrada; si cruza el borde, un tramo abierto unido por la costura', () => {
    const cuadrado: XY[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const dentro = clipIsolines([{ level: 7, closed: true, points: cuadrado.map((p) => ({ x: p.x + 2, y: p.y + 2 })) }], [
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 },
    ])
    expect(dentro).toHaveLength(1)
    expect(dentro[0].closed).toBe(true)
    expect(dentro[0].points).toHaveLength(4)

    // el mismo anillo (2..12) contra un semiplano x ≤ 7: queda la «C» izquierda, en UN tramo, aunque el anillo
    // empiece en (2, 2), en medio de la parte que se conserva
    const izq: XY[] = [{ x: -10, y: -10 }, { x: 7, y: -10 }, { x: 7, y: 30 }, { x: -10, y: 30 }]
    const c = clipIsolines([{ level: 7, closed: true, points: cuadrado.map((p) => ({ x: p.x + 2, y: p.y + 2 })) }], izq)
    expect(c).toHaveLength(1)
    expect(c[0].closed).toBe(false)
    expect(c[0].points.map((p) => [p.x, p.y])).toEqual([[7, 12], [2, 12], [2, 2], [7, 2]])
  })

  it('una curva completamente fuera desaparece', () => {
    expect(clipPolyline([{ x: 200, y: 0 }, { x: 300, y: 0 }], false, TRI)).toEqual([])
  })
})
