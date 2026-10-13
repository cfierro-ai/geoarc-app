import type { ReactNode } from 'react'
import { navigate, pathForRoute, type Route } from '../router'

function ContoursIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 44c6-10 14-14 24-14s18 4 24 12" />
      <path d="M14 50c5-6 11-9 18-9s13 3 18 8" opacity=".6" />
      <path d="M18 34c4-9 9-14 15-14s11 5 14 13" />
      <path d="M26 26c2-5 4-8 7-8s5 3 6 7" opacity=".6" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="46" cy="16" r="6" />
      <path d="M46 4v4M46 24v4M34 16h4M54 16h4M38 8l3 3M51 21l3 3M54 8l-3 3" opacity=".6" />
      <path d="M8 54h48" />
      <path d="M16 54V32h14v22" />
      <path d="M30 32 44 54" strokeDasharray="3 3" />
    </svg>
  )
}

function ModuleCard({ route, title, icon, children, steps }: { route: Route; title: string; icon: ReactNode; children: ReactNode; steps: string[] }) {
  return (
    <a
      href={pathForRoute(route)}
      onClick={(e) => {
        e.preventDefault()
        navigate(route)
      }}
      className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
      data-testid={`tarjeta-${route}`}
    >
      <div className="flex items-center gap-3 text-slate-700">
        {icon}
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{children}</p>
      <ol className="mt-3 space-y-1 text-sm text-slate-700">
        {steps.map((s, k) => (
          <li key={k} className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs">{k + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <span className="mt-4 self-start rounded-md bg-slate-800 px-3 py-1 text-sm text-white group-hover:bg-slate-700">Entrar</span>
    </a>
  )
}

/** Pantalla de inicio: un módulo por tarjeta. Cada módulo funciona solo; el sitio y el terreno se comparten. */
export function Home() {
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50" data-testid="inicio">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Terreno real y norma, para el taller</h2>
        <p className="mt-1 text-sm text-slate-600">
          Elige un módulo. Cada uno funciona solo; el sitio y el terreno que cargues se comparten entre ambos.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ModuleCard route="curvas" title="Curvas de nivel" icon={<ContoursIcon />} steps={['Ubica el sitio', 'Dibuja el área', 'Las curvas aparecen']}>
            Curvas del terreno real de cualquier lugar, con la equidistancia que el dato sostiene. Exporta a DXF georreferenciado
            (UTM) con cotas.
          </ModuleCard>
          <ModuleCard route="sombras" title="Estudio de sombras" icon={<SunIcon />} steps={['Ubica el sitio', 'Define el lote', 'Aplica rasantes y altura máxima']}>
            Envolvente por rasantes, distanciamientos y altura máxima, en plano o sobre el terreno del sitio. Muestra qué
            restricción manda en cada punto; vista 3D y DXF.
          </ModuleCard>
        </div>
        <p className="mt-8 text-[11px] leading-snug text-slate-400">
          Herramienta docente de META|Lab, Universidad Autónoma de Chile. Los resultados no reemplazan un levantamiento
          topográfico ni el certificado de informaciones previas.
        </p>
      </div>
    </div>
  )
}
