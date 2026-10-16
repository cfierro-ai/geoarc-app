import { TEXTURAS, texturaDe, type TexturaId } from '../model'
import { actions, useAppState } from '../store'

/** Selector de textura del GLB (Satelital / Mapa / Sin textura) con la atribución de la fuente elegida. */
export function TexturaSelector() {
  const textura = useAppState((s) => s.exportTextura)
  const info = texturaDe(textura)
  return (
    <div className="space-y-1" data-testid="textura">
      <p className="text-[11px] font-medium text-slate-600">Textura</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1" role="radiogroup" aria-label="Textura del modelo 3D">
        {TEXTURAS.map((t) => (
          <label key={t.id} className="flex items-center gap-1 text-[11px] text-slate-700">
            <input type="radio" name="textura" checked={textura === t.id} onChange={() => actions.setExportTextura(t.id as TexturaId)} />
            {t.label}
          </label>
        ))}
      </div>
      {info.atribucion && (
        <p className="text-[10px] text-slate-500" data-testid="textura-atribucion">
          {info.atribucion}
        </p>
      )}
    </div>
  )
}
