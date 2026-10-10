import { expect, test } from '@playwright/test'
import { dibujarArea, usarLaderaSintetica } from './util'

/**
 * Flujo docente completo SIN red externa, por los dos módulos y con el estado compartido:
 * inicio → Curvas (ladera sintética en un área dibujada) → Estudio de sombras sobre ese mismo terreno → 3D.
 * Deja capturas en e2e/capturas/ para revisión visual.
 */
test('inicio → curvas → estudio de sombras sobre el terreno del sitio → vista 3D', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await page.getByTestId('tarjeta-curvas').click()
  await expect(page).toHaveURL(/\/curvas$/)

  await usarLaderaSintetica(page)
  await dibujarArea(page)
  // sin botón de carga: al cerrar el área la ladera se genera sola
  await expect(page.getByTestId('dem-info')).toContainText('Ladera sintética')
  await expect(page.getByTestId('area-info')).toContainText(' ha · celda ')
  await expect(page.getByTestId('uso-dato-texto')).toContainText('Terreno inventado')
  const [curvas] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar curvas DXF (UTM)' }).click(),
  ])
  await curvas.saveAs('e2e/capturas/11-curvas-ladera.dxf')

  // al Estudio de sombras: el terreno del sitio ya está cargado y cubre el lote → se reutiliza
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Estudio de sombras' }).click()
  await expect(page).toHaveURL(/\/sombras$/)
  await expect(page.getByRole('radio', { name: /Plano \(cota 0\)/ })).toBeChecked() // por defecto
  await page.getByRole('radio', { name: /Terreno del sitio/ }).check()
  await page.getByRole('button', { name: 'Lote de ejemplo' }).click()
  await expect(page.getByTestId('lot-info')).toContainText('4 lados')
  await expect(page.getByTestId('lot-info')).toContainText('700,0 m²')
  await expect(page.getByTestId('terreno-estudio')).toHaveText('Ladera sintética (demo)')

  // la envolvente existe y tiene volumen positivo; bajar la altura máxima lo reduce
  await expect(page.getByTestId('volume')).not.toHaveText('0 m³')
  const vol1 = await page.getByTestId('volume').innerText()
  await page.getByLabel('Altura máxima').fill('6')
  await expect(page.getByTestId('volume')).not.toHaveText(vol1)

  // el mapa ocupa todo el visor (regresión: MapLibre forzaba position: relative → 300 px)
  const mapBox = await page.getByTestId('map').boundingBox()
  expect(mapBox!.height).toBeGreaterThan(600)
  await expect(page.getByTestId('map')).not.toHaveAttribute('data-curvas', '0')
  await expect(page.getByTestId('map')).toHaveAttribute('data-idle', 'true', { timeout: 30_000 })
  await page.screenshot({ path: 'e2e/capturas/01-panel-mapa.png' })

  await page.getByRole('button', { name: 'Vista 3D' }).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: 'e2e/capturas/02-vista-3d.png' })

  // vista 3D: el panel de un lado resalta su rasante
  await page.getByLabel('Rol lado 1').hover()
  await page.waitForTimeout(800)
  await page.screenshot({ path: 'e2e/capturas/03-lado1-resaltado.png' })

  // de vuelta en Curvas, el área y el terreno siguen ahí (estado compartido)
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Curvas de nivel' }).click()
  await expect(page.getByTestId('dem-info')).toContainText('Ladera sintética')

  expect(errors).toEqual([])
})
