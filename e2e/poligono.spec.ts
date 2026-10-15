import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { centroMapa, dentroOBorde, interceptarContexto, interceptarTerrarium, lwpolilineasDxf } from './util'

/**
 * Área como polígono (clics + doble clic). El terreno se calcula sobre el rectángulo envolvente y las curvas se recortan
 * al polígono. Sin red externa: Terrarium interceptado con un plano inclinado (util.ts).
 */
test('curvas: área como polígono → curvas recortadas al polígono, también en el DXF', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const n = await interceptarTerrarium(page)
  await interceptarContexto(page)
  await page.goto('/curvas')
  const { cx, cy } = await centroMapa(page)

  // triángulo rectángulo: SO, SE y NO, a ±150 px del centro (~140 m de cateto a zoom 17)
  await page.getByRole('button', { name: 'Dibujar polígono' }).click()
  await expect(page.getByTestId('map-banner')).toContainText('Doble clic: cerrar el polígono')
  await page.mouse.click(cx - 150, cy + 150)
  await page.waitForTimeout(350) // evita que dos clics seguidos se lean como doble clic
  await page.mouse.click(cx + 150, cy + 150)
  await page.waitForTimeout(350)
  await page.mouse.dblclick(cx - 150, cy - 150)

  await expect(page.getByTestId('area-info')).toContainText(/Polígono de 3 vértices · [\d,]+ ha\. Se calcula sobre su rectángulo envolvente: \d+ × \d+ m · celda/)
  await expect(page.getByTestId('dem-info')).toContainText('Terrarium')
  expect(n.terrarium).toBeGreaterThan(0)
  await expect(page.getByTestId('map')).not.toHaveAttribute('data-curvas', '0')
  await page.getByLabel(/Mostrar la malla del dato/).check()
  await expect(page.getByTestId('map')).toHaveAttribute('data-idle', 'true', { timeout: 30_000 })
  await page.screenshot({ path: 'e2e/capturas/14-area-poligono.png' })

  // DXF: AREA es el triángulo, y ningún vértice de las curvas sale de él (tolerancia: los 3 decimales del DXF)
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar DXF (UTM)' }).click(),
  ])
  await descarga.saveAs('e2e/capturas/15-area-poligono.dxf')
  const dxf = await readFile(await descarga.path(), 'utf8')
  const [tri] = lwpolilineasDxf(dxf, 'AREA')
  expect(tri).toHaveLength(3)
  const curvas = [...lwpolilineasDxf(dxf, 'CURVAS'), ...lwpolilineasDxf(dxf, 'CURVAS_MAESTRAS')]
  expect(curvas.length).toBeGreaterThan(3)
  const fuera = curvas.flat().filter((p) => !dentroOBorde(p, tri, 0.01))
  expect(fuera).toEqual([])

  // la vista 3D muestra las mismas curvas recortadas sobre el terreno del rectángulo envolvente
  await page.getByRole('button', { name: 'Vista 3D' }).click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e/capturas/16-area-poligono-3d.png' })
  expect(errors).toEqual([])
})

test('curvas: un polígono de 2 vértices no se cierra y el panel dice por qué', async ({ page }) => {
  await interceptarTerrarium(page)
  await interceptarContexto(page)
  await page.goto('/curvas')
  const { cx, cy } = await centroMapa(page)
  await page.getByRole('button', { name: 'Dibujar polígono' }).click()
  await page.mouse.click(cx - 100, cy)
  await page.waitForTimeout(350)
  await page.mouse.dblclick(cx + 100, cy)
  await expect(page.getByText('El polígono necesita al menos 3 vértices.')).toBeVisible()
  await expect(page.getByTestId('area-info')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Dibujar polígono' })).toBeVisible()
})
