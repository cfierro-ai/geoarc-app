import { Dxf2000Writer } from './dxf2000'

/** Pares (código, valor) de un DXF, para inspeccionar la estructura. */
function tags(s: string): [number, string][] {
  const l = s.split('\n')
  const out: [number, string][] = []
  for (let k = 0; k + 1 < l.length; k += 2) out.push([+l[k], l[k + 1]])
  return out
}
/** Valores de un handle (código 5) y de todos los dueños (330). */
const handles = (t: [number, string][]) => t.filter(([c]) => c === 5 || c === 105).map(([, v]) => v)

describe('escritor DXF 2000 (AC1015)', () => {
  const build = () => {
    const w = new Dxf2000Writer()
    w.addLayer('curvas', 8).addLayer('área', 3)
    w.lwpolyline('curvas', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }], false, 12.5)
    w.polyline3d('vialidad', [{ x: 0, y: 0, z: 1 }, { x: 5, y: 0, z: 2 }, { x: 10, y: 0, z: 1 }])
    w.face3d('edificaciones', { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 3 })
    w.text('referencia', { x: 3, y: 3, z: 0 }, 2.5, '© metros', 0)
    return w
  }

  it('cabecera AC1015 con unidades en metros y semilla de handles sobre el máximo usado', () => {
    const s = build().toString()
    const t = tags(s)
    expect(s).toContain('$ACADVER\n1\nAC1015')
    expect(s).toContain('$INSUNITS\n70\n6')
    expect(s).toContain('$MEASUREMENT\n70\n1')
    // secciones obligatorias en orden
    expect(['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS'].every((x) => s.includes(`SECTION\n2\n${x}\n`))).toBe(true)
    // $HANDSEED > todo handle usado (su propio valor, código 5 en la cabecera, se excluye)
    const seedHex = s.match(/\$HANDSEED\n5\n([0-9A-F]+)/)![1]
    const usados = handles(t).filter((h) => h !== seedHex)
    expect(parseInt(seedHex, 16)).toBeGreaterThan(Math.max(...usados.map((h) => parseInt(h, 16))))
  })

  it('todos los handles son únicos', () => {
    const hs = handles(tags(build().toString()))
    expect(new Set(hs).size).toBe(hs.length)
  })

  it('$EXTMIN/$EXTMAX envuelven todas las coordenadas', () => {
    const s = build().toString()
    const grab = (name: string) => {
      const m = s.match(new RegExp(`\\$${name}\\n10\\n(-?[\\d.]+)\\n20\\n(-?[\\d.]+)\\n30\\n(-?[\\d.]+)`))!
      return m.slice(1).map(Number)
    }
    expect(grab('EXTMIN')).toEqual([0, 0, 0])
    expect(grab('EXTMAX')).toEqual([10, 5, 12.5]) // z máx 12,5 (elevación de la LWPOLYLINE)
  })

  it('LWPOLYLINE: AcDbPolyline, conteo 90, elevación 38, sin código 30', () => {
    const s = build().toString()
    const lw = s.slice(s.indexOf('\nLWPOLYLINE\n'), s.indexOf('\nPOLYLINE\n'))
    expect(lw).toContain('100\nAcDbPolyline')
    expect(lw).toContain('90\n3')
    expect(lw).toContain('38\n12.500')
    expect(lw).toContain('10\n10.000\n20\n0.000')
    expect(lw).not.toContain('\n30\n') // 2D: no lleva Z por vértice
  })

  it('POLYLINE 3D: AcDb3dPolyline y sus VERTEX pertenecen al handle de la polilínea', () => {
    const s = build().toString()
    const seg = s.slice(s.indexOf('\nPOLYLINE\n'), s.indexOf('\n3DFACE\n'))
    const ph = seg.match(/POLYLINE\n5\n([0-9A-F]+)/)![1]
    expect(seg).toContain('100\nAcDb3dPolyline')
    const vertices = [...seg.matchAll(/VERTEX\n5\n[0-9A-F]+\n330\n([0-9A-F]+)/g)].map((m) => m[1])
    expect(vertices).toHaveLength(3)
    expect(vertices.every((o) => o === ph)).toBe(true)
    expect(seg.match(/SEQEND\n5\n[0-9A-F]+\n330\n([0-9A-F]+)/)![1]).toBe(ph)
  })

  it('3DFACE triángulo: el 4.º punto repite el 3.º', () => {
    const s = build().toString()
    const f = s.slice(s.indexOf('\n3DFACE\n'), s.indexOf('\nTEXT\n'))
    expect(f).toContain('100\nAcDbFace')
    expect(f).toMatch(/12\n1.000\n22\n1.000\n32\n3.000\n13\n1.000\n23\n1.000\n33\n3.000/)
  })

  it('TEXT: dos subclases AcDbText, centrado (72=1, 73=2) y el «©» escapado como \\U+00A9', () => {
    const s = build().toString()
    const t = s.slice(s.indexOf('\nTEXT\n'))
    expect((t.match(/100\nAcDbText/g) || []).length).toBe(2)
    expect(t).toContain('1\n\\U+00A9 metros')
    expect(t).toContain('72\n1')
    expect(t).toContain('73\n2')
  })

  it('las capas van a la tabla LAYER con su color', () => {
    const s = build().toString()
    expect(s).toContain('2\nCURVAS\n70\n0\n62\n8')
    expect(s).toContain('2\n_REA\n70\n0\n62\n3') // «área» saneado
    // el archivo queda en ASCII puro
    expect([...s].every((c) => c.charCodeAt(0) < 128)).toBe(true)
  })
})
