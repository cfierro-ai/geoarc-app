import { squareRect } from '../core/dem/area'
import { PERFIL_OGUC } from '../core/normativa/perfiles'
import { defaultEdges, fmtAreaSize, TEMUCO } from './model'
import { parseScene, serializeScene, type Scene } from './scene'

const scene: Scene = {
  site: TEMUCO,
  area: { minX: -120.5, minY: -40, maxX: 80, maxY: 95.25 },
  demSource: 'terrarium',
  contourInterval: 5,
  indexEvery: 4,
  terrainMode: 'sitio',
  lot: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }],
  profileId: 'oguc',
  maxHeight: 10.5,
  edges: defaultEdges(3, PERFIL_OGUC),
}

describe('archivo .geoarc', () => {
  it('v3: guardar y abrir conserva área, lote, curvas y terreno del estudio', () => {
    const f = serializeScene(scene)
    expect(f.version).toBe(3)
    const s = parseScene(JSON.stringify(f))
    for (const k of ['minX', 'minY', 'maxX', 'maxY'] as const) expect(s.area![k]).toBeCloseTo(scene.area![k], 6)
    s.lot.forEach((p, i) => {
      expect(p.x).toBeCloseTo(scene.lot[i].x, 6)
      expect(p.y).toBeCloseTo(scene.lot[i].y, 6)
    })
    expect([s.contourInterval, s.indexEvery, s.demSource, s.terrainMode, s.notice]).toEqual([5, 4, 'terrarium', 'sitio', undefined])
  })

  it('v2: con lote y área, el estudio sigue sobre el terreno del sitio; sin lote, en plano', () => {
    const { terrainMode: _omit, ...v3 } = serializeScene(scene)
    void _omit
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
