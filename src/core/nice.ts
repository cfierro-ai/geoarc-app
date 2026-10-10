/**
 * Números «redondos» para mostrar y elegir medidas: v = mantisa × 10^k.
 * SERIE_FINA da pasos de ≤ 25 % (celdas de grilla); SERIE_CARTO es la usual en cartografía (equidistancias, textos).
 */
export const SERIE_FINA = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8]
export const SERIE_CARTO = [1, 2, 2.5, 5]

function candidatos(v: number, mantisas: number[]): number[] {
  const d = Math.floor(Math.log10(v))
  const out: number[] = []
  for (let e = d - 1; e <= d + 1; e++) for (const m of mantisas) out.push(+(m * 10 ** e).toPrecision(6))
  return out
}

/** Valor de la serie más cercano a v (en escala logarítmica). */
export function niceNearest(v: number, mantisas = SERIE_FINA): number {
  let best = NaN
  let dBest = Infinity
  for (const c of candidatos(v, mantisas)) {
    const d = Math.abs(Math.log(c / v))
    if (d < dBest) {
      dBest = d
      best = c
    }
  }
  return best
}

/** Menor valor de la serie que es ≥ v. */
export function niceCeil(v: number, mantisas = SERIE_FINA): number {
  return candidatos(v, mantisas).find((c) => c >= v * (1 - 1e-9))!
}
