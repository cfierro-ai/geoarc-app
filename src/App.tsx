import { useEffect, useRef } from 'react'
import { Home } from './app/components/Home'
import { btn } from './app/components/ui'
import { download } from './app/util'
import { navigate, pathForRoute, useRoute, type Route } from './app/router'
import { parseScene, serializeScene } from './app/scene'
import { actions, sombras3dAvailable, useAppState } from './app/store'
import type { View } from './app/model'
import { CurvasModule } from './modules/curvas/CurvasModule'
import { SombrasModule } from './modules/sombras/SombrasModule'

const TITLES: Record<Route, string> = {
  inicio: 'GEO·ARC — Curvas de nivel y estudio de sombras',
  curvas: 'Curvas de nivel · GEO·ARC',
  sombras: 'Estudio de sombras · GEO·ARC',
}

const MODULES: { route: Exclude<Route, 'inicio'>; label: string }[] = [
  { route: 'curvas', label: 'Curvas de nivel' },
  { route: 'sombras', label: 'Estudio de sombras' },
]

/** Selector Mapa / Vista 3D del módulo activo. */
function ViewToggle({ route }: { route: Exclude<Route, 'inicio'> }) {
  const view = useAppState((s) => (route === 'curvas' ? s.curvas.view : s.sombras.view))
  const available = useAppState((s) => (route === 'curvas' ? !!s.terrain.dem : sombras3dAvailable(s)))
  const shown: View = available ? view : 'mapa'
  const setView = (v: View) => (route === 'curvas' ? actions.setCurvas({ view: v }) : actions.setSombras({ view: v }))
  return (
    <div className="flex overflow-hidden rounded-md border border-slate-300 text-sm" role="group" aria-label="Vista">
      {(['mapa', '3d'] as const).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          disabled={v === '3d' && !available}
          className={`px-3 py-1 disabled:opacity-40 ${shown === v ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}`}
        >
          {v === 'mapa' ? 'Mapa' : 'Vista 3D'}
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const route = useRoute()
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.title = TITLES[route]
  }, [route])

  const save = () => download('escena.geoarc', JSON.stringify(serializeScene(actions.currentScene()), null, 2), 'application/json')
  const open = async (file: File) => {
    const s = parseScene(await file.text())
    void actions.openScene(s)
    if (route === 'inicio') navigate(s.lot.length > 2 ? 'sombras' : 'curvas')
  }

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-800">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex flex-wrap items-center gap-4">
          <a
            href={pathForRoute('inicio')}
            onClick={(e) => (e.preventDefault(), navigate('inicio'))}
            className="flex items-baseline gap-3"
            aria-label="GEO·ARC — inicio"
          >
            <h1 className="text-lg font-semibold tracking-tight">GEO·ARC</h1>
            <span className="hidden text-xs text-slate-500 lg:inline">Terreno real y norma · META|Lab</span>
          </a>
          <nav className="flex gap-1 text-sm" aria-label="Módulos">
            {MODULES.map((m) => (
              <a
                key={m.route}
                href={pathForRoute(m.route)}
                onClick={(e) => (e.preventDefault(), navigate(m.route))}
                aria-current={route === m.route ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1 ${route === m.route ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {m.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {route !== 'inicio' && <ViewToggle route={route} />}
          <button className={btn} onClick={save} title="Guardar sitio, área, lote y norma en un archivo">Guardar .geoarc</button>
          <button className={btn} onClick={() => fileRef.current?.click()}>Abrir .geoarc</button>
          <input
            ref={fileRef}
            type="file"
            accept=".geoarc,application/json"
            className="hidden"
            data-testid="abrir-escena"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) open(f).catch((err) => alert(String(err)))
              e.target.value = ''
            }}
          />
        </div>
      </header>
      {route === 'inicio' && <Home />}
      {route === 'curvas' && <CurvasModule />}
      {route === 'sombras' && <SombrasModule />}
    </div>
  )
}
