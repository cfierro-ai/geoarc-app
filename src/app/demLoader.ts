import type { LocalFrame } from '../core/geo/local'
import type { HeightGrid } from '../core/dem/grid'
import { loadCopernicusGrid } from '../core/dem/copernicus'
import { loadTerrariumGrid } from '../core/dem/terrarium'
import { syntheticHillside } from '../core/dem/synthetic'
import type { DemSourceId } from './model'

export type DemLoader = (frame: LocalFrame, size: number, cell: number) => Promise<HeightGrid>
export type DemLoaders = Record<DemSourceId, DemLoader>

const LOADERS: DemLoaders = {
  copernicus: loadCopernicusGrid,
  terrarium: (frame, size, cell) => loadTerrariumGrid(frame, size, cell),
  sintetico: async (_frame, size, cell) => syntheticHillside(size, cell),
}

export interface DemLoadResult {
  grid: HeightGrid
  /** Fuente que entregó el dato (puede diferir de la pedida si hubo respaldo). */
  source: DemSourceId
  /** Fuente pedida que falló y fue reemplazada. */
  fallbackFrom?: DemSourceId
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Carga el DEM de la fuente pedida. Si Copernicus falla, usa Terrarium: su bucket no tiene CORS y el navegador
 * bloquea la respuesta (ver docs/decisiones.md). Un bloqueo CORS y una caída de red llegan igual («Failed to fetch»),
 * así que el respaldo se activa ante cualquier error de Copernicus.
 */
export async function loadDem(
  src: DemSourceId,
  frame: LocalFrame,
  size: number,
  cell: number,
  loaders: DemLoaders = LOADERS,
): Promise<DemLoadResult> {
  try {
    return { grid: await loaders[src](frame, size, cell), source: src }
  } catch (e) {
    if (src === 'copernicus') {
      try {
        return { grid: await loaders.terrarium(frame, size, cell), source: 'terrarium', fallbackFrom: 'copernicus' }
      } catch (e2) {
        throw new Error(
          `No se pudo cargar el terreno. Copernicus: ${msg(e)}. Terrarium: ${msg(e2)}. ` +
            'Revisa la conexión o usa la ladera sintética.',
        )
      }
    }
    throw new Error(
      `No se pudo cargar el terreno (${src}). ${msg(e)}. ` + 'Prueba otra fuente; si persiste, puede ser un bloqueo CORS o de red.',
    )
  }
}
