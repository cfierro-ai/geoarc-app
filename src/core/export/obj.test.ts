import { createLocalFrame } from '../geo/local'
import { createGrid, type HeightGrid } from '../dem/grid'
import { sceneToObj } from './obj'

const frame = createLocalFrame({ lon: -72.598, lat: -38.739 })

/** Grilla plana (cota `z`) de 11×11 nodos, celda 1 m, origen (0,0). */
const grillaPlana = (z = 0): HeightGrid =>
  createGrid(11, 11, 1, 0, 0, { source: 'plano', kind: 'plano', nominalResolutionM: 1 }, () => z)

/** Parsea un OBJ: vértices, caras (índices), líneas `l` y grupos. */
function parseObj(s: string) {
  const verts: [number, number, number][] = []
  const caras: { grupo: string; idx: [number, number, number] }[] = []
  const lineas: { grupo: string; idx: number[] }[] = []
  let grupo = ''
  for (const l of s.split('\n')) {
    const p = l.trim().split(/\s+/)
    if (p[0] === 'v') verts.push([+p[1], +p[2], +p[3]])
    else if (p[0] === 'g') grupo = p[1]
    else if (p[0] === 'f') caras.push({ grupo, idx: [+p[1], +p[2], +p[3]] })
    else if (p[0] === 'l') lineas.push({ grupo, idx: p.slice(1).map(Number) })
  }
  return { verts, caras, lineas }
}
const areaTriObj = (verts: [number, number, number][], caras: { idx: [number, number, number] }[]) =>
  caras.reduce((s, { idx }) => {
    const [a, b, c] = idx.map((i) => verts[i - 1])
    return s + Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2
  }, 0)

describe('malla OBJ', () => {
  it('terreno sobre un plano, recortado al área: solo celdas con los 4 nodos dentro → 72 triángulos, 36 m²', () => {
    // área 6×6 (2..8) sobre una grilla 0..10: celdas con todos los nodos dentro = 6×6 = 36 → 72 triángulos
    const s = sceneToObj({ frame, grid: grillaPlana(0), area: { minX: 2, minY: 2, maxX: 8, maxY: 8 }, origin: 'local' })
    const { verts, caras } = parseObj(s)
    const terreno = caras.filter((c) => c.grupo === 'terreno')
    expect(terreno).toHaveLength(72)
    expect(areaTriObj(verts, terreno)).toBeCloseTo(36, 6)
    // origen local: la esquina SO del área queda en (0,0)
    const xs = verts.map((v) => v[0])
    expect(Math.min(...xs)).toBeCloseTo(0, 6)
  })

  it('origen UTM: los vértices del terreno son coordenadas absolutas', () => {
    const s = sceneToObj({ frame, grid: grillaPlana(0), area: { minX: 2, minY: 2, maxX: 8, maxY: 8 }, origin: 'utm' })
    const { verts } = parseObj(s)
    expect(Math.min(...verts.map((v) => v[0]))).toBeGreaterThan(100000)
  })

  it('cada edificio es un sólido cerrado: toda arista pertenece a exactamente dos caras', () => {
    const s = sceneToObj({
      frame,
      grid: grillaPlana(100),
      area: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
      origin: 'local',
      edificaciones: [
        { id: 'e', anillo: [{ x: 3, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 7 }, { x: 3, y: 7 }], huecos: [], altura: 9, alturaFuente: 'height' },
      ],
      cotaBase: () => 100,
    })
    const { verts, caras, lineas } = parseObj(s)
    // contorno del área como polilínea `l`, apoyado sobre el terreno (cota 100, nunca bajo él)
    const area = lineas.filter((l) => l.grupo === 'area')
    expect(area.length).toBeGreaterThan(0)
    expect(area.flatMap((l) => l.idx).every((i) => verts[i - 1][2] === 100)).toBe(true)
    const edif = caras.filter((c) => c.grupo === 'edificaciones')
    expect(edif.length).toBeGreaterThan(0)
    const cuenta = new Map<string, number>()
    for (const { idx } of edif)
      for (let i = 0; i < 3; i++) {
        const [u, v] = [idx[i], idx[(i + 1) % 3]].sort((a, b) => a - b)
        const k = `${u}-${v}`
        cuenta.set(k, (cuenta.get(k) ?? 0) + 1)
      }
    expect([...cuenta.values()].every((n) => n === 2)).toBe(true)
  })
})
