import { sceneToDxf } from './sceneDxf'
import { createLocalFrame } from '../geo/local'

interface Ent {
  type: string
  g: Map<number, string[]>
}
/** Lector de la sección ENTITIES de un AC1015: cada entidad con sus pares (código → valores, en orden). */
function parse(s: string): { ents: Ent[]; layers: string[] } {
  const l = s.split('\n')
  const pairs: [number, string][] = []
  for (let k = 0; k + 1 < l.length; k += 2) pairs.push([+l[k], l[k + 1]])
  const start = pairs.findIndex(([c, v], k) => c === 2 && v === 'ENTITIES' && pairs[k - 1][1] === 'SECTION')
  const end = pairs.findIndex(([c, v], k) => c === 0 && v === 'ENDSEC' && k > start)
  const ents: Ent[] = []
  for (let k = start + 1; k < end; k++) {
    const [c, v] = pairs[k]
    if (c === 0) ents.push({ type: v, g: new Map() })
    else {
      const g = ents[ents.length - 1].g
      g.set(c, [...(g.get(c) ?? []), v])
    }
  }
  // capas de usuario en orden (la tabla LAYER; se excluye la capa 0)
  const layers = [...s.matchAll(/AcDbLayerTableRecord\n\s*2\n([^\n]+)\n/g)].map((m) => m[1]).filter((x) => x !== '0')
  return { ents, layers }
}
const first = (e: Ent, c: number) => e.g.get(c)?.[0]
const all = (e: Ent, c: number) => e.g.get(c) ?? []
const onLayer = (ents: Ent[], type: string, layer: string) => ents.filter((e) => e.type === type && first(e, 8) === layer)

