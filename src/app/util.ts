import { useEffect } from 'react'
import type { MapMode } from './model'

/** Esc cancela el dibujo en curso (sitio, área o lote). */
export function useEscape(mode: MapMode, cancel: () => void) {
  useEffect(() => {
    if (mode === 'none') return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, cancel])
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
