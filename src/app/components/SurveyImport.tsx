import { useMemo, useRef, useState } from 'react'
import { createLocalFrame } from '../../core/geo/local'
import { defaultSurveyLayers, readSurveyDxf, type SurveyDrawing } from '../../core/survey/dxfRead'
import { looksLikeSiteUtm, surveyToGrid, type SurveyCoords } from '../../core/survey/survey'
import { fmt, fmtNum } from '../model'
import { actions, useAppState } from '../store'
import { btn, btnPrimary, Note } from './ui'

/**
 * Importar un levantamiento topográfico DXF como terreno compartido (lo usan los dos módulos).
 * Informa capas, cantidad de entidades y rango de cotas; permite elegir capas y el sistema de coordenadas.
 */
export function SurveyImport() {
  const site = useAppState((s) => s.site)
  const survey = useAppState((s) => s.terrain.survey)
  const frame = useMemo(() => createLocalFrame(site), [site])
  const [file, setFile] = useState<{ name: string; drawing: SurveyDrawing } | null>(null)
  const [layers, setLayers] = useState<string[]>([])
  const [coords, setCoords] = useState<SurveyCoords>('local')
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const onFile = async (f: File) => {
    setErr(undefined)
    try {
      const d = readSurveyDxf(await f.text())
      if (!d.features.length) throw new Error('El DXF no tiene entidades con cota (LWPOLYLINE, POLYLINE, LINE o POINT) en espacio modelo.')
      setFile({ name: f.name, drawing: d })
      setLayers(defaultSurveyLayers(d))
      setCoords('local')
    } catch (e) {
      setFile(null)
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const use = () => {
    if (!file) return
    setBusy(true)
    setErr(undefined)
    // un cuadro para que el panel muestre «Procesando…» antes del cálculo (sincrónico)
    requestAnimationFrame(() => {
      try {
        actions.importSurvey(surveyToGrid(file.drawing, { fileName: file.name, coords, layers, frame }))
        setFile(null)
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    })
  }

  const d = file?.drawing
  const ignored = d ? Object.entries(d.ignored) : []
  const utmHint = d ? looksLikeSiteUtm(d, frame) : false

  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-2 text-xs" data-testid="levantamiento">
      <input
        ref={inputRef}
        type="file"
        accept=".dxf"
        className="hidden"
        data-testid="importar-dxf"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onFile(f)
          e.target.value = ''
        }}
      />
      {survey && !d && (
        <p className="text-slate-700" data-testid="levantamiento-activo">
          Levantamiento en uso: <b>{survey.fileName}</b> · {fmtNum(survey.points, 0)} puntos · cotas {fmt(survey.zMin)} – {fmt(survey.zMax)} m ·
          coordenadas {survey.coords === 'utm' ? 'UTM del sitio' : 'locales'}
        </p>
      )}
      {!d && (
        <div className="flex flex-wrap items-center gap-2">
          <button className={btn} onClick={() => inputRef.current?.click()}>
            {survey ? 'Importar otro DXF…' : 'Importar levantamiento DXF…'}
          </button>
          {!survey && <span className="text-slate-500">Curvas o puntos con cota, en metros.</span>}
        </div>
      )}
      {d && (
        <>
          <p className="text-slate-700">
            <b>{file.name}</b> · cotas {fmt(d.zMin)} – {fmt(d.zMax)} m
          </p>
          <table className="w-full text-left" data-testid="levantamiento-capas">
            <thead className="text-slate-500">
              <tr><th className="font-normal">Capa</th><th className="font-normal">Entidades</th><th className="font-normal">Cotas (m)</th></tr>
            </thead>
            <tbody>
              {d.layers.map((l) => (
                <tr key={l.name}>
                  <td>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={layers.includes(l.name)}
                        onChange={(e) => setLayers((ls) => (e.target.checked ? [...ls, l.name] : ls.filter((x) => x !== l.name)))}
                        aria-label={`Usar capa ${l.name}`}
                      />
                      {l.name}
                    </label>
                  </td>
                  <td>{l.entities}</td>
                  <td>{l.zMin === l.zMax ? fmt(l.zMin) : `${fmt(l.zMin)} – ${fmt(l.zMax)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {ignored.length > 0 && (
            <p className="text-slate-500">Ignorado: {ignored.map(([t, n]) => `${n} ${t}`).join(', ')}.</p>
          )}
          <fieldset className="space-y-0.5">
            <legend className="text-slate-600">Coordenadas del dibujo</legend>
            <label className="flex items-center gap-1">
              <input type="radio" name="coords" checked={coords === 'local'} onChange={() => setCoords('local')} />
              Locales: centrar el dibujo en el sitio
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="coords" checked={coords === 'utm'} onChange={() => setCoords('utm')} />
              UTM del sitio (huso {frame.zone}{frame.south ? 'S' : 'N'})
            </label>
          </fieldset>
          {utmHint && coords === 'local' && <Note>Las coordenadas parecen UTM del huso {frame.zone}{frame.south ? 'S' : 'N'}, cerca del sitio: puedes usar «UTM del sitio».</Note>}
          <div className="flex gap-1">
            <button className={btnPrimary} onClick={use} disabled={!layers.length || busy}>{busy ? 'Procesando…' : 'Usar como terreno'}</button>
            <button className={btn} onClick={() => setFile(null)}>Cancelar</button>
          </div>
        </>
      )}
      {err && <Note tone="error">{err}</Note>}
    </div>
  )
}
