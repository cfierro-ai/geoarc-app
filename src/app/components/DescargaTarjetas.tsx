import type { ReactNode } from 'react'
import { btn, btnPrimary } from './ui'
import { OrigenSelector } from './DescargaOrigen'
import { DensidadSelector } from './DescargaDensidad'
import { useAppState } from '../store'

export interface TarjetaDescarga {
  titulo: string
  formato: string
  /** Contenido REAL del archivo (solo lo que va de verdad). */
  contenido: string[]
  /** Datos de la malla cuando aplica: densidad, triángulos, tamaño estimado. */
  meta?: string[]
  /** Nota permanente neutral (p. ej. con qué se abre el GLB). */
  info?: string
  /** Control propio de la tarjeta (p. ej. el selector de textura del GLB). */
  extra?: ReactNode
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
 * Paso «Descargar»: una tarjeta por formato (DXF 2000, GLB, OBJ), todas visibles. Selectores compartidos de origen y
 * densidad de la malla 3D. Cada tarjeta declara formato, unidades (metros), origen y el contenido real del archivo.
 */
export function DescargaTarjetas({ tamano, tarjetas }: { tamano?: string; tarjetas: TarjetaDescarga[] }) {
  const origin = useAppState((s) => s.exportOrigin)
  const originTxt = origin === 'local' ? 'origen local (SO del área en 0,0; el archivo anota el origen en UTM)' : 'origen UTM absolutas'
  return (
    <>
      <OrigenSelector />
      <DensidadSelector />
      {tamano && <p className="text-xs text-slate-600" data-testid="descarga-tamano">Área: {tamano}</p>}
      <div className="grid gap-2 sm:grid-cols-3">
        {tarjetas.map((t) => (
          <div key={t.titulo} className="flex flex-col gap-1 rounded-md border border-slate-200 p-2" data-testid={t.testId}>
            <p className="text-sm font-medium text-slate-800">{t.titulo}</p>
            <p className="text-[11px] text-slate-500">{t.formato} · metros · {originTxt}</p>
            <ul className="list-disc pl-4 text-[11px] text-slate-600">
              {t.contenido.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
            {t.meta && t.meta.map((m, i) => <p key={i} className="text-[11px] text-slate-500">{m}</p>)}
            {t.extra}
            {t.info && <p className="text-[11px] text-slate-500">{t.info}</p>}
            {t.nota && <p className="text-[11px] text-amber-700">{t.nota}</p>}
            <button className={`${t.destacado ? btnPrimary : btn} mt-auto`} onClick={t.onDescargar} disabled={t.disabled}>{t.boton}</button>
          </div>
        ))}
      </div>
    </>
  )
}
