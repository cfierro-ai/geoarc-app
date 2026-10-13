import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createLocalFrame, type LocalFrame, type LonLat, type XY } from './core/geo/local'
import type { HeightGrid } from './core/dem/grid'
import { gridStats, sampleBilinear } from './core/dem/grid'
import { areaProblem, autoCell, dataGridLines, pointInRect, rectFromCorners, type Rect } from './core/dem/area'
import { contourLevels, isolines } from './core/contours/isolines'
import { contarNiveles, escalaConfiable, MAX_NIVELES } from './core/contours/escala'
import { computeEnvelope, prepare, suggestedCell } from './core/envelope/envelope'
import { PERFILES, PERFIL_OGUC, reglaPorRol, type EdgeRole } from './core/normativa/perfiles'
import { sceneToDxf } from './core/export/sceneDxf'
import { loadDem } from './app/demLoader'
import { defaultEdges, exampleLot, isSourceAvailable, TEMUCO, type DemSourceId, type EdgeSetting, type MapMode } from './app/model'
import { parseScene, serializeScene } from './app/scene'
import { MapView } from './app/components/MapView'
import { Scene3D } from './app/components/Scene3D'
import { Panel, type DemStatus } from './app/components/Panel'

export type View = 'mapa' | '3d'

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Quita vértices repetidos (el doble clic agrega dos clics extra en el mismo punto). */
function cleanRing(pts: XY[], tol = 0.3): XY[] {
  const out: XY[] = []
  for (const p of pts) if (!out.length || Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) > tol) out.push(p)
  while (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= tol) out.pop()
  return out
}

