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

/** Vértices (x, y, z) de la POLYLINE 3D de una capa: sus entidades VERTEX, en orden, hasta el SEQEND. */
function polyVerts(ents: Ent[], layer: string): { x: number; y: number; z: number }[] {
  const k = ents.findIndex((e) => e.type === 'POLYLINE' && first(e, 8) === layer)
  if (k < 0) return []
  const out: { x: number; y: number; z: number }[] = []
  for (let j = k + 1; j < ents.length && ents[j].type === 'VERTEX'; j++)
    out.push({ x: +first(ents[j], 10)!, y: +first(ents[j], 20)!, z: +first(ents[j], 30)! })
  return out
}

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
    expect(layers).toEqual(['CURVAS', 'CURVAS_MAESTRAS', 'ETIQUETAS', 'AREA', 'REFERENCIA'])

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

    // AREA: POLYLINE 3D cerrada (70 = 9), 4 esquinas en UTM a cota 0 (sin terreno)
    const area = polyVerts(ents, 'AREA')
    expect(first(onLayer(ents, 'POLYLINE', 'AREA')[0], 70)).toBe('9')
    expect(area.map((p) => p.x.toFixed(3))).toEqual([0, 100, 100, 0].map(E))
    expect(area.map((p) => p.y.toFixed(3))).toEqual([0, 0, 60, 60].map(N))
    expect(area.every((p) => p.z === 0)).toBe(true)
  })

  it('área como polígono: AREA lleva los vértices del polígono', () => {
    const tri = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 60 }]
    const s = sceneToDxf({ frame, indexInterval: 5, contours: [], area: { minX: 0, minY: 0, maxX: 100, maxY: 60 }, areaPolygon: tri })
    const area = polyVerts(parse(s).ents, 'AREA')
    expect(area.map((p) => p.x.toFixed(3))).toEqual(tri.map((p) => E(p.x)))
    expect(area.map((p) => p.y.toFixed(3))).toEqual(tri.map((p) => N(p.y)))
  })

  it('Z de AREA y REFERENCIA: apoyadas en el terreno, ningún vértice más de 1 m bajo la cota mínima', () => {
    const area = { minX: 0, minY: 0, maxX: 100, maxY: 60 }
    const s = sceneToDxf({
      frame,
      indexInterval: 5,
      area,
      contours: [],
      origin: 'local',
      demCell: 10,
      cotaBase: (p) => 200 + 0.3 * p.x + 0.1 * p.y, // cota mínima 200 en (0,0), máxima 236 en (100,60)
      demInfo: 'Terrarium · ~30 m',
    })
    const { ents } = parse(s)
    const minZ = 200
    // AREA: POLYLINE 3D densificada (más de 4 vértices), con la cota real del terreno en cada vértice
    const av = polyVerts(ents, 'AREA')
    expect(av.length).toBeGreaterThan(4)
    expect(Math.min(...av.map((p) => p.z))).toBeGreaterThanOrEqual(minZ - 1)
    expect(av.find((p) => p.x === 0 && p.y === 0)!.z).toBeCloseTo(200, 3)
    // REFERENCIA: a la cota mínima redondeada hacia abajo (elevación 38 de las LWPOLYLINE y Z 30 de los TEXT)
    const refZ = [
      ...onLayer(ents, 'LWPOLYLINE', 'REFERENCIA').map((e) => +(first(e, 38) ?? '0')),
      ...onLayer(ents, 'TEXT', 'REFERENCIA').map((e) => +(first(e, 30) ?? '0')),
    ]
    expect(refZ.length).toBeGreaterThan(0)
    expect(refZ.every((z) => z >= minZ - 1 && z <= minZ)).toBe(true)
    expect(refZ).toContain(200) // Math.floor(200)
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
    expect(layers).toEqual(['CURVAS', 'CURVAS_MAESTRAS', 'ETIQUETAS', 'AREA', 'EDIFICACIONES', 'VIALIDAD', 'ATRIBUCION', 'REFERENCIA'])

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

  it('origen local: coordenadas con la esquina SO del área en (0,0) y un TEXT con el origen en UTM', () => {
    const area = { minX: 0, minY: 0, maxX: 100, maxY: 60 }
    const s = sceneToDxf({
      frame,
      indexInterval: 5,
      area,
      origin: 'local',
      contours: [{ level: 100, closed: false, points: [{ x: 0, y: 10 }, { x: 100, y: 10 }] }],
    })
    const { ents } = parse(s)
    // AREA: esquinas locales (0,0)-(100,0)-(100,60)-(0,60), no UTM
    const av = polyVerts(ents, 'AREA')
    expect(av.map((p) => p.x.toFixed(3))).toEqual(['0.000', '100.000', '100.000', '0.000'])
    expect(av.map((p) => p.y.toFixed(3))).toEqual(['0.000', '0.000', '60.000', '60.000'])
    // la cota de las curvas es la real (100), no se desplaza
    expect(first(onLayer(ents, 'LWPOLYLINE', 'CURVAS_MAESTRAS')[0], 38)).toBe('100.000')
    // TEXT de referencia con el origen en UTM absolutas
    const ref = onLayer(ents, 'TEXT', 'REFERENCIA').map((t) => first(t, 1))
    const origen = `Origen local = UTM 18S E ${Math.round(frame.originE)} N ${Math.round(frame.originN)}`
    expect(ref).toContain(origen)
  })

  it('origen UTM (por defecto): las coordenadas son absolutas y no hay TEXT de origen', () => {
    const s = sceneToDxf({ frame, indexInterval: 5, area: { minX: 0, minY: 0, maxX: 100, maxY: 60 }, contours: [] })
    expect(polyVerts(parse(s).ents, 'AREA')[0].x.toFixed(3)).toBe(E(0))
    expect(s).not.toContain('Origen local')
  })

  it('alturas supuestas: los edificios sin dato de OSM van a la capa EDIFICACIONES_SUPUESTAS', () => {
    const s = sceneToDxf({
      frame,
      indexInterval: 5,
      contours: [],
      area: { minX: 0, minY: 0, maxX: 100, maxY: 60 },
      contexto: {
        fuente: 'overpass',
        fecha: '2026-10-15T12:00:00Z',
        edificaciones: [
          { id: 'c', anillo: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }], huecos: [], altura: 12, alturaFuente: 'height' },
          { id: 's', anillo: [{ x: 40, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 20 }, { x: 40, y: 20 }], huecos: [], altura: 3, alturaFuente: 'defecto' },
        ],
        vias: [],
      },
    })
    const { ents, layers } = parse(s)
    expect(layers).toContain('EDIFICACIONES')
    expect(layers).toContain('EDIFICACIONES_SUPUESTAS')
    expect(onLayer(ents, 'LWPOLYLINE', 'EDIFICACIONES')).toHaveLength(1) // la conocida
    expect(onLayer(ents, 'LWPOLYLINE', 'EDIFICACIONES_SUPUESTAS')).toHaveLength(1) // la supuesta
  })

  it('estudio en plano (sin terreno): LOTE y REFERENCIA, sin capas de curvas', () => {
    const s = sceneToDxf({ frame, indexInterval: 5, contours: [], lot: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] })
    expect(parse(s).layers).toEqual(['LOTE', 'REFERENCIA'])
    // el archivo queda en ASCII puro
    expect([...s].every((c) => c.charCodeAt(0) < 128)).toBe(true)
  })

  it('REFERENCIA: barra de escala (100 m en ~5 ha), flecha de norte («N»), y recuadro con GEO·ARC, elevación y fecha', () => {
    const s = sceneToDxf({
      frame,
      indexInterval: 5,
      area: { minX: 0, minY: 0, maxX: 250, maxY: 190 },
      contours: [],
      demInfo: 'Terrarium (AWS Terrain Tiles) · ~30 m',
      fecha: '2026-10-15',
    })
    const ref = onLayer(parse(s).ents, 'TEXT', 'REFERENCIA').map((t) => first(t, 1))
    expect(ref).toContain('100 m') // ~5 ha → barra de 100 m
    expect(ref).toContain('N')
    expect(ref).toContain('GEO\\U+00B7ARC \\U+00B7 unidades: metros') // «·» escapado a ASCII
    expect(ref).toContain('Elevaci\\U+00F3n: Terrarium (AWS Terrain Tiles) \\U+00B7 ~30 m')
    expect(ref).toContain('Fecha: 2026-10-15')
    // la barra de escala es una LWPOLYLINE en REFERENCIA
    expect(onLayer(parse(s).ents, 'LWPOLYLINE', 'REFERENCIA').length).toBeGreaterThan(0)
  })
})
