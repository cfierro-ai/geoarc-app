import { geocode } from './geocode'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const NOMINATIM_OK = [{ display_name: 'Temuco, Cautín, Araucanía, Chile', lat: '-38.7359', lon: '-72.5905' }]
const PHOTON_OK = {
  type: 'FeatureCollection',
  features: [
    {
      geometry: { type: 'Point', coordinates: [-72.590538, -38.7358908] },
      properties: { name: 'Temuco', county: 'Provincia de Cautín', state: 'Región de la Araucanía', country: 'Chile' },
    },
    {
      geometry: { type: 'Point', coordinates: [-72.5791543, -38.7369258] },
      properties: { name: 'Temuco', street: 'Avenida Barros Arana', housenumber: '29', city: 'Temuco', country: 'Chile' },
    },
  ],
}

/** fetch simulado: responde según el host y registra los hosts consultados. */
function fakeFetch(nominatim: () => Promise<Response>, photon: () => Promise<Response> = async () => json(PHOTON_OK)) {
  const hosts: string[] = []
  const f = (async (input: RequestInfo | URL) => {
    const host = new URL(String(input)).host
    hosts.push(host)
    return host.includes('nominatim') ? nominatim() : photon()
  }) as typeof fetch
  return { f, hosts }
}

describe('geocode: Nominatim con respaldo a Photon', () => {
  it('usa Nominatim si responde', async () => {
    const { f, hosts } = fakeFetch(async () => json(NOMINATIM_OK))
    const r = await geocode('Temuco', f)
    expect(r.provider).toBe('Nominatim')
    expect(r.results).toEqual([{ name: 'Temuco, Cautín, Araucanía, Chile', p: { lat: -38.7359, lon: -72.5905 } }])
    expect(hosts).toEqual(['nominatim.openstreetmap.org'])
  })

  it('si Nominatim limita (429), consulta Photon', async () => {
    const { f, hosts } = fakeFetch(async () => json({ error: 'rate limited' }, 429))
    const r = await geocode('Temuco', f)
    expect(r.provider).toBe('Photon')
    expect(hosts).toEqual(['nominatim.openstreetmap.org', 'photon.komoot.io'])
    expect(r.results[0]).toEqual({ name: 'Temuco, Provincia de Cautín, Región de la Araucanía, Chile', p: { lat: -38.7358908, lon: -72.590538 } })
    expect(r.results[1].name).toBe('Temuco, Avenida Barros Arana 29, Chile')
  })

  it('si Nominatim falla por red, consulta Photon', async () => {
    const { f } = fakeFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect((await geocode('Temuco', f)).provider).toBe('Photon')
  })

  it('una búsqueda sin resultados en Nominatim no es una falla: no consulta Photon', async () => {
    const { f, hosts } = fakeFetch(async () => json([]))
    const r = await geocode('zzzz', f)
    expect(r).toEqual({ provider: 'Nominatim', results: [] })
    expect(hosts).toEqual(['nominatim.openstreetmap.org'])
  })

  it('si fallan ambos, lanza un error', async () => {
    const { f } = fakeFetch(
      async () => json({}, 503),
      async () => json({}, 500),
    )
    await expect(geocode('Temuco', f)).rejects.toThrow(/Nominatim.*503.*Photon.*500/s)
  })
})
