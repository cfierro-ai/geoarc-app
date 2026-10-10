import type { LocalFrame } from '../core/geo/local'
import type { HeightGrid } from '../core/dem/grid'
import { squareRect, type Rect } from '../core/dem/area'
import { rectGrid } from '../core/dem/grid'
import { syntheticHillside } from '../core/dem/synthetic'
import { lotFromDimensions, terrainAreaForLot } from '../core/envelope/lote'
import { createAppStore } from './store'
import type { DemLoaders } from './demLoader'

/** Terrarium simulado: plano que sube 25 m de sur a norte en cualquier área (dato de 30 m). */
const terrariumPlano = (area: Rect, cell: number): HeightGrid =>
  rectGrid(area, cell, { source: 'Terrarium (simulado)', kind: 'DSM', nominalResolutionM: 30 }, (_x, y) =>
    100.3 + (25 * (y - area.minY)) / (area.maxY - area.minY),
  )

/** Cargadores simulados que registran las áreas pedidas; `pausa` retiene la respuesta hasta llamar a `soltar`. */
function loaders() {
  const calls: { src: string; area: Rect }[] = []
  const pending: (() => void)[] = []
  let pausa = false
  const make = (src: keyof DemLoaders, fn: (a: Rect, c: number) => HeightGrid) => async (_f: LocalFrame, area: Rect, cell: number) => {
    calls.push({ src, area })
    if (pausa) await new Promise<void>((r) => pending.push(r))
    return fn(area, cell)
  }
  const l: DemLoaders = {
    terrarium: make('terrarium', terrariumPlano),
    copernicus: make('copernicus', terrariumPlano),
    sintetico: make('sintetico', (a, c) => syntheticHillside(a, c)),
  }
  return {
    l,
    calls,
    pausar: () => void (pausa = true),
    soltar: () => {
      pausa = false
      pending.splice(0).forEach((r) => r())
    },
  }
}

describe('store común', () => {
  it('al cargar el terreno preselecciona la equidistancia (5 ha, 25 m de desnivel, Terrarium → 5 m)', async () => {
    const { l } = loaders()
    const st = createAppStore(l)
    await st.actions.loadTerrain({ minX: 0, minY: 0, maxX: 250, maxY: 200 })
    expect(st.getState().terrain.dem?.meta.nominalResolutionM).toBe(30)
    expect(st.getState().curvas.contourInterval).toBe(5)
  })

  it('una carga vieja que llega tarde se descarta', async () => {
    const { l, pausar, soltar } = loaders()
    const st = createAppStore(l)
    pausar()
    const vieja = st.actions.loadTerrain(squareRect(100))
    soltar()
    const nueva = st.actions.loadTerrain(squareRect(300))
    await Promise.all([vieja, nueva])
    expect(st.getState().terrain.area).toEqual(squareRect(300))
    expect(st.getState().terrain.dem!.nx).toBeGreaterThan(200)
  })

  it('cambiar de sitio limpia el terreno y el lote', async () => {
    const { l } = loaders()
    const st = createAppStore(l)
    await st.actions.loadTerrain(squareRect(200))
    st.actions.setLot(lotFromDimensions(20, 20))
    st.actions.setSite({ lon: -70.65, lat: -33.44 })
    const s = st.getState()
    expect([s.terrain.area, s.terrain.dem, s.sombras.lot.length, s.sombras.edges.length]).toEqual([null, null, 0, 0])
  })

  it('sombras en plano no descarga nada; con «Terreno del sitio» descarga alrededor del lote', async () => {
    const { l, calls } = loaders()
    const st = createAppStore(l)
    const lot = lotFromDimensions(20, 30)
    await st.actions.setLot(lot)
    expect(calls).toHaveLength(0)
    expect(st.getState().sombras.edges).toHaveLength(4)
    await st.actions.setTerrainMode('sitio')
    expect(calls).toEqual([{ src: 'terrarium', area: terrainAreaForLot(lot) }])
    expect(st.getState().terrain.dem).not.toBeNull()
  })

  it('«Terreno del sitio» reutiliza el terreno del módulo de curvas si cubre el lote', async () => {
    const { l, calls } = loaders()
    const st = createAppStore(l)
    await st.actions.loadTerrain(squareRect(200)) // dibujado en Curvas
    await st.actions.setTerrainMode('sitio')
    await st.actions.setLot(lotFromDimensions(20, 30))
    expect(calls).toHaveLength(1)
    // un lote fuera del área obliga a pedir terreno nuevo a su alrededor
    await st.actions.setLot(lotFromDimensions(20, 30, 0, { x: 300, y: 0 }))
    expect(calls).toHaveLength(2)
    expect(calls[1].area.minX).toBeGreaterThan(200)
  })

  it('un levantamiento importado pasa a ser el terreno compartido; descargar un área lo reemplaza', async () => {
    const { l, calls } = loaders()
    const st = createAppStore(l)
    const area = { minX: -30, minY: -30, maxX: 30, maxY: 30 }
    const grid = rectGrid(area, 0.25, { source: 'Levantamiento (x.dxf)', kind: 'levantamiento', nominalResolutionM: 10 }, (x) => 100 + x / 10)
    st.actions.importSurvey({ grid, area, info: { fileName: 'x.dxf', coords: 'local', layers: ['CN'], points: 10, triangles: 8, zMin: 97, zMax: 103 } })
    expect(st.getState().terrain.survey?.fileName).toBe('x.dxf')
    expect(st.getState().curvas.contourInterval).toBe(0.5) // levantamiento: mínima 0,5 m; 6 m de desnivel → 12 curvas

    // en sombras, «Levantamiento importado» usa esa grilla y no descarga nada
    await st.actions.setTerrainMode('levantamiento')
    await st.actions.setLot(lotFromDimensions(20, 20))
    expect(calls).toHaveLength(0)
    // «Terreno del sitio» no confunde el levantamiento con el terreno descargado: pide el del sitio
    await st.actions.setTerrainMode('sitio')
    expect(calls).toHaveLength(1)
    expect(st.getState().terrain.survey).toBeNull()
  })

  it('abrir una escena que usaba un levantamiento avisa y no descarga', async () => {
    const { l, calls } = loaders()
    const st = createAppStore(l)
    await st.actions.openScene({ ...st.actions.currentScene(), area: squareRect(60), surveyFile: 'plano.dxf' })
    expect(calls).toHaveLength(0)
    expect(st.getState().terrain.status.warn).toMatch(/plano\.dxf.*vuelve a importarlo/)
  })

  it('abrir una escena conserva la equidistancia guardada', async () => {
    const { l } = loaders()
    const st = createAppStore(l)
    await st.actions.openScene({ ...st.actions.currentScene(), area: squareRect(200), contourInterval: 1 })
    expect(st.getState().terrain.dem).not.toBeNull()
    expect(st.getState().curvas.contourInterval).toBe(1)
  })
})
