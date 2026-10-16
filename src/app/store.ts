import { useSyncExternalStore } from 'react'
import { createLocalFrame, type LonLat, type XY } from '../core/geo/local'
import { gridStats, type HeightGrid } from '../core/dem/grid'
import { autoCell, rectOfPolygon, rectSize, type Rect } from '../core/dem/area'
import { MAX_LADO_CONTEXTO, type Contexto } from '../core/contexto/contexto'
import { preseleccionEquidistancia } from '../core/contours/escala'
import { lotBox, terrainAreaForLot } from '../core/envelope/lote'
import { PERFILES, PERFIL_OGUC, reglaPorRol, type EdgeRole } from '../core/normativa/perfiles'
import { loadDem, type DemLoaders } from './demLoader'
import { cargarContexto, type ContextoLoader } from './contextoLoader'
import {
  defaultEdges,
  isSourceAvailable,
  TEMUCO,
  type DemSourceId,
  type DemStatus,
  type EdgeSetting,
  type ExportOrigin,
  type TerrainMode,
  type View,
} from './model'
import type { Scene } from './scene'

/**
 * Estado de la app. `site` y `terrain` son COMPARTIDOS por los dos módulos (el terreno descargado en Curvas sirve
 * al Estudio de sombras y viceversa). `curvas` y `sombras` son de cada módulo y sobreviven al cambiar de ruta.
 * Cada módulo funciona solo: ninguno necesita que el otro se haya usado antes.
 */
export interface TerrainState {
  /** Rectángulo de cálculo: el área dibujada, o el rectángulo envolvente del polígono. */
  area: Rect | null
  /** Polígono del área (null = el área es el rectángulo). Las curvas se recortan a él. */
  polygon: XY[] | null
  source: DemSourceId
  dem: HeightGrid | null
  status: DemStatus
}

/**
 * Contexto del área (edificaciones y vías de OSM), compartido como el terreno. Se descarga solo al definir un área
 * nueva; cambiar de fuente de elevación no lo vuelve a pedir. `area` es el área para la que se pidió.
 */
export interface ContextoState {
  estado: 'idle' | 'cargando' | 'listo' | 'error' | 'omitido'
  datos: Contexto | null
  area: Rect | null
  msg?: string
  /** Se usó el respaldo (teselas): por qué. */
  aviso?: string
}

/** Capas del contexto visibles en el mapa (y edificaciones en la vista 3D del estudio de sombras). */
export interface CapasState {
  edificaciones: boolean
  vias: boolean
}

export interface CurvasState {
  contourInterval: number
  indexEvery: number
  showDataGrid: boolean
  view: View
}

export interface SombrasState {
  terrainMode: TerrainMode
  lot: XY[]
  edges: EdgeSetting[]
  profileId: 'oguc' | 'personalizado'
  maxHeight: number
  didactic: boolean
  exaggeration: number
  view: View
}

export interface AppState {
  site: LonLat
  terrain: TerrainState
  contexto: ContextoState
  capas: CapasState
  /** Origen de las coordenadas de las descargas (compartido por los dos módulos). */
  exportOrigin: ExportOrigin
  curvas: CurvasState
  sombras: SombrasState
}

export function initialState(): AppState {
  return {
    site: TEMUCO,
    terrain: { area: null, polygon: null, source: 'terrarium', dem: null, status: { state: 'idle' } },
    contexto: { estado: 'idle', datos: null, area: null },
    capas: { edificaciones: true, vias: true },
    exportOrigin: 'local',
    curvas: { contourInterval: 5, indexEvery: 5, showDataGrid: false, view: 'mapa' },
    sombras: {
      terrainMode: 'plano',
      lot: [],
      edges: [],
      profileId: 'oguc',
      maxHeight: PERFIL_OGUC.alturaMaxima.valor,
      didactic: true,
      exaggeration: 1,
      view: 'mapa',
    },
  }
}

/** ¿La grilla cubre el lote con 10 m de holgura? Si no, el estudio de sombras pide terreno alrededor del lote. */
export function gridCoversLot(g: HeightGrid, lot: XY[]): boolean {
  const b = lotBox(lot, 10)
  return b.minX >= g.x0 && b.minY >= g.y0 && b.maxX <= g.x0 + (g.nx - 1) * g.cell && b.maxY <= g.y0 + (g.ny - 1) * g.cell
}

/** ¿El estudio de sombras tiene vista 3D? Necesita lote y terreno (plano, o el del sitio cubriendo el lote). */
export function sombras3dAvailable(s: AppState): boolean {
  const { terrainMode, lot } = s.sombras
  if (lot.length < 3) return false
  return terrainMode === 'plano' || (terrainMode === 'sitio' && !!s.terrain.dem && gridCoversLot(s.terrain.dem, lot))
}

