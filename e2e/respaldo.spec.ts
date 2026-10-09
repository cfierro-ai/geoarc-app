import { crc32, deflateSync } from 'node:zlib'
import { expect, test } from '@playwright/test'

/** PNG RGB 256×256 con codificación Terrarium: cota = r·256 + g + b/256 − 32768. Rampa de 100 a 131 m hacia el este. */
function terrariumTile(): Buffer {
  const W = 256
  const rows: Buffer[] = []
  for (let y = 0; y < W; y++) {
    const row = Buffer.alloc(1 + W * 3) // byte de filtro 0 + RGB
    for (let x = 0; x < W; x++) {
      const v = 100 + Math.floor(x / 8) + 32768
      row[1 + x * 3] = v >> 8
      row[2 + x * 3] = v & 255
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

/**
 * Copernicus bloqueado (como hoy por CORS) → la app carga Terrarium sola, cambia el selector y avisa.
 * Sin red externa: ambas fuentes se interceptan.
 */
test('si Copernicus falla, se usa Terrarium y se avisa', async ({ page }) => {
  const tile = terrariumTile()
  let copernicusRequests = 0
  await page.route('https://copernicus-dem-30m.s3.amazonaws.com/**', (r) => {
    copernicusRequests++
    return r.abort('failed')
  })
  await page.route('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: tile }),
  )

  await page.goto('/')
  const fuente = page.getByLabel('Fuente de elevación')
  await expect(fuente).toHaveValue('terrarium') // Terrarium es la fuente por defecto

  await fuente.selectOption('copernicus')
  await page.getByRole('button', { name: 'Cargar terreno' }).click()

  await expect(page.getByTestId('dem-aviso')).toHaveText('Copernicus no disponible; se usó Terrarium.')
  await expect(page.getByTestId('dem-info')).toContainText('Terrarium')
  await expect(fuente).toHaveValue('terrarium')
  expect(copernicusRequests).toBeGreaterThan(0)

  await page.getByTestId('dem-aviso').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'e2e/capturas/05-respaldo-terrarium.png' })
})
