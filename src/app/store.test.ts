import type { LocalFrame } from '../core/geo/local'
import type { HeightGrid } from '../core/dem/grid'
import { squareRect, type Rect } from '../core/dem/area'
import { rectGrid } from '../core/dem/grid'
import { syntheticHillside } from '../core/dem/synthetic'
import { lotFromDimensions, terrainAreaForLot } from '../core/envelope/lote'
import { createAppStore } from './store'
import type { DemLoaders } from './demLoader'
import type { ContextoLoader } from './contextoLoader'
import type { Contexto } from '../core/contexto/contexto'

/** Terrarium simulado: plano que sube 25 m de sur a norte en cualquier área (dato de 30 m). */
const terrariumPlano = (area: Rect, cell: number): HeightGrid =>
  rectGrid(area, cell, { source: 'Terrarium (simulado)', kind: 'DSM', nominalResolutionM: 30 }, (_x, y) =>
    100.3 + (25 * (y - area.minY)) / (area.maxY - area.minY),
  )

const CTX: Contexto = {
  fuente: 'overpass',
  fecha: '2026-10-13T12:00:00Z',
  edificaciones: [{ id: 'w1', anillo: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], huecos: [], altura: 6, alturaFuente: 'pisos' }],
  vias: [],
}

/** Contexto simulado que registra las áreas pedidas (o falla con `error`). */
function ctxFalso(error?: string) {
  const areas: Rect[] = []
  const load: ContextoLoader = async (_f, area) => {
    areas.push(area)
    if (error) throw new Error(error)
    return { contexto: CTX }
  }
  return { load, areas }
}

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
    const st = createAppStore(l, ctxFalso().load)
    await st.actions.loadTerrain({ minX: 0, minY: 0, maxX: 250, maxY: 200 })
    expect(st.getState().terrain.dem?.meta.nominalResolutionM).toBe(30)
    expect(st.getState().curvas.contourInterval).toBe(5)
  })

  it('una carga vieja que llega tarde se descarta', async () => {
    const { l, pausar, soltar } = loaders()
    const st = createAppStore(l, ctxFalso().load)
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
    const st = createAppStore(l, ctxFalso().load)
    await st.actions.loadTerrain(squareRect(200))
    st.actions.setLot(lotFromDimensions(20, 20))
    st.actions.setSite({ lon: -70.65, lat: -33.44 })
    const s = st.getState()
    expect([s.terrain.area, s.terrain.dem, s.sombras.lot.length, s.sombras.edges.length]).toEqual([null, null, 0, 0])
  })

  it('sombras en plano no descarga nada; con «Terreno del sitio» descarga alrededor del lote', async () => {
    const { l, calls } = loaders()
    const st = createAppStore(l, ctxFalso().load)
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
    const st = createAppStore(l, ctxFalso().load)
    await st.actions.loadTerrain(squareRect(200)) // dibujado en Curvas
    await st.actions.setTerrainMode('sitio')
    await st.actions.setLot(lotFromDimensions(20, 30))
    expect(calls).toHaveLength(1)
    // un lote fuera del área obliga a pedir terreno nuevo a su alrededor
    await st.actions.setLot(lotFromDimensions(20, 30, 0, { x: 300, y: 0 }))
    expect(calls).toHaveLength(2)
    expect(calls[1].area.minX).toBeGreaterThan(200)
  })

  it('área como polígono: se descarga su rectángulo envolvente y el polígono sobrevive a cambiar de fuente', async () => {
    const { l, calls } = loaders()
    const st = createAppStore(l, ctxFalso().load)
    const tri = [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 0, y: 90 }]
    await st.actions.setAreaPolygon(tri)
    expect(calls).toEqual([{ src: 'terrarium', area: { minX: 0, minY: 0, maxX: 120, maxY: 90 } }])
    expect(st.getState().terrain.polygon).toEqual(tri)
    await st.actions.setTerrainSource('sintetico')
    expect(st.getState().terrain.polygon).toEqual(tri)
    // un rectángulo nuevo reemplaza al polígono
    await st.actions.loadTerrain(squareRect(100))
    expect(st.getState().terrain.polygon).toBeNull()
  })

  it('el estudio de sombras que descarga alrededor del lote deja un área rectangular (sin el polígono de Curvas)', async () => {
    const { l } = loaders()
    const st = createAppStore(l, ctxFalso().load)
    await st.actions.setAreaPolygon([{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 0, y: 60 }])
    await st.actions.setTerrainMode('sitio')
    await st.actions.setLot(lotFromDimensions(20, 30, 0, { x: 300, y: 0 }))
    expect(st.getState().terrain.polygon).toBeNull()
  })

  it('al cerrar el área se descarga el contexto; cambiar de fuente no lo vuelve a pedir', async () => {
    const { l } = loaders()
    const ctx = ctxFalso()
    const st = createAppStore(l, ctx.load)
    await st.actions.loadTerrain(squareRect(200))
    await vi.waitFor(() => expect(st.getState().contexto.estado).toBe('listo'))
    expect(ctx.areas).toEqual([squareRect(200)])
    expect(st.getState().contexto.datos?.edificaciones).toHaveLength(1)
    await st.actions.setTerrainSource('sintetico')
    expect(ctx.areas).toHaveLength(1)
    // otra área sí
    await st.actions.setAreaPolygon([{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 0, y: 90 }])
    expect(ctx.areas).toHaveLength(2)
  })

  it('un área de más de 3 km por lado no descarga contexto y lo dice', async () => {
    const { l } = loaders()
    const ctx = ctxFalso()
    const st = createAppStore(l, ctx.load)
    await st.actions.loadTerrain({ minX: 0, minY: 0, maxX: 3500, maxY: 500 })
    expect(ctx.areas).toHaveLength(0)
    expect(st.getState().contexto.estado).toBe('omitido')
    expect(st.getState().contexto.msg).toMatch(/3 km/)
  })

  it('si el contexto falla, el terreno igual carga; «reintentar» lo vuelve a pedir', async () => {
    const { l } = loaders()
    const ctx = ctxFalso('Overpass respondió 429')
    const st = createAppStore(l, ctx.load)
    await st.actions.loadTerrain(squareRect(200))
    await vi.waitFor(() => expect(st.getState().contexto.estado).toBe('error'))
    expect(st.getState().terrain.dem).not.toBeNull()
    expect(st.getState().contexto.msg).toMatch(/429/)
    await st.actions.retryContexto()
    expect(ctx.areas).toHaveLength(2)
  })

  it('cambiar de sitio limpia el contexto', async () => {
    const { l } = loaders()
    const st = createAppStore(l, ctxFalso().load)
    await st.actions.loadTerrain(squareRect(200))
    await vi.waitFor(() => expect(st.getState().contexto.estado).toBe('listo'))
    st.actions.setSite({ lon: -70.65, lat: -33.44 })
    expect([st.getState().contexto.estado, st.getState().contexto.datos]).toEqual(['idle', null])
  })

  it('abrir una escena con el contexto guardado no lo vuelve a descargar', async () => {
    const { l } = loaders()
    const ctx = ctxFalso()
    const st = createAppStore(l, ctx.load)
    await st.actions.openScene({ ...st.actions.currentScene(), area: squareRect(200), contexto: CTX })
    expect(ctx.areas).toHaveLength(0)
    expect(st.getState().contexto).toMatchObject({ estado: 'listo', datos: CTX })
    expect(st.actions.currentScene().contexto).toEqual(CTX)
  })

  it('abrir una escena conserva la equidistancia guardada', async () => {
    const { l } = loaders()
    const st = createAppStore(l, ctxFalso().load)
    await st.actions.openScene({ ...st.actions.currentScene(), area: squareRect(200), contourInterval: 1 })
    expect(st.getState().terrain.dem).not.toBeNull()
    expect(st.getState().curvas.contourInterval).toBe(1)
  })
})
