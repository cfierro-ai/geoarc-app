import type { XY, XYZ } from '../geo/local'

/**
 * Escritor DXF 2000 (AC1015). Reemplaza al R12: declara unidades ($INSUNITS 6 = metros) y entidades modernas
 * (LWPOLYLINE, 3DFACE con subclases y handles) que SketchUp y Rhino importan con geometría visible, no solo AutoCAD.
 *
 * Estructura: HEADER · CLASSES (vacía) · TABLES (VPORT, LTYPE, LAYER, STYLE, VIEW, UCS, APPID, DIMSTYLE, BLOCK_RECORD) ·
 * BLOCKS (*Model_Space, *Paper_Space) · ENTITIES (en el BLOCK_RECORD de model space) · OBJECTS (diccionario raíz y
 * layouts). Cada objeto lleva handle único; los del andamiaje son fijos (≤ 0xFF) y los generados parten en 0x100.
 *
 * El texto no ASCII va como `\U+XXXX` (R2000 no admite UTF-8 en TEXT; sí lo leen AutoCAD, ezdxf, LibreCAD, QGIS).
 */

// Handles fijos del andamiaje (hex), calcados de un AC1015 de ezdxf.
const H = {
  root: '0',
  vportTable: '8', activeVport: '23',
  ltypeTable: '2', byBlock: '24', byLayer: '25', continuous: '26',
  layerTable: '1', layer0: '27',
  styleTable: '5', standardStyle: '29',
  viewTable: '7', ucsTable: '6',
  appidTable: '3', acadApp: '2A',
  dimstyleTable: '4', standardDim: '2B',
  brTable: '9', mspace: '17', pspace: '1B',
  msBlockBegin: '18', msBlockEnd: '19', psBlockBegin: '1C', psBlockEnd: '1D',
  rootDict: 'A', layoutDict: 'D', groupDict: 'B', layoutModel: '1A', layoutPaper: '1E',
}

interface LayerDef {
  name: string
  color: number
  handle: string
}

export class Dxf2000Writer {
  private layers: LayerDef[] = []
  private entities: string[] = []
  private next = 0x100
  private ext = { minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity }

  private handle(): string {
    return (this.next++).toString(16).toUpperCase()
  }

  private see(x: number, y: number, z: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return
    if (x < this.ext.minX) this.ext.minX = x
    if (y < this.ext.minY) this.ext.minY = y
    if (z < this.ext.minZ) this.ext.minZ = z
    if (x > this.ext.maxX) this.ext.maxX = x
    if (y > this.ext.maxY) this.ext.maxY = y
    if (z > this.ext.maxZ) this.ext.maxZ = z
  }

  addLayer(name: string, color: number): this {
    const n = sanitize(name)
    if (!this.layers.some((l) => l.name === n)) this.layers.push({ name: n, color, handle: this.handle() })
    return this
  }

  /** LWPOLYLINE (2D) a una elevación constante: curvas, huellas de edificio y área. */
  lwpolyline(layer: string, pts: XY[], closed = false, elevation = 0): this {
    if (pts.length < 2) return this
    const L = sanitize(layer)
    const e: (string | number)[] = [0, 'LWPOLYLINE', 5, this.handle(), 330, H.mspace, 100, 'AcDbEntity', 8, L, 100, 'AcDbPolyline', 90, pts.length, 70, closed ? 1 : 0]
    if (elevation !== 0) e.push(38, n(elevation))
    for (const p of pts) {
      e.push(10, n(p.x), 20, n(p.y))
      this.see(p.x, p.y, elevation)
    }
    this.entities.push(pairs(e))
    return this
  }

