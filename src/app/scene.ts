import { createLocalFrame, type LonLat, type XY } from '../core/geo/local'
import { rectFromCorners, squareRect, type Rect } from '../core/dem/area'
import type { PerfilNormativo } from '../core/normativa/perfiles'
import { isSourceAvailable, type DemSourceId, type EdgeSetting } from './model'

/** v1 (GEO·ARC 0.1): área cuadrada centrada en el sitio, celda elegida a mano. */
interface SceneFileV1 {
  format: 'geoarc'
  version: 1
  site: LonLat
  areaSize: number
  cell: number
  demSource: DemSourceId
  contourInterval: number
  lotLonLat: LonLat[]
  profileId: PerfilNormativo['id']
  maxHeight: number
  edges: EdgeSetting[]
}

/** v2: área libre (esquinas SO y NE en lon/lat, como el lote), celda automática. */
export interface SceneFileV2 {
  format: 'geoarc'
  version: 2
  site: LonLat
  areaLonLat: [LonLat, LonLat] | null
  demSource: DemSourceId
  contourInterval: number
  indexEvery: number
  lotLonLat: LonLat[]
  profileId: PerfilNormativo['id']
  maxHeight: number
  edges: EdgeSetting[]
}

/** Escena en el marco local del sitio, lista para cargar en la app. */
export interface Scene {
  site: LonLat
  area: Rect | null
  demSource: DemSourceId
  contourInterval: number
  indexEvery: number
  lot: XY[]
  profileId: PerfilNormativo['id']
  maxHeight: number
  edges: EdgeSetting[]
  /** Aviso para el usuario (p. ej. una fuente que ya no está disponible). */
  notice?: string
}

export function serializeScene(s: Scene): SceneFileV2 {
  const fr = createLocalFrame(s.site)
  return {
    format: 'geoarc',
    version: 2,
    site: s.site,
    areaLonLat: s.area ? [fr.toLonLat({ x: s.area.minX, y: s.area.minY }), fr.toLonLat({ x: s.area.maxX, y: s.area.maxY })] : null,
    demSource: s.demSource,
    contourInterval: s.contourInterval,
    indexEvery: s.indexEvery,
    lotLonLat: s.lot.map((p) => fr.toLonLat(p)),
    profileId: s.profileId,
    maxHeight: s.maxHeight,
    edges: s.edges,
  }
}

/** Lee un .geoarc (v1 o v2). Lanza un error legible si el archivo no es una escena. */
export function parseScene(text: string): Scene {
  const f = JSON.parse(text) as SceneFileV1 | SceneFileV2
  if (f?.format !== 'geoarc' || (f.version !== 1 && f.version !== 2)) throw new Error('Archivo no reconocido')
  const fr = createLocalFrame(f.site)
  const area =
    f.version === 1
      ? squareRect(f.areaSize)
      : f.areaLonLat
        ? rectFromCorners(fr.toLocal(f.areaLonLat[0]), fr.toLocal(f.areaLonLat[1]))
        : null
  const available = isSourceAvailable(f.demSource)
  return {
    site: f.site,
    area,
    demSource: available ? f.demSource : 'terrarium',
    notice: available ? undefined : 'La escena usaba Copernicus, que requiere proxy: se usa Terrarium.',
    contourInterval: f.contourInterval,
    indexEvery: f.version === 2 ? f.indexEvery : 5,
    lot: f.lotLonLat.map((p) => fr.toLocal(p)),
    profileId: f.profileId,
    maxHeight: f.maxHeight,
    edges: f.edges,
  }
}
