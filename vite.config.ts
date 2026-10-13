/// <reference types="vitest/config" />
import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

/** Rutas de los módulos (deben coincidir con MODULE_ROUTES en src/app/router.ts). */
const ROUTES = ['curvas', 'sombras']

/**
 * GitHub Pages no reescribe rutas: /curvas daría 404. Tras el build se copia index.html en <ruta>/index.html (responde
 * 200) y en 404.html (respaldo para cualquier otra ruta). Los recursos usan rutas absolutas con la base, así que la
 * misma página sirve desde cualquier carpeta.
 */
function rutasEstaticas(): Plugin {
  let outDir = 'dist'
  return {
    name: 'geoarc-rutas-estaticas',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir)
    },
    closeBundle() {
      const index = resolve(outDir, 'index.html')
      for (const r of ROUTES) {
        mkdirSync(resolve(outDir, r), { recursive: true })
        copyFileSync(index, resolve(outDir, r, 'index.html'))
      }
      copyFileSync(index, resolve(outDir, '404.html'))
    },
  }
}

export default defineConfig({
  // GitHub Pages publica bajo /<repo>/; en local y otros hostings, raíz.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss(), rutasEstaticas()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
})
