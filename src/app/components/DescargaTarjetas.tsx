import { btn, btnPrimary } from './ui'
import { OrigenSelector } from './DescargaOrigen'
import { useAppState } from '../store'

export interface TarjetaDescarga {
  titulo: string
  formato: string
  /** Contenido REAL del archivo (solo lo que va de verdad). */
  contenido: string[]
  /** Texto del botón (también su nombre accesible). */
  boton: string
  onDescargar: () => void
  disabled?: boolean
  /** Aviso (p. ej. alturas supuestas). */
  nota?: string
  destacado?: boolean
  testId: string
}

/**
 * Paso «Descargar»: selector de origen, tamaño del área y una tarjeta por formato (DXF 2000, malla OBJ).
 * Cada tarjeta declara formato, unidades (metros), origen y el contenido real del archivo. Sin prometer lo que no está.
 */
export function DescargaTarjetas({ tamano, tarjetas }: { tamano?: string; tarjetas: TarjetaDescarga[] }) {
  const origin = useAppState((s) => s.exportOrigin)
  const originTxt = origin === 'local' ? 'origen local (SO del área en 0,0; el archivo anota el origen en UTM)' : 'origen UTM absolutas'
  return (
    <>
      <OrigenSelector />
      {tamano && <p className="text-xs text-slate-600" data-testid="descarga-tamano">Área: {tamano}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {tarjetas.map((t) => (
          <div key={t.titulo} className="flex flex-col gap-1 rounded-md border border-slate-200 p-2" data-testid={t.testId}>
            <p className="text-sm font-medium text-slate-800">{t.titulo}</p>
            <p className="text-[11px] text-slate-500">{t.formato} · metros · {originTxt}</p>
            <ul className="list-disc pl-4 text-[11px] text-slate-600">
              {t.contenido.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
            {t.nota && <p className="text-[11px] text-amber-700">{t.nota}</p>}
            <button className={`${t.destacado ? btnPrimary : btn} mt-auto`} onClick={t.onDescargar} disabled={t.disabled}>{t.boton}</button>
          </div>
        ))}
      </div>
    </>
  )
}
