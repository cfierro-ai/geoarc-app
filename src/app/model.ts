import type { LonLat, XY } from '../core/geo/local'
import type { EdgeRule } from '../core/envelope/envelope'
import type { EdgeRole, PerfilNormativo } from '../core/normativa/perfiles'
import { reglaPorRol } from '../core/normativa/perfiles'

export type DemSourceId = 'copernicus' | 'terrarium' | 'sintetico'

export const DEM_SOURCES: { id: DemSourceId; label: string; hint: string }[] = [
  { id: 'terrarium', label: 'Terrarium / SRTM (global)', hint: 'Referencial; ~30 m en Chile.' },
  {
    id: 'copernicus',
    label: 'Copernicus GLO-30 (DSM, global)',
    hint: 'Superficie: incluye árboles y edificios. Hoy su servidor no permite lectura desde el navegador (CORS); si falla, se usa Terrarium.',
  },
  { id: 'sintetico', label: 'Ladera sintética (sin conexión)', hint: 'Para práctica y pruebas.' },
]

export interface EdgeSetting {
  role: EdgeRole
  rule: EdgeRule
}

export type MapMode = 'none' | 'site' | 'lot'

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
  const w = 20
  const d = 35
  const a = (15 * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 },
    { x: w / 2, y: d / 2 },
    { x: -w / 2, y: d / 2 },
  ].map((p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c }))
}

export const TEMUCO: LonLat = { lon: -72.5985, lat: -38.739 }

export const fmt = (v: number, d = 1) =>
  Number.isFinite(v) ? v.toLocaleString('es-CL', { maximumFractionDigits: d, minimumFractionDigits: d }) : '—'

/** Archivo de escena .geoarc (JSON). */
export interface SceneFile {
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
