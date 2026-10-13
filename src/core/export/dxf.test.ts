import { DxfWriter } from './dxf'
import { sceneToDxf } from './sceneDxf'
import { createLocalFrame } from '../geo/local'

/** Lector mínimo de DXF: pares (código, valor) → entidades de la sección ENTITIES. */
function parseDxf(s: string) {
  const lines = s.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  expect(lines.length % 2).toBe(0)
  const pairs: [number, string][] = []
  for (let k = 0; k < lines.length; k += 2) {
    expect(lines[k]).toMatch(/^\d+$/)
    pairs.push([+lines[k], lines[k + 1]])
  }
  const start = pairs.findIndex(([c, v], k) => c === 2 && v === 'ENTITIES' && pairs[k - 1][1] === 'SECTION')
  const ents: { type: string; g: Map<number, string[]> }[] = []
  for (let k = start + 1; pairs[k][1] !== 'ENDSEC'; k++) {
    const [c, v] = pairs[k]
    if (c === 0) ents.push({ type: v, g: new Map() })
    else {
      const e = ents[ents.length - 1]
      e.g.set(c, [...(e.g.get(c) ?? []), v])
    }
  }
  const layers = pairs.filter(([c], k) => c === 2 && pairs[k - 1][1] === 'LAYER').map(([, v]) => v)
  return { ents, layers }
}

const first = (e: { g: Map<number, string[]> }, c: number) => e.g.get(c)?.[0]

describe('DXF R12', () => {
  it('estructura válida con capas y entidades', () => {
    const s = new DxfWriter()
      .addLayer('curvas', 8)
      .polyline3d('curvas', [{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 1 }], false)
      .face3d('curvas', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 })
      .text('curvas', { x: 1, y: 2, z: 3 }, 2.5, '125', 30)
      .toString()
    expect(s).toContain('AC1009')
    expect(s).toContain('\nCURVAS\n')
    expect(s.match(/\nVERTEX\n/g)).toHaveLength(2)
    expect(s).toContain('3DFACE')
    expect(s).toContain('\nSTYLE\n2\nSTANDARD\n')
    expect(s.trim().endsWith('EOF')).toBe(true)
    const t = parseDxf(s).ents.find((e) => e.type === 'TEXT')!
    expect([first(t, 1), first(t, 40), first(t, 50), first(t, 72), first(t, 73)]).toEqual(['125', '2.500', '30.000', '1', '2'])
    expect([first(t, 11), first(t, 21), first(t, 31)]).toEqual(['1.000', '2.000', '3.000'])
  })

  it('curvas: CURVAS, CURVAS_MAESTRAS, ETIQUETAS (cota sobre las maestras) y AREA, en UTM absolutas', () => {
    const frame = createLocalFrame({ lon: -72.598, lat: -38.739 })
    const s = sceneToDxf({
      frame,
      indexInterval: 5,
      area: { minX: 0, minY: 0, maxX: 100, maxY: 60 },
      contours: [
        { level: 100, closed: false, points: [{ x: 0, y: 10 }, { x: 100, y: 10 }] },
        { level: 101, closed: false, points: [{ x: 0, y: 20 }, { x: 100, y: 20 }] },
      ],
    })
    const { ents, layers } = parseDxf(s)
    expect(layers).toEqual(['CURVAS', 'CURVAS_MAESTRAS', 'ETIQUETAS', 'AREA']) // sin lote: ni LOTE ni ENVOLVENTE

    const polys = ents.filter((e) => e.type === 'POLYLINE')
    expect(polys.map((p) => first(p, 8))).toEqual(['CURVAS_MAESTRAS', 'CURVAS', 'AREA'])

    // texto de 0,5 m (lado mayor 100 m / 160 = 0,625 → 0,5): 100 m / (40 · 0,5) = 5 rótulos «100» sobre la maestra
    const texts = ents.filter((e) => e.type === 'TEXT')
    expect(texts).toHaveLength(5)
    for (const t of texts) {
      expect([first(t, 8), first(t, 1), first(t, 40), first(t, 31), first(t, 50)]).toEqual(['ETIQUETAS', '100', '0.500', '100.000', '0.000'])
      expect(first(t, 21)).toBe((frame.originN + 10).toFixed(3))
    }
    expect(texts.map((t) => first(t, 11))).toEqual([10, 30, 50, 70, 90].map((x) => (frame.originE + x).toFixed(3)))

    // AREA: polilínea 2D cerrada (70 = 1) a cota 0, con las 4 esquinas en UTM
    const k = ents.findIndex((e) => e.type === 'POLYLINE' && first(e, 8) === 'AREA')
    expect(first(ents[k], 70)).toBe('1')
    const verts = ents.slice(k + 1, k + 5)
    expect(verts.every((v) => v.type === 'VERTEX' && first(v, 30) === '0.000')).toBe(true)
    expect(verts.map((v) => [first(v, 10), first(v, 20)])).toEqual(
      [[0, 0], [100, 0], [100, 60], [0, 60]].map(([x, y]) => [(frame.originE + x).toFixed(3), (frame.originN + y).toFixed(3)]),
    )
    expect(ents[k + 5].type).toBe('SEQEND')
  })

  it('con lote agrega LOTE', () => {
    const frame = createLocalFrame({ lon: -72.598, lat: -38.739 })
    const s = sceneToDxf({ frame, indexInterval: 5, contours: [], lot: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] })
    expect(parseDxf(s).layers).toContain('LOTE')
  })
})
