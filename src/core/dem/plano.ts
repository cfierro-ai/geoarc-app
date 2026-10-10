import { rectGrid, type HeightGrid } from './grid'
import type { Rect } from './area'

/** Terreno plano a cota 0: el estudio de sombras «de libro», sin topografía. */
export const flatTerrain = (_x: number, _y: number) => 0

/** Grilla plana (cota 0) sobre el área, para la vista 3D. */
export function flatGrid(area: Rect, cell: number): HeightGrid {
  return rectGrid(area, cell, { source: 'Plano (cota 0)', kind: 'plano', nominalResolutionM: cell }, flatTerrain)
}
