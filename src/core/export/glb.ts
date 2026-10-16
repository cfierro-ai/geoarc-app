import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import type { LocalFrame, XY, XYZ } from '../geo/local'
import type { HeightGrid } from '../dem/grid'
import { pointInRect, rectCorners, type Rect } from '../dem/area'
import { densificarAnillo, pointInPolygon } from '../envelope/polygon'
import { edificioSolido } from './solido'
import { ATRIBUCION_OSM, esAlturaConocida, type Edificacion, type Via } from '../contexto/contexto'
import { aYArriba, inyectarAsset, mallaTerreno, pasoDensidad } from './glbCore'

/**
 * Modelo 3D en formato GLB (glTF binario) para SketchUp Pro, Blender y visores 3D, sin instalar nada. Metros
 * (1 unidad = 1 m), ejes Y-arriba (conversión en glbCore). Mismo origen (local/UTM) que el DXF y el OBJ. Solo navegador
 * (usa three y, para la textura, canvas). El ensamblado de la textura va en el parámetro `textura` (ver glb.ts/textura).
 */

const COLOR_TERRENO = 0x9aa3a8
const COLOR_EDIFICIO = 0x8a9096
const COLOR_EDIFICIO_SUPUESTO = 0xc2c8cd
const COLOR_LINEA = 0x2b2f33

export interface SceneForGlb {
  frame: LocalFrame
  grid: HeightGrid
  area: Rect
  areaPolygon?: XY[] | null
  origin?: 'utm' | 'local'
  /** Densidad de la malla: objetivo de celdas en el lado mayor del área. */
  celdasLado: number
  edificaciones?: Edificacion[]
  vias?: Via[]
  /** Cota del terreno (coordenadas locales) para apoyar edificios, vías y el contorno del área. */
  cotaBase?: (p: XY) => number
  /** Atribución para asset.copyright (textura + OSM). */
  copyright?: string
}

export interface ResultadoGlb {
  glb: ArrayBuffer
  /** Triángulos del modelo (terreno + edificios), para la tarjeta de descarga. */
  triangulos: number
}

export async function sceneToGlb(s: SceneForGlb): Promise<ResultadoGlb> {
  const local = s.origin !== 'utm'
  const shift: XY = local ? { x: s.area.minX, y: s.area.minY } : { x: 0, y: 0 }
  const U = (p: XY): XY => (local ? { x: p.x - shift.x, y: p.y - shift.y } : s.frame.toUTM(p))
  const dentro = (p: XY) => (s.areaPolygon ? pointInPolygon(p, s.areaPolygon) : pointInRect(p, s.area))
  const base = (p: XY) => {
    const z = s.cotaBase ? s.cotaBase(p) : 0
    return Number.isFinite(z) ? z : 0
  }
  const yUp = (p: XYZ): [number, number, number] => {
    const u = U(p)
    return aYArriba({ x: u.x, y: u.y, z: p.z })
  }

  const scene = new THREE.Scene()
  scene.name = 'GEOARC'

  // terreno: malla recortada al área, submuestreada a la densidad, con normales
  const paso = pasoDensidad(s.grid, s.celdasLado)
  const malla = mallaTerreno(s.grid, dentro, paso)
  const terrGeo = new THREE.BufferGeometry()
  const pos = new Float32Array(malla.pos.length * 3)
  malla.pos.forEach((p, i) => pos.set(yUp(p), i * 3))
  terrGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  terrGeo.setIndex(malla.tris.flat())
  terrGeo.computeVertexNormals()
  const terreno = new THREE.Mesh(terrGeo, new THREE.MeshStandardMaterial({ color: COLOR_TERRENO, roughness: 1, metalness: 0, side: THREE.DoubleSide }))
  terreno.name = 'terreno'
  scene.add(terreno)
  let triangulos = malla.tris.length

  // edificios como sólidos cerrados; los de altura supuesta en gris más claro
  const grupos: [Edificacion[], number, string][] = [
    [(s.edificaciones ?? []).filter((e) => esAlturaConocida(e.alturaFuente)), COLOR_EDIFICIO, 'edificaciones'],
    [(s.edificaciones ?? []).filter((e) => !esAlturaConocida(e.alturaFuente)), COLOR_EDIFICIO_SUPUESTO, 'edificaciones_supuestas'],
  ]
  for (const [edifs, color, nombre] of grupos) {
    if (!edifs.length) continue
    const arr: number[] = []
    for (const e of edifs) {
      const z0 = Math.min(...e.anillo.map(base))
      for (const t of edificioSolido(e.anillo, e.huecos, z0, e.altura)) {
        for (const v of t) arr.push(...yUp(v))
        triangulos++
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3))
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 }))
    m.name = nombre
    scene.add(m)
  }

  // líneas (mode LINES): vías sobre el terreno y el contorno del área
  const seg: number[] = []
  const addLinea = (pts: XYZ[], cerrada: boolean) => {
    const n = cerrada ? pts.length : pts.length - 1
    for (let k = 0; k < n; k++) seg.push(...yUp(pts[k]), ...yUp(pts[(k + 1) % pts.length]))
  }
  for (const v of s.vias ?? []) addLinea(v.linea.map((p): XYZ => ({ x: p.x, y: p.y, z: base(p) })), false)
  const anillo = densificarAnillo(s.areaPolygon ?? rectCorners(s.area), true, s.grid.cell * paso)
  addLinea(anillo.map((p): XYZ => ({ x: p.x, y: p.y, z: base(p) })), true)
  if (seg.length) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg), 3))
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: COLOR_LINEA }))
    l.name = 'lineas'
    scene.add(l)
  }

  const exporter = new GLTFExporter()
  const glbRaw = (await exporter.parseAsync(scene, { binary: true, onlyVisible: false })) as ArrayBuffer
  const glb = inyectarAsset(glbRaw, { generator: 'GEO·ARC', copyright: s.copyright ?? ATRIBUCION_OSM })
  return { glb, triangulos }
}
