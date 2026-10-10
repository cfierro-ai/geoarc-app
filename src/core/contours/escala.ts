import { niceCeil, SERIE_CARTO } from '../nice'

/**
 * Escala y equidistancia que el dato soporta, según su resolución horizontal REAL (`DemMeta.nominalResolutionM`).
 * Criterio cartográfico de uso docente (no es norma; revisable en un solo lugar):
 * - Escala: regla de Tobler (1987): el detalle mínimo legible en papel es ~0,5 mm, así que el denominador de la
 *   escala más detallada que el dato sostiene es 2 000 × resolución (m). Un dato de 30 m sostiene ≈ 1:60.000.
 * - Equidistancia: en las series topográficas usuales la equidistancia normal es ≈ denominador / 2 500
 *   (1:25.000 → 10 m; 1:50.000 → 20 m). Se redondea hacia arriba en la serie 1–2–2,5–5.
 */
export interface EscalaDato {
  /** Denominador de la escala más detallada confiable (1:denominador). */
  denominador: number
  /** Equidistancia mínima sugerida (m). */
  equidistanciaMinima: number
}

/** Redondea hacia arriba a `d` cifras significativas. */
function ceilSig(v: number, d = 2): number {
  const p = 10 ** (Math.floor(Math.log10(v)) - d + 1)
  return Math.ceil(v / p - 1e-9) * p
}

export function escalaConfiable(resolucionM: number): EscalaDato {
  const denominador = ceilSig(2000 * resolucionM)
  return { denominador, equidistanciaMinima: niceCeil(denominador / 2500, SERIE_CARTO) }
}

/** Equidistancias que ofrece el selector, incluida la mínima sugerida del dato. */
export function opcionesEquidistancia(minima: number): number[] {
  const base = [0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100]
  return [...new Set([...base, minima])].sort((a, b) => a - b)
}

/** Sobre esta cantidad de curvas el plano no se lee (y el cálculo se vuelve lento): la equidistancia no se ofrece. */
export const MAX_NIVELES = 400

/** Cantidad de curvas entre min y max para una equidistancia. */
export function contarNiveles(min: number, max: number, e: number): number {
  return Math.max(0, Math.floor(max / e + 1e-9) - Math.ceil(min / e - 1e-9) + 1)
}

/** Cota para rótulos (mapa y DXF): español de Chile, hasta 2 decimales, sin separador de miles («1250», «122,5»). */
export function cotaLabel(level: number): string {
  return level.toLocaleString('es-CL', { maximumFractionDigits: 2, useGrouping: false })
}
