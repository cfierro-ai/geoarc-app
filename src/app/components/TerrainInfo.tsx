import { useMemo } from 'react'
import { gridStats } from '../../core/dem/grid'
import { DEM_SOURCES, fmt, fmtNum, type DemSourceId } from '../model'
import { actions, useAppState } from '../store'
import { input, Note } from './ui'

/** Estado de la descarga del terreno compartido: cargando, error con «Reintentar», aviso. */
export function TerrainStatus() {
  const { status, source } = useAppState((s) => s.terrain)
  return (
    <>
      {status.state === 'loading' && (
        <p className="text-xs text-slate-600" data-testid="dem-cargando">
          {source === 'sintetico' ? 'Generando la ladera sintética…' : 'Descargando el terreno…'}
        </p>
      )}
      {status.state === 'error' && (
        <Note tone="error">
          {status.msg}{' '}
          <button className="underline" onClick={() => void actions.retryTerrain()}>Reintentar</button>
        </Note>
      )}
      {status.state === 'idle' && status.warn && (
        <div data-testid="dem-aviso">
          <Note tone="warn">{status.warn}</Note>
        </div>
      )}
    </>
  )
}

/** Metadatos del terreno (siempre visibles) y la advertencia de DSM. */
export function TerrainMeta() {
  const dem = useAppState((s) => s.terrain.dem)
  const st = useMemo(() => (dem ? gridStats(dem) : null), [dem])
  if (!dem || !st) return null
  return (
    <>
      <div className="rounded-md bg-slate-50 p-2 text-xs" data-testid="dem-info">
        <div>
          <b>{dem.meta.source}</b> · tipo {dem.meta.kind} · dato ~{fmtNum(dem.meta.nominalResolutionM)} m (grilla {fmtNum(dem.cell)} m)
        </div>
        <div>Cotas {fmt(st.min)} – {fmt(st.max)} m · desnivel {fmt(st.max - st.min)} m</div>
      </div>
      {dem.meta.kind === 'DSM' && (
        <Note tone="warn">
          Modelo de <b>superficie</b>: incluye copas de árboles y techos. En sitios con bosque la cota «natural» puede quedar
          10–25 m sobre el suelo real. Para proyecto, usa un levantamiento topográfico.
        </Note>
      )}
    </>
  )
}

/** «Opciones avanzadas» (plegado): fuente de elevación. El profesor normalmente no la toca. */
export function SourceOptions() {
  const source = useAppState((s) => s.terrain.source)
  return (
    <details className="rounded-md border border-slate-200 px-2 py-1 text-xs" data-testid="opciones-avanzadas">
      <summary className="cursor-pointer text-slate-600">Opciones avanzadas</summary>
      <label className="mt-1.5 block text-slate-600">
        Fuente de elevación
        <select className={input} value={source} onChange={(e) => void actions.setTerrainSource(e.target.value as DemSourceId)} aria-label="Fuente de elevación">
          {DEM_SOURCES.map((d) => (
            <option key={d.id} value={d.id} disabled={!!d.disabled}>
              {d.label}{d.disabled ? ` — ${d.disabled}` : ''}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-slate-500">{DEM_SOURCES.find((d) => d.id === source)?.hint}</p>
      <p className="mt-1 text-slate-500">
        Copernicus GLO-30 queda deshabilitado: su servidor no permite la lectura desde el navegador y hace falta un proxy.
      </p>
    </details>
  )
}
