import { createLocalFrame } from '../core/geo/local'
import type { HeightGrid } from '../core/dem/grid'
import { squareRect, type Rect } from '../core/dem/area'
import { syntheticHillside } from '../core/dem/synthetic'
import { loadDem, type DemLoaders } from './demLoader'

const frame = createLocalFrame({ lon: -72.5985, lat: -38.739 })
const A200 = squareRect(200)
const A300 = squareRect(300)

const grid = (source: string): HeightGrid => {
  const g = syntheticHillside(squareRect(20), 2)
  return { ...g, meta: { ...g.meta, source } }
}

/** Cargadores simulados: registran las llamadas; los que se indiquen fallan como falla el navegador ante CORS. */
function loaders(fail: Partial<Record<keyof DemLoaders, Error>> = {}) {
  const calls: { src: keyof DemLoaders; area: Rect; cell: number }[] = []
  const make =
    (src: keyof DemLoaders) =>
    async (_f: typeof frame, area: Rect, cell: number): Promise<HeightGrid> => {
      calls.push({ src, area, cell })
      if (fail[src]) throw fail[src]
      return grid(src)
    }
  const l: DemLoaders = { copernicus: make('copernicus'), terrarium: make('terrarium'), sintetico: make('sintetico') }
  return { l, calls }
}

const corsError = () => new TypeError('Failed to fetch')

describe('loadDem: respaldo de Copernicus a Terrarium', () => {
  it('si Copernicus responde, no hay respaldo', async () => {
    const { l, calls } = loaders()
    const r = await loadDem('copernicus', frame, A200, 2, l)
    expect(r.source).toBe('copernicus')
    expect(r.fallbackFrom).toBeUndefined()
    expect(r.grid.meta.source).toBe('copernicus')
    expect(calls.map((c) => c.src)).toEqual(['copernicus'])
  })

  it('si Copernicus falla (CORS o red), carga Terrarium con los mismos parámetros e informa el respaldo', async () => {
    const { l, calls } = loaders({ copernicus: corsError() })
    const r = await loadDem('copernicus', frame, A300, 5, l)
    expect(r.source).toBe('terrarium')
    expect(r.fallbackFrom).toBe('copernicus')
    expect(r.grid.meta.source).toBe('terrarium')
    expect(calls).toEqual([
      { src: 'copernicus', area: A300, cell: 5 },
      { src: 'terrarium', area: A300, cell: 5 },
    ])
  })

  it('si fallan Copernicus y Terrarium, el error nombra ambas fuentes', async () => {
    const { l } = loaders({ copernicus: corsError(), terrarium: new Error('Terrarium 503') })
    await expect(loadDem('copernicus', frame, A200, 2, l)).rejects.toThrow(/Copernicus.*Failed to fetch.*Terrarium.*503/s)
  })

  it('Terrarium elegido no tiene respaldo: falla con su propio error', async () => {
    const { l, calls } = loaders({ terrarium: corsError() })
    await expect(loadDem('terrarium', frame, A200, 2, l)).rejects.toThrow(/terrarium.*Failed to fetch/i)
    expect(calls.map((c) => c.src)).toEqual(['terrarium'])
  })

  it('la ladera sintética no usa red', async () => {
    const { l, calls } = loaders({ copernicus: corsError(), terrarium: corsError() })
    const r = await loadDem('sintetico', frame, A200, 2, l)
    expect(r.source).toBe('sintetico')
    expect(calls.map((c) => c.src)).toEqual(['sintetico'])
  })
})
