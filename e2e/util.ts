import { crc32, deflateSync } from 'node:zlib'
import { expect, type Page } from '@playwright/test'

/** Abre «Opciones avanzadas» y elige la ladera sintética (sin red). */
export async function usarLaderaSintetica(page: Page) {
  await page.getByText('Opciones avanzadas').click()
  await page.getByLabel('Fuente de elevación').selectOption('sintetico')
}

/** Centro del mapa en pantalla (ahí está el sitio). */
export async function centroMapa(page: Page) {
  await expect(page.getByTestId('map')).toHaveAttribute('data-ready', 'true') // el mapa se crea tras cargar el estilo base
  const box = (await page.getByTestId('map').boundingBox())!
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 }
}

const TEMUCO = { lon: -72.5985, lat: -38.739 }

/**
 * Intercepta Terrarium (sin red externa) con un plano inclinado continuo entre teselas: 200 m en Temuco, sube
 * 2 m/píxel al este y 1 m/píxel al sur. Copernicus se aborta. Devuelve los contadores de peticiones.
 */
export async function interceptarTerrarium(page: Page) {
  const n = { terrarium: 0, copernicus: 0 }
  await page.route('https://copernicus-dem-30m.s3.amazonaws.com/**', (r) => {
    n.copernicus++
    return r.abort('failed')
  })
  await page.route('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/**', (r) => {
    n.terrarium++
    const [z, x, y] = new URL(r.request().url()).pathname.match(/(\d+)\/(\d+)\/(\d+)\.png$/)!.slice(1).map(Number)
    const ref = pixelGlobal(TEMUCO.lon, TEMUCO.lat, z)
    // el valor de cada píxel es el de su centro (i + 0,5)
    const body = terrariumPng((i, j) => 200 + 2 * (x * 256 + i + 0.5 - ref.x) + (y * 256 + j + 0.5 - ref.y))
    return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body })
  })
  return n
}

/** Dibuja el área con dos clics en esquinas opuestas, a ±d px del centro del mapa (a zoom 17, ~0,47 m/px en Temuco). */
export async function dibujarArea(page: Page, d = 100) {
  const { cx, cy } = await centroMapa(page)
  await page.getByRole('button', { name: /Dibujar área en el mapa|Redibujar área/ }).click()
  await page.mouse.click(cx - d, cy + d)
  await page.waitForTimeout(350) // evita que dos clics seguidos se lean como doble clic
  await page.mouse.move(cx + d, cy - d)
  await page.mouse.click(cx + d, cy - d)
}

/** PNG RGB 256×256 a partir de una función de cota por píxel, con la codificación Terrarium (r·256 + g + b/256 − 32768). */
export function terrariumPng(cota: (i: number, j: number) => number): Buffer {
  const W = 256
  const rows: Buffer[] = []
  for (let j = 0; j < W; j++) {
    const row = Buffer.alloc(1 + W * 3) // byte de filtro 0 + RGB
    for (let i = 0; i < W; i++) {
      const v = cota(i, j) + 32768
      const e = Math.floor(v)
      row[1 + i * 3] = e >> 8
      row[2 + i * 3] = e & 255
      row[3 + i * 3] = Math.floor((v - e) * 256)
    }
    rows.push(row)
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(W, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Coordenada global de píxel Web Mercator (256 px por tesela). */
export function pixelGlobal(lon: number, lat: number, z: number) {
  const n = 2 ** z * 256
  const r = (lat * Math.PI) / 180
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n }
}
