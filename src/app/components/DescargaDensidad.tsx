import { DENSIDADES, type DensidadId } from '../model'
import { actions, useAppState } from '../store'

/** Selector de densidad de la malla 3D (Gruesa/Media/Fina), compartido por las descargas GLB y OBJ. */
export function DensidadSelector() {
  const d = useAppState((s) => s.exportDensidad)
  return (
    <div className="space-y-1" data-testid="densidad">
      <p className="text-xs font-medium text-slate-600">Densidad de la malla 3D (GLB y OBJ)</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1" role="radiogroup" aria-label="Densidad de la malla 3D">
        {DENSIDADES.map((o) => (
          <label key={o.id} className="flex items-center gap-1 text-xs text-slate-700" title={o.hint}>
            <input type="radio" name="densidad" checked={d === o.id} onChange={() => actions.setExportDensidad(o.id as DensidadId)} />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  )
}