  /** POLYLINE 3D (cota por vértice): vías sobre el terreno. */
  polyline3d(layer: string, pts: XYZ[], closed = false): this {
    if (pts.length < 2) return this
    const L = sanitize(layer)
    const ph = this.handle()
    const e: (string | number)[] = [0, 'POLYLINE', 5, ph, 330, H.mspace, 100, 'AcDbEntity', 8, L, 100, 'AcDb3dPolyline', 66, 1, 10, 0, 20, 0, 30, 0, 70, closed ? 9 : 8]
    for (const p of pts) {
      e.push(0, 'VERTEX', 5, this.handle(), 330, ph, 100, 'AcDbEntity', 8, L, 100, 'AcDbVertex', 100, 'AcDb3dPolylineVertex', 10, n(p.x), 20, n(p.y), 30, n(p.z), 70, 32)
      this.see(p.x, p.y, p.z)
    }
    e.push(0, 'SEQEND', 5, this.handle(), 330, ph, 100, 'AcDbEntity', 8, L)
    this.entities.push(pairs(e))
    return this
  }

  /**
   * 3DFACE (triángulo si d = c): muros y techos de edificios, caras de la envolvente. `ocultas` es la máscara del
   * código 70 (aristas invisibles: 1 = 1→2, 2 = 2→3, 4 = 3→4, 8 = 4→1), para ocultar las diagonales de la triangulación.
   */
  face3d(layer: string, a: XYZ, b: XYZ, c: XYZ, d: XYZ = c, ocultas = 0): this {
    const L = sanitize(layer)
    const e: (string | number)[] = [0, '3DFACE', 5, this.handle(), 330, H.mspace, 100, 'AcDbEntity', 8, L, 100, 'AcDbFace']
    ;[a, b, c, d].forEach((p, k) => {
      e.push(10 + k, n(p.x), 20 + k, n(p.y), 30 + k, n(p.z))
      this.see(p.x, p.y, p.z)
    })
    if (ocultas) e.push(70, ocultas)
    this.entities.push(pairs(e))
    return this
  }

  /** TEXT centrado (horizontal y vertical) en `p`, de altura `height` y giro `angleDeg`. */
  text(layer: string, p: XYZ, height: number, value: string, angleDeg = 0): this {
    const L = sanitize(layer)
    const at: [number, string][] = [[10, n(p.x)], [20, n(p.y)], [30, n(p.z)]]
    const al: [number, string][] = [[11, n(p.x)], [21, n(p.y)], [31, n(p.z)]]
    const e: (string | number)[] = [0, 'TEXT', 5, this.handle(), 330, H.mspace, 100, 'AcDbEntity', 8, L, 100, 'AcDbText']
    for (const [c, v] of at) e.push(c, v)
    e.push(40, n(height), 1, ascii(value), 50, n(angleDeg), 72, 1)
    for (const [c, v] of al) e.push(c, v)
    // segunda subclase AcDbText con la alineación vertical (73 = 2, medio)
    e.push(100, 'AcDbText', 73, 2)
    this.see(p.x, p.y, p.z)
    this.entities.push(pairs(e))
    return this
  }

  toString(): string {
    const ex = Number.isFinite(this.ext.minX) ? this.ext : { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 }
    const seed = this.next.toString(16).toUpperCase()

    const header = pairs([
      0, 'SECTION', 2, 'HEADER',
      9, '$ACADVER', 1, 'AC1015',
      9, '$HANDSEED', 5, seed,
      9, '$INSUNITS', 70, 6,
      9, '$MEASUREMENT', 70, 1,
      9, '$LTSCALE', 40, 1,
      9, '$EXTMIN', 10, n(ex.minX), 20, n(ex.minY), 30, n(ex.minZ),
      9, '$EXTMAX', 10, n(ex.maxX), 20, n(ex.maxY), 30, n(ex.maxZ),
      0, 'ENDSEC',
    ])

    const classes = pairs([0, 'SECTION', 2, 'CLASSES', 0, 'ENDSEC'])

    const tables = pairs([0, 'SECTION', 2, 'TABLES']) + this.tablesBody() + pairs([0, 'ENDSEC'])

    const blocks = pairs([
      0, 'SECTION', 2, 'BLOCKS',
      ...block(H.msBlockBegin, H.msBlockEnd, H.mspace, '*Model_Space'),
      ...block(H.psBlockBegin, H.psBlockEnd, H.pspace, '*Paper_Space'),
      0, 'ENDSEC',
    ])

    const entities = pairs([0, 'SECTION', 2, 'ENTITIES']) + this.entities.join('') + pairs([0, 'ENDSEC'])

    const objects = this.objectsSection()

    return header + classes + tables + blocks + entities + objects + pairs([0, 'EOF'])
  }

