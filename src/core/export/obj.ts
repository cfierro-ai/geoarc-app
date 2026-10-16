import type { LocalFrame, XY } from '../geo/local'
import type { HeightGrid } from '../dem/grid'
import { pointInRect, rectCorners, type Rect } from '../dem/area'
import { densificarAnillo, pointInPolygon } from '../envelope/polygon'
import { edificioSolido } from './solido'
import { mallaTerreno, pasoDensidad } from './glbCore'
import type { Edificacion } from '../contexto/contexto'

/**
 * Malla 3D en formato OBJ (metros): terreno recortado al área y edificios como sólidos cerrados.
 * Mismo origen que el DXF (local por defecto: esquina SO del área en 0,0; o UTM absolutas). Ejes x=este, y=norte,
 * z=cota. Los vértices se comparten (mismas coordenadas → mismo índice), así los sólidos quedan cerrados.
 */

/** Escritor OBJ con vértices compartidos por coordenada (al milímetro). */
export class ObjWriter {
  private verts: string[] = []
  private faces: string[] = []
  private index = new Map<string, number>()
  private n = 0

  vertex(x: number, y: number, z: number): number {
    const k = `${round(x)},${round(y)},${round(z)}`
    const found = this.index.get(k)
    if (found !== undefined) return found
    this.verts.push(`v ${fmt(x)} ${fmt(y)} ${fmt(z)}`)
    this.n += 1
    this.index.set(k, this.n)
    return this.n
  }

  group(name: string): void {
    this.faces.push(`g ${name}`)
  }

  face(a: number, b: number, c: number): void {
    this.faces.push(`f ${a} ${b} ${c}`)
  }

  /** Polilínea (contorno del área): elemento `l` con los índices de vértice en orden. */
  line(idx: number[]): void {
    if (idx.length > 1) this.faces.push(`l ${idx.join(' ')}`)
  }

  toString(): string {
    return ['# GEO·ARC · malla 3D · metros', ...this.verts, ...this.faces, ''].join('\n')
  }
}

export interface SceneForObj {
  frame: LocalFrame
  grid: HeightGrid
  /** Rectángulo de cálculo (recorte del terreno). */
  area: Rect
  /** Polígono del área (recorta el terreno a él en vez del rectángulo). */
  areaPolygon?: XY[] | null
  origin?: 'utm' | 'local'
  edificaciones?: Edificacion[]
  /** Cota del terreno (coordenadas locales) para apoyar los edificios. */
  cotaBase?: (p: XY) => number
  /** Densidad de la malla: objetivo de celdas en el lado mayor. Sin él, la grilla completa. */
  celdasLado?: number
}

export function sceneToObj(s: SceneForObj): string {
  const w = new ObjWriter()
  const local = s.origin !== 'utm'
  const shift: XY = local ? { x: s.area.minX, y: s.area.minY } : { x: 0, y: 0 }
  const U = (p: XY): XY => (local ? { x: p.x - shift.x, y: p.y - shift.y } : s.frame.toUTM(p))
  const dentro = (p: XY) => (s.areaPolygon ? pointInPolygon(p, s.areaPolygon) : pointInRect(p, s.area))
  const base = (p: XY) => {
    const z = s.cotaBase ? s.cotaBase(p) : 0
    return Number.isFinite(z) ? z : 0
  }

  // terreno: malla recortada al área y submuestreada a la densidad (misma lógica que el GLB)
  w.group('terreno')
  const pasoMalla = s.celdasLado ? pasoDensidad(s.grid, s.celdasLado) : 1
  const malla = mallaTerreno(s.grid, dentro, pasoMalla)
  for (const [a, b, c] of malla.tris) {
    const idx = [malla.pos[a], malla.pos[b], malla.pos[c]].map((p) => {
      const u = U(p)
      return w.vertex(u.x, u.y, p.z)
    })
    w.face(idx[0], idx[1], idx[2])
  }

  // edificios: sólidos cerrados (piso + muros + techo) desde la cota más baja del terreno bajo la huella
  if (s.edificaciones?.length) {
    w.group('edificaciones')
    for (const e of s.edificaciones) {
      const z0 = Math.min(...e.anillo.map(base))
      const anilloU = e.anillo.map(U)
      const huecosU = e.huecos.map((h) => h.map(U))
      for (const [a, b, c] of edificioSolido(anilloU, huecosU, z0, e.altura)) {
        w.face(w.vertex(a.x, a.y, a.z), w.vertex(b.x, b.y, b.z), w.vertex(c.x, c.y, c.z))
      }
    }
  }

  // contorno del área apoyado sobre el terreno (polilínea `l`), igual que el AREA del DXF: marca el límite del lote
  w.group('area')
  const anillo = s.areaPolygon ?? rectCorners(s.area)
  const pasoContorno = (s.grid.cell > 0 ? s.grid.cell : Math.max(1, Math.max(s.area.maxX - s.area.minX, s.area.maxY - s.area.minY) / 200)) * pasoMalla
  const denso = s.cotaBase ? densificarAnillo(anillo, true, pasoContorno) : anillo
  const idxArea = denso.map((q) => {
    const u = U(q)
    return w.vertex(u.x, u.y, base(q))
  })
  w.line([...idxArea, idxArea[0]])

  return w.toString()
}

const round = (v: number) => Math.round(v * 1000) / 1000
const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(3) : '0')
