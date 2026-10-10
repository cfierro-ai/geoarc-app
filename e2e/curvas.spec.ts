import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { centroMapa, pixelGlobal, terrariumPng } from './util'

const TEMUCO = { lon: -72.5985, lat: -38.739 }

/**
 * Módulo de curvas, flujo del profesor: ubicar el sitio → dibujar el área → las curvas aparecen.
 * Sin red externa: Terrarium se intercepta con un plano inclinado continuo entre teselas (200 m en el sitio,
 * sube 2 m/píxel al este y 1 m/píxel al sur); Copernicus no debe pedirse nunca.
 */
test('curvas: área de dos clics, Terrarium automático, escala confiable, malla y DXF', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  let terrarium = 0
  let copernicus = 0
  await page.route('https://copernicus-dem-30m.s3.amazonaws.com/**', (r) => {
    copernicus++
    return r.abort('failed')
  })
  await page.route('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/**', (r) => {
    terrarium++
    const [z, x, y] = new URL(r.request().url()).pathname.match(/(\d+)\/(\d+)\/(\d+)\.png$/)!.slice(1).map(Number)
    const ref = pixelGlobal(TEMUCO.lon, TEMUCO.lat, z)
    // el valor de cada píxel es el de su centro (i + 0,5)
    const body = terrariumPng((i, j) => 200 + 2 * (x * 256 + i + 0.5 - ref.x) + (y * 256 + j + 0.5 - ref.y))
    return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body })
  })
  await page.goto('/')

  // la fuente queda plegada en «Opciones avanzadas»; Copernicus se ve pero no se puede elegir
  const fuente = page.getByLabel('Fuente de elevación')
  await expect(fuente).toBeHidden()
  await page.getByText('Opciones avanzadas').click()
  await expect(fuente).toHaveValue('terrarium')
  const cop = fuente.locator('option[value="copernicus"]')
  await expect(cop).toHaveJSProperty('disabled', true) // toBeDisabled no aplica a <option>
  await expect(cop).toHaveText(/requiere proxy/)
  await page.getByText('Opciones avanzadas').click()

  // área: un segundo clic a 5 px (~5 m) no la cierra y el aviso del mapa dice por qué
  const { cx, cy } = await centroMapa(page)
  await page.getByRole('button', { name: 'Dibujar área en el mapa' }).click()
  await page.mouse.click(cx - 100, cy + 100)
  await page.waitForTimeout(350)
  await page.mouse.move(cx - 95, cy + 95)
  await expect(page.getByTestId('map-banner')).toContainText('al menos 10 m')
  await page.mouse.click(cx - 95, cy + 95)
  await page.waitForTimeout(350)
  await expect(page.getByTestId('area-info')).toHaveCount(0)
  // la vista previa sigue al cursor con su tamaño en metros y hectáreas
  await page.mouse.move(cx + 100, cy - 100)
  await expect(page.getByTestId('map-banner')).toContainText(/\d+ × \d+ m · [\d,]+ ha/)
  await page.screenshot({ path: 'e2e/capturas/08-area-dibujo.png' })
  await page.mouse.click(cx + 100, cy - 100)

  // sin botón: el terreno se descarga al cerrar el área
  await expect(page.getByTestId('dem-info')).toContainText('Terrarium')
  expect(terrarium).toBeGreaterThan(0)
  expect(copernicus).toBe(0)
  await expect(page.getByTestId('area-info')).toContainText(/\d+ × \d+ m · [\d,]+ ha · celda [\d,]+ m/)

  // dato de ~30 m → escala confiable 1:60.000 y equidistancia mínima sugerida (25 m) preseleccionada
  await expect(page.getByTestId('escala-valor')).toHaveText('1:60.000')
  await expect(page.getByTestId('equidistancia-sugerida')).toHaveText('25 m')
  await expect(page.getByLabel('Equidistancia')).toHaveValue('25')
  await expect(page.getByTestId('map')).not.toHaveAttribute('data-curvas', '0')

  // malla del dato sobre el mapa
  await page.getByLabel(/Mostrar la malla del dato/).check()
  await expect(page.getByTestId('map')).not.toHaveAttribute('data-malla', '0')
  await expect(page.getByTestId('map')).toHaveAttribute('data-idle', 'true', { timeout: 30_000 })
  await page.screenshot({ path: 'e2e/capturas/09-curvas-terrarium.png' })

  // DXF: maestras cada 50 m (1 de 2) → la curva de 200 m, la del sitio, es maestra y lleva su cota
  await page.getByLabel('Maestras cada').selectOption('2')
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar curvas DXF (UTM)' }).click(),
  ])
  expect(descarga.suggestedFilename()).toMatch(/^geoarc_curvas_.*_UTM18S\.dxf$/)
  await descarga.saveAs('e2e/capturas/10-curvas-terrarium.dxf')
  const dxf = await readFile(await descarga.path(), 'utf8')
  expect([...dxf.matchAll(/\nLAYER\n2\n(\w+)\n/g)].map((m) => m[1])).toEqual(['CURVAS', 'CURVAS_MAESTRAS', 'ETIQUETAS', 'AREA'])
  expect(dxf).toMatch(/\nTEXT\n8\nETIQUETAS\n(?:.*\n)*?1\n200\n/)
  expect(dxf).toMatch(/\nPOLYLINE\n8\nAREA\n/)

  expect(errors).toEqual([])
})
