import { expect, test } from '@playwright/test'

/**
 * Flujo docente completo SIN red externa: ladera sintética + lote de ejemplo.
 * Deja capturas en e2e/capturas/ para revisión visual.
 */
test('sitio → terreno sintético → lote → envolvente → vista 3D', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'GEO·ARC' })).toBeVisible()

  await page.getByLabel('Fuente de elevación').selectOption('sintetico')
  await page.getByRole('button', { name: 'Cargar terreno' }).click()
  await expect(page.getByTestId('dem-info')).toContainText('Ladera sintética')

  await page.getByRole('button', { name: 'Lote de ejemplo' }).click()
  await expect(page.getByTestId('lot-info')).toContainText('4 lados')
  await expect(page.getByTestId('lot-info')).toContainText('700,0 m²')

  // la envolvente existe y tiene volumen positivo
  await expect(page.getByTestId('volume')).not.toHaveText('0 m³')
  const vol1 = await page.getByTestId('volume').innerText()

  // bajar la altura máxima reduce el volumen
  await page.getByLabel('Altura máxima').fill('6')
  await expect(page.getByTestId('volume')).not.toHaveText(vol1)

  // el mapa ocupa todo el visor (regresión: MapLibre forzaba position: relative → 300 px)
  const mapBox = await page.getByTestId('map').boundingBox()
  expect(mapBox!.height).toBeGreaterThan(600)
  await expect(page.getByTestId('map')).toHaveAttribute('data-idle', 'true') // curvas y lote ya dibujados
  await page.screenshot({ path: 'e2e/capturas/01-panel-mapa.png' })

  await page.getByRole('button', { name: 'Vista 3D' }).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'e2e/capturas/02-vista-3d.png' })

  // vista 3D: el panel de un lado resalta su rasante
  await page.getByLabel('Rol lado 1').hover()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e/capturas/03-lado1-resaltado.png' })

  expect(errors).toEqual([])
})
