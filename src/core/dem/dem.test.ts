import { createGrid, rectGrid, sampleBilinear, gridStats } from './grid'
import { decodeTerrarium, lonLatToTile, terrariumPixelSize, terrariumZoom } from './terrarium'
import { copernicusTileName } from './copernicus'
import { rasterSampler } from './resample'
import { syntheticHillside } from './synthetic'
import { squareRect } from './area'

const meta = { source: 't', kind: 'sintético' as const, nominalResolutionM: 1 }

describe('grilla de elevación', () => {
  it('interpola un plano exactamente', () => {
    const g = createGrid(11, 11, 1, 0, 0, meta, (x, y) => 2 * x + 3 * y + 10)
    expect(sampleBilinear(g, 3.25, 7.5)).toBeCloseTo(2 * 3.25 + 3 * 7.5 + 10, 6)
    expect(sampleBilinear(g, 10, 10)).toBeCloseTo(60, 6)
    expect(Number.isNaN(sampleBilinear(g, -0.1, 5))).toBe(true)
    expect(gridStats(g)).toEqual({ min: 10, max: 60 })
  })

  it('grilla sobre un rectángulo: celdas = lado / celda, centrada en el área', () => {
    const g = rectGrid({ minX: 0, minY: 0, maxX: 10, maxY: 6 }, 2, meta, () => 0)
    expect([g.nx, g.ny, g.x0, g.y0]).toEqual([6, 4, 0, 0]) // 5 × 3 celdas
    // 5 m / 2 m = 2,5 celdas → 3 celdas, centradas: de −0,5 a 5,5
    const h = rectGrid({ minX: 0, minY: 0, maxX: 10, maxY: 5 }, 2, meta, () => 0)
    expect([h.ny, h.y0]).toEqual([4, -0.5])
  })

  it('la ladera sintética es determinista, desciende al norte y no depende del área', () => {
    const g = syntheticHillside(squareRect(200), 2)
    expect(sampleBilinear(g, -60, -80)).toBeGreaterThan(sampleBilinear(g, -60, 80))
    expect(syntheticHillside(squareRect(200), 2).z).toEqual(g.z)
    // otra área que comparte nodos con la primera da la misma cota en ellos
    const otra = syntheticHillside({ minX: -20, minY: -20, maxX: 60, maxY: 40 }, 2)
    expect(sampleBilinear(otra, 10, 10)).toBeCloseTo(sampleBilinear(g, 10, 10), 4)
    expect(otra.meta.nominalResolutionM).toBe(2)
  })
})

describe('fuentes DEM', () => {
  it('decodifica Terrarium', () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0)
    expect(decodeTerrarium(128, 100, 128)).toBeCloseTo(100.5, 6)
  })
  it('calcula teselas Web Mercator', () => {
    const t = lonLatToTile({ lon: 0, lat: 0 }, 0)
    expect(t.x).toBeCloseTo(0.5)
    expect(t.y).toBeCloseTo(0.5)
  })
  it('Terrarium: zoom más bajo cuyo píxel no supera la celda (tope z14)', () => {
    // ecuador: píxel z14 = 40 075 016,686 / (256 · 2^14) = 9,5546 m
    expect(terrariumPixelSize(14, 0)).toBeCloseTo(9.5546, 4)
    expect(terrariumZoom(10, 0)).toBe(14) // z13 = 19,1 m > 10
    expect(terrariumZoom(2, 0)).toBe(14) // nunca más fino que z14
    // Temuco (38,74° S): píxel z12 ≈ 29,8 m, z11 ≈ 59,6 m, z10 ≈ 119 m
    const lat = -38.739
    expect(terrariumZoom(20, lat)).toBe(13)
    expect(terrariumZoom(30, lat)).toBe(12)
    expect(terrariumZoom(80, lat)).toBe(11)
  })
  it('nombra teselas Copernicus por su esquina suroeste', () => {
    expect(copernicusTileName({ lon: -72.598, lat: -38.739 })).toBe('Copernicus_DSM_COG_10_S39_00_W073_00_DEM')
    expect(copernicusTileName({ lon: 7.2, lat: 45.5 })).toBe('Copernicus_DSM_COG_10_N45_00_E007_00_DEM')
  })
  it('muestrea un raster geográfico (fila 0 al norte)', () => {
    // 3x3, lon 0..2, lat 2..0; valor = lon + 10*lat
    const data = [20, 21, 22, 10, 11, 12, 0, 1, 2]
    const s = rasterSampler(data, 3, 3, 0, 2, 1, 1)
    expect(s({ lon: 1.5, lat: 0.5 })).toBeCloseTo(6.5, 6)
    expect(Number.isNaN(s({ lon: 3, lat: 1 }))).toBe(true)
  })
})
