import type { XY, XYZ } from '../geo/local'
import type { HeightGrid } from '../dem/grid'

/**
 * Piezas puras del exportador GLB (sin three ni canvas): se prueban en Node. El ensamblado de la escena three y la
 * exportación binaria viven en glb.ts (solo navegador).
 */

/**
 * Conversión de ejes: local (x este, y norte, z cota; Z arriba) → glTF (Y arriba, right-handed): (x, y, z) → (x, z, −y).
 * La X (este–oeste) se conserva, así que el ancho del área no cambia.
 */
export function aYArriba(p: XYZ): [number, number, number] {
  return [p.x, p.z, -p.y]
}

/** Paso de submuestreo de la grilla para la densidad pedida (objetivo de celdas en el lado mayor del área). */
export function pasoDensidad(g: HeightGrid, celdasLado: number): number {
  return Math.max(1, Math.round(Math.max(g.nx, g.ny) / Math.max(1, celdasLado)))
}

export interface MallaTerreno {
  /** Vértices en coordenadas LOCALES (x este, y norte, z cota real). */
  pos: XYZ[]
  /** Triángulos como índices a `pos`. */
  tris: [number, number, number][]
}

/**
 * Malla del terreno recortada al área y submuestreada al `paso` dado, indexada (vértices compartidos → normales suaves).
 * Solo se conserva un triángulo si sus tres vértices están dentro del área y tienen cota finita. Devuelve coordenadas
 * locales; glb.ts aplica el origen (local/UTM) y la conversión a Y-arriba, y calcula las normales y las UV.
 */
export function mallaTerreno(g: HeightGrid, dentro: (p: XY) => boolean, paso: number): MallaTerreno {
  const idxs: number[] = []
  for (let i = 0; i < g.nx; i += paso) idxs.push(i)
  if (idxs[idxs.length - 1] !== g.nx - 1) idxs.push(g.nx - 1)
  const jdxs: number[] = []
  for (let j = 0; j < g.ny; j += paso) jdxs.push(j)
  if (jdxs[jdxs.length - 1] !== g.ny - 1) jdxs.push(g.ny - 1)

  const node = (i: number, j: number): XYZ => ({ x: g.x0 + i * g.cell, y: g.y0 + j * g.cell, z: g.z[j * g.nx + i] })
  const pos: XYZ[] = []
  const vid = new Map<number, number>()
  const vertex = (i: number, j: number): number => {
    const key = j * g.nx + i
    let id = vid.get(key)
    if (id === undefined) {
      id = pos.length
      pos.push(node(i, j))
      vid.set(key, id)
    }
    return id
  }
  const ok = (p: XYZ) => Number.isFinite(p.z) && dentro(p)
  const tris: [number, number, number][] = []
  for (let a = 0; a < jdxs.length - 1; a++)
    for (let b = 0; b < idxs.length - 1; b++) {
      const i0 = idxs[b]
      const i1 = idxs[b + 1]
      const j0 = jdxs[a]
      const j1 = jdxs[a + 1]
      const A = node(i0, j0)
      const B = node(i1, j0)
      const C = node(i1, j1)
      const D = node(i0, j1)
      if (ok(A) && ok(B) && ok(D)) tris.push([vertex(i0, j0), vertex(i1, j0), vertex(i0, j1)])
      if (ok(B) && ok(C) && ok(D)) tris.push([vertex(i1, j0), vertex(i1, j1), vertex(i0, j1)])
    }
  return { pos, tris }
}

const MAGIC = 0x46546c67 // "glTF"
const JSON_CHUNK = 0x4e4f534a // "JSON"

/**
 * Inserta `asset.copyright` y `asset.generator` en el chunk JSON de un GLB binario (GLTFExporter no los escribe).
 * Reconstruye el GLB con las longitudes y el relleno correctos; el chunk BIN queda intacto.
 */
export function inyectarAsset(glb: ArrayBuffer, asset: { copyright?: string; generator?: string }): ArrayBuffer {
  const dv = new DataView(glb)
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('No es un GLB (magic glTF)')
  const jsonLen = dv.getUint32(12, true)
  if (dv.getUint32(16, true) !== JSON_CHUNK) throw new Error('El primer chunk del GLB no es JSON')
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLen)))
  json.asset = { ...json.asset, ...asset }

  const enc = new TextEncoder().encode(JSON.stringify(json))
  const pad = (4 - (enc.length % 4)) % 4
  const newJson = new Uint8Array(enc.length + pad)
  newJson.set(enc)
  newJson.fill(0x20, enc.length) // relleno con espacios

  const restStart = 20 + jsonLen // chunk BIN (header + datos), si lo hay
  const rest = new Uint8Array(glb, restStart, glb.byteLength - restStart)

  const out = new ArrayBuffer(20 + newJson.length + rest.length)
  const o = new DataView(out)
  o.setUint32(0, MAGIC, true)
  o.setUint32(4, 2, true)
  o.setUint32(8, out.byteLength, true)
  o.setUint32(12, newJson.length, true)
  o.setUint32(16, JSON_CHUNK, true)
  const ou = new Uint8Array(out)
  ou.set(newJson, 20)
  ou.set(rest, 20 + newJson.length)
  return out
}
