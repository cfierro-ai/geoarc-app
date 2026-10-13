import { rectGrid, type HeightGrid } from './grid'
import { squareRect, type Rect } from './area'

/**
 * Ladera sintética determinista para clases sin conexión y para tests e2e.
 * Pendiente ~12 % descendiendo hacia el norte, con una loma suave al oriente y ondulación menor.
 * La forma está fijada en el marco local: cualquier área la muestrea igual.
 */
export function syntheticHillside(area: Rect = squareRect(200), cell = 2, base = 120): HeightGrid {
  return rectGrid(
    area,
    cell,
    {
      source: 'Ladera sintética (demo)',
      kind: 'sintético',
      nominalResolutionM: cell,
      notes: 'Terreno inventado para práctica sin conexión.',
    },
    (x, y) =>
      base -
      0.12 * y +
      6 * Math.exp(-((x - 40) ** 2 + (y + 10) ** 2) / (2 * 35 ** 2)) +
      0.8 * Math.sin(x / 17) * Math.cos(y / 23),
  )
}
