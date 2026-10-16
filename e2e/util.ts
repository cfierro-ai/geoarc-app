import { crc32, deflateSync } from 'node:zlib'
import { expect, type Page } from '@playwright/test'

/** PNG RGB de color sólido `size`×`size` (por defecto 1×1). */
export function solidPng(r: number, g: number, b: number, size = 1): Buffer {
  const rows: Buffer[] = []
  for (let j = 0; j < size; j++) {
    const row = Buffer.alloc(1 + size * 3)
    for (let i = 0; i < size; i++) {
      row[1 + i * 3] = r
      row[2 + i * 3] = g
      row[3 + i * 3] = b
    }
    rows.push(row)
  }
  return pngFromRows(rows, size, size)
}

/**
 * Deja el mapa base determinista y sin red: aborta OpenFreeMap (fuerza el respaldo a OSM raster) y sirve teselas grises.
 * Así el mapa llega a reposo («idle») de inmediato y los e2e no dependen de que carguen las teselas de OpenFreeMap.
 * NO usar en los tests que prueban el mapa base en vivo (mapa-base, buscador).
 */
export async function interceptarMapaBase(page: Page) {
  const gris = solidPng(226, 232, 240)
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort('failed'))
  for (const patron of ['https://tile.openstreetmap.org/**', 'https://server.arcgisonline.com/**'])
    await page.route(patron, (r) =>
      r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: gris }),
    )
}

/** Abre «Opciones avanzadas» y elige la ladera sintética (sin red). */
export async function usarLaderaSintetica(page: Page) {
  await page.getByText('Opciones avanzadas').click()
  await page.getByLabel('Fuente de elevación').selectOption('sintetico')
}

/** Centro del mapa en pantalla (ahí está el sitio). */
export async function centroMapa(page: Page) {
  // data-ready se pone al cargar el estilo base de OpenFreeMap (externo), con respaldo a OSM raster a los 8 s:
  // es una espera de red externa, así que el plazo es generoso (no el 5 s por defecto).
  await expect(page.getByTestId('map')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 })
  const box = (await page.getByTestId('map').boundingBox())!
  return { cx: box.x + box.width / 2, cy: box.y + box.height / 2 }
}

const TEMUCO = { lon: -72.5985, lat: -38.739 }

/**
 * Intercepta Terrarium (sin red externa) con un plano inclinado continuo entre teselas: 200 m en Temuco, sube
 * 2 m/píxel al este y 1 m/píxel al sur. Copernicus se aborta. Devuelve los contadores de peticiones.
 */
export async function interceptarTerrarium(page: Page) {
  const n = { terrarium: 0, copernicus: 0 }
  await page.route('https://copernicus-dem-30m.s3.amazonaws.com/**', (r) => {
    n.copernicus++
    return r.abort('failed')
  })
  await page.route('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/**', (r) => {
    n.terrarium++
    const [z, x, y] = new URL(r.request().url()).pathname.match(/(\d+)\/(\d+)\/(\d+)\.png$/)!.slice(1).map(Number)
    const ref = pixelGlobal(TEMUCO.lon, TEMUCO.lat, z)
    // el valor de cada píxel es el de su centro (i + 0,5)
    const body = terrariumPng((i, j) => 200 + 2 * (x * 256 + i + 0.5 - ref.x) + (y * 256 + j + 0.5 - ref.y))
    return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body })
  })
  return n
}

/** lon/lat a (x, y) m del sitio (aproximación local; basta para un fixture). */
const desdeSitio = (x: number, y: number) => ({
  lat: TEMUCO.lat + y / 111_320,
  lon: TEMUCO.lon + x / (111_320 * Math.cos((TEMUCO.lat * Math.PI) / 180)),
})
const rect = (x: number, y: number, w: number, h: number) =>
  [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]].map(([a, b]) => desdeSitio(a, b))

/**
 * Respuesta Overpass simulada alrededor del sitio: tres edificios (height 15; 4 pisos → 12 m; sin dato → 3 m) y dos
 * vías. Los dos primeros quedan dentro del terreno del lote de ejemplo en el estudio de sombras; el tercero, fuera.
 */
export const CONTEXTO_TEMUCO = {
  osm3s: { timestamp_osm_base: '2026-10-13T12:42:35Z' },
  elements: [
    { type: 'way', id: 1001, tags: { building: 'yes', height: '15' }, geometry: rect(30, 10, 20, 12) },
    { type: 'way', id: 1002, tags: { building: 'house', 'building:levels': '4' }, geometry: rect(-40, -30, 10, 10) },
    { type: 'way', id: 1003, tags: { building: 'yes' }, geometry: rect(60, -40, 8, 8) },
    { type: 'way', id: 2001, tags: { highway: 'residential' }, geometry: [desdeSitio(-200, -60), desdeSitio(200, -60)] },
    { type: 'way', id: 2002, tags: { highway: 'tertiary' }, geometry: [desdeSitio(-80, -200), desdeSitio(-80, 200)] },
  ],
}