describe('escena → DXF 2000', () => {
  const frame = createLocalFrame({ lon: -72.598, lat: -38.739 })
  const E = (x: number) => (frame.originE + x).toFixed(3)
  const N = (y: number) => (frame.originN + y).toFixed(3)

  it('curvas: CURVAS, CURVAS_MAESTRAS (LWPOLYLINE a la cota), ETIQUETAS y AREA, en UTM absolutas', () => {
    const s = sceneToDxf({
      frame,
      indexInterval: 5,
      area: { minX: 0, minY: 0, maxX: 100, maxY: 60 },
      contours: [
        { level: 100, closed: false, points: [{ x: 0, y: 10 }, { x: 100, y: 10 }] },
        { level: 101, closed: false, points: [{ x: 0, y: 20 }, { x: 100, y: 20 }] },
      ],
    })
    expect(s).toContain('AC1015')
    const { ents, layers } = parse(s)
    expect(layers).toEqual(['CURVAS', 'CURVAS_MAESTRAS', 'ETIQUETAS', 'AREA'])

    // curva 100 → maestra (LWPOLYLINE con elevación 38 = 100); curva 101 → fina
    const maestra = onLayer(ents, 'LWPOLYLINE', 'CURVAS_MAESTRAS')
    expect(maestra).toHaveLength(1)
    expect(first(maestra[0], 38)).toBe('100.000')
    expect(first(maestra[0], 90)).toBe('2')
    expect(all(maestra[0], 10)).toEqual([E(0), E(100)])
    expect(onLayer(ents, 'LWPOLYLINE', 'CURVAS')).toHaveLength(1)

    // 5 rótulos «100» (lado 100 m / 160 = 0,5 m de texto) en ETIQUETAS
    const texts = onLayer(ents, 'TEXT', 'ETIQUETAS')
    expect(texts).toHaveLength(5)
    for (const t of texts) expect([first(t, 1), first(t, 40), first(t, 50)]).toEqual(['100', '0.500', '0.000'])
    expect(texts.map((t) => first(t, 11))).toEqual([10, 30, 50, 70, 90].map(E))

    // AREA: LWPOLYLINE cerrada (70 = 1), sin elevación (cota 0), 4 esquinas en UTM
    const area = onLayer(ents, 'LWPOLYLINE', 'AREA')[0]
    expect(first(area, 70)).toBe('1')
    expect(area.g.has(38)).toBe(false)
    expect(all(area, 10)).toEqual([0, 100, 100, 0].map(E))
    expect(all(area, 20)).toEqual([0, 0, 60, 60].map(N))
  })

  it('área como polígono: AREA lleva los vértices del polígono', () => {
    const tri = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 60 }]
    const s = sceneToDxf({ frame, indexInterval: 5, contours: [], area: { minX: 0, minY: 0, maxX: 100, maxY: 60 }, areaPolygon: tri })
    const area = onLayer(parse(s).ents, 'LWPOLYLINE', 'AREA')[0]
    expect(first(area, 90)).toBe('3')
    expect(all(area, 10)).toEqual(tri.map((p) => E(p.x)))
    expect(all(area, 20)).toEqual(tri.map((p) => N(p.y)))
  })

  it('contexto: EDIFICACIONES (huella LWPOLYLINE + muros y techo 3DFACE, sólido), VIALIDAD (3D) y atribución OSM', () => {
    const s = sceneToDxf({
      frame,
      indexInterval: 5,
      contours: [],
      area: { minX: 0, minY: 0, maxX: 100, maxY: 60 },
      contexto: {
        fuente: 'overpass',
        fecha: '2026-10-13T12:42:35Z',
        edificaciones: [
          { id: 'w1', anillo: [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 20 }, { x: 10, y: 20 }], huecos: [[{ x: 15, y: 12 }, { x: 20, y: 12 }, { x: 20, y: 18 }]], altura: 12, alturaFuente: 'pisos' },
        ],
        vias: [{ id: 'w2', linea: [{ x: 0, y: 40 }, { x: 100, y: 40 }], clase: 'residential' }],
      },
      cotaBase: (p) => 200 + p.x / 10, // sube 1 m cada 10 m al este; cota 200 en el origen
    })
    const { ents, layers } = parse(s)
    expect(layers).toEqual(['CURVAS', 'CURVAS_MAESTRAS', 'ETIQUETAS', 'AREA', 'EDIFICACIONES', 'VIALIDAD', 'ATRIBUCION'])

    // huella: exterior + patio como LWPOLYLINE cerradas a la cota base más baja (x=10 → 201)
    const huellas = onLayer(ents, 'LWPOLYLINE', 'EDIFICACIONES')
    expect(huellas).toHaveLength(2)
    for (const h of huellas) expect([first(h, 70), first(h, 38)]).toEqual(['1', '201.000'])

    // muros + techo como 3DFACE, entre la cota base (201) y base + altura (213)
    const caras = onLayer(ents, '3DFACE', 'EDIFICACIONES')
    expect(caras.length).toBeGreaterThan(10)
    const zs = caras.flatMap((c) => [first(c, 30), first(c, 31), first(c, 32), first(c, 33)].filter(Boolean).map(Number))
    expect(Math.min(...zs)).toBeCloseTo(201, 3)
    expect(Math.max(...zs)).toBeCloseTo(213, 3) // 201 + 12

    // vía: POLYLINE 3D con la cota del terreno en cada vértice (200 y 210)
    const via = onLayer(ents, 'POLYLINE', 'VIALIDAD')[0]
    expect(first(via, 70)).toBe('8')
    const k = ents.indexOf(via)
    expect([first(ents[k + 1], 30), first(ents[k + 2], 30)]).toEqual(['200.000', '210.000'])

    expect(first(onLayer(ents, 'TEXT', 'ATRIBUCION')[0], 1)).toBe('\\U+00A9 OpenStreetMap contributors (ODbL)')
  })

  it('estudio en plano (sin terreno): solo LOTE, sin capas de curvas', () => {
    const s = sceneToDxf({ frame, indexInterval: 5, contours: [], lot: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] })
    expect(parse(s).layers).toEqual(['LOTE'])
    // el archivo queda en ASCII puro
    expect([...s].every((c) => c.charCodeAt(0) < 128)).toBe(true)
  })
})