const rectContains = (outer: Rect, inner: Rect) =>
  inner.minX >= outer.minX && inner.minY >= outer.minY && inner.maxX <= outer.maxX && inner.maxY <= outer.maxY

const sameRect = (a: Rect | null, b: Rect | null) =>
  !!a && !!b && a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY

export function createAppStore(loaders?: DemLoaders, contextoLoader: ContextoLoader = cargarContexto) {
  let state = initialState()
  const listeners = new Set<() => void>()
  /** Cada carga lleva un número; una respuesta que llega después de otra carga más nueva se descarta. */
  let seq = 0
  let ctxSeq = 0

  const set = (patch: Partial<AppState>) => {
    state = { ...state, ...patch }
    for (const l of listeners) l()
  }
  const setTerrain = (p: Partial<TerrainState>) => set({ terrain: { ...state.terrain, ...p } })
  const setCurvas = (p: Partial<CurvasState>) => set({ curvas: { ...state.curvas, ...p } })
  const setSombras = (p: Partial<SombrasState>) => set({ sombras: { ...state.sombras, ...p } })
  const setContexto = (p: Partial<ContextoState>) => set({ contexto: { ...state.contexto, ...p } })

  /** Edificaciones y vías del área (+ 50 m). No bloquea el terreno: si falla, el panel lo dice y ofrece reintentar. */
  async function loadContexto(area: Rect) {
    const my = ++ctxSeq
    const { w, h } = rectSize(area)
    if (Math.max(w, h) > MAX_LADO_CONTEXTO) {
      setContexto({ estado: 'omitido', datos: null, area, aviso: undefined, msg: `El área supera ${MAX_LADO_CONTEXTO / 1000} km por lado: no se descargan edificaciones ni vías.` })
      return
    }
    setContexto({ estado: 'cargando', datos: null, area, msg: undefined, aviso: undefined })
    try {
      const r = await contextoLoader(createLocalFrame(state.site), area)
      if (my !== ctxSeq) return
      setContexto({ estado: 'listo', datos: r.contexto, aviso: r.aviso })
    } catch (e) {
      if (my !== ctxSeq) return
      setContexto({ estado: 'error', msg: e instanceof Error ? e.message : String(e) })
    }
  }
  const profile = () => PERFILES.find((p) => p.id === state.sombras.profileId) ?? PERFIL_OGUC

  /**
   * Descarga (o genera) el terreno del área. Al llegar, preselecciona la equidistancia de Curvas según el dato y el
   * desnivel (salvo que se indique otra, p. ej. al abrir una escena). `polygon`: el área es ese polígono y `area` su
   * rectángulo envolvente; sin él, el área es el rectángulo.
   */
  async function loadTerrain(
    area: Rect,
    source = state.terrain.source,
    opts: { interval?: number; notice?: string; polygon?: XY[] | null } = {},
  ) {
    const my = ++seq
    const frame = createLocalFrame(state.site)
    setTerrain({ area, polygon: opts.polygon ?? null, source, dem: null, status: { state: 'loading' } })
    // el contexto depende solo del área: cambiar de fuente o reintentar el terreno no lo vuelve a pedir
    if (!sameRect(state.contexto.area, area)) void loadContexto(area)
    try {
      const r = await loadDem(source, frame, area, autoCell(area), loaders)
      if (my !== seq) return
      const st = gridStats(r.grid)
      if (!Number.isFinite(st.min)) throw new Error('La fuente no devolvió datos para esta zona.')
      setCurvas({ contourInterval: opts.interval ?? preseleccionEquidistancia(r.grid.meta, st.max - st.min).equidistancia })
      setTerrain({ dem: r.grid, status: { state: 'idle', warn: r.fallbackFrom ? 'Copernicus no disponible; se usó Terrarium.' : opts.notice } })
    } catch (e) {
      if (my !== seq) return
      setTerrain({ status: { state: 'error', msg: e instanceof Error ? e.message : String(e) } })
    }
  }

  /** Estudio de sombras sobre el terreno del sitio: reutiliza el terreno si cubre el lote; si no, lo pide alrededor. */
  function ensureSiteTerrain(): Promise<void> | undefined {
    const { terrainMode, lot } = state.sombras
    const t = state.terrain
    if (terrainMode !== 'sitio' || lot.length < 3 || t.status.state === 'error') return
    if (t.dem && gridCoversLot(t.dem, lot)) return
    if (t.status.state === 'loading' && t.area && rectContains(t.area, lotBox(lot, 10))) return
    return loadTerrain(terrainAreaForLot(lot))
  }

  const actions = {
    loadTerrain,
    ensureSiteTerrain,
    /** Área dibujada como polígono: se descarga su rectángulo envolvente. */
    setAreaPolygon(poly: XY[]) {
      return loadTerrain(rectOfPolygon(poly), state.terrain.source, { polygon: poly })
    },
    retryContexto() {
      if (state.contexto.area) return loadContexto(state.contexto.area)
    },
    setCapas(p: Partial<CapasState>) {
      set({ capas: { ...state.capas, ...p } })
    },
    setExportOrigin(o: ExportOrigin) {
      set({ exportOrigin: o })
    },
    setCurvas,
    setSombras,
    setSite(p: LonLat) {
      seq++ // descarta una descarga en curso del sitio anterior
      ctxSeq++
      set({
        site: p,
        terrain: { ...state.terrain, area: null, polygon: null, dem: null, status: { state: 'idle' } },
        contexto: { estado: 'idle', datos: null, area: null },
        sombras: { ...state.sombras, lot: [], edges: [] },
      })
    },
    setTerrainSource(src: DemSourceId) {
      if (!isSourceAvailable(src)) return
      setTerrain({ source: src })
      if (state.terrain.area) return loadTerrain(state.terrain.area, src, { polygon: state.terrain.polygon })
    },
    retryTerrain() {
      setTerrain({ status: { state: 'idle' } })
      if (state.sombras.terrainMode === 'sitio' && state.sombras.lot.length > 2 && !state.terrain.area) return ensureSiteTerrain()
      if (state.terrain.area) return loadTerrain(state.terrain.area, undefined, { polygon: state.terrain.polygon })
    },
    setTerrainMode(mode: TerrainMode) {
      setSombras({ terrainMode: mode })
      return ensureSiteTerrain()
    },
    setLot(lot: XY[]) {
      setSombras({ lot, edges: defaultEdges(lot.length, profile()) })
      return ensureSiteTerrain()
    },
    clearLot() {
      setSombras({ lot: [], edges: [] })
    },
    setProfile(id: 'oguc' | 'personalizado') {
      const p = PERFILES.find((q) => q.id === id) ?? PERFIL_OGUC
      setSombras({
        profileId: id,
        maxHeight: p.alturaMaxima.valor,
        edges: state.sombras.edges.map((e) => ({ role: e.role, rule: reglaPorRol(p, e.role) })),
      })
    },
    setRole(k: number, role: EdgeRole) {
      setSombras({ edges: state.sombras.edges.map((e, i) => (i === k ? { role, rule: reglaPorRol(profile(), role) } : e)) })
    },
    setRule(k: number, patch: Partial<EdgeSetting['rule']>) {
      setSombras({ edges: state.sombras.edges.map((e, i) => (i === k ? { ...e, rule: { ...e.rule, ...patch } } : e)) })
    },
    applyToAll(k: number) {
      const src = state.sombras.edges[k].rule
      setSombras({ edges: state.sombras.edges.map((e) => ({ ...e, rule: { ...e.rule, angleDeg: src.angleDeg, startHeight: src.startHeight } })) })
    },
    currentScene(): Scene {
      const { site, terrain, curvas, sombras } = state
      return {
        site,
        area: terrain.area,
        areaPolygon: terrain.polygon,
        contexto: state.contexto.estado === 'listo' ? state.contexto.datos : null,
        demSource: terrain.source,
        contourInterval: curvas.contourInterval,
        indexEvery: curvas.indexEvery,
        terrainMode: sombras.terrainMode,
        lot: sombras.lot,
        profileId: sombras.profileId,
        maxHeight: sombras.maxHeight,
        edges: sombras.edges,
        exportOrigin: state.exportOrigin,
      }
    },
    openScene(s: Scene) {
      seq++
      ctxSeq++
      set({
        // el contexto guardado se usa tal cual: no se vuelve a descargar
        contexto: s.contexto && s.area ? { estado: 'listo', datos: s.contexto, area: s.area } : { estado: 'idle', datos: null, area: null },
        exportOrigin: s.exportOrigin,
        site: s.site,
        terrain: { area: s.area, polygon: s.areaPolygon, source: s.demSource, dem: null, status: { state: 'idle', warn: s.notice } },
        curvas: { ...state.curvas, contourInterval: s.contourInterval, indexEvery: s.indexEvery },
        sombras: { ...state.sombras, terrainMode: s.terrainMode, lot: s.lot, edges: s.edges, profileId: s.profileId, maxHeight: s.maxHeight },
      })
      if (s.area) return loadTerrain(s.area, s.demSource, { interval: s.contourInterval, notice: s.notice, polygon: s.areaPolygon })
      return ensureSiteTerrain()
    },
  }

  return {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    actions,
  }
}

export type AppStore = ReturnType<typeof createAppStore>

export const appStore = createAppStore()
export const actions = appStore.actions

/** Lee una parte del estado. El selector debe devolver algo que ya existe en el estado (no un objeto nuevo). */
export function useAppState<T>(sel: (s: AppState) => T): T {
  return useSyncExternalStore(appStore.subscribe, () => sel(appStore.getState()))
}