/** Intercepta Overpass (sin red): responde `respuesta` (por defecto, sin entidades). Devuelve las peticiones. */
export async function interceptarContexto(page: Page, respuesta: object = { elements: [] }) {
  const n = { overpass: 0, cuerpos: [] as string[] }
  await page.route('https://overpass-api.de/**', (r) => {
    n.overpass++
    n.cuerpos.push(decodeURIComponent(r.request().postData() ?? ''))
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(respuesta) })
  })
  return n
}

/** Dibuja el área con dos clics en esquinas opuestas, a ±d px del centro del mapa (a zoom 17, ~0,47 m/px en Temuco). */
export async function dibujarArea(page: Page, d = 100) {
  const { cx, cy } = await centroMapa(page)
  await page.getByRole('button', { name: 'Dibujar rectángulo' }).click()
  await page.mouse.click(cx - d, cy + d)
  await page.waitForTimeout(350) // evita que dos clics seguidos se lean como doble clic
  await page.mouse.move(cx + d, cy - d)
  await page.mouse.click(cx + d, cy - d)
}

/** Vértices de las POLYLINE de una capa de un DXF R12 (x, y en UTM), una lista por polilínea. */
/** Capas de usuario de un DXF 2000, en orden (excluye la capa 0). */
export function capasDxf(dxf: string): string[] {
  return [...dxf.matchAll(/AcDbLayerTableRecord\n\s*2\n([^\n]+)\n/g)].map((m) => m[1]).filter((x) => x !== '0')
}

/** Vértices de cada LWPOLYLINE de una capa (DXF 2000): curvas, área y huellas de edificio. */
export function lwpolilineasDxf(dxf: string, capa: string): { x: number; y: number }[][] {
  const l = dxf.split(/\r?\n/)
  const out: { x: number; y: number }[][] = []
  let cur: { code: string; val: string }[] | null = null
  const flush = () => {
    if (!cur) return
    if (cur.find((p) => p.code === '8')?.val === capa) {
      const xs = cur.filter((p) => p.code === '10').map((p) => +p.val)
      const ys = cur.filter((p) => p.code === '20').map((p) => +p.val)
      out.push(xs.map((x, i) => ({ x, y: ys[i] })))
    }
    cur = null
  }
  for (let k = 0; k + 1 < l.length; k += 2) {
    const code = l[k].trim()
    const val = l[k + 1]
    if (code === '0') {
      flush()
      cur = val === 'LWPOLYLINE' ? [] : null
    } else if (cur) cur.push({ code, val })
  }
  flush()
  return out
}

export function polilineasDxf(dxf: string, capa: string): { x: number; y: number }[][] {
  const l = dxf.split(/\r?\n/)
  const ents: { type: string; g: Map<string, string> }[] = []
  for (let k = 0; k + 1 < l.length; k += 2) {
    const c = l[k].trim()
    if (c === '0') ents.push({ type: l[k + 1], g: new Map() })
    else if (ents.length && !ents[ents.length - 1].g.has(c)) ents[ents.length - 1].g.set(c, l[k + 1])
  }
  const out: { x: number; y: number }[][] = []
  for (let k = 0; k < ents.length; k++) {
    if (ents[k].type !== 'POLYLINE' || ents[k].g.get('8') !== capa) continue
    const pts: { x: number; y: number }[] = []
    for (let j = k + 1; j < ents.length && ents[j].type === 'VERTEX'; j++) pts.push({ x: +ents[j].g.get('10')!, y: +ents[j].g.get('20')! })
    out.push(pts)
  }
  return out
}

/** ¿El punto está dentro del polígono o a menos de `tol` de su borde? */
export function dentroOBorde(p: { x: number; y: number }, poly: { x: number; y: number }[], tol: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  if (inside) return true
  return poly.some((a, k) => {
    const b = poly[(k + 1) % poly.length]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < tol
  })
}

/** PNG RGB 256×256 a partir de una función de cota por píxel, con la codificación Terrarium (r·256 + g + b/256 − 32768). */
export function terrariumPng(cota: (i: number, j: number) => number): Buffer {
  const W = 256
  const rows: Buffer[] = []
  for (let j = 0; j < W; j++) {
    const row = Buffer.alloc(1 + W * 3) // byte de filtro 0 + RGB
    for (let i = 0; i < W; i++) {
      const v = cota(i, j) + 32768
      const e = Math.floor(v)
      row[1 + i * 3] = e >> 8
      row[2 + i * 3] = e & 255
      row[3 + i * 3] = Math.floor((v - e) * 256)
    }
    rows.push(row)
  }
  return pngFromRows(rows, W, W)
}

/** Ensambla un PNG RGB a partir de filas (cada una con su byte de filtro 0 + RGB). */
function pngFromRows(rows: Buffer[], w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(td))
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Coordenada global de píxel Web Mercator (256 px por tesela). */
export function pixelGlobal(lon: number, lat: number, z: number) {
  const n = 2 ** z * 256
  const r = (lat * Math.PI) / 180
  return { x: ((lon + 180) / 360) * n, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n }
}

