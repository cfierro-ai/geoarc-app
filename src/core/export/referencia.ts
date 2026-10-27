import type { XY } from '../geo/local'

/**
 * Capa REFERENCIA del DXF: barra de escala, flecha de norte de cuadrícula y un recuadro con los metadatos.
 * Todo en coordenadas locales (luego se transforma como el resto de la escena). El norte de cuadrícula es +Y.
 */

/** Longitud de la barra de escala (m) según el lado mayor del área: 50 (chica), 100 (media) o 500 (grande). */
export function longitudEscala(span: number): number {
  if (span < 200) return 50
  if (span >= 2000) return 500
  return 100
}

export interface ElementosRef {
  /** Polilíneas (abiertas) de la barra de escala y la flecha de norte. */
  segmentos: XY[][]
  /** Textos centrados (barra, «N» y líneas de información). */
  textos: { p: XY; texto: string; altura: number }[]
}

/**
 * Elementos de la REFERENCIA anclados en (bx, by) — abajo a la izquierda, bajo el área — con altura de texto `th`.
 * Barra de escala horizontal con marcas en 0, mitad y total; flecha de norte a su derecha; líneas de info encima.
 */
export function elementosReferencia(bx: number, by: number, th: number, escalaLen: number, lineas: string[]): ElementosRef {
  const segmentos: XY[][] = []
  const textos: ElementosRef['textos'] = []
  const tick = th * 0.6

  // barra de escala: línea principal y marcas verticales en 0, mitad y total
  segmentos.push([{ x: bx, y: by }, { x: bx + escalaLen, y: by }])
  for (const t of [0, escalaLen / 2, escalaLen]) segmentos.push([{ x: bx + t, y: by }, { x: bx + t, y: by + tick }])
  textos.push({ p: { x: bx + escalaLen / 2, y: by - 1.4 * th }, texto: `${escalaLen} m`, altura: th })

  // flecha de norte de cuadrícula (hacia +Y), a la derecha de la barra
  const nx = bx + escalaLen + 6 * th
  const nh = 4 * th
  segmentos.push([{ x: nx, y: by }, { x: nx, y: by + nh }])
  segmentos.push([{ x: nx - tick, y: by + nh - tick }, { x: nx, y: by + nh }, { x: nx + tick, y: by + nh - tick }])
  textos.push({ p: { x: nx, y: by + nh + 1.4 * th }, texto: 'N', altura: th })

  // recuadro de información: líneas apiladas encima de la barra, centradas en el medio de la barra
  const cx = bx + escalaLen / 2
  const yBase = by + 2 * th
  lineas.forEach((l, i) => textos.push({ p: { x: cx, y: yBase + (lineas.length - 1 - i) * 1.6 * th }, texto: l, altura: th }))

  // rectángulo alrededor de las líneas (ancho aproximado por el largo del texto más largo)
  const maxChars = Math.max(1, ...lineas.map((l) => l.length))
  const semiAncho = (maxChars * th * 0.6) / 2 + th
  const yTop = yBase + (lineas.length - 1) * 1.6 * th + th
  const yBot = yBase - th
  segmentos.push([
    { x: cx - semiAncho, y: yBot },
    { x: cx + semiAncho, y: yBot },
    { x: cx + semiAncho, y: yTop },
    { x: cx - semiAncho, y: yTop },
    { x: cx - semiAncho, y: yBot },
  ])

  return { segmentos, textos }
}
