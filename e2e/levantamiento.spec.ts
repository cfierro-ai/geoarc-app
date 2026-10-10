import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { interceptarTerrarium } from './util'

/** DXF sintético de un cerro: 5 curvas concéntricas (100–104 m), un deslinde a cota 0 y un texto. */
function dxfCerro(): string {
  const P = (...a: (string | number)[]) => a.map(String).join('\n')
  const circle = (r: number, n = 72) => Array.from({ length: n }, (_, k) => ({ x: 5000 + r * Math.cos((2 * Math.PI * k) / n), y: 8000 + r * Math.sin((2 * Math.PI * k) / n) }))
  const lw = (layer: string, pts: { x: number; y: number }[], z: number) =>
    P(0, 'LWPOLYLINE', 8, layer, 90, pts.length, 70, 1, 38, z, ...pts.flatMap((p) => [10, p.x.toFixed(3), 20, p.y.toFixed(3)]))
  const p3d = (layer: string, pts: { x: number; y: number }[], z: number) =>
    P(0, 'POLYLINE', 8, layer, 66, 1, 10, 0, 20, 0, 30, 0, 70, 9, ...pts.flatMap((p) => [0, 'VERTEX', 8, layer, 10, p.x.toFixed(3), 20, p.y.toFixed(3), 30, z, 70, 32]), 0, 'SEQEND')
  const ents = [
    lw('CURVAS', circle(50), 100),
    lw('CURVAS', circle(40), 101),
    lw('CURVAS_MAESTRAS', circle(30), 102),
    p3d('CURVAS', circle(20), 103),
    lw('CURVAS', circle(10), 104),
    lw('DESLINDE', [{ x: 4980, y: 7980 }, { x: 5020, y: 7980 }, { x: 5020, y: 8020 }, { x: 4980, y: 8020 }], 0),
    P(0, 'TEXT', 8, 'TEXTOS', 10, 5000, 20, 8000, 30, 0, 40, 2, 1, 'COTA 104'),
  ]
  return [P(0, 'SECTION', 2, 'ENTITIES'), ...ents, P(0, 'ENDSEC', 0, 'EOF')].join('\n') + '\n'
}

test('levantamiento DXF: se importa en Curvas y alimenta al Estudio de sombras', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const n = await interceptarTerrarium(page)
  const archivo = test.info().outputPath('cerro.dxf')
  await writeFile(archivo, dxfCerro())

  await page.goto('/curvas')
  await page.getByTestId('importar-dxf').setInputFiles(archivo)

  // informa capas, entidades y rango de cotas; el deslinde a cota 0 queda fuera por defecto
  const capas = page.getByTestId('levantamiento-capas')
  await expect(capas).toContainText('CURVAS')
  await expect(capas).toContainText('100,0 – 104,0') // capa CURVAS: 100, 101, 103, 104
  await expect(page.getByLabel('Usar capa DESLINDE')).not.toBeChecked()
  await expect(page.getByLabel('Usar capa CURVAS_MAESTRAS')).toBeChecked()
  await expect(page.getByTestId('levantamiento')).toContainText('Ignorado: 1 TEXT')
  await expect(page.getByRole('radio', { name: /Locales: centrar el dibujo en el sitio/ })).toBeChecked()
  await expect(page.getByTestId('map')).toHaveAttribute('data-idle', 'true', { timeout: 30_000 })
  await page.screenshot({ path: 'e2e/capturas/14-levantamiento-capas.png' })
  await page.getByRole('button', { name: 'Usar como terreno' }).click()

  await expect(page.getByTestId('dem-info')).toContainText('Levantamiento (cerro.dxf) · tipo levantamiento')
  await expect(page.getByTestId('dem-info')).toContainText('Cotas 100,0 – 104,0 m') // sin cotas inventadas en el borde
  await expect(page.getByTestId('levantamiento-activo')).toContainText('cerro.dxf')
  await expect(page.getByTestId('uso-dato-texto')).toHaveText('Levantamiento topográfico: útil para el lote y el proyecto.')
  await expect(page.getByTestId('equidistancia-minima')).toHaveText('0,5 m')
  await expect(page.getByLabel('Equidistancia')).toHaveValue('0.5') // 4 m de desnivel → 8 curvas
  await expect(page.getByTestId('map')).not.toHaveAttribute('data-curvas', '0')
  await expect(page.getByTestId('map')).toHaveAttribute('data-idle', 'true', { timeout: 30_000 })
  await page.screenshot({ path: 'e2e/capturas/15-levantamiento-curvas.png' })

  // el Estudio de sombras usa el mismo levantamiento
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Estudio de sombras' }).click()
  await page.getByRole('radio', { name: /Levantamiento importado/ }).check()
  await expect(page.getByTestId('levantamiento-activo')).toContainText('cerro.dxf')
  await page.getByLabel('Ancho del lote').fill('20')
  await page.getByLabel('Fondo del lote').fill('20')
  await page.getByTestId('lote-dimensiones').getByRole('button', { name: 'Crear' }).click()
  await expect(page.getByTestId('terreno-estudio')).toHaveText('Levantamiento (cerro.dxf)')
  await expect(page.getByTestId('volume')).not.toHaveText('0 m³')
  await page.getByRole('button', { name: 'Vista 3D' }).click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e/capturas/16-levantamiento-sombras-3d.png' })

  expect(n.terrarium).toBe(0) // nada se descargó
  expect(errors).toEqual([])
})
