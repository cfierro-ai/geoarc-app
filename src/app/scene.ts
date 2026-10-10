import { createLocalFrame, type LonLat, type XY } from '../core/geo/local'
import { rectFromCorners, squareRect, type Rect } from '../core/dem/area'
import type { PerfilNormativo } from '../core/normativa/perfiles'
import { isSourceAvailable, type DemSourceId, type EdgeSetting, type TerrainMode } from './model'

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
interface SceneFileV2 extends Omit<SceneFileV1, 'version' | 'areaSize' | 'cell'> {
  version: 2
  areaLonLat: [LonLat, LonLat] | null
  indexEvery: number
}

/** v3: dos módulos; el estudio de sombras guarda sobre qué terreno se calcula. */
export interface SceneFileV3 extends Omit<SceneFileV2, 'version'> {
  version: 3
  terrainMode: TerrainMode
  /** Nombre del DXF si el terreno era un levantamiento importado (el archivo no se incluye). */
  surveyFile?: string
}

/** Escena en el marco local del sitio, lista para cargar en la app. */
export interface Scene {
  site: LonLat
  area: Rect | null
  demSource: DemSourceId
  contourInterval: number
  indexEvery: number
  terrainMode: TerrainMode
  lot: XY[]
  profileId: PerfilNormativo['id']
  maxHeight: number
  edges: EdgeSetting[]
  surveyFile?: string
  /** Aviso para el usuario (p. ej. una fuente que ya no está disponible). */
  notice?: string
}

export function serializeScene(s: Scene): SceneFileV3 {
  const fr = createLocalFrame(s.site)
  return {
    format: 'geoarc',
    version: 3,
    site: s.site,
    areaLonLat: s.area ? [fr.toLonLat({ x: s.area.minX, y: s.area.minY }), fr.toLonLat({ x: s.area.maxX, y: s.area.maxY })] : null,
    demSource: s.demSource,
    contourInterval: s.contourInterval,
    indexEvery: s.indexEvery,
    terrainMode: s.terrainMode,
    lotLonLat: s.lot.map((p) => fr.toLonLat(p)),
    profileId: s.profileId,
    maxHeight: s.maxHeight,
    edges: s.edges,
    ...(s.surveyFile ? { surveyFile: s.surveyFile } : {}),
  }
}

/** Lee un .geoarc (v1, v2 o v3). Lanza un error legible si el archivo no es una escena. */
export function parseScene(text: string): Scene {
  const f = JSON.parse(text) as SceneFileV1 | SceneFileV2 | SceneFileV3
  if (f?.format !== 'geoarc' || ![1, 2, 3].includes(f.version)) throw new Error('Archivo no reconocido')
  const fr = createLocalFrame(f.site)
  const area =
    f.version === 1
      ? squareRect(f.areaSize)
      : f.areaLonLat
        ? rectFromCorners(fr.toLocal(f.areaLonLat[0]), fr.toLocal(f.areaLonLat[1]))
        : null
  const lot = f.lotLonLat.map((p) => fr.toLocal(p))
  const available = isSourceAvailable(f.demSource)
  return {
    site: f.site,
    area,
    demSource: available ? f.demSource : 'terrarium',
    notice: available ? undefined : 'La escena usaba Copernicus, que requiere proxy: se usa Terrarium.',
    contourInterval: f.contourInterval,
    indexEvery: f.version === 1 ? 5 : f.indexEvery,
    // hasta v2 la envolvente se calculaba siempre sobre el terreno cargado
    terrainMode: f.version === 3 ? f.terrainMode : lot.length > 2 && area ? 'sitio' : 'plano',
    lot,
    profileId: f.profileId,
    maxHeight: f.maxHeight,
    edges: f.edges,
    surveyFile: f.version === 3 ? f.surveyFile : undefined,
  }
}
