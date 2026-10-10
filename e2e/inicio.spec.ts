import { expect, test } from '@playwright/test'

/** Navegación: inicio con dos tarjetas, rutas /curvas y /sombras, sitio compartido, atrás/adelante y carga directa. */
test('inicio, rutas y estado compartido entre módulos', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/Curvas de nivel y estudio de sombras/)
  await expect(page.getByTestId('tarjeta-curvas')).toContainText('Curvas de nivel')
  await expect(page.getByTestId('tarjeta-sombras')).toContainText('Estudio de sombras')
  await page.screenshot({ path: 'e2e/capturas/00-inicio.png' })

  await page.getByTestId('tarjeta-sombras').click()
  await expect(page).toHaveURL(/\/sombras$/)
  await expect(page).toHaveTitle(/^Estudio de sombras/)

  // el sitio elegido en un módulo es el del otro
  await page.getByPlaceholder('Dirección o «lat, lon»').fill('-33.4378, -70.6506')
  await page.getByRole('button', { name: 'Buscar' }).click()
  await expect(page.getByTestId('panel-sombras')).toContainText('-33.43780, -70.65060 · UTM 19S')
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Curvas de nivel' }).click()
  await expect(page).toHaveURL(/\/curvas$/)
  await expect(page.getByTestId('panel-curvas')).toContainText('-33.43780, -70.65060 · UTM 19S')

  // atrás / adelante del navegador
  await page.goBack()
  await expect(page.getByTestId('panel-sombras')).toBeVisible()
  await page.goForward()
  await expect(page.getByTestId('panel-curvas')).toBeVisible()

  // carga directa de una ruta (GitHub Pages: el build copia index.html en sombras/ y 404.html)
  await page.goto('/sombras/')
  await expect(page.getByTestId('panel-sombras')).toBeVisible()
  await page.goto('/otra-cosa')
  await expect(page.getByTestId('inicio')).toBeVisible()
  await page.getByRole('link', { name: 'GEO·ARC — inicio' }).click()
  await expect(page.getByTestId('inicio')).toBeVisible()
})
