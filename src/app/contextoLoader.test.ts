import { createLocalFrame } from '../core/geo/local'
import { cargarContexto, OVERPASS_URL } from './contextoLoader'
import { OFM_STYLE_URL } from './model'

const frame = createLocalFrame({ lon: -72.5985, lat: -38.739 })
const AREA = { minX: -100, minY: -80, maxX: 100, maxY: 80 }

/** fetch simulado: responde según la URL y registra las peticiones. */
function fetchFalso(rutas: Record<string, (init?: RequestInit) => Response>) {
  const pedidas: { url: string; body?: string }[] = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    pedidas.push({ url, body: init?.body ? String(init.body) : undefined })
    const k = Object.keys(rutas).find((p) => url.startsWith(p))
    if (!k) throw new TypeError('Failed to fetch')
    return rutas[k](init)
  }) as typeof fetch
  return { f, pedidas }
}

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } })
const TILEJSON = 'https://tiles.openfreemap.org/planet'
const TILES = 'https://tiles.openfreemap.org/planet/20261011_080001_pt/'

describe('carga del contexto', () => {
  it('Overpass: consulta el área + 50 m y entrega el contexto en el marco local', async () => {
    const { f, pedidas } = fetchFalso({
      [OVERPASS_URL]: () => json({ osm3s: { timestamp_osm_base: '2026-10-13T12:42:35Z' }, elements: [] }),
    })
    const r = await cargarContexto(frame, AREA, f)
    expect(r.contexto.fuente).toBe('overpass')
    expect(r.contexto.fecha).toBe('2026-10-13T12:42:35Z')
    expect(r.aviso).toBeUndefined()
    // el bbox de la consulta cubre el área ampliada 50 m (la esquina SO del área + 50 m queda dentro)
    const q = decodeURIComponent(pedidas[0].body!.replace(/^data=/, ''))
    const [s, w, n, e] = q.match(/way\["building"\]\(([^)]+)\)/)![1].split(',').map(Number)
    const so = frame.toLonLat({ x: AREA.minX - 49, y: AREA.minY - 49 })
    const ne = frame.toLonLat({ x: AREA.maxX + 49, y: AREA.maxY + 49 })
    expect([s < so.lat, w < so.lon, n > ne.lat, e > ne.lon]).toEqual([true, true, true, true])
    const so51 = frame.toLonLat({ x: AREA.minX - 52, y: AREA.minY - 52 })
    expect(s).toBeGreaterThan(so51.lat - 1e-4) // no mucho más: ~50 m
  })

  it('si Overpass falla (429), usa las teselas de OpenFreeMap y lo avisa', async () => {
    const { f, pedidas } = fetchFalso({
      [OVERPASS_URL]: () => new Response('Too Many Requests', { status: 429 }),
      [OFM_STYLE_URL]: () => json({ sources: { openmaptiles: { type: 'vector', url: TILEJSON } } }),
      [TILES]: () => new Response(new Uint8Array(0)), // tesela vacía (válida)
      [TILEJSON]: () => json({ tiles: [`${TILES}{z}/{x}/{y}.pbf`], maxzoom: 14 }),
    })
    const r = await cargarContexto(frame, AREA, f)
    expect(r.contexto.fuente).toBe('teselas')
    expect(r.aviso).toMatch(/Overpass.*429.*teselas de OpenFreeMap/)
    expect(pedidas.filter((p) => p.url.startsWith(TILES)).every((p) => /\/14\/\d+\/\d+\.pbf$/.test(p.url))).toBe(true)
  })

  it('si fallan las dos fuentes, el error nombra ambas', async () => {
    const { f } = fetchFalso({ [OVERPASS_URL]: () => new Response('', { status: 504 }) })
    await expect(cargarContexto(frame, AREA, f)).rejects.toThrow(/Overpass.*504.*Teselas/)
  })

  it('un aviso de error de Overpass (respuesta 200 con «remark») cuenta como falla', async () => {
    const { f } = fetchFalso({
      [OVERPASS_URL]: () => json({ remark: 'runtime error: Query timed out in "query" at line 3 after 26 seconds.', elements: [] }),
    })
    await expect(cargarContexto(frame, AREA, f)).rejects.toThrow(/timed out/)
  })
})
