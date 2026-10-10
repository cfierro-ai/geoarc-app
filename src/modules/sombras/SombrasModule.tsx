import { useCallback, useEffect, useMemo, useState } from 'react'
import { createLocalFrame, type LonLat, type XY } from '../../core/geo/local'
import { gridStats, sampleBilinear, type HeightGrid } from '../../core/dem/grid'
import { flatGrid } from '../../core/dem/plano'
import { contourLevels, isolines } from '../../core/contours/isolines'
import { preseleccionEquidistancia } from '../../core/contours/escala'
import { computeEnvelope, GOV_MAX_HEIGHT, prepare } from '../../core/envelope/envelope'
import { envelopeInputFor, lotFromDimensions, terrainAreaForLot } from '../../core/envelope/lote'
import { area, facing, outwardNormal, toCCW } from '../../core/envelope/polygon'
import { PERFILES, perfilVerificado, type EdgeRole } from '../../core/normativa/perfiles'
import { sceneToDxf } from '../../core/export/sceneDxf'
import { MapView } from '../../app/components/MapView'
import { Scene3D } from '../../app/components/Scene3D'
import { SiteSection } from '../../app/components/SiteSection'
import { SourceOptions, TerrainMeta, TerrainStatus } from '../../app/components/TerrainInfo'
import { btn, btnPrimary, input, ModulePanel, Note, Num, Section } from '../../app/components/ui'
import { download, useEscape } from '../../app/util'
import { edgeColor, exampleLot, fmt, MAX_HEIGHT_COLOR, ROLE_LABEL, TERRAIN_MODES, type MapMode, type TerrainMode } from '../../app/model'
import { actions, gridCoversLot, useAppState } from '../../app/store'

/** Quita vértices repetidos (el doble clic agrega dos clics extra en el mismo punto). */
function cleanRing(pts: XY[], tol = 0.3): XY[] {
  const out: XY[] = []
  for (const p of pts) if (!out.length || Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y) > tol) out.push(p)
  while (out.length > 2 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= tol) out.pop()
  return out
}

/** Grilla sobre la que se calcula y dibuja el estudio: plana (cota 0) o el terreno del sitio si cubre el lote. */
function useStudyGrid(terrainMode: TerrainMode, lot: XY[], dem: HeightGrid | null): HeightGrid | null {
  const flat = useMemo(() => (terrainMode === 'plano' && lot.length > 2 ? flatGrid(terrainAreaForLot(lot), 1) : null), [terrainMode, lot])
  if (terrainMode === 'plano') return flat
  return terrainMode === 'sitio' && dem && lot.length > 2 && gridCoversLot(dem, lot) ? dem : null
}

function LotDimensions() {
  const [ancho, setAncho] = useState(20)
  const [fondo, setFondo] = useState(30)
  const [giro, setGiro] = useState(0)
  return (
    <div className="rounded-md border border-slate-200 p-2" data-testid="lote-dimensiones">
      <p className="mb-1 text-xs text-slate-600">Por dimensiones (centrado en el sitio)</p>
      <div className="grid grid-cols-4 items-end gap-1 text-[11px] text-slate-500">
        <label>Ancho (m)<Num label="Ancho del lote" value={ancho} min={1} step={1} onChange={setAncho} /></label>
        <label>Fondo (m)<Num label="Fondo del lote" value={fondo} min={1} step={1} onChange={setFondo} /></label>
        <label title="Sentido antihorario">Giro (°)<Num label="Giro del lote" value={giro} step={5} onChange={setGiro} /></label>
        <button className={btn} disabled={!(ancho > 0 && fondo > 0)} onClick={() => void actions.setLot(lotFromDimensions(ancho, fondo, giro))}>
          Crear
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">El lado 1 es el frente (ancho); el giro es antihorario.</p>
    </div>
  )
}

/**
 * Módulo Estudio de sombras: envolvente por rasantes, distanciamientos y altura máxima.
 * Terreno «Plano (cota 0)» por defecto; «Terreno del sitio» descarga (o reutiliza) el terreno alrededor del lote.
 */
