import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { CONTEXTO_TEMUCO, capasDxf, dibujarArea, interceptarContexto, interceptarMapaBase, interceptarTerrarium, lwpolilineasDxf, polilineasDxf } from './util'

/**
 * Contexto del área (edificaciones y vías de OSM) sin red: Overpass responde un fixture (util.ts) y Terrarium un plano
 * inclinado. Mapa con capas activables, DXF con EDIFICACIONES/VIALIDAD/atribución, guardado en el .geoarc y vista 3D
 * del estudio de sombras con las edificaciones extruidas.
 */
test('curvas: contexto de OSM en el mapa (capas activables), en el DXF y guardado en el .geoarc', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await interceptarTerrarium(page)
  const n = await interceptarContexto(page, CONTEXTO_TEMUCO)
  await interceptarMapaBase(page)
  await page.goto('/curvas')
  await dibujarArea(page, 120)

  await expect(page.getByTestId('contexto-info')).toContainText('3 edificaciones · 2 vías · OpenStreetMap (Overpass)')
  await expect(page.getByTestId('contexto-alturas')).toHaveText(
    'Alturas: 1 con altura en OSM · 1 por pisos (3 m c/u) · 1 sin dato (1 piso, 3 m).',
  )
  expect(n.overpass).toBe(1)
  expect(n.cuerpos[0]).toMatch(/way\["building"\]\(-38\.\d+,-72\.\d+,-38\.\d+,-72\.\d+\)/)
  const mapa = page.getByTestId('map')
  await expect(mapa).toHaveAttribute('data-edificaciones', '3')
  await expect(mapa).toHaveAttribute('data-vias', '2')

  // capas activables
  await page.getByLabel('Edificaciones', { exact: true }).uncheck()
  await expect(mapa).toHaveAttribute('data-edificaciones', '0')
  await expect(mapa).toHaveAttribute('data-vias', '2')
  await page.getByLabel('Edificaciones', { exact: true }).check()
  await expect(mapa).toHaveAttribute('data-edificaciones', '3')
  await expect(mapa).toHaveAttribute('data-idle', 'true', { timeout: 30_000 })
  await page.screenshot({ path: 'e2e/capturas/17-contexto-mapa.png' })

  // DXF: EDIFICACIONES con la altura como espesor, VIALIDAD y la atribución de OSM
  await expect(page.getByTestId('tarjeta-dxf')).toContainText('3 edificaciones (con su altura)')
  await expect(page.getByTestId('tarjeta-dxf')).toContainText('2 vías')
  await page.getByTestId('tarjeta-dxf').scrollIntoViewIfNeeded()
  await page.getByTestId('panel-curvas').screenshot({ path: 'e2e/capturas/24-descargar-tarjetas.png' })
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar DXF 2000' }).click()])
  await descarga.saveAs('e2e/capturas/18-contexto.dxf')
  const dxf = await readFile(await descarga.path(), 'utf8')
  expect(dxf).toContain('AC1015')
  expect(capasDxf(dxf)).toEqual(['CURVAS', 'CURVAS_MAESTRAS', 'ETIQUETAS', 'AREA', 'EDIFICACIONES', 'VIALIDAD', 'ATRIBUCION', 'REFERENCIA'])
  // 3 edificios rectangulares: 3 huellas LWPOLYLINE + por cada uno 4 muros (cuadriláteros) y 2 triángulos de techo
  expect(lwpolilineasDxf(dxf, 'EDIFICACIONES')).toHaveLength(3)
  expect((dxf.match(/8\nEDIFICACIONES\n100\nAcDbFace/g) || []).length).toBe(3 * 6)
  expect(polilineasDxf(dxf, 'VIALIDAD')).toHaveLength(2)
  expect(dxf).toContain('\n8\nATRIBUCION\n')
  expect(dxf).toContain('\n1\n\\U+00A9 OpenStreetMap contributors (ODbL)\n')

  // OBJ: malla 3D con grupos terreno y edificaciones, vértices y caras; cada edificio cerrado (arista en 2 caras)
  const [obj] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar malla 3D (OBJ)' }).click()])
  await obj.saveAs('e2e/capturas/23-contexto.obj')
  const malla = await readFile(await obj.path(), 'utf8')
  expect(malla).toContain('g terreno')
  expect(malla).toContain('g edificaciones')
  expect((malla.match(/^v /gm) || []).length).toBeGreaterThan(10)
  const edifFaces: [number, number, number][] = []
  let grupo = ''
  for (const l of malla.split('\n')) {
    if (l.startsWith('g ')) grupo = l.slice(2).trim()
    else if (l.startsWith('f ') && grupo === 'edificaciones') edifFaces.push(l.slice(2).trim().split(/\s+/).map(Number) as [number, number, number])
  }
  expect(edifFaces.length).toBeGreaterThan(0)
  const edgeCount = new Map<string, number>()
  for (const idx of edifFaces)
    for (let i = 0; i < 3; i++) {
      const [u, v] = [idx[i], idx[(i + 1) % 3]].sort((a, b) => a - b)
      edgeCount.set(`${u}-${v}`, (edgeCount.get(`${u}-${v}`) ?? 0) + 1)
    }
  expect([...edgeCount.values()].every((n) => n === 2)).toBe(true) // sólidos cerrados

  // .geoarc: el contexto queda guardado; al abrirlo no se vuelve a pedir a Overpass
  const [guardado] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Guardar .geoarc' }).click()])
  const archivo = 'e2e/capturas/19-contexto.geoarc'
  await guardado.saveAs(archivo)
  const escena = JSON.parse(await readFile(archivo, 'utf8'))
  expect([escena.version, escena.contexto.fuente, escena.contexto.edificaciones.length, escena.contexto.vias.length]).toEqual([4, 'overpass', 3, 2])

  await page.reload()
  await expect(page.getByTestId('contexto-info')).toHaveCount(0)
  await page.getByTestId('abrir-escena').setInputFiles(archivo)
  await expect(page.getByTestId('contexto-info')).toContainText('3 edificaciones · 2 vías')
  await expect(page.getByTestId('dem-info')).toContainText('Terrarium')
  expect(n.overpass).toBe(1)
  expect(errors).toEqual([])
})

test('sombras: las edificaciones del contexto se extruyen en la vista 3D', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await interceptarTerrarium(page)
  await interceptarContexto(page, CONTEXTO_TEMUCO)
  await interceptarMapaBase(page)
  await page.goto('/curvas')
  await dibujarArea(page, 120)
  await expect(page.getByTestId('contexto-info')).toContainText('3 edificaciones')

  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Estudio de sombras' }).click()
  await page.getByRole('button', { name: 'Lote de ejemplo' }).click()
  await expect(page.getByTestId('terreno-estudio')).toHaveText('Plano (cota 0)')
  const capa = page.getByLabel('Edificaciones del contexto')
  await expect(capa).toBeChecked()
  await expect(page.getByTestId('map')).toHaveAttribute('data-edificaciones', '3')

  await page.getByRole('button', { name: 'Vista 3D' }).click()
  // en plano, el terreno del estudio es el lote + 30 m: entran los dos edificios cercanos, no el tercero
  await expect(page.getByTestId('scene3d')).toHaveAttribute('data-edificaciones', '2')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'e2e/capturas/20-sombras-contexto-3d.png' })

  await capa.uncheck()
  await expect(page.getByTestId('scene3d')).toHaveAttribute('data-edificaciones', '0')
  expect(errors).toEqual([])
})
