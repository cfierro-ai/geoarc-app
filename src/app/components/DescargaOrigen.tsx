import { EXPORT_ORIGINS, type ExportOrigin } from '../model'
import { actions, useAppState } from '../store'

/** Selector del origen de coordenadas de las descargas (local / UTM). Compartido por los dos módulos. */
export function OrigenSelector() {
  const origin = useAppState((s) => s.exportOrigin)
  return (
    <div className="space-y-1" data-testid="origen">
      <p className="text-xs font-medium text-slate-600">Origen de coordenadas</p>
      <div className="space-y-1" role="radiogroup" aria-label="Origen de coordenadas">
        {EXPORT_ORIGINS.map((o) => (
          <label key={o.id} className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="radio"
              name="origen"
              className="mt-0.5"
              checked={origin === o.id}
              onChange={() => actions.setExportOrigin(o.id as ExportOrigin)}
            />
            <span>
              <b className="font-medium">{o.label}</b>
              <span className="block text-slate-500">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