export function SombrasModule() {
  const site = useAppState((s) => s.site)
  const terrain = useAppState((s) => s.terrain)
  const sombras = useAppState((s) => s.sombras)
  const { terrainMode, lot, edges, maxHeight, didactic, exaggeration } = sombras
  const [mode, setMode] = useState<MapMode>('none')
  const [draft, setDraft] = useState<XY[]>([])
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null)
  const frame = useMemo(() => createLocalFrame(site), [site])
  const profile = PERFILES.find((p) => p.id === sombras.profileId) ?? PERFILES[0]

  // al entrar al módulo (p. ej. tras redibujar el área en Curvas) se verifica que el terreno cubra el lote
  useEffect(() => void actions.ensureSiteTerrain(), [])

  const grid = useStudyGrid(terrainMode, lot, terrain.dem)
  const view = grid && lot.length > 2 ? sombras.view : 'mapa'
  const terrainFn = useCallback((x: number, y: number) => (grid ? sampleBilinear(grid, x, y) : NaN), [grid])

  const envInput = useMemo(() => {
    if (!grid || lot.length < 3 || edges.length !== lot.length) return null
    return envelopeInputFor(lot, edges.map((e) => e.rule), maxHeight, terrainFn)
  }, [grid, lot, edges, maxHeight, terrainFn])
  const envelope = useMemo(() => (envInput ? computeEnvelope(envInput) : undefined), [envInput])
  const envCtx = useMemo(() => (envInput ? prepare(envInput) : undefined), [envInput])

  // curvas del terreno del sitio (equidistancia preseleccionada), como referencia en el mapa y en 3D
  const { contours, indexInterval } = useMemo(() => {
    if (terrainMode !== 'sitio' || !grid) return { contours: [], indexInterval: 25 }
    const { min, max } = gridStats(grid)
    const e = preseleccionEquidistancia(grid.meta, max - min).equidistancia
    return { contours: isolines(grid, contourLevels(min, max, e)), indexInterval: 5 * e }
  }, [terrainMode, grid])

  const cancel = useCallback(() => {
    setMode('none')
    setDraft([])
  }, [])
  useEscape(mode, cancel)

  const finishLot = () => {
    const ring = cleanRing(draft)
    cancel()
    if (ring.length >= 3) {
      void actions.setLot(ring)
      setSelectedEdge(null)
    }
  }

  const onPick = (p: LonLat) => {
    if (mode === 'site') {
      actions.setSite(p)
      setMode('none')
    } else if (mode === 'lot') setDraft((d) => [...d, frame.toLocal(p)])
  }

  const lotInfo = useMemo(() => {
    if (lot.length < 3) return null
    const reversed = toCCW(lot) !== lot
    const sides = lot.map((a, k) => {
      const b = lot[(k + 1) % lot.length]
      const n0 = outwardNormal(a, b)
      const n = reversed ? { x: -n0.x, y: -n0.y } : n0
      return { len: Math.hypot(b.x - a.x, b.y - a.y), facing: facing(n) }
    })
    return { area: area(lot), perim: sides.reduce((t, x) => t + x.len, 0), sides }
  }, [lot])

  const govShare = useMemo(() => {
    if (!envelope) return []
    const counts = new Map<number, number>()
    let tot = 0
    for (let k = 0; k < envelope.rel.length; k++)
      if (envelope.rel[k] > 0) {
        counts.set(envelope.governing[k], (counts.get(envelope.governing[k]) ?? 0) + 1)
        tot++
      }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([g, c]) => ({ g, pct: (100 * c) / tot }))
  }, [envelope])

  const exportDxf = () => {
    const sitio = terrainMode === 'sitio'
    const dxf = sceneToDxf({
      frame,
      contours,
      indexInterval,
      area: sitio ? (terrain.area ?? undefined) : undefined,
      lot,
      lotZ: (p) => terrainFn(p.x, p.y),
      envelope,
    })
    download(`geoarc_sombras_${site.lat.toFixed(5)}_${site.lon.toFixed(5)}_UTM${frame.zone}${frame.south ? 'S' : 'N'}.dxf`, dxf, 'application/dxf')
  }
  const exportPng = () => {
    const c = document.querySelector<HTMLCanvasElement>('#geoarc-3d canvas, canvas#geoarc-3d')
    c?.toBlob((b) => b && download('geoarc_sombras_3d.png', b, 'image/png'))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <ModulePanel testId="panel-sombras">
        <SiteSection mode={mode} onPickOnMap={(on) => (setMode(on ? 'site' : 'none'), actions.setSombras({ view: 'mapa' }))} />

        <Section n={2} title="Terreno" done={!!grid}>
          <div className="space-y-1" role="radiogroup" aria-label="Terreno del estudio">
            {TERRAIN_MODES.map((m) => (
              <label key={m.id} className={`flex items-start gap-2 text-xs ${m.disabled ? 'text-slate-400' : 'text-slate-700'}`}>
                <input
                  type="radio"
                  name="terreno"
                  className="mt-0.5"
                  checked={terrainMode === m.id}
                  disabled={!!m.disabled}
                  onChange={() => void actions.setTerrainMode(m.id)}
                />
                <span>
                  <b className="font-medium">{m.label}</b>
                  {m.disabled && <> — {m.disabled}</>}
                  <span className="block text-slate-500">{m.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {terrainMode === 'sitio' && (
            <>
              {lot.length < 3 && <p className="text-xs text-slate-500">Define el lote (paso 3): el terreno se descarga solo a su alrededor.</p>}
              <TerrainStatus />
              {grid && <TerrainMeta />}
              <SourceOptions />
            </>
          )}
        </Section>

        <Section n={3} title="Lote" done={lot.length > 2}>
          <div className="flex flex-wrap gap-1">
            {mode !== 'lot' ? (
              <button className={btn} onClick={() => (setDraft([]), setMode('lot'), actions.setSombras({ view: 'mapa' }))}>Dibujar en mapa</button>
            ) : (
              <>
                <button className={btnPrimary} onClick={finishLot} disabled={draft.length < 3}>Cerrar lote ({draft.length})</button>
                <button className={btn} onClick={cancel}>Cancelar</button>
              </>
            )}
            <button className={btn} onClick={() => (void actions.setLot(exampleLot()), setSelectedEdge(null))}>Lote de ejemplo</button>
            {lot.length > 0 && <button className={btn} onClick={actions.clearLot}>Borrar</button>}
          </div>
          <LotDimensions />
          {lotInfo && (
            <p className="text-xs text-slate-600" data-testid="lot-info">
              {lotInfo.sides.length} lados · superficie {fmt(lotInfo.area)} m² · perímetro {fmt(lotInfo.perim)} m
            </p>
          )}
        </Section>

        <Section n={4} title="Norma" done={edges.length > 0}>
          <select className={input} value={profile.id} onChange={(e) => actions.setProfile(e.target.value as 'oguc' | 'personalizado')} aria-label="Perfil normativo">
            {PERFILES.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <p className="text-xs text-slate-500">{profile.descripcion}</p>
          {!perfilVerificado(profile) && (
            <Note tone="warn">
              Valores por defecto <b>por verificar</b> contra el texto vigente ({profile.anguloRasante.fuente}). Ajústalos según la norma del caso.
            </Note>
          )}
          <label className="block text-xs text-slate-600">
            Altura máxima sobre suelo natural (m) · 0 = sin límite
            <Num label="Altura máxima" value={maxHeight} onChange={(v) => actions.setSombras({ maxHeight: v })} step={0.5} min={0} />
          </label>
          {lotInfo && edges.length === lot.length && (
            <div className="space-y-1.5">
              {edges.map((e, k) => (
                <div
                  key={k}
                  className={`rounded-md border p-1.5 ${selectedEdge === k ? 'border-slate-800' : 'border-slate-200'}`}
                  onMouseEnter={() => setSelectedEdge(k)}
                  onMouseLeave={() => setSelectedEdge(null)}
                >
                  <div className="mb-1 flex items-center gap-1.5 text-xs">
                    <span className="h-3 w-3 rounded-sm" style={{ background: edgeColor(k) }} />
                    <b>Lado {k + 1}</b>
                    <span className="text-slate-500">· {fmt(lotInfo.sides[k].len)} m · mira al {lotInfo.sides[k].facing}</span>
                    <select className="ml-auto rounded border border-slate-300 px-1 text-xs" value={e.role} onChange={(ev) => actions.setRole(k, ev.target.value as EdgeRole)} aria-label={`Rol lado ${k + 1}`}>
                      {(Object.keys(ROLE_LABEL) as EdgeRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </div>
                  {e.rule.rasante && (
                    <div className="grid grid-cols-4 gap-1 text-[11px] text-slate-500">
                      <label>Ángulo°<Num label={`Ángulo lado ${k + 1}`} value={e.rule.angleDeg} step={1} min={1} onChange={(v) => actions.setRule(k, { angleDeg: Math.min(89.9, v) })} /></label>
                      <label>Arranque<Num label={`Arranque lado ${k + 1}`} value={e.rule.startHeight} onChange={(v) => actions.setRule(k, { startHeight: v })} /></label>
                      <label>Distanc.<Num label={`Distanciamiento lado ${k + 1}`} value={e.rule.setback} min={0} onChange={(v) => actions.setRule(k, { setback: Math.max(0, v) })} /></label>
                      <label title="Distancia de la línea oficial al eje de la calle">Eje calle<Num label={`Eje lado ${k + 1}`} value={e.rule.originOffset} min={0} onChange={(v) => actions.setRule(k, { originOffset: Math.max(0, v) })} /></label>
                    </div>
                  )}
                </div>
              ))}
              <button className="text-xs text-slate-500 underline" onClick={() => actions.applyToAll(0)}>Copiar ángulo y arranque del lado 1 a todos</button>
            </div>
          )}
        </Section>

        <Section n={5} title="Resultados" done={!!envelope}>
          {!envelope ? (
            <p className="text-xs text-slate-500">
              {lot.length < 3 ? 'Define el lote para calcular la envolvente.' : terrainMode === 'sitio' ? 'Esperando el terreno del sitio…' : 'Calculando…'}
            </p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs" data-testid="results">
                <dt className="text-slate-500">Terreno</dt><dd className="text-right font-medium" data-testid="terreno-estudio">{grid?.meta.source}</dd>
                <dt className="text-slate-500">Superficie lote</dt><dd className="text-right font-medium">{fmt(envelope.stats.lotArea)} m²</dd>
                <dt className="text-slate-500">Huella edificable</dt><dd className="text-right font-medium">{fmt(envelope.stats.footprintArea)} m²</dd>
                <dt className="text-slate-500">Volumen máx. envolvente</dt><dd className="text-right font-medium" data-testid="volume">{fmt(envelope.stats.volume, 0)} m³</dd>
                <dt className="text-slate-500">Altura máx. alcanzable</dt><dd className="text-right font-medium" data-testid="altura-max">{fmt(envelope.stats.maxRel)} m</dd>
              </dl>
              <div>
                <p className="mb-1 text-xs text-slate-500">¿Qué restricción manda en cada parte de la huella?</p>
                <div className="flex h-3 overflow-hidden rounded">
                  {govShare.map(({ g, pct }) => (
                    <div key={g} style={{ width: `${pct}%`, background: g === GOV_MAX_HEIGHT ? MAX_HEIGHT_COLOR : edgeColor(g) }} title={`${pct.toFixed(0)} %`} />
                  ))}
                </div>
                <ul className="mt-1 grid grid-cols-2 text-[11px] text-slate-600">
                  {govShare.map(({ g, pct }) => (
                    <li key={g} className="flex items-center gap-1">
                      <span className="h-2 w-2 rounded-sm" style={{ background: g === GOV_MAX_HEIGHT ? MAX_HEIGHT_COLOR : edgeColor(g) }} />
                      {g === GOV_MAX_HEIGHT ? 'Altura máxima' : `Rasante lado ${g + 1}`}: {pct.toFixed(0)} %
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
          {grid && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={didactic} onChange={(e) => actions.setSombras({ didactic: e.target.checked })} /> Mostrar planos de rasante
              </label>
              <label className="flex items-center gap-1">
                Exageración vertical
                <select className="rounded border border-slate-300 px-1" value={exaggeration} onChange={(e) => actions.setSombras({ exaggeration: +e.target.value })}>
                  {[1, 1.5, 2, 3].map((v) => <option key={v} value={v}>×{v}</option>)}
                </select>
              </label>
            </div>
          )}
          <div className="flex flex-wrap gap-1 pt-1">
            <button className={btn} onClick={exportDxf} disabled={!envelope}>Exportar DXF (UTM)</button>
            <button className={btn} onClick={exportPng} disabled={!envelope || view !== '3d'} title="Disponible en la vista 3D">Imagen PNG</button>
          </div>
        </Section>
      </ModulePanel>

      <main className="relative min-h-[420px] flex-1">
        <div className={`absolute inset-0 ${view === 'mapa' ? '' : 'invisible'}`}>
          <MapView
            frame={frame}
            site={site}
            area={terrainMode === 'sitio' ? terrain.area : null}
            areaCorner={null}
            loading={terrainMode === 'sitio' && terrain.status.state === 'loading'}
            contours={contours}
            indexInterval={indexInterval}
            dataGrid={null}
            lot={lot}
            draft={draft}
            mode={mode}
            onPick={onPick}
            onFinishLot={finishLot}
            visible={view === 'mapa'}
          />
        </div>
        {grid && lot.length > 2 && (
          <div className={`absolute inset-0 ${view === '3d' ? 'z-10' : 'invisible'}`}>
            <Scene3D
              dem={grid}
              contours={contours}
              indexInterval={indexInterval}
              lot={lot}
              envelope={envelope}
              envCtx={envCtx}
              didactic={didactic}
              selectedEdge={selectedEdge}
              exaggeration={exaggeration}
              visible={view === '3d'}
            />
          </div>
        )}
      </main>
    </div>
  )
}
