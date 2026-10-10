import { expect, test } from '@playwright/test'
import { centroMapa } from './util'

/**
 * Regresión del bug del handoff v1.2: el lote dibujado debe quedar donde se hace clic.
 * Se dibuja un cuadrado en pantalla y se comprueba que el polígono resultante coincide
 * (superficie según escala del mapa y vértices sobre los puntos cliqueados). En plano: no hace falta terreno.
 */
test('dibujar lote en el mapa: el polígono queda bajo el cursor', async ({ page }) => {
  await page.goto('/sombras')
  const { cx, cy } = await centroMapa(page)
  const d = 60
  await page.getByRole('button', { name: 'Dibujar en mapa' }).click()
  for (const [dx, dy] of [[-d, -d], [d, -d], [d, d], [-d, d]]) {
    await page.mouse.click(cx + dx, cy + dy)
    await page.waitForTimeout(350) // evita que dos clics seguidos se lean como doble clic
  }
  await page.getByRole('button', { name: /Cerrar lote/ }).click()
  await expect(page.getByTestId('lot-info')).toContainText('4 lados')

  // superficie esperada = (2d px · m/px)², con m/px leído del propio mapa
  const mPerPx = await page.evaluate(() => {
    const bar = document.querySelector('.maplibregl-ctrl-scale') as HTMLElement
    const meters = parseFloat(bar.textContent!.replace(/[^\d.]/g, ''))
    const km = /km/.test(bar.textContent!)
    return ((km ? 1000 : 1) * meters) / bar.getBoundingClientRect().width
  })
  const expected = (2 * d * mPerPx) ** 2
  const txt = await page.getByTestId('lot-info').innerText()
  const area = parseFloat(txt.match(/superficie ([\d.,]+)/)![1].replace(/\./g, '').replace(',', '.'))
  expect(Math.abs(area - expected) / expected).toBeLessThan(0.05)

  await page.mouse.move(cx + d, cy + d)
  await page.screenshot({ path: 'e2e/capturas/04-lote-dibujado.png' })
})
