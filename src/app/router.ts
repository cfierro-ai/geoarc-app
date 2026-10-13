import { useSyncExternalStore } from 'react'

/**
 * Rutas de la app: inicio, /curvas y /sombras, bajo la base del despliegue (`/` en local, `/<repo>/` en GitHub Pages).
 * Pages no tiene reescritura de rutas: el build copia index.html en curvas/, sombras/ y 404.html (vite.config.ts).
 */
export type Route = 'inicio' | 'curvas' | 'sombras'
export const MODULE_ROUTES = ['curvas', 'sombras'] as const

const BASE = import.meta.env?.BASE_URL ?? '/'

export function routeFromPath(pathname: string, base = BASE): Route {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : pathname.replace(/^\//, '')
  const seg = rest.split('/').filter(Boolean)[0] ?? ''
  return (MODULE_ROUTES as readonly string[]).includes(seg) ? (seg as Route) : 'inicio'
}

export function pathForRoute(r: Route, base = BASE): string {
  return r === 'inicio' ? base : `${base}${r}`
}

const listeners = new Set<() => void>()
const subscribe = (l: () => void) => {
  listeners.add(l)
  window.addEventListener('popstate', l)
  return () => {
    listeners.delete(l)
    window.removeEventListener('popstate', l)
  }
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => routeFromPath(window.location.pathname))
}

export function navigate(r: Route) {
  const path = pathForRoute(r)
  if (window.location.pathname !== path) window.history.pushState(null, '', path)
  for (const l of listeners) l()
  window.scrollTo(0, 0)
}
