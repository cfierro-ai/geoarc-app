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

/** Quita vértices repetidos de un anillo dibujado en el mapa (el doble clic agrega dos clics en el mismo punto). */
export function cleanRing(pts: XY[], tol = 0.3): XY[] {
  const out: XY[] = []
  for (const p of pts) if (!out.length || Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) > tol) out.push(p)
  while (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= tol) out.pop()
  return out
}

export function bbox(poly: XY[]) {
  return {
    minX: Math.min(...poly.map((p) => p.x)),
    maxX: Math.max(...poly.map((p) => p.x)),
    minY: Math.min(...poly.map((p) => p.y)),
    maxY: Math.max(...poly.map((p) => p.y)),
  }
}
