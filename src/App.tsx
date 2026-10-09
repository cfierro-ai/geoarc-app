import { useCallback, useMemo, useState } from 'react'
import { createLocalFrame, type LonLat, type XY } from './core/geo/local'
import type { HeightGrid } from './core/dem/grid'
import { gridStats, sampleBilinear } from './core/dem/grid'
import { contourLevels, isolines } from './core/contours/isolines'
import { computeEnvelope, prepare, suggestedCell } from './core/envelope/envelope'
import { PERFILES, PERFIL_OGUC, reglaPorRol, type EdgeRole } from './core/normativa/perfiles'
import { sceneToDxf } from './core/export/sceneDxf'
import { loadDem } from './app/demLoader'
import { defaultEdges, exampleLot, TEMUCO, type DemSourceId, type EdgeSetting, type MapMode, type SceneFile } from './app/model'
import { MapView } from './app/components/MapView'
import { Scene3D } from './app/components/Scene3D'
import { Panel } from './app/components/Panel'

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
  const [areaSize, setAreaSize] = useState(200)
  const [cell, setCell] = useState(2)
  const [demSource, setDemSource] = useState<DemSourceId>('terrarium')
  const [dem, setDem] = useState<HeightGrid | null>(null)
  const [demStatus, setDemStatus] = useState<{ state: 'idle' | 'loading' | 'error'; msg?: string; warn?: string }>({ state: 'idle' })
  const [contourInterval, setContourInterval] = useState(1)
  const [indexInterval, setIndexInterval] = useState(5)
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

  const frame = useMemo(() => createLocalFrame(site), [site])
  const profile = PERFILES.find((p) => p.id === profileId) ?? PERFIL_OGUC

  const contours = useMemo(() => {
    if (!dem) return []
    const { min, max } = gridStats(dem)
    return isolines(dem, contourLevels(min, max, contourInterval))
  }, [dem, contourInterval])

  const terrain = useCallback((x: number, y: number) => (dem ? sampleBilinear(dem, x, y) : NaN), [dem])

  const envInput = useMemo(() => {
    if (!dem || lot.length < 3 || edges.length !== lot.length) return null
    return { lot, rules: edges.map((e) => e.rule), maxHeight: maxHeight > 0 ? maxHeight : Infinity, terrain, cell: suggestedCell(lot) }
  }, [dem, lot, edges, maxHeight, terrain])
  const envelope = useMemo(() => (envInput ? computeEnvelope(envInput) : undefined), [envInput])
  const envCtx = useMemo(() => (envInput ? prepare(envInput) : undefined), [envInput])

  const actions = {
    setSite(p: LonLat) {
      setSite(p)
      setDem(null)
      setLot([])
      setEdges([])
      setDraft([])
      setDemStatus({ state: 'idle' })
    },
    async loadTerrain() {
      setDemStatus({ state: 'loading' })
      try {
        const r = await loadDem(demSource, frame, areaSize, cell)
        const st = gridStats(r.grid)
        if (!Number.isFinite(st.min)) throw new Error('La fuente no devolvió datos para esta zona.')
        setDem(r.grid)
        if (r.fallbackFrom) {
          setDemSource(r.source)
          setDemStatus({ state: 'idle', warn: 'Copernicus no disponible; se usó Terrarium.' })
        } else setDemStatus({ state: 'idle' })
      } catch (e) {
        setDemStatus({ state: 'error', msg: e instanceof Error ? e.message : String(e) })
      }
    },
    startLot() {
      setDraft([])
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
    cancelLot() {
      setMode('none')
      setDraft([])
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
    exportDxf() {
      const dxf = sceneToDxf({ frame, contours, indexInterval, lot, lotZ: (p) => terrain(p.x, p.y), envelope })
      download(`geoarc_${site.lat.toFixed(5)}_${site.lon.toFixed(5)}_UTM${frame.zone}${frame.south ? 'S' : 'N'}.dxf`, dxf, 'application/dxf')
    },
    exportPng() {
      const c = document.querySelector<HTMLCanvasElement>('#geoarc-3d canvas, canvas#geoarc-3d')
      if (!c) return
      c.toBlob((b) => b && download('geoarc_vista3d.png', b, 'image/png'))
    },
    saveScene() {
      const f: SceneFile = {
        format: 'geoarc',
        version: 1,
        site,
        areaSize,
        cell,
        demSource,
        contourInterval,
        lotLonLat: lot.map((p) => frame.toLonLat(p)),
        profileId,
        maxHeight,
        edges,
      }
      download('escena.geoarc', JSON.stringify(f, null, 2), 'application/json')
    },
    async openScene(file: File) {
      const f = JSON.parse(await file.text()) as SceneFile
      if (f.format !== 'geoarc') throw new Error('Archivo no reconocido')
      const fr = createLocalFrame(f.site)
      setSite(f.site)
      setAreaSize(f.areaSize)
      setCell(f.cell)
      setDemSource(f.demSource)
      setContourInterval(f.contourInterval)
      setProfileId(f.profileId)
      setMaxHeight(f.maxHeight)
      setLot(f.lotLonLat.map((p) => fr.toLocal(p)))
      setEdges(f.edges)
      setDem(null)
      setDemStatus({ state: 'idle', msg: 'Escena abierta. Carga el terreno para recalcular.' })
    },
  }

  const onPick = (p: LonLat) => {
    if (mode === 'site') {
      actions.setSite(p)
      setMode('none')
    } else if (mode === 'lot') setDraft((d) => [...d, frame.toLocal(p)])
  }

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
              className={`px-3 py-1 disabled:opacity-40 ${view === v ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}`}
            >
              {v === 'mapa' ? 'Mapa' : 'Vista 3D'}
            </button>
          ))}
        </nav>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Panel
          s={{
            site, frame, areaSize, cell, demSource, dem, demStatus, contourInterval, indexInterval, lot, draft, mode,
            profile, maxHeight, edges, envelope, didactic, selectedEdge, exaggeration, view,
          }}
          set={{ setAreaSize, setCell, setDemSource, setContourInterval, setIndexInterval, setMode, setMaxHeight, setDidactic, setSelectedEdge, setExaggeration, setView }}
          act={actions}
        />
        <main className="relative min-h-[420px] flex-1">
          <div className={`absolute inset-0 ${view === 'mapa' ? '' : 'invisible'}`}>
            <MapView
              frame={frame}
              site={site}
              areaSize={areaSize}
              contours={contours}
              indexInterval={indexInterval}
              lot={lot}
              draft={draft}
              mode={mode}
              onPick={onPick}
              onFinishLot={actions.finishLot}
              visible={view === 'mapa'}
            />
          </div>
          {dem && (
            <div className={`absolute inset-0 ${view === '3d' ? 'z-10' : 'invisible'}`}>
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
                visible={view === '3d'}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
