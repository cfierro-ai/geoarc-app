import { createLocalFrame, type LocalFrame, type LonLat, type XY } from '../core/geo/local'
import { rectFromCorners, squareRect, type Rect } from '../core/dem/area'
import type { PerfilNormativo } from '../core/normativa/perfiles'
import type { AlturaFuente, Contexto } from '../core/contexto/contexto'
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
interface SceneFileV3 extends Omit<SceneFileV2, 'version'> {
  version: 3
  terrainMode: TerrainMode
}

type LL = [number, number]

/** Contexto en el archivo: lon/lat con 7 decimales (~1 cm), así no depende del marco local. */
interface ContextoArchivo {
  fuente: Contexto['fuente']
  fecha: string
  edificaciones: { id: string; anillo: LL[]; huecos: LL[][]; altura: number; alturaFuente: AlturaFuente }[]
  vias: { id: string; linea: LL[]; clase: string }[]
}

/**
 * v4: el área puede ser un polígono (vértices en lon/lat; `areaLonLat` sigue siendo su rectángulo envolvente) y se
 * guarda el contexto descargado (edificaciones y vías de OSM): al abrir la escena no se vuelve a pedir.
 */
export interface SceneFileV4 extends Omit<SceneFileV3, 'version'> {
  version: 4
  areaPolygonLonLat: LonLat[] | null
  contexto: ContextoArchivo | null
}

function contextoAArchivo(c: Contexto, fr: LocalFrame): ContextoArchivo {
  const ll = (p: XY): LL => {
    const g = fr.toLonLat(p)
    return [+g.lon.toFixed(7), +g.lat.toFixed(7)]
  }
  return {
    fuente: c.fuente,
    fecha: c.fecha,
    edificaciones: c.edificaciones.map((e) => ({ id: e.id, anillo: e.anillo.map(ll), huecos: e.huecos.map((h) => h.map(ll)), altura: e.altura, alturaFuente: e.alturaFuente })),
    vias: c.vias.map((v) => ({ id: v.id, linea: v.linea.map(ll), clase: v.clase })),
  }
}

function contextoDesdeArchivo(c: ContextoArchivo, fr: LocalFrame): Contexto {
  const xy = ([lon, lat]: LL) => fr.toLocal({ lon, lat })
  return {
    fuente: c.fuente,
    fecha: c.fecha,
    edificaciones: c.edificaciones.map((e) => ({ ...e, anillo: e.anillo.map(xy), huecos: e.huecos.map((h) => h.map(xy)) })),
    vias: c.vias.map((v) => ({ ...v, linea: v.linea.map(xy) })),
  }
}

/** Escena en el marco local del sitio, lista para cargar en la app. */
export interface Scene {
  site: LonLat
  /** Rectángulo de cálculo: el área, o el rectángulo envolvente del polígono. */
  area: Rect | null
  /** Polígono del área (null = el área es el rectángulo). */
  areaPolygon: XY[] | null
  /** Contexto descargado para el área (null = no hay). */
  contexto: Contexto | null
  demSource: DemSourceId
  contourInterval: number
  indexEvery: number
  terrainMode: TerrainMode
  lot: XY[]
  profileId: PerfilNormativo['id']
  maxHeight: number
  edges: EdgeSetting[]
  /** Aviso para el usuario (p. ej. una fuente que ya no está disponible). */
  notice?: string
}

export function serializeScene(s: Scene): SceneFileV4 {
  const fr = createLocalFrame(s.site)
  return {
    format: 'geoarc',
    version: 4,
    site: s.site,
    areaLonLat: s.area ? [fr.toLonLat({ x: s.area.minX, y: s.area.minY }), fr.toLonLat({ x: s.area.maxX, y: s.area.maxY })] : null,
    areaPolygonLonLat: s.area && s.areaPolygon ? s.areaPolygon.map((p) => fr.toLonLat(p)) : null,
    contexto: s.area && s.contexto ? contextoAArchivo(s.contexto, fr) : null,
    demSource: s.demSource,
    contourInterval: s.contourInterval,
    indexEvery: s.indexEvery,
    terrainMode: s.terrainMode,
    lotLonLat: s.lot.map((p) => fr.toLonLat(p)),
    profileId: s.profileId,
    maxHeight: s.maxHeight,
    edges: s.edges,
  }
}

/** Lee un .geoarc (v1 a v4). Lanza un error legible si el archivo no es una escena. */
export function parseScene(text: string): Scene {
  const f = JSON.parse(text) as SceneFileV1 | SceneFileV2 | SceneFileV3 | SceneFileV4
  if (f?.format !== 'geoarc' || ![1, 2, 3, 4].includes(f.version)) throw new Error('Archivo no reconocido')
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
    areaPolygon: f.version === 4 && area && f.areaPolygonLonLat ? f.areaPolygonLonLat.map((p) => fr.toLocal(p)) : null,
    contexto: f.version === 4 && area && f.contexto ? contextoDesdeArchivo(f.contexto, fr) : null,
    demSource: available ? f.demSource : 'terrarium',
    notice: available ? undefined : 'La escena usaba Copernicus, que requiere proxy: se usa Terrarium.',
    contourInterval: f.contourInterval,
    indexEvery: f.version === 1 ? 5 : f.indexEvery,
    // hasta v2 la envolvente se calculaba siempre sobre el terreno cargado
    terrainMode: f.version >= 3 ? (f as SceneFileV3 | SceneFileV4).terrainMode : lot.length > 2 && area ? 'sitio' : 'plano',
    lot,
    profileId: f.profileId,
    maxHeight: f.maxHeight,
    edges: f.edges,
  }
}
