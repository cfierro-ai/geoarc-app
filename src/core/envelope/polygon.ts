import type { XY } from '../geo/local'

export function signedArea(poly: XY[]): number {
  let a = 0
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k]
    const q = poly[(k + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

export function area(poly: XY[]): number {
  return Math.abs(signedArea(poly))
}

/** Devuelve el polígono en sentido antihorario (CCW). */
export function toCCW(poly: XY[]): XY[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly
}

export function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function distToSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L2 = dx * dx + dy * dy
  let t = L2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Normal exterior unitaria del lado a→b de un polígono CCW. */
export function outwardNormal(a: XY, b: XY): XY {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1
  return { x: (b.y - a.y) / L, y: -(b.x - a.x) / L }
}

const RUMBOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']

/** Rumbo (N, NE, …) hacia el que mira un lado según su normal exterior. */
export function facing(n: XY): string {
  const az = (Math.atan2(n.x, n.y) * 180) / Math.PI // 0 = norte, horario
  return RUMBOS[Math.round((((az % 360) + 360) % 360) / 45) % 8]
}

/** Distancia acumulada a lo largo de una polilínea abierta (suma de los lados), en las unidades de las coordenadas. */
export function longitudPolilinea(pts: XY[]): number {
  let d = 0
  for (let k = 1; k < pts.length; k++) d += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y)
  return d
}

/**
 * Densifica una polilínea/anillo agregando puntos intermedios para que ningún tramo supere `paso` (m). Conserva los
 * vértices originales. Un anillo cerrado se densifica también en el tramo de cierre y se devuelve SIN repetir el primer
 * vértice. Sirve para apoyar el contorno del área sobre el terreno (una cota por punto, muestreada cada celda).
 */
export function densificarAnillo(pts: XY[], cerrada: boolean, paso: number): XY[] {
  if (pts.length < 2 || !(paso > 0)) return pts
  const out: XY[] = []
  const n = cerrada ? pts.length : pts.length - 1
  for (let k = 0; k < n; k++) {
    const a = pts[k]
    const b = pts[(k + 1) % pts.length]
    out.push(a)
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    const m = Math.floor(d / paso)
    for (let i = 1; i <= m; i++) {
      const t = (i * paso) / d
      if (t < 1 - 1e-9) out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    }
  }
  if (!cerrada) out.push(pts[pts.length - 1])
  return out
}

/** Quita vértices repetidos de un anillo dibujado en el mapa (el doble clic agrega dos clics en el mismo punto). */
export function cleanRing(pts: XY[], tol = 0.3): XY[] {
  const out: XY[] = []
  for (const p of pts) if (!out.length || Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) > tol) out.push(p)
  while (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= tol) out.pop()
  return out
}

/**
 * Agrupa una lista de anillos (p. ej. los de un multipolígono de teselas, fusionado por altura) en edificios
 * individuales: cada anillo exterior con sus patios. La clasificación es por CONTENCIÓN (no por el sentido absoluto):
 * la profundidad de anidamiento de un anillo = cuántos otros lo contienen; profundidad par → exterior, impar → hueco.
 * Cada hueco se asigna al exterior más pequeño que lo contiene. Así dos anillos disjuntos dan dos edificios y nunca se
 * triangula un conjunto de anillos disjuntos como un solo polígono.
 */
export function agruparAnillos(anillos: XY[][]): { anillo: XY[]; huecos: XY[][] }[] {
  const rings = anillos.filter((r) => r.length >= 3)
  const rep = rings.map((r) => r[0]) // punto representativo (primer vértice)
  const areas = rings.map((r) => area(r))
  const depth = rings.map((_, i) => rings.reduce((d, r, j) => (j !== i && pointInPolygon(rep[i], r) ? d + 1 : d), 0))
  const exteriores = rings.map((_, i) => i).filter((i) => depth[i] % 2 === 0)
  const edificios = exteriores.map((i) => ({ anillo: rings[i], huecos: [] as XY[][] }))
  // cada anillo de profundidad impar (hueco) va al exterior más pequeño que lo contiene
  rings.forEach((r, i) => {
    if (depth[i] % 2 === 0) return
    let best = -1
    for (let k = 0; k < exteriores.length; k++) {
      const e = exteriores[k]
      if (pointInPolygon(rep[i], rings[e]) && (best < 0 || areas[e] < areas[exteriores[best]])) best = k
    }
    if (best >= 0) edificios[best].huecos.push(r)
  })
  return edificios
}

export function bbox(poly: XY[]) {
  // Bucle explícito en vez de Math.min(...spread): el spread lanza RangeError con arreglos muy grandes
  // (una curva densa o una vía de kilómetros) y esta función es alcanzable desde el contexto y el recorte.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const p of poly) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, maxX, minY, maxY }
}
