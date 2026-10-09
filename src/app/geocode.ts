import type { LonLat } from '../core/geo/local'

export interface GeoResult {
  name: string
  p: LonLat
}

export interface GeocodeResponse {
  provider: 'Nominatim' | 'Photon'
  results: GeoResult[]
}

const TIMEOUT_MS = 8000

async function getJson(url: string, fetchFn: typeof fetch, label: string): Promise<unknown> {
  const r = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!r.ok) throw new Error(`${label} ${r.status}`)
  return r.json()
}

async function nominatim(q: string, fetchFn: typeof fetch): Promise<GeoResult[]> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=es&q=${encodeURIComponent(q)}`
  const j = (await getJson(url, fetchFn, 'Nominatim')) as { display_name: string; lat: string; lon: string }[]
  return j.map((x) => ({ name: x.display_name, p: { lat: +x.lat, lon: +x.lon } }))
}

interface PhotonProps {
  name?: string
  street?: string
  housenumber?: string
  city?: string
  county?: string
  state?: string
  country?: string
}

/** Photon (komoot), mismo dato OSM. No admite `lang=es` (solo default/de/en/fr): se usa el idioma por defecto. */
async function photon(q: string, fetchFn: typeof fetch): Promise<GeoResult[]> {
  const url = `https://photon.komoot.io/api/?limit=5&q=${encodeURIComponent(q)}`
  const j = (await getJson(url, fetchFn, 'Photon')) as {
    features: { geometry: { coordinates: [number, number] }; properties: PhotonProps }[]
  }
  return j.features.map(({ geometry, properties: t }) => {
    const street = t.street && (t.housenumber ? `${t.street} ${t.housenumber}` : t.street)
    const parts = [t.name, street, t.city, t.county, t.state, t.country].filter((s): s is string => !!s)
    return { name: [...new Set(parts)].join(', '), p: { lon: geometry.coordinates[0], lat: geometry.coordinates[1] } }
  })
}

/**
 * Busca un lugar en Nominatim; si falla o limita (HTTP de error, red, tiempo agotado), consulta Photon.
 * Una respuesta vacía de Nominatim es un resultado válido, no una falla.
 */
export async function geocode(q: string, fetchFn: typeof fetch = fetch): Promise<GeocodeResponse> {
  try {
    return { provider: 'Nominatim', results: await nominatim(q, fetchFn) }
  } catch (e) {
    try {
      return { provider: 'Photon', results: await photon(q, fetchFn) }
    } catch (e2) {
      const msg = (x: unknown) => (x instanceof Error ? x.message : String(x))
      throw new Error(`Buscadores no disponibles (${msg(e)}; ${msg(e2)})`)
    }
  }
}
