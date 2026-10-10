import type { LonLat, XY } from '../core/geo/local'
import type { EdgeRule } from '../core/envelope/envelope'
import type { EdgeRole, PerfilNormativo } from '../core/normativa/perfiles'
import { reglaPorRol } from '../core/normativa/perfiles'
import { lotFromDimensions } from '../core/envelope/lote'

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

export type MapMode = 'none' | 'site' | 'area' | 'lot'

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

/** Terreno del estudio de sombras. */
export type TerrainMode = 'plano' | 'sitio' | 'levantamiento'

export const TERRAIN_MODES: { id: TerrainMode; label: string; hint: string; disabled?: string }[] = [
  { id: 'plano', label: 'Plano (cota 0)', hint: 'Sin topografía: la envolvente «de libro». No necesita conexión.' },
  { id: 'sitio', label: 'Terreno del sitio', hint: 'Terreno real alrededor del lote: se descarga solo (o se reutiliza el del módulo de curvas).' },
  { id: 'levantamiento', label: 'Levantamiento importado', hint: 'DXF de un levantamiento topográfico (curvas o puntos con cota).' },
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