  private tablesBody(): string {
    const vport = pairs([
      0, 'TABLE', 2, 'VPORT', 5, H.vportTable, 330, H.root, 100, 'AcDbSymbolTable', 70, 1,
      0, 'VPORT', 5, H.activeVport, 330, H.vportTable, 100, 'AcDbSymbolTableRecord', 100, 'AcDbViewportTableRecord',
      2, '*Active', 70, 0, 10, 0, 20, 0, 11, 1, 21, 1, 12, 0, 22, 0, 13, 0, 23, 0,
      40, 1000, 41, 1.34, 42, 50, 43, 0, 44, 0, 50, 0, 51, 0, 71, 0, 72, 1000, 73, 1, 74, 3, 75, 0, 76, 0, 77, 0, 78, 0,
      0, 'ENDTAB',
    ])
    const ltypeRec = (h: string, name: string) => [
      0, 'LTYPE', 5, h, 330, H.ltypeTable, 100, 'AcDbSymbolTableRecord', 100, 'AcDbLinetypeTableRecord', 2, name, 70, 0, 3, '', 72, 65, 73, 0, 40, 0,
    ]
    const ltype = pairs([
      0, 'TABLE', 2, 'LTYPE', 5, H.ltypeTable, 330, H.root, 100, 'AcDbSymbolTable', 70, 3,
      ...ltypeRec(H.byBlock, 'ByBlock'), ...ltypeRec(H.byLayer, 'ByLayer'), ...ltypeRec(H.continuous, 'Continuous'),
      0, 'ENDTAB',
    ])
    const layerRec = (h: string, name: string, color: number) => [
      0, 'LAYER', 5, h, 330, H.layerTable, 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord', 2, name, 70, 0, 62, color, 6, 'Continuous', 370, -3, 390, H.layoutModel,
    ]
    const layer = pairs([
      0, 'TABLE', 2, 'LAYER', 5, H.layerTable, 330, H.root, 100, 'AcDbSymbolTable', 70, this.layers.length + 1,
      ...layerRec(H.layer0, '0', 7),
      ...this.layers.flatMap((l) => layerRec(l.handle, l.name, l.color)),
      0, 'ENDTAB',
    ])
    const style = pairs([
      0, 'TABLE', 2, 'STYLE', 5, H.styleTable, 330, H.root, 100, 'AcDbSymbolTable', 70, 1,
      0, 'STYLE', 5, H.standardStyle, 330, H.styleTable, 100, 'AcDbSymbolTableRecord', 100, 'AcDbTextStyleTableRecord',
      2, 'Standard', 70, 0, 40, 0, 41, 1, 50, 0, 71, 0, 42, 2.5, 3, 'txt', 4, '',
      0, 'ENDTAB',
    ])
    const view = pairs([0, 'TABLE', 2, 'VIEW', 5, H.viewTable, 330, H.root, 100, 'AcDbSymbolTable', 70, 0, 0, 'ENDTAB'])
    const ucs = pairs([0, 'TABLE', 2, 'UCS', 5, H.ucsTable, 330, H.root, 100, 'AcDbSymbolTable', 70, 0, 0, 'ENDTAB'])
    const appid = pairs([
      0, 'TABLE', 2, 'APPID', 5, H.appidTable, 330, H.root, 100, 'AcDbSymbolTable', 70, 1,
      0, 'APPID', 5, H.acadApp, 330, H.appidTable, 100, 'AcDbSymbolTableRecord', 100, 'AcDbRegAppTableRecord', 2, 'ACAD', 70, 0,
      0, 'ENDTAB',
    ])
    // DIMSTYLE: su handle va en el código 105, no 5
    const dimstyle = pairs([
      0, 'TABLE', 2, 'DIMSTYLE', 5, H.dimstyleTable, 330, H.root, 100, 'AcDbSymbolTable', 70, 1, 100, 'AcDbDimStyleTable',
      0, 'DIMSTYLE', 105, H.standardDim, 330, H.dimstyleTable, 100, 'AcDbSymbolTableRecord', 100, 'AcDbDimStyleTableRecord', 2, 'Standard', 70, 0,
      0, 'ENDTAB',
    ])
    const blockRecord = pairs([
      0, 'TABLE', 2, 'BLOCK_RECORD', 5, H.brTable, 330, H.root, 100, 'AcDbSymbolTable', 70, 2,
      0, 'BLOCK_RECORD', 5, H.mspace, 330, H.brTable, 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, '*Model_Space', 340, H.layoutModel,
      0, 'BLOCK_RECORD', 5, H.pspace, 330, H.brTable, 100, 'AcDbSymbolTableRecord', 100, 'AcDbBlockTableRecord', 2, '*Paper_Space', 340, H.layoutPaper,
      0, 'ENDTAB',
    ])
    return vport + ltype + layer + style + view + ucs + appid + dimstyle + blockRecord
  }

