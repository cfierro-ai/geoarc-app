import { expect, test, type Page } from '@playwright/test'

/**
 * Lee el último cuadro dibujado (el canvas usa preserveDrawingBuffer): una firma de todos los píxeles y cuántos
 * píxeles son verde saturado (color del lado 4, #76b041). Si la vista no se redibuja, la firma no cambia.
 */
const cuadro = (page: Page) =>
  page.evaluate(() => {
    const src = document.querySelector<HTMLCanvasElement>('#geoarc-3d canvas')!
    const c = document.createElement('canvas')
    c.width = src.width
    c.height = src.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(src, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let firma = 0
    let verde = 0
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i]
      const g = d[i + 1]
      const b = d[i + 2]
      firma = (firma * 31 + r * 7 + g * 3 + b) >>> 0
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      if (max === 0 || (max - min) / max < 0.35 || max !== g) continue
      const h = 60 * ((b - r) / (max - min) + 2)
      if (h >= 70 && h <= 140) verde++
    }
    return { firma, verde }
  })

/**
 * Regresión del redibujo bajo demanda (frameloop 'demand'). Con los planos de rasante DESACTIVADOS, el resaltado
 * de un lado solo cambia colores del InstancedMesh (fuera de las props de React); y desactivar los planos desmonta
 * objetos, lo que en R3F 9.8 no pide cuadro. En ambos casos la vista debe redibujarse.
 */
test('vista 3D sin planos de rasante: el resaltado del lado 2 se dibuja', async ({ page }) => {
  await page.goto('/sombras') // en plano (por defecto)
  await page.getByRole('button', { name: 'Lote de ejemplo' }).click()
  await expect(page.getByTestId('volume')).not.toHaveText('0 m³')

  await page.getByRole('button', { name: 'Vista 3D' }).click()
  await page.waitForTimeout(1500)
  const conPlanos = await cuadro(page)

  await page.getByLabel('Mostrar planos de rasante').uncheck()
  await page.waitForTimeout(1500)
  const sinPlanos = await cuadro(page)
  expect(sinPlanos.firma, 'desactivar los planos no redibujó la vista 3D').not.toBe(conPlanos.firma)

  await page.getByLabel('Rol lado 2').hover()
  await page.waitForTimeout(1500)
  const resaltado = await cuadro(page)
  await page.screenshot({ path: 'e2e/capturas/06-lado2-sin-planos.png' })
  console.log(`[resaltado] píxeles verdes (lado 4): sin resaltar ${sinPlanos.verde} → lado 2 resaltado ${resaltado.verde}`)

  // el lado 4 gobierna parte de la envolvente: sin resaltado se ve verde; al resaltar el lado 2 pasa a gris
  expect(sinPlanos.verde).toBeGreaterThan(1000)
  expect(resaltado.verde, 'el resaltado del lado 2 no se dibujó').toBeLessThan(sinPlanos.verde * 0.5)
})
