import { expect, test } from '@playwright/test'
import { centroMapa, interceptarContexto, interceptarMapaBase, interceptarTerrarium } from './util'

/** Herramienta Medir: distancia acumulada por clics y área al cerrar con doble clic (en el marco métrico local). */
test('medir: el lado de un área dibujada coincide con su ancho; doble clic da el área', async ({ page }) => {
  await interceptarTerrarium(page)
  await interceptarContexto(page)
  await interceptarMapaBase(page)
  await page.goto('/curvas')
  const { cx, cy } = await centroMapa(page)
  const d = 120

  // dibujar un rectángulo (esquinas opuestas) y leer su ancho del panel
  await page.getByRole('button', { name: 'Dibujar rectángulo' }).click()
  await page.mouse.click(cx - d, cy + d)
  await page.waitForTimeout(350)
  await page.mouse.click(cx + d, cy - d)
  await expect(page.getByTestId('area-info')).toContainText(/\d+ × \d+ m/)
  const anchoTxt = await page.getByTestId('area-info').innerText()
  const ancho = +anchoTxt.match(/(\d+) × \d+ m/)![1]

  // medir el lado inferior (de esquina a esquina, misma y de pantalla)
  await page.getByRole('button', { name: 'Medir' }).click()
  await page.mouse.click(cx - d, cy + d)
  await page.waitForTimeout(250)
  await page.mouse.click(cx + d, cy + d)
  await expect(page.getByTestId('medida-info')).toContainText('Distancia:')
  const distTxt = await page.getByTestId('medida-info').innerText()
  const dist = +distTxt.match(/Distancia: ([\d.,]+) m/)![1].replace(/\./g, '').replace(',', '.')
  expect(Math.abs(dist - ancho) / ancho).toBeLessThan(0.04)
  await page.screenshot({ path: 'e2e/capturas/21-medir-distancia.png' })

  // cerrar un triángulo con doble clic → área en m² y ha
  await page.getByRole('button', { name: 'Terminar' }).click()
  await page.getByRole('button', { name: 'Medir' }).click()
  await page.mouse.click(cx - d, cy + d)
  await page.waitForTimeout(250)
  await page.mouse.click(cx + d, cy + d)
  await page.waitForTimeout(250)
  await page.mouse.dblclick(cx + d, cy - d)
  await expect(page.getByTestId('medida-info')).toContainText(/Área: [\d.,]+ m² · [\d.,]+ ha/)
  await page.screenshot({ path: 'e2e/capturas/22-medir-area.png' })
})

test('medir: también está en el Estudio de sombras', async ({ page }) => {
  await interceptarTerrarium(page)
  await interceptarMapaBase(page)
  await page.goto('/sombras')
  await centroMapa(page)
  await page.getByRole('button', { name: 'Medir', exact: true }).click()
  await expect(page.getByTestId('medida-info')).toBeVisible()
})
