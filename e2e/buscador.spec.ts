import { expect, test } from '@playwright/test'

/** Nominatim limita (429) → la búsqueda responde con Photon y lo atribuye. Sin red externa: ambos se interceptan. */
test('buscador: si Nominatim limita, responde Photon', async ({ page }) => {
  let nominatim = 0
  await page.route('https://nominatim.openstreetmap.org/**', (r) => {
    nominatim++
    return r.fulfill({ status: 429, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'Too Many Requests' })
  })
  await page.route('https://photon.komoot.io/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-70.6506, -33.4378] },
            properties: { name: 'Plaza de Armas', city: 'Santiago', state: 'Región Metropolitana de Santiago', country: 'Chile' },
          },
        ],
      }),
    }),
  )

  await page.goto('/')
  await page.getByPlaceholder('Dirección o «lat, lon»').fill('Plaza de Armas, Santiago')
  await page.getByRole('button', { name: 'Buscar' }).click()

  const resultado = page.getByRole('button', { name: /Plaza de Armas, Santiago/ })
  await expect(resultado).toBeVisible()
  await expect(page.getByTestId('geocoder-attribution')).toContainText('Photon (komoot)')
  expect(nominatim).toBe(1)
  await page.screenshot({ path: 'e2e/capturas/07-buscador-photon.png' })

  await resultado.click()
  await expect(page.getByTestId('panel')).toContainText('-33.43780, -70.65060')
})
