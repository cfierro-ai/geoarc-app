import { useState } from 'react'
import type { XY } from '../core/geo/local'
import { area as polyArea, longitudPolilinea } from '../core/envelope/polygon'

/**
 * Estado de la herramienta Medir: vértices (marco local), distancia acumulada y, al cerrar con doble clic, el área.
 * Lo comparten los dos módulos. El mode del mapa lo maneja cada módulo.
 */
export function useMeasure() {
  const [pts, setPts] = useState<XY[]>([])
  const [cerrada, setCerrada] = useState(false)
  return {
    pts,
    cerrada,
    /** Agrega un vértice (y reabre la poligonal si estaba cerrada). */
    add: (q: XY) => {
      setCerrada(false)
      setPts((a) => [...a, q])
    },
    /** Cierra la poligonal (doble clic) si tiene al menos 3 vértices, para dar el área. */
    close: () => setCerrada(pts.length > 2),
    reset: () => {
      setPts([])
      setCerrada(false)
    },
    distancia: longitudPolilinea(pts),
    area: cerrada && pts.length > 2 ? polyArea(pts) : null,
  }
}
