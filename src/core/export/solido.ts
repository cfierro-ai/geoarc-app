import earcut from 'earcut'
import type { XY, XYZ } from '../geo/local'
import { signedArea } from '../envelope/polygon'

export type Tri3 = [XYZ, XYZ, XYZ]
export type Quad3 = [XYZ, XYZ, XYZ, XYZ]

const ccw = (p: XY[]) => (signedArea(p) >= 0 ? p : [...p].reverse())
const cw = (p: XY[]) => (signedArea(p) < 0 ? p : [...p].reverse())

/**
 * Triangula un polígono con huecos usando earcut. Devuelve triángulos como tríos de puntos (no índices).
 * El anillo exterior se normaliza a antihorario y los huecos a horario (lo que earcut espera), así los triángulos
 * quedan antihorarios (normal hacia arriba) sea cual sea el sentido de entrada.
 */
export function triangular(anillo: XY[], huecos: XY[][] = []): [XY, XY, XY][] {
  const coords: number[] = []
  const holeStarts: number[] = []
  for (const p of ccw(anillo)) coords.push(p.x, p.y)
  for (const h of huecos) {
    holeStarts.push(coords.length / 2)
    for (const p of cw(h)) coords.push(p.x, p.y)
  }
  const idx = earcut(coords, holeStarts.length ? holeStarts : undefined)
  const pt = (i: number): XY => ({ x: coords[2 * i], y: coords[2 * i + 1] })
  const tris: [XY, XY, XY][] = []
  for (let k = 0; k < idx.length; k += 3) tris.push([pt(idx[k]), pt(idx[k + 1]), pt(idx[k + 2])])
  return tris
}

/** Un cuadrilátero vertical por cada arista del anillo y de cada hueco, de la cota `z0` a `z0 + altura`. */
export function murosEdificio(anillo: XY[], huecos: XY[][], z0: number, altura: number): Quad3[] {
  const zt = z0 + altura
  const out: Quad3[] = []
  for (const ring of [anillo, ...huecos])
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      out.push([
        { x: a.x, y: a.y, z: z0 },
        { x: b.x, y: b.y, z: z0 },
        { x: b.x, y: b.y, z: zt },
        { x: a.x, y: a.y, z: zt },
      ])
    }
  return out
}

/** Triángulos del techo a la cota `z0 + altura`. */
export function techoEdificio(anillo: XY[], huecos: XY[][], z0: number, altura: number): Tri3[] {
  const zt = z0 + altura
  return triangular(anillo, huecos).map(([a, b, c]) => [
    { x: a.x, y: a.y, z: zt },
    { x: b.x, y: b.y, z: zt },
    { x: c.x, y: c.y, z: zt },
  ] as Tri3)
}

/** Triángulo del techo con el código 70 del 3DFACE: qué aristas van invisibles. */
export interface CaraTecho {
  tri: Tri3
  /** Máscara de aristas invisibles del 3DFACE (1 = 1→2, 2 = 2→3, 4 = 3→4 degenerada, 8 = 4→1). */
  ocultas: number
}

/**
 * Techo como 3DFACE con las aristas INTERIORES (las diagonales que la triangulación agrega) marcadas invisibles, para
 * que en planta se vea solo el contorno del edificio y sus patios, no la malla de triángulos. Una arista compartida por
 * dos triángulos es interior; una que aparece una sola vez está en el borde (contorno o patio) y queda visible.
 */
export function techoCaras(anillo: XY[], huecos: XY[][], z0: number, altura: number): CaraTecho[] {
  const tris = techoEdificio(anillo, huecos, z0, altura)
  const key = (p: XYZ) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`
  const arista = (a: XYZ, b: XYZ) => [key(a), key(b)].sort().join('|')
  const cuenta = new Map<string, number>()
  for (const [a, b, c] of tris) for (const [p, q] of [[a, b], [b, c], [c, a]] as [XYZ, XYZ][]) cuenta.set(arista(p, q), (cuenta.get(arista(p, q)) ?? 0) + 1)
  const interior = (a: XYZ, b: XYZ) => (cuenta.get(arista(a, b)) ?? 0) > 1
  return tris.map(([a, b, c]) => {
    // el 3DFACE se emite con la 4ª esquina = 3ª: la arista 3→4 (bit 4) es degenerada y siempre va oculta
    let ocultas = 4
    if (interior(a, b)) ocultas |= 1 // arista 1→2
    if (interior(b, c)) ocultas |= 2 // arista 2→3
    if (interior(c, a)) ocultas |= 8 // arista 4→1 (= 3→1)
    return { tri: [a, b, c], ocultas }
  })
}

/**
 * Edificio como sólido cerrado (piso + muros + techo) en triángulos. Para la malla OBJ y para verificar el cierre:
 * cada arista pertenece a exactamente dos caras. El piso repite la triangulación del techo con el sentido invertido.
 */
export function edificioSolido(anillo: XY[], huecos: XY[][], z0: number, altura: number): Tri3[] {
  const techo = techoEdificio(anillo, huecos, z0, altura)
  const piso: Tri3[] = triangular(anillo, huecos).map(([a, b, c]) => [
    { x: a.x, y: a.y, z: z0 },
    { x: c.x, y: c.y, z: z0 },
    { x: b.x, y: b.y, z: z0 },
  ])
  const muros: Tri3[] = murosEdificio(anillo, huecos, z0, altura).flatMap(([a, b, c, d]) => [
    [a, b, c],
    [a, c, d],
  ])
  return [...piso, ...muros, ...techo]
}
