import type { XY, XYZ } from '../geo/local'

/**
 * Escritor DXF R12 (AC1009) mínimo: capas, POLYLINE 2D/3D, 3DFACE y TEXT (estilo STANDARD).
 * R12 es el formato más compatible (AutoCAD, Revit, Civil 3D, QGIS, Rhino, SketchUp, BricsCAD, LibreCAD).
 */
export class DxfWriter {
  private layers = new Map<string, number>()
  private entities: string[] = []

  addLayer(name: string, color: number): this {
    this.layers.set(sanitize(name), color)
    return this
  }

  polyline3d(layer: string, pts: XYZ[], closed = false): this {
    if (pts.length < 2) return this
    const L = sanitize(layer)
    const e: (string | number)[] = [0, 'POLYLINE', 8, L, 66, 1, 10, 0, 20, 0, 30, 0, 70, closed ? 9 : 8]
    for (const p of pts) e.push(0, 'VERTEX', 8, L, 10, n(p.x), 20, n(p.y), 30, n(p.z), 70, 32)
    e.push(0, 'SEQEND', 8, L)
    this.entities.push(pairs(e))
    return this
  }

  /** Polilínea plana a la cota `elevation` (código 30 de la POLYLINE). */
  polyline2d(layer: string, pts: XY[], closed = false, elevation = 0): this {
    if (pts.length < 2) return this
    const L = sanitize(layer)
    const e: (string | number)[] = [0, 'POLYLINE', 8, L, 66, 1, 10, 0, 20, 0, 30, n(elevation), 70, closed ? 1 : 0]
    for (const p of pts) e.push(0, 'VERTEX', 8, L, 10, n(p.x), 20, n(p.y), 30, n(elevation))
    e.push(0, 'SEQEND', 8, L)
    this.entities.push(pairs(e))
    return this
  }

  face3d(layer: string, a: XYZ, b: XYZ, c: XYZ, d: XYZ = c): this {
    const L = sanitize(layer)
    const e: (string | number)[] = [0, '3DFACE', 8, L]
    ;[a, b, c, d].forEach((p, k) => e.push(10 + k, n(p.x), 20 + k, n(p.y), 30 + k, n(p.z)))
    this.entities.push(pairs(e))
    return this
  }

  /** Texto centrado (horizontal y verticalmente) en `p`, de altura `height` y giro `angleDeg`. */
  text(layer: string, p: XYZ, height: number, value: string, angleDeg = 0): this {
    const L = sanitize(layer)
    const at = [n(p.x), n(p.y), n(p.z)]
    // 72 = 1 (centro) y 73 = 2 (medio): el texto se ubica por el punto de alineación 11/21/31
    const e: (string | number)[] = [0, 'TEXT', 8, L, 10, at[0], 20, at[1], 30, at[2], 40, n(height), 1, value, 50, n(angleDeg)]
    e.push(7, 'STANDARD', 72, 1, 11, at[0], 21, at[1], 31, at[2], 73, 2)
    this.entities.push(pairs(e))
    return this
  }

  toString(): string {
    const head = pairs([0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 0, 'ENDSEC'])
    const lt = pairs([0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB'])
    const lyr: (string | number)[] = [0, 'TABLE', 2, 'LAYER', 70, this.layers.size]
    for (const [name, color] of this.layers) lyr.push(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS')
    lyr.push(0, 'ENDTAB')
    const style = pairs([0, 'TABLE', 2, 'STYLE', 70, 1, 0, 'STYLE', 2, 'STANDARD', 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 2.5, 3, 'txt', 4, '', 0, 'ENDTAB'])
    const tables = pairs([0, 'SECTION', 2, 'TABLES']) + lt + pairs(lyr) + style + pairs([0, 'ENDSEC'])
    const ents = pairs([0, 'SECTION', 2, 'ENTITIES']) + this.entities.join('') + pairs([0, 'ENDSEC'])
    return head + tables + ents + pairs([0, 'EOF'])
  }
}

function n(v: number): string {
  return Number.isFinite(v) ? v.toFixed(3) : '0'
}

function sanitize(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9_-]/g, '_')
}

function pairs(a: (string | number)[]): string {
  let s = ''
  for (let k = 0; k < a.length; k += 2) s += `${a[k]}\n${a[k + 1]}\n`
  return s
}
