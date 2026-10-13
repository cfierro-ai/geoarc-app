import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { LocalFrame, LonLat, XY } from '../../core/geo/local'
import type { HeightGrid } from '../../core/dem/grid'
import { gridStats } from '../../core/dem/grid'
import { gridCells, rectSize, type Rect } from '../../core/dem/area'
import { contarNiveles, escalaConfiable, MAX_NIVELES, opcionesEquidistancia } from '../../core/contours/escala'
import type { EnvelopeResult } from '../../core/envelope/envelope'
import { GOV_MAX_HEIGHT } from '../../core/envelope/envelope'
import { area, facing, outwardNormal, toCCW } from '../../core/envelope/polygon'
import { PERFILES, perfilVerificado, type EdgeRole, type PerfilNormativo } from '../../core/normativa/perfiles'
import {
  DEM_SOURCES,
  edgeColor,
  fmt,
  fmtAreaSize,
  fmtNum,
  INDEX_EVERY_OPTIONS,
  MAX_HEIGHT_COLOR,
  ROLE_LABEL,
  type DemSourceId,
  type EdgeSetting,
  type MapMode,
} from '../model'
import type { View } from '../../App'
import { geocode, type GeocodeResponse, type GeoResult } from '../geocode'

export interface DemStatus {
  state: 'idle' | 'loading' | 'error'
  msg?: string
  warn?: string
}

interface State {
  site: LonLat
  frame: LocalFrame
  area: Rect | null
  areaCorner: XY | null
  cell: number | null
  demSource: DemSourceId
  dem: HeightGrid | null
  demStatus: DemStatus
  contourInterval: number
  indexEvery: number
  showDataGrid: boolean
  /** La malla del dato está dibujada (false si se pidió pero es demasiado densa). */
  dataGridShown: boolean
  lot: XY[]
  /** Algún vértice del lote queda fuera del área de terreno. */
  lotOutside: boolean
  draft: XY[]
  mode: MapMode
  profile: PerfilNormativo
  maxHeight: number
  edges: EdgeSetting[]
  envelope?: EnvelopeResult
  didactic: boolean
  selectedEdge: number | null
  exaggeration: number
  view: View
}

interface Setters {
  setContourInterval(v: number): void
  setIndexEvery(v: number): void
  setShowDataGrid(v: boolean): void
  setMode(v: MapMode): void
  setMaxHeight(v: number): void
  setDidactic(v: boolean): void
  setSelectedEdge(v: number | null): void
  setExaggeration(v: number): void
  setView(v: View): void
}

interface Actions {
  setSite(p: LonLat): void
  startArea(): void
  cancelDraw(): void
  setDemSource(src: DemSourceId): void
  retry(): void
  startLot(): void
  finishLot(): void
  exampleLot(): void
  clearLot(): void
  setProfile(id: 'oguc' | 'personalizado'): void
  setRole(k: number, r: EdgeRole): void
  setRule(k: number, patch: Partial<EdgeSetting['rule']>): void
  applyToAll(k: number): void
  exportContoursDxf(): void
  exportDxf(): void
  exportPng(): void
  saveScene(): void
  openScene(f: File): Promise<void>
}

const btn = 'rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm hover:bg-slate-100 disabled:opacity-40'
const btnPrimary = 'rounded-md bg-slate-800 px-3 py-1 text-sm text-white hover:bg-slate-700 disabled:opacity-40'
const input = 'w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-sm'