  private objectsSection(): string {
    // diccionario raíz con los diccionarios con nombre mínimos (GROUP y LAYOUT), y los dos layouts
    const root = pairs([
      0, 'DICTIONARY', 5, H.rootDict, 330, H.root, 100, 'AcDbDictionary', 281, 1,
      3, 'ACAD_GROUP', 350, H.groupDict,
      3, 'ACAD_LAYOUT', 350, H.layoutDict,
    ])
    const groupDict = pairs([0, 'DICTIONARY', 5, H.groupDict, 330, H.rootDict, 100, 'AcDbDictionary', 281, 1])
    const layoutDict = pairs([
      0, 'DICTIONARY', 5, H.layoutDict, 330, H.rootDict, 100, 'AcDbDictionary', 281, 1,
      3, 'Model', 350, H.layoutModel, 3, 'Layout1', 350, H.layoutPaper,
    ])
    const layout = (h: string, name: string, order: number, block: string) => pairs([
      0, 'LAYOUT', 5, h, 330, H.layoutDict, 100, 'AcDbPlotSettings', 100, 'AcDbLayout',
      1, name, 70, 1, 71, order, 10, 0, 20, 0, 11, 420, 21, 297, 12, 0, 22, 0, 32, 0,
      14, 0, 24, 0, 34, 0, 15, 0, 25, 0, 35, 0, 146, 0,
      13, 0, 23, 0, 33, 0, 16, 1, 26, 0, 36, 0, 17, 0, 27, 1, 37, 0, 76, 0, 330, block,
    ])
    return pairs([0, 'SECTION', 2, 'OBJECTS']) + root + groupDict + layoutDict + layout(H.layoutModel, 'Model', 0, H.mspace) + layout(H.layoutPaper, 'Layout1', 1, H.pspace) + pairs([0, 'ENDSEC'])
  }
}

function block(beginH: string, endH: string, brH: string, name: string): (string | number)[] {
  return [
    0, 'BLOCK', 5, beginH, 330, brH, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockBegin', 2, name, 70, 0, 10, 0, 20, 0, 30, 0, 3, name, 1, '',
    0, 'ENDBLK', 5, endH, 330, brH, 100, 'AcDbEntity', 8, '0', 100, 'AcDbBlockEnd',
  ]
}

function n(v: number): string {
  return Number.isFinite(v) ? v.toFixed(3) : '0.0'
}

/** R2000 no admite UTF-8 en TEXT: lo no ASCII va con el escape \U+XXXX de AutoCAD. */
function ascii(s: string): string {
  return s.replace(/[^\x20-\x7e]/g, (c) => `\\U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`)
}

function sanitize(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9_-]/g, '_')
}

function pairs(a: (string | number)[]): string {
  let s = ''
  for (let k = 0; k < a.length; k += 2) s += `${a[k]}\n${a[k + 1]}\n`
  return s
}
