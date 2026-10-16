import { infoMosaico, latFrac, lonFrac, pixelDeLonLat, uvDeLonLat, zoomMosaico } from './mosaico'

// bbox ~250 m cerca de Temuco (área + margen)
const BB = { west: -72.6, east: -72.597, south: -38.741, north: -38.738 }

describe('mosaico de teselas para la textura', () => {
  it('zoom: el lado mayor del área queda entre 2048 y 4096 px cuando la fuente llega a ese zoom', () => {
    const z = zoomMosaico(BB, 24)
    const span = Math.max(Math.abs(lonFrac(BB.east) - lonFrac(BB.west)), Math.abs(latFrac(BB.south) - latFrac(BB.north)))
    const ladoPx = span * 256 * 2 ** z
    expect(ladoPx).toBeGreaterThanOrEqual(2048)
    expect(ladoPx).toBeLessThanOrEqual(4096)
  })

  it('zoom: se recorta al zoom máximo de la fuente', () => {
    expect(zoomMosaico(BB, 10)).toBe(10)
  })

  it('la esquina NE del área cae en la tesela NE del mosaico, con error < 1 px', () => {
    const m = infoMosaico(BB, zoomMosaico(BB, 24))
    const px = pixelDeLonLat({ lon: BB.east, lat: BB.north }, m)
    // tesela NE = última columna (x), primera fila (y)
    expect(px.x).toBeGreaterThanOrEqual((m.nx - 1) * 256 - 1)
    expect(px.x).toBeLessThanOrEqual(m.nx * 256)
    expect(px.y).toBeGreaterThanOrEqual(0)
    expect(px.y).toBeLessThanOrEqual(256 + 1)
  })

  it('UV: NE ≈ (1, 0) arriba-derecha; SO ≈ (0, 1) abajo-izquierda', () => {
    const m = infoMosaico(BB, zoomMosaico(BB, 24))
    const ne = uvDeLonLat({ lon: BB.east, lat: BB.north }, m)
    const so = uvDeLonLat({ lon: BB.west, lat: BB.south }, m)
    expect(ne.u).toBeGreaterThan((m.nx - 1) / m.nx)
    expect(ne.v).toBeLessThan(1 / m.ny)
    expect(so.u).toBeLessThan(1 / m.nx)
    expect(so.v).toBeGreaterThan((m.ny - 1) / m.ny)
  })
})
