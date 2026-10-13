import { useMemo, useState } from 'react'
import { createLocalFrame, type LonLat } from '../../core/geo/local'
import { geocode, type GeocodeResponse, type GeoResult } from '../geocode'
import { actions, useAppState } from '../store'
import type { MapMode } from '../model'
import { btn, input, Section } from './ui'

function SiteSearch({ onPick }: { onPick: (p: LonLat) => void }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<GeoResult[]>([])
  const [provider, setProvider] = useState<GeocodeResponse['provider']>()
  const [err, setErr] = useState<string>()
  const go = async () => {
    setErr(undefined)
    const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)$/)
    if (m) {
      onPick({ lat: parseFloat(m[1]), lon: parseFloat(m[2]) })
      setRes([])
      return
    }
    try {
      const r = await geocode(q)
      setRes(r.results)
      setProvider(r.provider)
      if (!r.results.length) setErr('Sin resultados.')
    } catch {
      setErr('No se pudo consultar el buscador. Ingresa coordenadas "lat, lon".')
    }
  }
  return (
    <div>
      <div className="flex gap-1">
        <input
          className={input}
          placeholder="Dirección o «lat, lon»"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go()}
        />
        <button className={btn} onClick={go}>Buscar</button>
      </div>
      {err && <p className="mt-1 text-xs text-red-700">{err}</p>}
      {res.length > 0 && (
        <ul className="mt-1 max-h-32 overflow-auto rounded border border-slate-200 bg-white text-xs">
          {res.map((r, k) => (
            <li key={k}>
              <button className="w-full px-2 py-1 text-left hover:bg-slate-100" onClick={() => (onPick(r.p), setRes([]))}>
                {r.name}
              </button>
            </li>
          ))}
          <li className="border-t border-slate-100 px-2 py-0.5 text-[10px] text-slate-400" data-testid="geocoder-attribution">
            Búsqueda: {provider === 'Photon' ? 'Photon (komoot)' : 'Nominatim'} · datos © OpenStreetMap
          </li>
        </ul>
      )}
    </div>
  )
}

/** Paso «Sitio», común a los dos módulos: el sitio es compartido. */
export function SiteSection({ mode, onPickOnMap }: { mode: MapMode; onPickOnMap: (on: boolean) => void }) {
  const site = useAppState((s) => s.site)
  const frame = useMemo(() => createLocalFrame(site), [site])
  return (
    <Section n={1} title="Sitio" done>
      <SiteSearch onPick={actions.setSite} />
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>
          {site.lat.toFixed(5)}, {site.lon.toFixed(5)} · UTM {frame.zone}
          {frame.south ? 'S' : 'N'} (EPSG:{frame.epsg})
        </span>
        <button className={btn} onClick={() => onPickOnMap(mode !== 'site')}>
          {mode === 'site' ? 'Cancelar' : 'Elegir en mapa'}
        </button>
      </div>
    </Section>
  )
}
