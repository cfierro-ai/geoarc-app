import { useCallback, useMemo, useState } from 'react'
import { createLocalFrame, type LonLat, type XY } from '../../core/geo/local'
import { gridStats, sampleClamped } from '../../core/dem/grid'
import { areaProblem, autoCell, dataGridLines, gridCells, polygonProblem, rectFromCorners, rectSize } from '../../core/dem/area'
import { clipIsolines, clipPolyline } from '../../core/contours/clip'
import { area as polygonArea, cleanRing } from '../../core/envelope/polygon'
import { contourLevels, isolines } from '../../core/contours/isolines'
import {
  contarNiveles,
  curvasPorDesnivel,
  equidistanciaMinimaConfiable,
  MAX_NIVELES,
  PRESELECCION,
  preseleccionEquidistancia,
  usoDelDato,
} from '../../core/contours/escala'
import { sceneToDxf } from '../../core/export/sceneDxf'
import { MapView } from '../../app/components/MapView'
import { Scene3D } from '../../app/components/Scene3D'
import { SiteSection } from '../../app/components/SiteSection'
import { SourceOptions, TerrainMeta, TerrainStatus } from '../../app/components/TerrainInfo'
import { ContextoPanel } from '../../app/components/ContextoInfo'
import { OrigenSelector } from '../../app/components/DescargaOrigen'
import { btn, btnPrimary, input, ModulePanel, Note, Section } from '../../app/components/ui'
import { download, useEscape } from '../../app/util'
import { fmt, fmtAreaSize, fmtNum, INDEX_EVERY_OPTIONS, origenSufijo, type MapMode } from '../../app/model'
import { actions, useAppState } from '../../app/store'

/** Qué lleva el DXF, en una frase: «Curvas con cota, área, edificaciones (con su altura) y vías». */
function contenidoDxf(edificaciones: boolean, vias: boolean): string {
  const partes = ['Curvas con cota', 'área', ...(edificaciones ? ['edificaciones (con su altura)'] : []), ...(vias ? ['vías'] : [])]
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}

/**
 * Módulo Curvas de nivel. Flujo: ubicar el sitio → dibujar el área → curvas y contexto (edificaciones y vías de OSM)
 * aparecen solos → descargar.
 * El área es un rectángulo (dos esquinas) o un polígono (clics + doble clic). Con polígono, el terreno se calcula sobre
 * su rectángulo envolvente y las curvas (y la malla del dato) se recortan al polígono.
 * El terreno se descarga solo al cerrar el área; la fuente queda en «Opciones avanzadas».
 */