export default function App() {
  const [site, setSite] = useState<LonLat>(TEMUCO)
  const [area, setArea] = useState<Rect | null>(null)
  const [areaCorner, setAreaCorner] = useState<XY | null>(null)
  const [demSource, setDemSource] = useState<DemSourceId>('terrarium')
  const [dem, setDem] = useState<HeightGrid | null>(null)
  const [demStatus, setDemStatus] = useState<DemStatus>({ state: 'idle' })
  const [contourInterval, setContourInterval] = useState(1)
  const [indexEvery, setIndexEvery] = useState(5)
  const [showDataGrid, setShowDataGrid] = useState(false)
  const [lot, setLot] = useState<XY[]>([])
  const [draft, setDraft] = useState<XY[]>([])
  const [mode, setMode] = useState<MapMode>('none')
  const [profileId, setProfileId] = useState<'oguc' | 'personalizado'>('oguc')
  const [maxHeight, setMaxHeight] = useState(PERFIL_OGUC.alturaMaxima.valor)
  const [edges, setEdges] = useState<EdgeSetting[]>([])
  const [view, setView] = useState<View>('mapa')
  const [didactic, setDidactic] = useState(true)
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null)
  const [exaggeration, setExaggeration] = useState(1)

  /** Cada carga lleva un número; una respuesta que llega después de otra carga más nueva se descarta. */
  const loadSeq = useRef(0)
  /** Resolución del último dato cargado: la equidistancia sugerida solo se vuelve a preseleccionar si cambia. */
  const lastRes = useRef<number | null>(null)

  const frame = useMemo(() => createLocalFrame(site), [site])
  const profile = PERFILES.find((p) => p.id === profileId) ?? PERFIL_OGUC
  const cell = useMemo(() => (area ? autoCell(area) : null), [area])
  const indexInterval = contourInterval * indexEvery
  const shownView: View = dem ? view : 'mapa'

  const contours = useMemo(() => {
    if (!dem) return []
    const { min, max } = gridStats(dem)
    if (contarNiveles(min, max, contourInterval) > MAX_NIVELES) return []
    return isolines(dem, contourLevels(min, max, contourInterval))
  }, [dem, contourInterval])

  const dataGrid = useMemo(
    () => (showDataGrid && dem && area ? dataGridLines(area, dem.meta.nominalResolutionM) : null),
    [showDataGrid, dem, area],
  )

  const terrain = useCallback((x: number, y: number) => (dem ? sampleBilinear(dem, x, y) : NaN), [dem])

  const envInput = useMemo(() => {
    if (!dem || lot.length < 3 || edges.length !== lot.length) return null
    return { lot, rules: edges.map((e) => e.rule), maxHeight: maxHeight > 0 ? maxHeight : Infinity, terrain, cell: suggestedCell(lot) }
  }, [dem, lot, edges, maxHeight, terrain])
  const envelope = useMemo(() => (envInput ? computeEnvelope(envInput) : undefined), [envInput])
  const envCtx = useMemo(() => (envInput ? prepare(envInput) : undefined), [envInput])

  const lotOutside = !!area && lot.length > 2 && lot.some((p) => !pointInRect(p, area))

  /** Descarga (o genera) el terreno del área. Sin botón: se llama al cerrar el área, al cambiar de fuente o al abrir una escena. */
  async function load(a: Rect, src: DemSourceId, fr: LocalFrame, opts: { interval?: number; notice?: string } = {}) {
    const seq = ++loadSeq.current
    setDem(null)
    setDemStatus({ state: 'loading' })
    try {
      const r = await loadDem(src, fr, a, autoCell(a))
      if (seq !== loadSeq.current) return
      if (!Number.isFinite(gridStats(r.grid).min)) throw new Error('La fuente no devolvió datos para esta zona.')
      const res = r.grid.meta.nominalResolutionM
      if (opts.interval !== undefined) setContourInterval(opts.interval)
      else if (res !== lastRes.current) setContourInterval(escalaConfiable(res).equidistanciaMinima)
      lastRes.current = res
      setDem(r.grid)
      const warn = r.fallbackFrom ? 'Copernicus no disponible; se usó Terrarium.' : opts.notice
      setDemStatus({ state: 'idle', warn })
    } catch (e) {
      if (seq !== loadSeq.current) return
      setDemStatus({ state: 'error', msg: e instanceof Error ? e.message : String(e) })
    }
  }

  const actions = {
    setSite(p: LonLat) {
      loadSeq.current++ // descarta una descarga en curso del sitio anterior
      setSite(p)
      setArea(null)
      setAreaCorner(null)
      setDem(null)
      setLot([])
      setEdges([])
      setDraft([])
      setDemStatus({ state: 'idle' })
    },
    startArea() {
      setAreaCorner(null)
      setDraft([])
      setMode('area')
      setView('mapa')
    },
    cancelDraw() {
      setMode('none')
      setAreaCorner(null)
      setDraft([])
    },
    setDemSource(src: DemSourceId) {
      if (!isSourceAvailable(src)) return
      setDemSource(src)
      if (area) void load(area, src, frame)
    },
    retry() {
      if (area) void load(area, demSource, frame)
    },
    startLot() {
      setDraft([])
      setAreaCorner(null)
      setMode('lot')
      setView('mapa')
    },
    finishLot() {
      const ring = cleanRing(draft)
      setMode('none')
      setDraft([])
      if (ring.length >= 3) {
        setLot(ring)
        setEdges(defaultEdges(ring.length, profile))
        setSelectedEdge(null)
      }
    },
    exampleLot() {
      const l = exampleLot()
      setLot(l)
      setEdges(defaultEdges(l.length, profile))
      setSelectedEdge(null)
    },
    clearLot() {
      setLot([])
      setEdges([])
      setSelectedEdge(null)
    },
    setProfile(id: 'oguc' | 'personalizado') {
      const p = PERFILES.find((q) => q.id === id) ?? PERFIL_OGUC
      setProfileId(id)
      setMaxHeight(p.alturaMaxima.valor)
      setEdges((es) => es.map((e) => ({ role: e.role, rule: reglaPorRol(p, e.role) })))
    },
    setRole(k: number, role: EdgeRole) {
      setEdges((es) => es.map((e, i) => (i === k ? { role, rule: reglaPorRol(profile, role) } : e)))
    },
    setRule(k: number, patch: Partial<EdgeSetting['rule']>) {
      setEdges((es) => es.map((e, i) => (i === k ? { ...e, rule: { ...e.rule, ...patch } } : e)))
    },
    applyToAll(k: number) {
      setEdges((es) => es.map((e) => ({ ...e, rule: { ...e.rule, angleDeg: es[k].rule.angleDeg, startHeight: es[k].rule.startHeight } })))
    },
    exportContoursDxf() {
      const dxf = sceneToDxf({ frame, contours, indexInterval, area: area ?? undefined })
      download(`geoarc_curvas_${site.lat.toFixed(5)}_${site.lon.toFixed(5)}_UTM${frame.zone}${frame.south ? 'S' : 'N'}.dxf`, dxf, 'application/dxf')
    },
    exportDxf() {
      const dxf = sceneToDxf({ frame, contours, indexInterval, area: area ?? undefined, lot, lotZ: (p) => terrain(p.x, p.y), envelope })
      download(`geoarc_${site.lat.toFixed(5)}_${site.lon.toFixed(5)}_UTM${frame.zone}${frame.south ? 'S' : 'N'}.dxf`, dxf, 'application/dxf')
    },
    exportPng() {
      const c = document.querySelector<HTMLCanvasElement>('#geoarc-3d canvas, canvas#geoarc-3d')
      if (!c) return
      c.toBlob((b) => b && download('geoarc_vista3d.png', b, 'image/png'))
    },
    saveScene() {
      const f = serializeScene({ site, area, demSource, contourInterval, indexEvery, lot, profileId, maxHeight, edges })
      download('escena.geoarc', JSON.stringify(f, null, 2), 'application/json')
    },
    async openScene(file: File) {
      const s = parseScene(await file.text())
      loadSeq.current++
      setSite(s.site)
      setArea(s.area)
      setAreaCorner(null)
      setMode('none')
      setDemSource(s.demSource)
      setContourInterval(s.contourInterval)
      setIndexEvery(s.indexEvery)
      setProfileId(s.profileId)
      setMaxHeight(s.maxHeight)
      setLot(s.lot)
      setEdges(s.edges)
      setDem(null)
      setDemStatus({ state: 'idle', warn: s.notice })
      if (s.area) void load(s.area, s.demSource, createLocalFrame(s.site), { interval: s.contourInterval, notice: s.notice })
    },
  }

  const onPick = (p: LonLat) => {
    if (mode === 'site') {
      actions.setSite(p)
      setMode('none')
    } else if (mode === 'area') {
      const q = frame.toLocal(p)
      if (!areaCorner) return setAreaCorner(q)
      const r = rectFromCorners(areaCorner, q)
      if (areaProblem(r)) return // el aviso del mapa explica por qué; se espera otro clic
      setAreaCorner(null)
      setMode('none')
      setArea(r)
      void load(r, demSource, frame)
    } else if (mode === 'lot') setDraft((d) => [...d, frame.toLocal(p)])
  }

  // Esc cancela el dibujo en curso (área, lote o sitio)
  useEffect(() => {
    if (mode === 'none') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setMode('none')
      setAreaCorner(null)
      setDraft([])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-800">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-tight">GEO·ARC</h1>
          <span className="hidden text-xs text-slate-500 sm:inline">Envolvente normativa sobre terreno real · META|Lab</span>
        </div>
        <nav className="flex overflow-hidden rounded-md border border-slate-300 text-sm">
          {(['mapa', '3d'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              disabled={v === '3d' && !dem}
              className={`px-3 py-1 disabled:opacity-40 ${shownView === v ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}`}
            >
              {v === 'mapa' ? 'Mapa' : 'Vista 3D'}
            </button>
          ))}
        </nav>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Panel
          s={{
            site, frame, area, areaCorner, cell, demSource, dem, demStatus, contourInterval, indexEvery, showDataGrid,
            dataGridShown: !!dataGrid, lot, lotOutside, draft, mode, profile, maxHeight, edges, envelope, didactic,
            selectedEdge, exaggeration, view: shownView,
          }}
          set={{ setContourInterval, setIndexEvery, setShowDataGrid, setMode, setMaxHeight, setDidactic, setSelectedEdge, setExaggeration, setView }}
          act={actions}
        />
        <main className="relative min-h-[420px] flex-1">
          <div className={`absolute inset-0 ${shownView === 'mapa' ? '' : 'invisible'}`}>
            <MapView
              frame={frame}
              site={site}
              area={area}
              areaCorner={areaCorner}
              loading={demStatus.state === 'loading'}
              contours={contours}
              indexInterval={indexInterval}
              dataGrid={dataGrid}
              lot={lot}
              draft={draft}
              mode={mode}
              onPick={onPick}
              onFinishLot={actions.finishLot}
              visible={shownView === 'mapa'}
            />
          </div>
          {dem && (
            <div className={`absolute inset-0 ${shownView === '3d' ? 'z-10' : 'invisible'}`}>
              <Scene3D
                dem={dem}
                contours={contours}
                indexInterval={indexInterval}
                lot={lot}
                envelope={envelope}
                envCtx={envCtx}
                didactic={didactic}
                selectedEdge={selectedEdge}
                exaggeration={exaggeration}
                visible={shownView === '3d'}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
