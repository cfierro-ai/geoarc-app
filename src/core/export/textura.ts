import type { MosaicoInfo } from './mosaico'

/**
 * Construye el mosaico de teselas raster en un canvas (solo navegador). Cada tesela se dibuja en su lugar; si una falla
 * (404, red, CORS) se rellena en gris y se cuenta, sin abortar la descarga. La imagen NO se reproyecta: glb.ts usa el
 * lon/lat de cada vértice para mapearlo al píxel que le toca (UV).
 */

const GRIS = '#9aa3a8'

export interface MosaicoCanvas {
  canvas: HTMLCanvasElement
  /** Teselas que no se pudieron cargar (se rellenaron en gris). */
  fallos: number
  total: number
}

export async function construirMosaico(m: MosaicoInfo, urlPlantilla: string): Promise<MosaicoCanvas> {
  const canvas = document.createElement('canvas')
  canvas.width = m.anchoPx
  canvas.height = m.altoPx
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D no disponible')
  ctx.fillStyle = GRIS
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  let fallos = 0
  const jobs: Promise<void>[] = []
  for (let ty = 0; ty < m.ny; ty++)
    for (let tx = 0; tx < m.nx; tx++) {
      const url = urlPlantilla.replace('{z}', String(m.zoom)).replace('{x}', String(m.x0 + tx)).replace('{y}', String(m.y0 + ty))
      jobs.push(
        cargarTesela(url)
          .then((img) => void ctx.drawImage(img, tx * 256, ty * 256, 256, 256))
          .catch(() => {
            fallos++
            ctx.fillStyle = GRIS
            ctx.fillRect(tx * 256, ty * 256, 256, 256)
          }),
      )
    }
  await Promise.all(jobs)
  return { canvas, fallos, total: m.nx * m.ny }
}

function cargarTesela(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // necesario para leer el canvas (GLTFExporter incrusta la imagen)
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(url))
    img.src = url
  })
}
