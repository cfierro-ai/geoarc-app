import type { LonLat, XY } from '../core/geo/local'
import type { EdgeRule } from '../core/envelope/envelope'
import type { EdgeRole, PerfilNormativo } from '../core/normativa/perfiles'
import { reglaPorRol } from '../core/normativa/perfiles'
import { lotFromDimensions } from '../core/envelope/lote'

/** OpenFreeMap, estilo vectorial «Liberty»: mapa base y respaldo del contexto (sus teselas traen edificios y vías). */
export const OFM_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

export type DemSourceId = 'copernicus' | 'terrarium' | 'sintetico'

export interface DemSourceInfo {
  id: DemSourceId
  label: string
  hint: string
  /** Si está, la fuente se muestra en el selector pero no se puede elegir; el texto dice por qué. */
  disabled?: string
}

export const DEM_SOURCES: DemSourceInfo[] = [
  { id: 'terrarium', label: 'Terrarium / SRTM (automático)', hint: 'Se descarga solo. Global; ~30 m en Chile; referencial.' },
  {
    id: 'copernicus',
    label: 'Copernicus GLO-30 (DSM)',
    hint: 'Superficie: incluye árboles y edificios. Su servidor no permite lectura desde el navegador (CORS).',
    disabled: 'requiere proxy',
  },
  { id: 'sintetico', label: 'Ladera sintética (sin conexión)', hint: 'Terreno inventado, para clases sin internet y pruebas.' },
]

export const isSourceAvailable = (id: DemSourceId) => !DEM_SOURCES.find((d) => d.id === id)?.disabled

/** Curvas maestras: una de cada N curvas. */
export const INDEX_EVERY_OPTIONS = [2, 4, 5, 10]

export interface EdgeSetting {
  role: EdgeRole
  rule: EdgeRule
}

/** Qué hace un clic en el mapa: nada, fijar el sitio, área rectangular (dos esquinas), área poligonal, lote o medir. */
export type MapMode = 'none' | 'site' | 'area' | 'poligono' | 'lot' | 'medir'

export const EDGE_COLORS = ['#e4572e', '#17bebb', '#f2b705', '#76b041', '#8e6bbf', '#2e86ab', '#f28482', '#a0522d']
export const MAX_HEIGHT_COLOR = '#9aa3ad'

export const edgeColor = (k: number) => EDGE_COLORS[k % EDGE_COLORS.length]

export const ROLE_LABEL: Record<EdgeRole, string> = {
  deslinde: 'Deslinde',
  frente: 'Frente a calle',
  libre: 'Sin rasante',
}

export function defaultEdges(n: number, p: PerfilNormativo): EdgeSetting[] {
  return Array.from({ length: n }, (_, k) => {
    const role: EdgeRole = k === 0 ? 'frente' : 'deslinde'
    return { role, rule: reglaPorRol(p, role) }
  })
}

/** Lote de ejemplo: 20 × 35 m girado 15°, centrado en el sitio. */
export function exampleLot(): XY[] {
  return lotFromDimensions(20, 35, 15)
}

export type View = 'mapa' | '3d'

/** Origen de las coordenadas de las descargas (DXF, OBJ). */
export type ExportOrigin = 'local' | 'utm'
export const EXPORT_ORIGINS: { id: ExportOrigin; label: string; hint: string }[] = [
  { id: 'local', label: 'Local (esquina SO del área en 0,0)', hint: 'Coordenadas pequeñas, cómodas en CAD. El archivo anota el origen en UTM.' },
  { id: 'utm', label: 'UTM absolutas', hint: 'Georreferenciado: coordenadas UTM del huso del sitio. Útil para SIG.' },
]
/** Sufijo del nombre de archivo según el origen: «_local» o «_UTM». */
export const origenSufijo = (o: ExportOrigin) => (o === 'local' ? '_local' : '_UTM')

/**
 * Densidad de la malla 3D (GLB y OBJ): objetivo de celdas en el lado MAYOR del área. La grilla del dato se submuestrea a
 * esa densidad. Más densidad = más detalle y archivo más grande. Para ajustar los niveles, cambiar `celdasLado` aquí.
 */
