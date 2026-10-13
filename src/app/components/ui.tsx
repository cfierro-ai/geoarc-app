import type { ReactNode } from 'react'

export const btn = 'rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm hover:bg-slate-100 disabled:opacity-40'
export const btnPrimary = 'rounded-md bg-slate-800 px-3 py-1 text-sm text-white hover:bg-slate-700 disabled:opacity-40'
export const input = 'w-full rounded border border-slate-300 bg-white px-1.5 py-0.5 text-sm'

export function Section({ n, title, children, done }: { n: number; title: string; children: ReactNode; done?: boolean }) {
  return (
    <section className="border-b border-slate-200 px-4 py-3">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${done ? 'bg-emerald-600 text-white' : 'bg-slate-200'}`}>{n}</span>
        {title}
      </h2>
      <div className="space-y-2 text-sm">{children}</div>
    </section>
  )
}

export function Note({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const c =
    tone === 'warn'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : tone === 'error'
        ? 'border-red-300 bg-red-50 text-red-900'
        : 'border-sky-200 bg-sky-50 text-sky-900'
  return <div className={`rounded-md border px-2 py-1.5 text-xs leading-snug ${c}`}>{children}</div>
}

export function Num({ value, onChange, step = 0.5, min, label }: { value: number; onChange: (v: number) => void; step?: number; min?: number; label: string }) {
  return (
    <input
      aria-label={label}
      type="number"
      className={input}
      value={Number.isFinite(value) ? value : ''}
      step={step}
      min={min}
      onChange={(e) => {
        const v = parseFloat(e.target.value)
        if (!Number.isNaN(v)) onChange(v)
      }}
    />
  )
}

/** Panel lateral de un módulo. */
export function ModulePanel({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <aside className="w-full shrink-0 overflow-y-auto border-r border-slate-200 bg-white md:w-[380px]" data-testid={testId}>
      {children}
      <p className="px-4 py-3 text-[11px] leading-snug text-slate-400">
        Herramienta docente. Los resultados dependen de la fuente de elevación y de los parámetros ingresados; no reemplazan un
        levantamiento topográfico ni el certificado de informaciones previas.
      </p>
    </aside>
  )
}
