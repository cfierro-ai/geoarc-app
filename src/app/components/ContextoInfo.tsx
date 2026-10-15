import type { AlturaFuente } from '../../core/contexto/contexto'
import { ATRIBUCION_OSM, conteoAlturas } from '../../core/contexto/contexto'
import { actions, useAppState } from '../store'
import { Note } from './ui'

const FUENTE: Record<'overpass' | 'teselas', string> = {
  overpass: 'OpenStreetMap (Overpass)',
  teselas: 'OpenStreetMap (teselas de OpenFreeMap)',
}

const ALTURA: Record<AlturaFuente, string> = {
  height: 'con altura en OSM',
  pisos: 'por pisos (3 m c/u)',
  defecto: 'sin dato (1 piso, 3 m)',
  tesela: 'altura de las teselas',
}

/** Estado del contexto del área (edificaciones y vías de OSM), sus capas y la atribución. */
export function ContextoPanel() {
  const ctx = useAppState((s) => s.contexto)
  const capas = useAppState((s) => s.capas)
  const d = ctx.estado === 'listo' ? ctx.datos : null
  const alturas = d
    ? (Object.keys(ALTURA) as AlturaFuente[])
        .map((k) => [k, d.edificaciones.filter((e) => e.alturaFuente === k).length] as const)
        .filter(([, n]) => n > 0)
    : []
  return (
    <div className="space-y-2" data-testid="contexto">
      {ctx.estado === 'cargando' && <p className="text-xs text-slate-600">Descargando edificaciones y vías (OpenStreetMap)…</p>}
      {ctx.estado === 'error' && (
        <Note tone="error">
          {ctx.msg}{' '}
          <button className="underline" onClick={() => void actions.retryContexto()}>Reintentar</button>
        </Note>
      )}
      {ctx.estado === 'omitido' && <Note tone="warn">{ctx.msg}</Note>}
      {d && (
        <>
          <p className="text-xs text-slate-700" data-testid="contexto-info">
            {d.edificaciones.length} edificaciones · {d.vias.length} vías · {FUENTE[d.fuente]}, {new Date(d.fecha).toLocaleDateString('es-CL')}
          </p>
          {d.edificaciones.length > 0 &&
            (() => {
              const c = conteoAlturas(d.edificaciones)
              return (
                <p className="text-[11px] text-slate-600" data-testid="contexto-resumen-alturas">
                  {c.total} {c.total === 1 ? 'edificación' : 'edificaciones'} · {c.conocida} con altura conocida
                  {c.supuesta > 0 && <>; {c.supuesta} con altura supuesta{c.supuesta3m ? ' (3 m)' : ''}</>}.
                </p>
              )
            })()}
          {alturas.length > 0 && (
            <p className="text-[11px] text-slate-500" data-testid="contexto-alturas">
              Detalle: {alturas.map(([k, n]) => `${n} ${ALTURA[k]}`).join(' · ')}.
            </p>
          )}
          {ctx.aviso && <Note tone="warn">{ctx.aviso}</Note>}
        </>
      )}
      <div className="flex gap-4 text-xs text-slate-700" role="group" aria-label="Capas del contexto">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={capas.edificaciones} onChange={(e) => actions.setCapas({ edificaciones: e.target.checked })} />
          Edificaciones
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={capas.vias} onChange={(e) => actions.setCapas({ vias: e.target.checked })} />
          Vías
        </label>
      </div>
      <p className="text-[11px] text-slate-500">
        Datos {ATRIBUCION_OSM}. Se descargan el área y 50 m alrededor; van al DXF en las capas EDIFICACIONES y VIALIDAD.
      </p>
    </div>
  )
}