function Section({ n, title, children, done }: { n: number; title: string; children: ReactNode; done?: boolean }) {
  return (
    <section className="border-b border-slate-200 px-4 py-3">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${done ? 'bg-emerald-600 text-white' : 'bg-slate-200'}`}>{n}</span>
        {title}
      </h2>
      <div className="space-y-2 text-sm">{children}</div>
    </section>
  )
}

function Note({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const c = tone === 'warn' ? 'border-amber-300 bg-amber-50 text-amber-900' : tone === 'error' ? 'border-red-300 bg-red-50 text-red-900' : 'border-sky-200 bg-sky-50 text-sky-900'
  return <div className={`rounded-md border px-2 py-1.5 text-xs leading-snug ${c}`}>{children}</div>
}

function Num({ value, onChange, step = 0.5, min, label }: { value: number; onChange: (v: number) => void; step?: number; min?: number; label: string }) {
  return (
    <input
      aria-label={label}
      type="number"
      className={input}
      value={Number.isFinite(value) ? value : ''}
      step={step}
      min={min}
      onChange={(e) => {
        const v = parseFloat(e.target.value)
        if (!Number.isNaN(v)) onChange(v)
      }}
    />
  )
}

const fmtEscala = (den: number) => `1:${den.toLocaleString('es-CL')}`

/**
 * Indicador de escala confiable: dónde cae el dato en la gama de escalas, de 1:200 (detalle de arquitectura) a
 * 1:250.000. A la izquierda de la marca, más detalle del que el dato tiene (precisión aparente).
 */
function EscalaDato({ resolucion }: { resolucion: number }) {
  const { denominador, equidistanciaMinima } = escalaConfiable(resolucion)
  const lo = Math.log10(200)
  const hi = Math.log10(250_000)
  const pos = (den: number) => Math.min(100, Math.max(0, ((Math.log10(den) - lo) / (hi - lo)) * 100))
  const p = pos(denominador)
  return (
    <div className="rounded-md border border-slate-200 p-2 text-xs" data-testid="escala-dato">
      <div className="flex items-baseline justify-between">
        <span className="text-slate-600">Escala confiable del dato</span>
        <b className="text-sm" data-testid="escala-valor">{fmtEscala(denominador)}</b>
      </div>
      <div className="relative mt-1.5 h-2 overflow-hidden rounded" aria-hidden>
        <div className="absolute inset-y-0 left-0 bg-amber-300" style={{ width: `${p}%` }} title="Más detalle que el dato: precisión aparente" />
        <div className="absolute inset-y-0 right-0 bg-emerald-500" style={{ left: `${p}%` }} title="Escalas que el dato sostiene" />
      </div>
      <div className="relative h-3.5 text-[10px] text-slate-400" aria-hidden>
        {[500, 5_000, 50_000].map((d) => (
          <span key={d} className="absolute -translate-x-1/2" style={{ left: `${pos(d)}%` }}>{fmtEscala(d)}</span>
        ))}
      </div>
      <p className="mt-0.5 leading-snug text-slate-600">
        Dato de ~{fmtNum(resolucion)} m: no sostiene más detalle que {fmtEscala(denominador)}.
        {denominador > 500 && <> Un plano de sitio a 1:500 pediría un dato de ~0,25 m (levantamiento).</>}
      </p>
      <p className="leading-snug text-slate-600">
        Equidistancia mínima sugerida: <b data-testid="equidistancia-sugerida">{fmtNum(equidistanciaMinima)} m</b>.
      </p>
    </div>
  )
}

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

export function Panel({ s, set, act }: { s: State; set: Setters; act: Actions }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const st = useMemo(() => (s.dem ? gridStats(s.dem) : null), [s.dem])
  const verified = perfilVerificado(s.profile)

  const lotInfo = useMemo(() => {
    if (s.lot.length < 3) return null
    const reversed = toCCW(s.lot) !== s.lot
    const sides = s.lot.map((a, k) => {
      const b = s.lot[(k + 1) % s.lot.length]
      const n0 = outwardNormal(a, b)
      const n = reversed ? { x: -n0.x, y: -n0.y } : n0
      return { len: Math.hypot(b.x - a.x, b.y - a.y), facing: facing(n) }
    })
    return { area: area(s.lot), perim: sides.reduce((t, x) => t + x.len, 0), sides }
  }, [s.lot])

  const govShare = useMemo(() => {
    const e = s.envelope
    if (!e) return []
    const counts = new Map<number, number>()
    let tot = 0
    for (let k = 0; k < e.rel.length; k++)
      if (e.rel[k] > 0) {
        counts.set(e.governing[k], (counts.get(e.governing[k]) ?? 0) + 1)
        tot++
      }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([g, c]) => ({ g, pct: (100 * c) / tot }))
  }, [s.envelope])

  const res = s.dem?.meta.nominalResolutionM
  const eqMin = res !== undefined ? escalaConfiable(res).equidistanciaMinima : undefined
  const coarseWarning = eqMin !== undefined && s.contourInterval < eqMin
  const tooMany = (e: number) => !!st && contarNiveles(st.min, st.max, e) > MAX_NIVELES
  const sourceInfo = DEM_SOURCES.find((d) => d.id === s.demSource)

  return (
    <aside className="w-full shrink-0 overflow-y-auto border-r border-slate-200 bg-white md:w-[380px]" data-testid="panel">
      <Section n={1} title="Sitio" done>
        <SiteSearch onPick={act.setSite} />
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>
            {s.site.lat.toFixed(5)}, {s.site.lon.toFixed(5)} · UTM {s.frame.zone}
            {s.frame.south ? 'S' : 'N'} (EPSG:{s.frame.epsg})
          </span>
          <button className={btn} onClick={() => (set.setMode(s.mode === 'site' ? 'none' : 'site'), set.setView('mapa'))}>
            {s.mode === 'site' ? 'Cancelar' : 'Elegir en mapa'}
          </button>
        </div>
      </Section>

      <Section n={2} title="Área y curvas de nivel" done={!!s.dem}>
        {s.mode === 'area' ? (
          <div className="flex items-center gap-2">
            <button className={btn} onClick={act.cancelDraw}>Cancelar</button>
            <span className="text-xs text-slate-500">{s.areaCorner ? 'Clic en la esquina opuesta del área.' : 'Clic en una esquina del área.'}</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button className={s.area ? btn : btnPrimary} onClick={act.startArea}>
              {s.area ? 'Redibujar área' : 'Dibujar área en el mapa'}
            </button>
            {!s.area && <span className="text-xs text-slate-500">Dos clics en esquinas opuestas. El terreno se descarga solo.</span>}
          </div>
        )}
        {s.area && s.cell !== null && (
          <p className="text-xs text-slate-600" data-testid="area-info">
            {fmtAreaSize(rectSize(s.area).w, rectSize(s.area).h)} · celda {fmtNum(s.cell)} m (
            {gridCells(s.area, s.cell).nx} × {gridCells(s.area, s.cell).ny})
          </p>
        )}
        {s.demStatus.state === 'loading' && (
          <p className="text-xs text-slate-600" data-testid="dem-cargando">
            {s.demSource === 'sintetico' ? 'Generando la ladera sintética…' : 'Descargando el terreno…'}
          </p>
        )}
        {s.demStatus.state === 'error' && (
          <Note tone="error">
            {s.demStatus.msg}{' '}
            <button className="underline" onClick={act.retry}>Reintentar</button>
          </Note>
        )}
        {s.demStatus.state === 'idle' && s.demStatus.warn && (
          <div data-testid="dem-aviso">
            <Note tone="warn">{s.demStatus.warn}</Note>
          </div>
        )}
        {s.dem && st && res !== undefined && eqMin !== undefined && (
          <>
            <div className="rounded-md bg-slate-50 p-2 text-xs" data-testid="dem-info">
              <div><b>{s.dem.meta.source}</b> · tipo {s.dem.meta.kind} · dato ~{fmtNum(res)} m (grilla {fmtNum(s.dem.cell)} m)</div>
              <div>Cotas {fmt(st.min)} – {fmt(st.max)} m · desnivel {fmt(st.max - st.min)} m</div>
            </div>
            <EscalaDato resolucion={res} />
            {s.dem.meta.kind === 'DSM' && (
              <Note tone="warn">
                Modelo de <b>superficie</b>: incluye copas de árboles y techos. En sitios con bosque la cota «natural» puede quedar
                10–25 m sobre el suelo real. Para proyecto, usa un levantamiento topográfico.
              </Note>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-600">
                Equidistancia
                <select className={input} value={s.contourInterval} onChange={(e) => set.setContourInterval(+e.target.value)} aria-label="Equidistancia">
                  {opcionesEquidistancia(eqMin).map((v) => (
                    <option key={v} value={v} disabled={tooMany(v)}>
                      {fmtNum(v)} m{v === eqMin ? ' · sugerida' : v < eqMin ? ' · aparente' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-600">
                Maestras cada
                <select className={input} value={s.indexEvery} onChange={(e) => set.setIndexEvery(+e.target.value)} aria-label="Maestras cada">
                  {INDEX_EVERY_OPTIONS.map((k) => (
                    <option key={k} value={k}>{fmtNum(s.contourInterval * k)} m (1 de {k})</option>
                  ))}
                </select>
              </label>
            </div>
            {coarseWarning && (
              <Note tone="warn">
                Curvas cada {fmtNum(s.contourInterval)} m sobre un dato de ~{fmtNum(res)} m: la precisión es <b>aparente</b>.
                La forma general es válida; el detalle, no.
              </Note>
            )}
            {tooMany(s.contourInterval) && (
              <Note tone="warn">Con esta equidistancia saldrían más de {MAX_NIVELES} curvas: elige una mayor.</Note>
            )}
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={s.showDataGrid} onChange={(e) => set.setShowDataGrid(e.target.checked)} />
              Mostrar la malla del dato en el mapa (celdas de ~{fmtNum(res)} m)
            </label>
            {s.showDataGrid && !s.dataGridShown && (
              <p className="text-xs text-slate-500">La malla es demasiado densa para dibujarla en esta área.</p>
            )}
            <button className={btn} onClick={act.exportContoursDxf}>Exportar curvas DXF (UTM)</button>
          </>
        )}
        <details className="rounded-md border border-slate-200 px-2 py-1 text-xs" data-testid="opciones-avanzadas">
          <summary className="cursor-pointer text-slate-600">Opciones avanzadas</summary>
          <label className="mt-1.5 block text-slate-600">
            Fuente de elevación
            <select className={input} value={s.demSource} onChange={(e) => act.setDemSource(e.target.value as DemSourceId)} aria-label="Fuente de elevación">
              {DEM_SOURCES.map((d) => (
                <option key={d.id} value={d.id} disabled={!!d.disabled}>
                  {d.label}{d.disabled ? ` — ${d.disabled}` : ''}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1 text-slate-500">{sourceInfo?.hint}</p>
          <p className="mt-1 text-slate-500">
            Copernicus GLO-30 queda deshabilitado: su servidor no permite la lectura desde el navegador y hace falta un proxy.
          </p>
        </details>
      </Section>

      <Section n={3} title="Lote" done={s.lot.length > 2}>
        <div className="flex flex-wrap gap-1">
          {s.mode !== 'lot' ? (
            <button className={btn} onClick={act.startLot}>Dibujar en mapa</button>
          ) : (
            <>
              <button className={btnPrimary} onClick={act.finishLot} disabled={s.draft.length < 3}>Cerrar lote ({s.draft.length})</button>
              <button className={btn} onClick={act.cancelDraw}>Cancelar</button>
            </>
          )}
          <button className={btn} onClick={act.exampleLot}>Lote de ejemplo</button>
          {s.lot.length > 0 && <button className={btn} onClick={act.clearLot}>Borrar</button>}
        </div>
        {lotInfo && (
          <p className="text-xs text-slate-600" data-testid="lot-info">
            {lotInfo.sides.length} lados · superficie {fmt(lotInfo.area)} m² · perímetro {fmt(lotInfo.perim)} m
          </p>
        )}
        {s.lotOutside && (
          <Note tone="warn">Parte del lote queda fuera del área de terreno: ahí no hay cotas. Redibuja el área para cubrirlo.</Note>
        )}
      </Section>

      <Section n={4} title="Norma" done={s.edges.length > 0}>
        <select className={input} value={s.profile.id} onChange={(e) => act.setProfile(e.target.value as 'oguc' | 'personalizado')} aria-label="Perfil normativo">
          {PERFILES.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <p className="text-xs text-slate-500">{s.profile.descripcion}</p>
        {!verified && (
          <Note tone="warn">
            Valores por defecto <b>por verificar</b> contra el texto vigente ({s.profile.anguloRasante.fuente}). Ajústalos según la norma del caso.
          </Note>
        )}
        <label className="block text-xs text-slate-600">
          Altura máxima sobre suelo natural (m) · 0 = sin límite
          <Num label="Altura máxima" value={s.maxHeight} onChange={set.setMaxHeight} step={0.5} min={0} />
        </label>
        {lotInfo && s.edges.length === s.lot.length && (
          <div className="space-y-1.5">
            {s.edges.map((e, k) => (
              <div
                key={k}
                className={`rounded-md border p-1.5 ${s.selectedEdge === k ? 'border-slate-800' : 'border-slate-200'}`}
                onMouseEnter={() => set.setSelectedEdge(k)}
                onMouseLeave={() => set.setSelectedEdge(null)}
              >
                <div className="mb-1 flex items-center gap-1.5 text-xs">
                  <span className="h-3 w-3 rounded-sm" style={{ background: edgeColor(k) }} />
                  <b>Lado {k + 1}</b>
                  <span className="text-slate-500">· {fmt(lotInfo.sides[k].len)} m · mira al {lotInfo.sides[k].facing}</span>
                  <select className="ml-auto rounded border border-slate-300 px-1 text-xs" value={e.role} onChange={(ev) => act.setRole(k, ev.target.value as EdgeRole)} aria-label={`Rol lado ${k + 1}`}>
                    {(Object.keys(ROLE_LABEL) as EdgeRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                </div>
                {e.rule.rasante && (
                  <div className="grid grid-cols-4 gap-1 text-[11px] text-slate-500">
                    <label>Ángulo°<Num label={`Ángulo lado ${k + 1}`} value={e.rule.angleDeg} step={1} min={1} onChange={(v) => act.setRule(k, { angleDeg: Math.min(89.9, v) })} /></label>
                    <label>Arranque<Num label={`Arranque lado ${k + 1}`} value={e.rule.startHeight} onChange={(v) => act.setRule(k, { startHeight: v })} /></label>
                    <label>Distanc.<Num label={`Distanciamiento lado ${k + 1}`} value={e.rule.setback} min={0} onChange={(v) => act.setRule(k, { setback: Math.max(0, v) })} /></label>
                    <label title="Distancia de la línea oficial al eje de la calle">Eje calle<Num label={`Eje lado ${k + 1}`} value={e.rule.originOffset} min={0} onChange={(v) => act.setRule(k, { originOffset: Math.max(0, v) })} /></label>
                  </div>
                )}
              </div>
            ))}
            <button className="text-xs text-slate-500 underline" onClick={() => act.applyToAll(0)}>Copiar ángulo y arranque del lado 1 a todos</button>
          </div>
        )}
      </Section>

      <Section n={5} title="Resultados" done={!!s.envelope}>
        {!s.envelope ? (
          <p className="text-xs text-slate-500">Dibuja el área (paso 2) y define el lote para calcular la envolvente.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs" data-testid="results">
              <dt className="text-slate-500">Superficie lote</dt><dd className="text-right font-medium">{fmt(s.envelope.stats.lotArea)} m²</dd>
              <dt className="text-slate-500">Huella edificable</dt><dd className="text-right font-medium">{fmt(s.envelope.stats.footprintArea)} m²</dd>
              <dt className="text-slate-500">Volumen máx. envolvente</dt><dd className="text-right font-medium" data-testid="volume">{fmt(s.envelope.stats.volume, 0)} m³</dd>
              <dt className="text-slate-500">Altura máx. alcanzable</dt><dd className="text-right font-medium">{fmt(s.envelope.stats.maxRel)} m</dd>
            </dl>
            <div>
              <p className="mb-1 text-xs text-slate-500">¿Qué restricción manda en cada parte de la huella?</p>
              <div className="flex h-3 overflow-hidden rounded">
                {govShare.map(({ g, pct }) => (
                  <div key={g} style={{ width: `${pct}%`, background: g === GOV_MAX_HEIGHT ? MAX_HEIGHT_COLOR : edgeColor(g) }} title={`${pct.toFixed(0)} %`} />
                ))}
              </div>
              <ul className="mt-1 grid grid-cols-2 text-[11px] text-slate-600">
                {govShare.map(({ g, pct }) => (
                  <li key={g} className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm" style={{ background: g === GOV_MAX_HEIGHT ? MAX_HEIGHT_COLOR : edgeColor(g) }} />
                    {g === GOV_MAX_HEIGHT ? 'Altura máxima' : `Rasante lado ${g + 1}`}: {pct.toFixed(0)} %
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        {s.dem && (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={s.didactic} onChange={(e) => set.setDidactic(e.target.checked)} /> Mostrar planos de rasante
            </label>
            <label className="flex items-center gap-1">
              Exageración vertical
              <select className="rounded border border-slate-300 px-1" value={s.exaggeration} onChange={(e) => set.setExaggeration(+e.target.value)}>
                {[1, 1.5, 2, 3].map((v) => <option key={v} value={v}>×{v}</option>)}
              </select>
            </label>
          </div>
        )}
        <div className="flex flex-wrap gap-1 pt-1">
          <button className={btn} onClick={act.exportDxf} disabled={!s.dem}>Exportar DXF (UTM)</button>
          <button className={btn} onClick={act.exportPng} disabled={!s.dem || s.view !== '3d'} title="Disponible en la vista 3D">Imagen PNG</button>
          <button className={btn} onClick={act.saveScene}>Guardar .geoarc</button>
          <button className={btn} onClick={() => fileRef.current?.click()}>Abrir .geoarc</button>
          <input
            ref={fileRef}
            type="file"
            accept=".geoarc,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) act.openScene(f).catch((err) => alert(String(err)))
              e.target.value = ''
            }}
          />
        </div>
      </Section>
      <p className="px-4 py-3 text-[11px] leading-snug text-slate-400">
        Herramienta docente. Los resultados dependen de la fuente de elevación y de los parámetros ingresados; no reemplazan un
        levantamiento topográfico ni el certificado de informaciones previas.
      </p>
    </aside>
  )
}