/**
 * Intercepta las teselas de textura (Esri y OSM) y devuelve una tesela de color distinto por (x, y), con CORS, para
 * que la textura del GLB sea determinista y su orientación se pueda revisar en la captura. No sale a la red.
 */
export async function interceptarTeselasTextura(page: Page) {
  const n = { esri: 0, osm: 0 }
  const servir = (r: Parameters<Parameters<Page['route']>[1]>[0]) => {
    const nums = (new URL(r.request().url()).pathname.match(/\d+/g) ?? []).map(Number)
    const [a = 0, b = 0] = nums.slice(-2) // los dos últimos números del path (x, y en algún orden)
    return r.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: solidPng((a * 53) % 256, (b * 97) % 256, 150),
    })
  }
  await page.route('https://server.arcgisonline.com/**', (r) => {
    n.esri++
    return servir(r)
  })
  await page.route('https://tile.openstreetmap.org/**', (r) => {
    n.osm++
    return servir(r)
  })
  return n
}

/** Lee la cabecera y el chunk JSON de un GLB binario. */
export function parseGlb(buf: Buffer): { esGlTF: boolean; version: number; json: any } {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const jsonLen = dv.getUint32(12, true)
  const json = JSON.parse(Buffer.from(buf.buffer, buf.byteOffset + 20, jsonLen).toString('utf8'))
  return { esGlTF: dv.getUint32(0, true) === 0x46546c67, version: dv.getUint32(4, true), json }
}

const VISOR_GLB = `<!doctype html><meta charset="utf-8"><body style="margin:0">
<canvas id="c" width="640" height="640"></canvas>
<script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/jsm/"}}</script>
<script type="module">
import * as THREE from 'three'
import { GLTFLoader } from '/vendor/jsm/loaders/GLTFLoader.js'
const canvas = document.getElementById('c')
const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
r.setClearColor(0xeeeeee, 1)
const scene = new THREE.Scene()
scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 2.5))
const d1 = new THREE.DirectionalLight(0xffffff, 1.2); d1.position.set(1, 2, 1.5); scene.add(d1)
const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 1e6)
new GLTFLoader().load('/modelo-render.glb', (g) => {
  scene.add(g.scene)
  const box = new THREE.Box3().setFromObject(g.scene)
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3())
  const dist = Math.max(s.x, s.y, s.z) * 1.6 || 10
  cam.position.set(c.x + dist, c.y + dist, c.z + dist); cam.up.set(0, 1, 0); cam.lookAt(c)
  r.render(scene, cam)
  const gl = r.getContext(), px = new Uint8Array(640 * 640 * 4)
  gl.readPixels(0, 0, 640, 640, gl.RGBA, gl.UNSIGNED_BYTE, px)
  let nonBg = 0
  for (let i = 0; i < px.length; i += 4) if (Math.abs(px[i] - 238) > 8 || Math.abs(px[i + 1] - 238) > 8 || Math.abs(px[i + 2] - 238) > 8) nonBg++
  window.__render = { nonBg, total: 640 * 640 }
}, undefined, (e) => { window.__render = { error: String(e) } })
</script></body>`

/**
 * Abre un GLB con three (GLTFLoader) en el navegador headless y lo renderiza, para revisar orientación y textura. three
 * y GLTFLoader se sirven desde node_modules (sin red). Devuelve cuántos píxeles no son el fondo y guarda la captura.
 */
export async function renderGlb(page: Page, glb: Buffer, outPng: string): Promise<{ nonBg?: number; total?: number; error?: string }> {
  const { readFile } = await import('node:fs/promises')
  // sirve three desde node_modules: build/*.js (three.module.js re-exporta three.core.js) y examples/jsm/**
  await page.route('**/vendor/**', async (r) => {
    const p = new URL(r.request().url()).pathname
    const file = p.includes('/vendor/jsm/')
      ? `node_modules/three/examples/jsm/${p.split('/vendor/jsm/')[1]}`
      : `node_modules/three/build/${p.split('/vendor/')[1]}`
    return r.fulfill({ contentType: 'text/javascript', body: await readFile(file, 'utf8') })
  })
  await page.route('**/modelo-render.glb', (r) => r.fulfill({ contentType: 'model/gltf-binary', body: glb }))
  await page.route('**/__visor.html', (r) => r.fulfill({ contentType: 'text/html', body: VISOR_GLB }))
  page.on('console', (m) => m.type() === 'error' && console.log('[visor console]', m.text()))
  page.on('pageerror', (e) => console.log('[visor pageerror]', e.message))
  await page.goto('/__visor.html')
  await page.waitForFunction(() => (window as unknown as { __render?: unknown }).__render, null, { timeout: 30_000 })
  const info = await page.evaluate(() => (window as unknown as { __render: { nonBg?: number; total?: number; error?: string } }).__render)
  await page.locator('#c').screenshot({ path: outPng })
  return info
}
