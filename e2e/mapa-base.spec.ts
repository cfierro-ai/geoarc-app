import { expect, test } from '@playwright/test'

/** Red de la sala que bloquea OpenFreeMap: el mapa queda en OSM raster y se puede seguir trabajando. */
test('mapa base: si OpenFreeMap no responde, queda OSM raster', async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort('failed'))
  await page.goto('/curvas')

  await expect(page.getByTestId('map')).toHaveAttribute('data-ready', 'true')
  const base = page.getByRole('group', { name: 'Mapa base' })
  await expect(base.getByRole('button', { name: 'Mapa' })).toBeDisabled()
  await expect(base.getByRole('button', { name: 'OSM' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.maplibregl-ctrl-attrib-inner')).toContainText('© OpenStreetMap contributors')
})
