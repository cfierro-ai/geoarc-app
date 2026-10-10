import { expect, test } from '@playwright/test'
import { interceptarTerrarium } from './util'

/**
 * Estudio de sombras en plano (cota 0), el terreno por defecto: no pide red. Caso dorado del núcleo
 * («lote plano 20×20, rasante 70°»): techo al centro = 10·tan 70° = 27,47 m. La UI muestra la altura máxima de las
 * celdas de cálculo (0,25 m); la más central está a 0,125 m del centro → 9,875·tan 70° = 27,13 m.
 */
test('sombras en plano: lote por dimensiones 20×20, rasante 70° → caso dorado', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const n = await interceptarTerrarium(page)
  await page.goto('/sombras')

  await expect(page.getByRole('radio', { name: /Plano \(cota 0\)/ })).toBeChecked()
  await expect(page.getByRole('radio', { name: /Levantamiento importado/ })).toBeEnabled() // ver levantamiento.spec.ts

  await page.getByLabel('Ancho del lote').fill('20')
  await page.getByLabel('Fondo del lote').fill('20')
  await page.getByLabel('Giro del lote').fill('0')
  await page.getByTestId('lote-dimensiones').getByRole('button', { name: 'Crear' }).click()
  await expect(page.getByTestId('lot-info')).toContainText('4 lados · superficie 400,0 m² · perímetro 80,0 m')

  // los 4 lados como deslinde (rasante 70° del perfil) y sin altura máxima
  await page.getByLabel('Rol lado 1').selectOption('deslinde')
  await page.getByLabel('Altura máxima').fill('0')
  await expect(page.getByTestId('terreno-estudio')).toHaveText('Plano (cota 0)')
  await expect(page.getByTestId('altura-max')).toHaveText('27,1 m')
  await expect(page.getByTestId('results')).toContainText('400,0 m²')
  expect(n.terrarium).toBe(0) // el plano no usa red

  await page.getByRole('button', { name: 'Vista 3D' }).click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e/capturas/12-sombras-plano-3d.png' })
  expect(errors).toEqual([])
})

test('sombras sobre el terreno del sitio: se descarga solo alrededor del lote', async ({ page }) => {
  const n = await interceptarTerrarium(page)
  await page.goto('/sombras')
  await page.getByRole('radio', { name: /Terreno del sitio/ }).check()
  await expect(page.getByText(/el terreno se descarga solo a su alrededor/)).toBeVisible()
  expect(n.terrarium).toBe(0) // sin lote, todavía no hay nada que descargar

  await page.getByRole('button', { name: 'Lote de ejemplo' }).click()
  await expect(page.getByTestId('dem-info')).toContainText('Terrarium')
  expect(n.terrarium).toBeGreaterThan(0)
  expect(n.copernicus).toBe(0)
  await expect(page.getByTestId('terreno-estudio')).toHaveText('Terrarium (AWS Terrain Tiles)')
  await expect(page.getByTestId('volume')).not.toHaveText('0 m³')
  await expect(page.getByTestId('map')).toHaveAttribute('data-idle', 'true', { timeout: 30_000 })
  await page.screenshot({ path: 'e2e/capturas/13-sombras-sitio.png' })
})
