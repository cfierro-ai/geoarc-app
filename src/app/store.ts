import { useSyncExternalStore } from 'react'
import { createLocalFrame, type LonLat, type XY } from '../core/geo/local'
import { gridStats, type HeightGrid } from '../core/dem/grid'
import { autoCell, type Rect } from '../core/dem/area'
import { preseleccionEquidistancia } from '../core/contours/escala'
import { lotBox, terrainAreaForLot } from '../core/envelope/lote'
import { PERFILES, PERFIL_OGUC, reglaPorRol, type EdgeRole } from '../core/normativa/perfiles'
import { loadDem, type DemLoaders } from './demLoader'
import {
  defaultEdges,
  isSourceAvailable,
  TEMUCO,
  type DemSourceId,
  type DemStatus,
  type EdgeSetting,
  type TerrainMode,
  type View,
} from './model'
import type { Scene } from './scene'
import type { SurveyInfo, SurveyTerrain } from '../core/survey/survey'

/**
 * Estado de la app. `site` y `terrain` son COMPARTIDOS por los dos módulos (el terreno descargado en Curvas sirve
 * al Estudio de sombras y viceversa). `curvas` y `sombras` son de cada módulo y sobreviven al cambiar de ruta.
 * Cada módulo funciona solo: ninguno necesita que el otro se haya usado antes.
 */
export interface TerrainState {
  area: Rect | null
  source: DemSourceId
  dem: HeightGrid | null
  status: DemStatus
  /** Si el terreno vigente es un levantamiento importado (DXF), su descripción; si no, null. */
  survey: SurveyInfo | null
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
  curvas: CurvasState
  sombras: SombrasState
}

export function initialState(): AppState {
  return {
    site: TEMUCO,
    terrain: { area: null, source: 'terrarium', dem: null, status: { state: 'idle' }, survey: null },
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

/** Grilla del estudio de sombras según su terreno, o null si todavía no hay (el plano se arma en el módulo). */
export function studySiteGrid(s: AppState): HeightGrid | null {
  const { terrainMode, lot } = s.sombras
  const { dem, survey } = s.terrain
  if (terrainMode === 'sitio') return dem && !survey && lot.length > 2 && gridCoversLot(dem, lot) ? dem : null
  if (terrainMode === 'levantamiento') return survey ? dem : null
  return null
}

/** ¿El estudio de sombras tiene vista 3D? Necesita lote y terreno (plano, el del sitio o el levantamiento). */
export function sombras3dAvailable(s: AppState): boolean {
  if (s.sombras.lot.length < 3) return false
  return s.sombras.terrainMode === 'plano' || !!studySiteGrid(s)
}

const rectContains = (outer: Rect, inner: Rect) =>
  inner.minX >= outer.minX && inner.minY >= outer.minY && inner.maxX <= outer.maxX && inner.maxY <= outer.maxY

export function createAppStore(loaders?: DemLoaders) {
  let state = initialState()
  const listeners = new Set<() => void>()
  /** Cada carga lleva un número; una respuesta que llega después de otra carga más nueva se descarta. */
  let seq = 0

  const set = (patch: Partial<AppState>) => {
    state = { ...state, ...patch }
    for (const l of listeners) l()
  }
  const setTerrain = (p: Partial<TerrainState>) => set({ terrain: { ...state.terrain, ...p } })
  const setCurvas = (p: Partial<CurvasState>) => set({ curvas: { ...state.curvas, ...p } })
  const setSombras = (p: Partial<SombrasState>) => set({ sombras: { ...state.sombras, ...p } })
  const profile = () => PERFILES.find((p) => p.id === state.sombras.profileId) ?? PERFIL_OGUC

  /**
   * Descarga (o genera) el terreno del área. Al llegar, preselecciona la equidistancia de Curvas según el dato y el
   * desnivel (salvo que se indique otra, p. ej. al abrir una escena).
   */
  async function loadTerrain(area: Rect, source = state.terrain.source, opts: { interval?: number; notice?: string } = {}) {
    const my = ++seq
    const frame = createLocalFrame(state.site)
    setTerrain({ area, source, dem: null, survey: null, status: { state: 'loading' } })
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
    // un levantamiento importado no es «el terreno del sitio» descargado: se pide el del sitio alrededor del lote
    if (t.dem && !t.survey && gridCoversLot(t.dem, lot)) return
    if (t.status.state === 'loading' && t.area && rectContains(t.area, lotBox(lot, 10))) return
    return loadTerrain(terrainAreaForLot(lot))
  }

  const actions = {
    loadTerrain,
    ensureSiteTerrain,
    setCurvas,
    setSombras,
    setSite(p: LonLat) {
      seq++ // descarta una descarga en curso del sitio anterior
      set({
        site: p,
        terrain: { ...state.terrain, area: null, dem: null, survey: null, status: { state: 'idle' } },
        sombras: { ...state.sombras, lot: [], edges: [] },
      })
    },
    /**
     * Un levantamiento importado pasa a ser el terreno compartido: Curvas lo dibuja y el Estudio de sombras lo usa en
     * «Levantamiento importado». Descarta cualquier descarga en curso.
     */
    importSurvey(t: SurveyTerrain) {
      seq++
      const st = gridStats(t.grid)
      setCurvas({ contourInterval: preseleccionEquidistancia(t.grid.meta, st.max - st.min).equidistancia })
      setTerrain({ area: t.area, dem: t.grid, survey: t.info, status: { state: 'idle' } })
    },
    setTerrainSource(src: DemSourceId) {
      if (!isSourceAvailable(src)) return
      setTerrain({ source: src })
      if (state.terrain.area) return loadTerrain(state.terrain.area, src)
    },
    retryTerrain() {
      setTerrain({ status: { state: 'idle' } })
      if (state.sombras.terrainMode === 'sitio' && state.sombras.lot.length > 2 && !state.terrain.area) return ensureSiteTerrain()
      if (state.terrain.area) return loadTerrain(state.terrain.area)
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
        demSource: terrain.source,
        contourInterval: curvas.contourInterval,
        indexEvery: curvas.indexEvery,
        terrainMode: sombras.terrainMode,
        lot: sombras.lot,
        profileId: sombras.profileId,
        maxHeight: sombras.maxHeight,
        edges: sombras.edges,
        surveyFile: terrain.survey?.fileName,
      }
    },
    openScene(s: Scene) {
      seq++
      // el .geoarc no lleva el DXF del levantamiento: se avisa que hay que volver a importarlo y no se descarga nada
      const notice = s.surveyFile ? `La escena usaba el levantamiento «${s.surveyFile}»: vuelve a importarlo.` : s.notice
      set({
        site: s.site,
        terrain: { area: s.area, source: s.demSource, dem: null, survey: null, status: { state: 'idle', warn: notice } },
        curvas: { ...state.curvas, contourInterval: s.contourInterval, indexEvery: s.indexEvery },
        sombras: { ...state.sombras, terrainMode: s.terrainMode, lot: s.lot, edges: s.edges, profileId: s.profileId, maxHeight: s.maxHeight },
      })
      if (s.surveyFile) return
      if (s.area) return loadTerrain(s.area, s.demSource, { interval: s.contourInterval, notice })
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
