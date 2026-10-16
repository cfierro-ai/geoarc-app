import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { CONTEXTO_TEMUCO, dibujarArea, interceptarContexto, interceptarMapaBase, interceptarTeselasTextura, interceptarTerrarium, parseGlb, renderGlb } from './util'

/**
 * Descarga «Modelo 3D (GLB)» sin red: Terrarium es un plano inclinado, el contexto es el fixture de Temuco y las
 * teselas de textura se simulan (un color por tesela). El GLB debe tener la magic «glTF», la malla del terreno, la
 * textura embebida (JPEG) y asset.copyright con la atribución.
 */
test('GLB: textura satelital, magic glTF, malla del terreno, textura embebida y copyright', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await interceptarTerrarium(page)
  await interceptarContexto(page, CONTEXTO_TEMUCO)
  await interceptarMapaBase(page)
  const tex = await interceptarTeselasTextura(page)
  await page.goto('/curvas')
  await dibujarArea(page, 120)
  await expect(page.getByTestId('dem-info')).toContainText('Terrarium')
  await expect(page.getByTestId('contexto-info')).toContainText('3 edificaciones')

  // tarjeta GLB con el selector de textura (satelital por defecto, con atribución de Esri) y la nota de apertura
  const tarjeta = page.getByTestId('tarjeta-glb')
  await expect(tarjeta).toContainText('GLB (glTF binario)')
  await expect(tarjeta).toContainText('SketchUp Pro')
  await expect(page.getByTestId('textura-atribucion')).toContainText('Esri')
  await expect(tarjeta).toContainText(/~[\d.]+ triángulos/)
  await tarjeta.scrollIntoViewIfNeeded()

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar modelo 3D (GLB)' }).click()])
  expect(dl.suggestedFilename()).toMatch(/^geoarc_modelo3d_.*_UTM18S_local\.glb$/)
  await dl.saveAs('e2e/capturas/30-modelo.glb')
  const buf = await readFile(await dl.path())
  const { esGlTF, version, json } = parseGlb(buf)
  expect(esGlTF).toBe(true) // magic «glTF»
  expect(version).toBe(2)
  expect(json.meshes.length).toBeGreaterThan(1) // terreno + edificios
  expect(json.images?.length ?? 0).toBeGreaterThan(0) // textura embebida
  expect(json.images[0].mimeType).toBe('image/jpeg')
  expect(json.asset.generator).toBe('GEO·ARC')
  expect(json.asset.copyright).toContain('Esri')
  expect(json.asset.copyright).toContain('OpenStreetMap')
  expect(tex.esri).toBeGreaterThan(0) // la textura satelital pidió teselas de Esri

  // «Sin textura»: el GLB no lleva imágenes
  await page.getByRole('radio', { name: 'Sin textura' }).check()
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar modelo 3D (GLB)' }).click()])
  const sinTex = parseGlb(await readFile(await dl2.path()))
  expect(sinTex.json.images?.length ?? 0).toBe(0)
  expect(sinTex.json.meshes.length).toBeGreaterThan(1)

  expect(errors).toEqual([])
})

/**
 * Verificación independiente (punto 4): el GLB se abre con three (GLTFLoader) y se renderiza. La captura permite revisar
 * la orientación (terreno abajo, Y-arriba) y la textura (patrón de teselas de colores). El validador glTF (0 errores) se
 * corre aparte, sobre los archivos de muestra.
 */
test('GLB: se abre con three (GLTFLoader) y se renderiza', async ({ page }) => {
  await interceptarTerrarium(page)
  await interceptarContexto(page, CONTEXTO_TEMUCO)
  await interceptarMapaBase(page)
  await interceptarTeselasTextura(page)
  await page.goto('/curvas')
  await dibujarArea(page, 120)
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar modelo 3D (GLB)' }).click()])
  const buf = await readFile(await dl.path())
  const info = await renderGlb(page, buf, 'e2e/capturas/31-modelo-3d.png')
  expect(info.error).toBeUndefined() // GLTFLoader lo cargó sin error
  expect(info.nonBg ?? 0).toBeGreaterThan(5_000) // el modelo se renderizó (no un lienzo vacío)
})
