import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { capasDxf, centroMapa, interceptarContexto, interceptarMapaBase, interceptarTerrarium, lwpolilineasDxf, polilineasDxf } from './util'

/**
 * Módulo de curvas, flujo del profesor: ubicar el sitio → dibujar el área → las curvas aparecen.
 * Sin red externa: Terrarium se intercepta con un plano inclinado (util.ts); Copernicus no debe pedirse nunca.
 */
test('curvas: área de dos clics, Terrarium automático, equidistancia preseleccionada, malla y DXF', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const n = await interceptarTerrarium(page)
  await interceptarContexto(page)
  await interceptarMapaBase(page)
  await page.goto('/curvas')

  // la fuente queda plegada en «Opciones avanzadas»; Copernicus se ve pero no se puede elegir
  const fuente = page.getByLabel('Fuente de elevación')
  await expect(fuente).toBeHidden()
  await page.getByText('Opciones avanzadas').click()
  await expect(fuente).toHaveValue('terrarium')
  const cop = fuente.locator('option[value="copernicus"]')
  await expect(cop).toHaveJSProperty('disabled', true) // toBeDisabled no aplica a <option>
  await expect(cop).toHaveText(/requiere proxy/)
  await page.getByText('Opciones avanzadas').click()

  // área: un segundo clic a 5 px (~2 m) no la cierra y el aviso del mapa dice por qué
  const { cx, cy } = await centroMapa(page)
  await page.getByRole('button', { name: 'Dibujar rectángulo' }).click()
  await page.mouse.click(cx - 100, cy + 100)
  await page.waitForTimeout(350)
  await page.mouse.move(cx - 95, cy + 95)
  await expect(page.getByTestId('map-banner')).toContainText('al menos 10 m')
  await page.mouse.click(cx - 95, cy + 95)
  await page.waitForTimeout(350)
  await expect(page.getByTestId('area-info')).toHaveCount(0)
  // la vista previa sigue al cursor con su tamaño en metros y hectáreas; el área es de ~210 m (barra de escala de 100 m)
  await page.mouse.move(cx + 340, cy - 340)
  await expect(page.getByTestId('map-banner')).toContainText(/\d+ × \d+ m · [\d,]+ ha/)
  await page.screenshot({ path: 'e2e/capturas/08-area-dibujo.png' })
  await page.mouse.click(cx + 340, cy - 340)

  // sin botón: el terreno se descarga al cerrar el área (timeout holgado: la suite completa carga CPU por el GLB)
  await expect(page.getByTestId('dem-info')).toContainText('Terrarium', { timeout: 20_000 })
  expect(n.terrarium).toBeGreaterThan(0)
  expect(n.copernicus).toBe(0)
  await expect(page.getByTestId('area-info')).toContainText(/\d+ × \d+ m · [\d,]+ ha · celda [\d,]+ m/)

  // dato de ~30 m: etiqueta informativa, mínima confiable 5 m; ~80 m de desnivel → 5 m preseleccionada
  await expect(page.getByTestId('uso-dato-texto')).toHaveText('Dato de ~30 m: útil para ladera y barrio, no para el lote.')
  await expect(page.getByTestId('equidistancia-minima')).toHaveText('5 m')
  await expect(page.getByTestId('equidistancia-sugerida')).toHaveText('5 m')
  await expect(page.getByLabel('Equidistancia')).toHaveValue('5')
  await expect(page.getByTestId('map')).not.toHaveAttribute('data-curvas', '0')

  // una equidistancia menor sigue disponible, con la advertencia de precisión aparente
  await page.getByLabel('Equidistancia').selectOption('1')
  await expect(page.getByText(/la precisión es aparente/)).toBeVisible()
  await page.getByLabel('Equidistancia').selectOption('5')

  // malla del dato sobre el mapa
  await page.getByLabel(/Mostrar la malla del dato/).check()
  await expect(page.getByTestId('map')).not.toHaveAttribute('data-malla', '0')
  await expect(page.getByTestId('map')).toHaveAttribute('data-idle', 'true', { timeout: 30_000 })
  await page.screenshot({ path: 'e2e/capturas/09-curvas-terrarium.png' })

  // sin edificaciones ni vías en el área, la descarga no las promete
  await expect(page.getByTestId('contexto-info')).toContainText('0 edificaciones · 0 vías')
  // tarjeta de descarga DXF: contenido real (curvas y área; sin edificaciones ni vías en esta área)
  await expect(page.getByTestId('tarjeta-dxf')).toContainText('DXF 2000')
  await expect(page.getByTestId('tarjeta-dxf')).toContainText('Curvas de nivel con cota')
  await expect(page.getByTestId('tarjeta-dxf')).not.toContainText('edificaciones')
  await expect(page.getByTestId('tarjeta-obj')).toContainText('Terreno recortado al área')

  // DXF local (por defecto): nombre con _local, capa REFERENCIA con el origen en UTM, coordenadas pequeñas
  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar DXF 2000' }).click(),
  ])
  expect(descarga.suggestedFilename()).toMatch(/^geoarc_curvas_.*_UTM18S_local\.dxf$/)
  await descarga.saveAs('e2e/capturas/10-curvas-terrarium.dxf')
  const dxf = await readFile(await descarga.path(), 'utf8')
  expect(dxf).toContain('AC1015') // DXF 2000
  expect(capasDxf(dxf)).toEqual(['CURVAS', 'CURVAS_MAESTRAS', 'ETIQUETAS', 'AREA', 'REFERENCIA'])
  expect(dxf).toMatch(/Origen local = UTM 18S E \d+ N \d+/)
  // una curva maestra lleva la cota 200 como rótulo (TEXT en ETIQUETAS) y como elevación de la LWPOLYLINE
  expect(dxf).toContain('8\nETIQUETAS\n')
  expect(dxf).toContain('\n1\n200\n')
  const area = polilineasDxf(dxf, 'AREA') // AREA es POLYLINE 3D apoyada sobre el terreno
  expect(area).toHaveLength(1)
  expect(Math.min(...area[0].flatMap((p) => [p.x, p.y]))).toBeCloseTo(0, 2) // esquina SO en el origen
  expect(lwpolilineasDxf(dxf, 'CURVAS_MAESTRAS').length).toBeGreaterThan(0)

  // escala: la barra de 100 m (capa REFERENCIA) mide 100,000 ± 0,001 → 1 unidad del DXF = 1 m
  const barra = lwpolilineasDxf(dxf, 'REFERENCIA')[0] // primer segmento: la barra de escala, horizontal
  const largoBarra = Math.hypot(barra[1].x - barra[0].x, barra[1].y - barra[0].y)
  expect(dxf.match(/\n1\n(\d+) m\n/)?.[1]).toBe('100') // el rótulo de la barra dice «100 m»
  expect(largoBarra).toBeCloseTo(100, 3)
  // el ancho del área en el DXF coincide con el que muestra la app
  const anchoApp = Number((await page.getByTestId('area-info').innerText()).match(/(\d+) ×/)![1])
  const anchoDxf = Math.max(...area[0].map((p) => p.x)) - Math.min(...area[0].map((p) => p.x))
  expect(Math.abs(anchoDxf - anchoApp)).toBeLessThanOrEqual(1)

  // cambiar a UTM: nombre con _UTM, coordenadas absolutas (centenares de miles) y sin TEXT de origen
  await page.getByRole('radio', { name: /UTM absolutas/ }).check()
  const [descargaUtm] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Descargar DXF 2000' }).click(),
  ])
  expect(descargaUtm.suggestedFilename()).toMatch(/_UTM18S_UTM\.dxf$/)
  const dxfUtm = await readFile(await descargaUtm.path(), 'utf8')
  expect(dxfUtm).not.toContain('Origen local')
  expect(polilineasDxf(dxfUtm, 'AREA')[0][0].x).toBeGreaterThan(100000)

  expect(errors).toEqual([])
})
