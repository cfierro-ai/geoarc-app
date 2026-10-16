import type { LocalFrame, XY } from '../core/geo/local'
import type { HeightGrid } from '../core/dem/grid'
import type { Rect } from '../core/dem/area'
import { localRectBBox } from '../core/dem/resample'
import { infoMosaico, zoomMosaico, type MosaicoInfo } from '../core/export/mosaico'
import { construirMosaico } from '../core/export/textura'
import { sceneToGlb } from '../core/export/glb'
import { estimarTriangulos, trisEdificios } from '../core/export/glbCore'
import { ATRIBUCION_OSM, type Edificacion, type Via } from '../core/contexto/contexto'
import { download } from './util'
import { densidadDe, texturaDe, type DensidadId, type ExportOrigin, type TexturaId } from './model'

/** Margen (m) del mosaico de textura alrededor del área, para que la textura cubra un poco más que el borde. */
const MARGEN_TEXTURA = 30

export interface EscenaGlb {
  frame: LocalFrame
  grid: HeightGrid
  area: Rect
  areaPolygon?: XY[] | null
  origin: ExportOrigin
  densidad: DensidadId
  edificaciones?: Edificacion[]
  vias?: Via[]
  cotaBase: (p: XY) => number
}

const bboxArea = (frame: LocalFrame, area: Rect) => localRectBBox(frame, area, MARGEN_TEXTURA)

export interface EstimacionGlb {
  triangulos: number
  tamanoMB: number
}

/** Estimación para la tarjeta: triángulos (terreno + edificios) y tamaño del archivo (malla + textura). */
export function estimarGlb(e: EscenaGlb, textura: TexturaId): EstimacionGlb {
  const celdas = densidadDe(e.densidad).celdasLado
  const triangulos = estimarTriangulos(e.grid, celdas, trisEdificios(e.edificaciones ?? []))
  let bytes = triangulos * 40 // posiciones + normales + índices, aprox.
  const t = texturaDe(textura)
  if (textura !== 'ninguna' && t.urlPlantilla) {
    const m = infoMosaico(bboxArea(e.frame, e.area), zoomMosaico(bboxArea(e.frame, e.area), t.maxZoom ?? 19))
    bytes += m.anchoPx * m.altoPx * 0.2 // JPEG ~0,2 bytes/px
  }
  return { triangulos, tamanoMB: bytes / 1e6 }
}

/** Líneas de densidad/triángulos/tamaño para la tarjeta. `conTamano` incluye el tamaño estimado (GLB sí, OBJ no). */
export function metaMalla(est: EstimacionGlb, densidadLabel: string, conTamano = true): string[] {
  const linea = `${densidadLabel} · ~${est.triangulos.toLocaleString('es-CL')} triángulos`
  if (!conTamano) return [linea]
  return [linea, `Tamaño estimado ~${est.tamanoMB.toLocaleString('es-CL', { maximumFractionDigits: est.tamanoMB < 10 ? 1 : 0 })} MB`]
}

/** Contenido real del GLB para la tarjeta. */
export function contenidoGlb(textura: TexturaId, nEdif: number, nVias: number): string[] {
  const t = texturaDe(textura)
  return [
    textura === 'ninguna' ? 'Terreno (sin textura)' : `Terreno con textura ${t.label}`,
    ...(nEdif ? [`${nEdif} ${nEdif === 1 ? 'edificio' : 'edificios'} (sólidos)`] : []),
    `Vías y contorno del área (líneas)${nVias ? ` · ${nVias} ${nVias === 1 ? 'vía' : 'vías'}` : ''}`,
  ]
}

export interface AvisoTeselas {
  fallos: number
  total: number
}

/** Arma el GLB (con textura si corresponde) y lo descarga. Devuelve el aviso de teselas fallidas, si las hubo. */
export async function exportarGlb(e: EscenaGlb, textura: TexturaId, nombre: string): Promise<AvisoTeselas | null> {
  const t = texturaDe(textura)
  let tex: { canvas: HTMLCanvasElement; mosaico: MosaicoInfo } | undefined
  let copyright = ATRIBUCION_OSM
  let aviso: AvisoTeselas | null = null
  if (textura !== 'ninguna' && t.urlPlantilla) {
    const bb = bboxArea(e.frame, e.area)
    const mosaico = infoMosaico(bb, zoomMosaico(bb, t.maxZoom ?? 19))
    const m = await construirMosaico(mosaico, t.urlPlantilla)
    tex = { canvas: m.canvas, mosaico }
    copyright = `${t.atribucion}; ${ATRIBUCION_OSM}`
    aviso = { fallos: m.fallos, total: m.total }
  }
  const { glb } = await sceneToGlb({
    frame: e.frame,
    grid: e.grid,
    area: e.area,
    areaPolygon: e.areaPolygon,
    origin: e.origin,
    celdasLado: densidadDe(e.densidad).celdasLado,
    edificaciones: e.edificaciones,
    vias: e.vias,
    cotaBase: e.cotaBase,
    textura: tex,
    copyright,
  })
  download(nombre, glb, 'model/gltf-binary')
  return aviso
}