export function CurvasModule() {
  const site = useAppState((s) => s.site)
  const terrain = useAppState((s) => s.terrain)
  const curvas = useAppState((s) => s.curvas)
  const contexto = useAppState((s) => s.contexto)
  const capas = useAppState((s) => s.capas)
  const exportOrigin = useAppState((s) => s.exportOrigin)
  const ctxDatos = contexto.estado === 'listo' ? contexto.datos : null
  const [mode, setMode] = useState<MapMode>('none')
  const [areaCorner, setAreaCorner] = useState<XY | null>(null)
  /** Vértices del polígono en dibujo y, si al cerrarlo no sirve, por qué. */
  const [polyDraft, setPolyDraft] = useState<XY[]>([])
  const [polyProblem, setPolyProblem] = useState<string | null>(null)
  const frame = useMemo(() => createLocalFrame(site), [site])
  const { area, polygon, dem } = terrain
  const { contourInterval, indexEvery, showDataGrid } = curvas
  const indexInterval = contourInterval * indexEvery
  const view = dem ? curvas.view : 'mapa'

  const st = useMemo(() => (dem ? gridStats(dem) : null), [dem])
  const contours = useMemo(() => {
    if (!dem || !st) return []
    if (contarNiveles(st.min, st.max, contourInterval) > MAX_NIVELES) return []
    const all = isolines(dem, contourLevels(st.min, st.max, contourInterval))
    return polygon ? clipIsolines(all, polygon) : all
  }, [dem, st, contourInterval, polygon])
  const dataGrid = useMemo(() => {
    if (!showDataGrid || !dem || !area) return null
    const lines = dataGridLines(area, dem.meta.nominalResolutionM)
    if (!lines || !polygon) return lines
    return lines.flatMap((l) => clipPolyline([l.a, l.b], false, polygon).map((t) => ({ a: t[0], b: t[t.length - 1] })))
  }, [showDataGrid, dem, area, polygon])

  const cancel = useCallback(() => {
    setMode('none')
    setAreaCorner(null)
    setPolyDraft([])
    setPolyProblem(null)
  }, [])

  const finishPolygon = () => {
    const ring = cleanRing(polyDraft)
    const problem = polygonProblem(ring)
    if (problem) {
      // se sigue dibujando: el aviso dice por qué no se cerró
      setPolyDraft(ring)
      return setPolyProblem(problem)
    }
    cancel()
    void actions.setAreaPolygon(ring)
  }

  const startDrawing = (m: 'area' | 'poligono') => {
    cancel()
    setMode(m)
    actions.setCurvas({ view: 'mapa' })
  }
  useEscape(mode, cancel)

  const onPick = (p: LonLat) => {
    if (mode === 'site') {
      actions.setSite(p)
      setMode('none')
    } else if (mode === 'area') {
      const q = frame.toLocal(p)
      if (!areaCorner) return setAreaCorner(q)
      const r = rectFromCorners(areaCorner, q)
      if (areaProblem(r)) return // el aviso del mapa explica por qué; se espera otro clic
      cancel()
      void actions.loadTerrain(r)
    } else if (mode === 'poligono') {
      setPolyProblem(null)
      setPolyDraft((d) => [...d, frame.toLocal(p)])
    }
  }

  const exportDxf = () => {
    const dxf = sceneToDxf({
      frame,
      contours,
      indexInterval,
      area: area ?? undefined,
      areaPolygon: polygon,
      contexto: ctxDatos,
      cotaBase: dem ? (p) => sampleClamped(dem, p.x, p.y) : undefined,
      origin: exportOrigin,
    })
    const utm = `UTM${frame.zone}${frame.south ? 'S' : 'N'}`
    download(`geoarc_curvas_${site.lat.toFixed(5)}_${site.lon.toFixed(5)}_${utm}${origenSufijo(exportOrigin)}.dxf`, dxf, 'application/dxf')
  }

  const minConf = dem ? equidistanciaMinimaConfiable(dem.meta) : undefined
  const pre = dem && st ? preseleccionEquidistancia(dem.meta, st.max - st.min) : undefined
  const tooMany = (e: number) => !!st && contarNiveles(st.min, st.max, e) > MAX_NIVELES
  const cell = area ? autoCell(area) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <ModulePanel testId="panel-curvas">
        <SiteSection mode={mode} onPickOnMap={(on) => (setMode(on ? 'site' : 'none'), actions.setCurvas({ view: 'mapa' }))} />

        <Section n={2} title="Área y curvas de nivel" done={!!dem}>
          {mode === 'area' ? (
            <div className="flex items-center gap-2">
              <button className={btn} onClick={cancel}>Cancelar</button>
              <span className="text-xs text-slate-500">{areaCorner ? 'Clic en la esquina opuesta del área.' : 'Clic en una esquina del área.'}</span>
            </div>
          ) : mode === 'poligono' ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button className={btnPrimary} onClick={finishPolygon} disabled={polyDraft.length < 3}>
                  Cerrar polígono ({polyDraft.length})
                </button>
                <button className={btn} onClick={cancel}>Cancelar</button>
                <span className="text-xs text-slate-500">Clic en cada vértice; doble clic cierra.</span>
              </div>
              {polyProblem && <Note tone="warn">{polyProblem}</Note>}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button className={area ? btn : btnPrimary} onClick={() => startDrawing('area')}>Dibujar rectángulo</button>
              <button className={btn} onClick={() => startDrawing('poligono')}>Dibujar polígono</button>
              {!area && <span className="text-xs text-slate-500">El terreno se descarga solo al cerrar el área.</span>}
            </div>
          )}
          {area && cell !== null && (
            <p className="text-xs text-slate-600" data-testid="area-info">
              {polygon ? (
                <>
                  Polígono de {polygon.length} vértices · {fmt(polygonArea(polygon) / 10_000, 2)} ha. Se calcula sobre su
                  rectángulo envolvente: {fmt(rectSize(area).w, 0)} × {fmt(rectSize(area).h, 0)} m
                </>
              ) : (
                fmtAreaSize(rectSize(area).w, rectSize(area).h)
              )}
              {` · celda ${fmtNum(cell)} m (${gridCells(area, cell).nx} × ${gridCells(area, cell).ny})`}
            </p>
          )}
          <TerrainStatus />
          {dem && st && minConf !== undefined && pre && (
            <>
              <TerrainMeta />
              <div className="rounded-md border border-slate-200 p-2 text-xs leading-snug text-slate-600" data-testid="uso-dato">
                <p className="text-slate-800" data-testid="uso-dato-texto">
                  {usoDelDato(dem.meta).replace(/^./, (c) => c.toUpperCase())}.
                </p>
                <p>
                  Equidistancia mínima confiable: <b data-testid="equidistancia-minima">{fmtNum(minConf)} m</b>. Sugerida para este
                  desnivel: <b data-testid="equidistancia-sugerida">{fmtNum(pre.equidistancia)} m</b> ({pre.curvas} curvas en{' '}
                  {fmtNum(st.max - st.min, 1)} m).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-600">
                  Equidistancia
                  <select className={input} value={contourInterval} onChange={(e) => actions.setCurvas({ contourInterval: +e.target.value })} aria-label="Equidistancia">
                    {[...new Set([...PRESELECCION, contourInterval])].sort((a, b) => a - b).map((v) => (
                      <option key={v} value={v} disabled={tooMany(v)}>
                        {fmtNum(v)} m{v < minConf ? ' · aparente' : ''} ({curvasPorDesnivel(st.max - st.min, v)} curvas)
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-600">
                  Maestras cada
                  <select className={input} value={indexEvery} onChange={(e) => actions.setCurvas({ indexEvery: +e.target.value })} aria-label="Maestras cada">
                    {INDEX_EVERY_OPTIONS.map((k) => (
                      <option key={k} value={k}>{fmtNum(contourInterval * k)} m (1 de {k})</option>
                    ))}
                  </select>
                </label>
              </div>
              {contourInterval < minConf && (
                <Note tone="warn">
                  Curvas cada {fmtNum(contourInterval)} m sobre un dato de ~{fmtNum(dem.meta.nominalResolutionM)} m: la precisión es <b>aparente</b>.
                  La forma general es válida; el detalle, no.
                </Note>
              )}
              {tooMany(contourInterval) && <Note tone="warn">Con esta equidistancia saldrían más de {MAX_NIVELES} curvas: elige una mayor.</Note>}
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={showDataGrid} onChange={(e) => actions.setCurvas({ showDataGrid: e.target.checked })} />
                Mostrar la malla del dato en el mapa (celdas de ~{fmtNum(dem.meta.nominalResolutionM)} m)
              </label>
              {showDataGrid && !dataGrid && <p className="text-xs text-slate-500">La malla es demasiado densa para dibujarla en esta área.</p>}
            </>
          )}
          <SourceOptions />
        </Section>

        {area && (
          <Section n={3} title="Contexto: edificaciones y vías" done={!!ctxDatos}>
            <ContextoPanel />
          </Section>
        )}

        {dem && (
          <Section n={4} title="Descargar" done={false}>
            <OrigenSelector />
            <button className={btnPrimary} onClick={exportDxf}>Descargar DXF 2000</button>
            <p className="text-xs text-slate-500" data-testid="descarga-contenido">
              {contenidoDxf(!!ctxDatos?.edificaciones.length, !!ctxDatos?.vias.length)}. Formato DXF 2000, en metros;{' '}
              {exportOrigin === 'local' ? 'origen local (el archivo anota el origen en UTM).' : `UTM ${frame.zone}${frame.south ? 'S' : 'N'} (EPSG:${frame.epsg}).`}
            </p>
          </Section>
        )}
      </ModulePanel>

      <main className="relative min-h-[420px] flex-1">
        <div className={`absolute inset-0 ${view === 'mapa' ? '' : 'invisible'}`}>
          <MapView
            frame={frame}
            site={site}
            area={area}
            areaPolygon={polygon}
            areaCorner={areaCorner}
            loading={terrain.status.state === 'loading'}
            contours={contours}
            indexInterval={indexInterval}
            dataGrid={dataGrid}
            lot={[]}
            draft={polyDraft}
            contexto={ctxDatos}
            capas={capas}
            mode={mode}
            onPick={onPick}
            onFinishDraft={finishPolygon}
            visible={view === 'mapa'}
          />
        </div>
        {dem && (
          <div className={`absolute inset-0 ${view === '3d' ? 'z-10' : 'invisible'}`}>
            <Scene3D dem={dem} contours={contours} indexInterval={indexInterval} lot={[]} didactic={false} selectedEdge={null} exaggeration={1} visible={view === '3d'} />
          </div>
        )}
      </main>
    </div>
  )
}
