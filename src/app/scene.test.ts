import { squareRect } from '../core/dem/area'
import { PERFIL_OGUC } from '../core/normativa/perfiles'
import { defaultEdges, fmtAreaSize, TEMUCO } from './model'
import { parseScene, serializeScene, type Scene } from './scene'
import type { Contexto } from '../core/contexto/contexto'
import type { XY } from '../core/geo/local'

const scene: Scene = {
  site: TEMUCO,
  area: { minX: -120.5, minY: -40, maxX: 80, maxY: 95.25 },
  areaPolygon: null,
  contexto: null,
  demSource: 'terrarium',
  contourInterval: 5,
  indexEvery: 4,
  terrainMode: 'sitio',
  lot: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }],
  profileId: 'oguc',
  maxHeight: 10.5,
  edges: defaultEdges(3, PERFIL_OGUC),
  exportOrigin: 'utm',
}

describe('archivo .geoarc', () => {
  it('v4: guardar y abrir conserva área, lote, curvas y terreno del estudio', () => {
    const f = serializeScene(scene)
    expect(f.version).toBe(4)
    const s = parseScene(JSON.stringify(f))
    for (const k of ['minX', 'minY', 'maxX', 'maxY'] as const) expect(s.area![k]).toBeCloseTo(scene.area![k], 6)
    s.lot.forEach((p, i) => {
      expect(p.x).toBeCloseTo(scene.lot[i].x, 6)
      expect(p.y).toBeCloseTo(scene.lot[i].y, 6)
    })
    expect([s.contourInterval, s.indexEvery, s.demSource, s.terrainMode, s.notice, s.areaPolygon]).toEqual([5, 4, 'terrarium', 'sitio', undefined, null])
    expect(s.exportOrigin).toBe('utm')
  })

  it('v4: el origen de exportación se guarda; un archivo sin el campo abre en «local»', () => {
    expect(parseScene(JSON.stringify(serializeScene({ ...scene, exportOrigin: 'local' }))).exportOrigin).toBe('local')
    const { exportOrigin: _o, ...sinOrigen } = serializeScene(scene)
    void _o
    expect(parseScene(JSON.stringify(sinOrigen)).exportOrigin).toBe('local')
  })

  it('v4: el área dibujada como polígono se guarda en lon/lat y vuelve igual', () => {
    const tri = [{ x: -100, y: -40 }, { x: 80, y: -40 }, { x: -100, y: 95.25 }]
    const s = parseScene(JSON.stringify(serializeScene({ ...scene, area: { minX: -100, minY: -40, maxX: 80, maxY: 95.25 }, areaPolygon: tri })))
    expect(s.areaPolygon).toHaveLength(3)
    s.areaPolygon!.forEach((p, i) => {
      expect(p.x).toBeCloseTo(tri[i].x, 6)
      expect(p.y).toBeCloseTo(tri[i].y, 6)
    })
  })

  it('v4: el contexto (edificaciones y vías) se guarda en lon/lat y vuelve igual (~1 cm)', () => {
    const contexto: Contexto = {
      fuente: 'overpass',
      fecha: '2026-10-13T12:42:35Z',
      edificaciones: [
        {
          id: 'r21',
          anillo: [{ x: 50, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 30 }, { x: 50, y: 30 }],
          huecos: [[{ x: 60, y: 10 }, { x: 70, y: 10 }, { x: 70, y: 20 }]],
          altura: 9,
          alturaFuente: 'height',
        },
      ],
      vias: [{ id: 'w31', linea: [{ x: -20, y: -5 }, { x: 100, y: -5 }], clase: 'residential' }],
    }
    const s = parseScene(JSON.stringify(serializeScene({ ...scene, contexto })))
    const c = s.contexto!
    expect([c.fuente, c.fecha, c.edificaciones[0].id, c.edificaciones[0].altura, c.edificaciones[0].alturaFuente, c.vias[0].clase]).toEqual([
      'overpass', '2026-10-13T12:42:35Z', 'r21', 9, 'height', 'residential',
    ])
    const pares: [XY, XY][] = [
      ...contexto.edificaciones[0].anillo.map((p, i): [XY, XY] => [p, c.edificaciones[0].anillo[i]]),
      ...contexto.edificaciones[0].huecos[0].map((p, i): [XY, XY] => [p, c.edificaciones[0].huecos[0][i]]),
      ...contexto.vias[0].linea.map((p, i): [XY, XY] => [p, c.vias[0].linea[i]]),
    ]
    for (const [a, b] of pares) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(0.02)
  })

  it('v3 (sin polígono) se abre con el área rectangular', () => {
    const { areaPolygonLonLat: _p, contexto: _c, ...v4 } = serializeScene(scene)
    void _p
    void _c
    const s = parseScene(JSON.stringify({ ...v4, version: 3 }))
    expect([s.terrainMode, s.areaPolygon]).toEqual(['sitio', null])
    expect(s.area!.maxX).toBeCloseTo(80, 6)
  })

  it('v2: con lote y área, el estudio sigue sobre el terreno del sitio; sin lote, en plano', () => {
    const { terrainMode: _omit, areaPolygonLonLat: _p, contexto: _c, ...v3 } = serializeScene(scene)
    void _omit
    void _p
    void _c
    const v2 = { ...v3, version: 2 }
    expect(parseScene(JSON.stringify(v2)).terrainMode).toBe('sitio')
    expect(parseScene(JSON.stringify({ ...v2, lotLonLat: [] })).terrainMode).toBe('plano')
  })

  it('v1: el área cuadrada centrada en el sitio pasa a rectángulo; la celda manual se ignora', () => {
    const v1 = {
      format: 'geoarc', version: 1, site: TEMUCO, areaSize: 300, cell: 5, demSource: 'sintetico', contourInterval: 1,
      lotLonLat: [], profileId: 'oguc', maxHeight: 10.5, edges: [],
    }
    const s = parseScene(JSON.stringify(v1))
    expect(s.area).toEqual(squareRect(300))
    expect([s.demSource, s.indexEvery, s.terrainMode]).toEqual(['sintetico', 5, 'plano'])
  })

  it('Copernicus (requiere proxy) se abre con Terrarium y lo avisa', () => {
    const s = parseScene(JSON.stringify({ ...serializeScene(scene), demSource: 'copernicus' }))
    expect(s.demSource).toBe('terrarium')
    expect(s.notice).toMatch(/Copernicus.*proxy/)
  })

  it('rechaza archivos que no son escenas', () => {
    expect(() => parseScene('{"format":"otro"}')).toThrow('Archivo no reconocido')
    expect(() => parseScene('{"format":"geoarc","version":9}')).toThrow('Archivo no reconocido')
  })

  it('tamaño del área en metros y hectáreas', () => {
    expect(fmtAreaSize(312, 180)).toBe('312 × 180 m · 5,62 ha')
  })
})
