import { createGrid, type HeightGrid } from '../dem/grid'
import { pointInRect } from '../dem/area'
import { aYArriba, inyectarAsset, mallaTerreno, pasoDensidad } from './glbCore'

const plano = (nx: number, ny: number): HeightGrid =>
  createGrid(nx, ny, 1, 0, 0, { source: 'plano', kind: 'plano', nominalResolutionM: 1 }, () => 0)

/** GLB mínimo (chunk JSON + chunk BIN) para probar la inyección de asset. */
function glbFalso(json: object, bin = new Uint8Array([1, 2, 3, 4, 5, 6])): ArrayBuffer {
  const js = new TextEncoder().encode(JSON.stringify(json))
  const jpad = (4 - (js.length % 4)) % 4
  const jlen = js.length + jpad
  const bpad = (4 - (bin.length % 4)) % 4
  const blen = bin.length + bpad
  const out = new ArrayBuffer(20 + jlen + 8 + blen)
  const dv = new DataView(out)
  const u = new Uint8Array(out)
  dv.setUint32(0, 0x46546c67, true)
  dv.setUint32(4, 2, true)
  dv.setUint32(8, out.byteLength, true)
  dv.setUint32(12, jlen, true)
  dv.setUint32(16, 0x4e4f534a, true)
  u.set(js, 20)
  for (let i = 0; i < jpad; i++) u[20 + js.length + i] = 0x20
  const b0 = 20 + jlen
  dv.setUint32(b0, blen, true)
  dv.setUint32(b0 + 4, 0x004e4942, true)
  u.set(bin, b0 + 8)
  return out
}

function leerJson(glb: ArrayBuffer): any {
  const dv = new DataView(glb)
  const jlen = dv.getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jlen)))
}

describe('exportador GLB (núcleo puro)', () => {
  it('ejes Z-arriba → Y-arriba: (0, 10, 5) → (0, 5, −10); la X se conserva', () => {
    expect(aYArriba({ x: 0, y: 10, z: 5 })).toEqual([0, 5, -10])
    // el ancho del área (X) se conserva ± 1 mm
    const esquinas = [{ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }, { x: 20, y: 15, z: 0 }, { x: 0, y: 15, z: 0 }]
    const xs = esquinas.map((p) => aYArriba(p)[0])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(20, 3)
  })

  it('paso de densidad: celdas objetivo en el lado mayor', () => {
    expect(pasoDensidad(plano(241, 201), 120)).toBe(2) // 240/120
    expect(pasoDensidad(plano(61, 51), 120)).toBe(1) // ya es gruesa
    expect(pasoDensidad(plano(481, 401), 120)).toBe(4)
  })

  it('malla del terreno: recortada al área, submuestreada; sobre un plano 11×11 y área 2..8 → 72 triángulos', () => {
    const g = plano(11, 11)
    const m = mallaTerreno(g, (p) => pointInRect(p, { minX: 2, minY: 2, maxX: 8, maxY: 8 }), 1)
    expect(m.tris).toHaveLength(72) // 6×6 celdas × 2
    // ningún índice fuera de rango, y todos los vértices dentro del área
    for (const t of m.tris) for (const i of t) expect(i).toBeLessThan(m.pos.length)
    expect(m.pos.every((p) => p.x >= 2 && p.x <= 8 && p.y >= 2 && p.y <= 8)).toBe(true)
    // con paso 2, muchos menos triángulos
    expect(mallaTerreno(g, () => true, 2).tris.length).toBeLessThan(mallaTerreno(g, () => true, 1).tris.length)
  })

  it('inyecta asset.copyright y generator en el GLB, conservando el chunk BIN', () => {
    const glb = inyectarAsset(glbFalso({ asset: { version: '2.0', generator: 'THREE.GLTFExporter' }, meshes: [] }), {
      generator: 'GEO·ARC',
      copyright: '© OpenStreetMap contributors; Esri',
    })
    const j = leerJson(glb)
    expect(j.asset.generator).toBe('GEO·ARC')
    expect(j.asset.copyright).toBe('© OpenStreetMap contributors; Esri')
    expect(j.asset.version).toBe('2.0')
    expect(j.meshes).toEqual([])
    // sigue siendo un GLB válido en cabecera y longitud total
    const dv = new DataView(glb)
    expect(dv.getUint32(0, true)).toBe(0x46546c67)
    expect(dv.getUint32(8, true)).toBe(glb.byteLength)
    // el chunk BIN se conservó (magic BIN presente)
    const jlen = dv.getUint32(12, true)
    expect(dv.getUint32(20 + jlen + 4, true)).toBe(0x004e4942)
  })
})
