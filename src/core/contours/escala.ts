import type { DemMeta } from '../dem/grid'

/**
 * Qué curvas sostiene el dato de elevación. Criterio docente fijado por Chris (2026-10-10); es cartográfico, no
 * normativo, y vive solo aquí.
 * - Equidistancia mínima confiable según la resolución REAL del dato (`DemMeta.nominalResolutionM`):
 *   ≥ 20 m (SRTM / Terrarium) → 5 m; 5–20 m → 2 m; < 5 m → 1 m; levantamiento topográfico → 0,5 m.
 * - Preselección: la menor de PRESELECCION que sea ≥ la mínima confiable y dé entre 5 y 20 curvas según el desnivel
 *   del área. Las equidistancias menores siguen disponibles, con la advertencia de precisión aparente.
 */

/** Equidistancias del selector (m), que también son las candidatas a preselección. */
export const PRESELECCION = [0.5, 1, 2, 5, 10, 20, 50]
export const CURVAS_MIN = 5
export const CURVAS_MAX = 20

/** Sobre esta cantidad de curvas el plano no se lee (y el cálculo se vuelve lento): la equidistancia no se ofrece. */
export const MAX_NIVELES = 400

type MetaDato = Pick<DemMeta, 'kind' | 'nominalResolutionM'>

export function equidistanciaMinimaConfiable(meta: MetaDato): number {
  if (meta.kind === 'levantamiento') return 0.5
  const r = meta.nominalResolutionM
  return r >= 20 ? 5 : r >= 5 ? 2 : 1
}

/** Curvas que caben en el desnivel con la equidistancia `e` (desnivel / e, por defecto). */
export function curvasPorDesnivel(desnivel: number, e: number): number {
  return Math.max(0, Math.floor(desnivel / e + 1e-9))
}

/**
 * Equidistancia preseleccionada. Si ninguna candidata da entre 5 y 20 curvas, se toma la primera que no pasa de 20
 * (en un área casi plana, la mínima confiable); si todas pasan de 20, la mayor.
 */
export function preseleccionEquidistancia(meta: MetaDato, desnivel: number): { equidistancia: number; curvas: number } {
  const min = equidistanciaMinimaConfiable(meta)
  const cands = PRESELECCION.filter((e) => e >= min - 1e-9)
  const n = (e: number) => curvasPorDesnivel(desnivel, e)
  const e =
    cands.find((v) => n(v) >= CURVAS_MIN && n(v) <= CURVAS_MAX) ?? cands.find((v) => n(v) <= CURVAS_MAX) ?? cands[cands.length - 1]
  return { equidistancia: e, curvas: n(e) }
}

/** Para qué sirve el dato: etiqueta informativa (no es una escala de plano). */
export function usoDelDato(meta: MetaDato): string {
  const r = meta.nominalResolutionM.toLocaleString('es-CL', { maximumFractionDigits: 2 })
  if (meta.kind === 'levantamiento') return 'levantamiento topográfico: útil para el lote y el proyecto'
  if (meta.kind === 'sintético') return `terreno inventado (~${r} m): sirve para practicar, no describe un lugar real`
  if (meta.nominalResolutionM >= 20) return `dato de ~${r} m: útil para ladera y barrio, no para el lote`
  if (meta.nominalResolutionM >= 5) return `dato de ~${r} m: útil para barrio y manzana; para el lote, solo como referencia`
  return `dato de ~${r} m: útil para manzana y lote`
}

/** Cantidad de curvas entre min y max para una equidistancia (las que contourLevels genera). */
export function contarNiveles(min: number, max: number, e: number): number {
  return Math.max(0, Math.floor(max / e + 1e-9) - Math.ceil(min / e - 1e-9) + 1)
}

/** Cota para rótulos (mapa y DXF): español de Chile, hasta 2 decimales, sin separador de miles («1250», «122,5»). */
export function cotaLabel(level: number): string {
  return level.toLocaleString('es-CL', { maximumFractionDigits: 2, useGrouping: false })
}