export type DensidadId = 'gruesa' | 'media' | 'fina'
export interface DensidadInfo {
  id: DensidadId
  label: string
  celdasLado: number
  hint: string
}
export const DENSIDADES: DensidadInfo[] = [
  { id: 'gruesa', label: 'Gruesa', celdasLado: 60, hint: 'Pocos triángulos: liviana, para corte láser o impresión 3D.' },
  { id: 'media', label: 'Media', celdasLado: 120, hint: 'Equilibrio entre detalle y tamaño.' },
  { id: 'fina', label: 'Fina', celdasLado: 240, hint: 'Más detalle; archivo más grande.' },
]
export const densidadDe = (id: DensidadId) => DENSIDADES.find((d) => d.id === id) ?? DENSIDADES[1]

/** Textura del modelo 3D (GLB): mosaico de teselas raster (sin reproyectar), o sin textura. Por defecto satelital. */
export type TexturaId = 'satelital' | 'osm' | 'ninguna'
export interface TexturaInfo {
  id: TexturaId
  label: string
  atribucion?: string
  /** Plantilla de URL de teselas; {z}/{x}/{y}. Esri usa {z}/{y}/{x}. */
  urlPlantilla?: string
  /** Zoom máximo con imagen de la fuente (sobre eso el mosaico se queda más chico que el objetivo de 2048–4096 px). */
  maxZoom?: number
}
export const TEXTURAS: TexturaInfo[] = [
  {
    id: 'satelital',
    label: 'Satelital (Esri)',
    atribucion: 'Imágenes: Esri, Maxar, Earthstar Geographics y la comunidad de usuarios GIS',
    urlPlantilla: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    // World Imagery tiene imagen hasta ~z19 en Chile (z20+ devuelve «Map data not yet available»); sobre eso, mosaico más chico
    maxZoom: 19,
  },
  { id: 'osm', label: 'Mapa (OSM)', atribucion: '© OpenStreetMap contributors', urlPlantilla: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19 },
  { id: 'ninguna', label: 'Sin textura' },
]
export const texturaDe = (id: TexturaId) => TEXTURAS.find((t) => t.id === id) ?? TEXTURAS[0]

/**
 * Nota permanente de la tarjeta «Modelo 3D (GLB)»: con qué se abre. Una sola constante para ajustarla cuando Chris
 * confirme las versiones de SketchUp.
 */
export const GLB_NOTA_APERTURA =
  'Se abre con: SketchUp Pro de escritorio (Archivo → Importar), Blender (gratuito) y el visor 3D de Windows. Si tu SketchUp no lo importa, Blender lo abre y lo convierte.'

/** Terreno del estudio de sombras. */
export type TerrainMode = 'plano' | 'sitio'

export const TERRAIN_MODES: { id: TerrainMode; label: string; hint: string }[] = [
  { id: 'plano', label: 'Plano (cota 0)', hint: 'Sin topografía: la envolvente «de libro». No necesita conexión.' },
  { id: 'sitio', label: 'Terreno del sitio', hint: 'Terreno real alrededor del lote: se descarga solo (o se reutiliza el del módulo de curvas).' },
]

/** Estado de la carga del terreno. */
export interface DemStatus {
  state: 'idle' | 'loading' | 'error'
  msg?: string
  warn?: string
}

export const TEMUCO: LonLat = { lon: -72.5985, lat: -38.739 }

export const fmt = (v: number, d = 1) =>
  Number.isFinite(v) ? v.toLocaleString('es-CL', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—'

/** Número con los decimales justos (hasta `d`): 2 → «2», 1,25 → «1,25». */
export const fmtNum = (v: number, d = 2) => (Number.isFinite(v) ? v.toLocaleString('es-CL', { maximumFractionDigits: d }) : '—')

/** Tamaño de un área: «312 × 180 m · 5,62 ha». */
export function fmtAreaSize(w: number, h: number): string {
  return `${fmt(w, 0)} × ${fmt(h, 0)} m · ${fmt((w * h) / 10_000, 2)} ha`
}
