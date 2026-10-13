import type { LocalFrame } from '../core/geo/local'
import type { Rect } from '../core/dem/area'
import { localRectBBox } from '../core/dem/resample'
import { consultaOverpass, contextoDesdeOverpass, MARGEN_CONTEXTO, type Contexto, type OverpassRespuesta } from '../core/contexto/contexto'
import { contextoDesdeTeselas, teselasDeBBox, ZOOM_TESELAS } from '../core/contexto/teselas'
import { OFM_STYLE_URL } from './model'

/** Instancia principal de Overpass (CORS `*`, medido el 2026-10-13). Los espejos probados fallaron (504, sin respuesta). */
export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

export interface ContextoCargado {
  contexto: Contexto
  /** Si se usó el respaldo: por qué. */
  aviso?: string
}

export type ContextoLoader = (frame: LocalFrame, area: Rect) => Promise<ContextoCargado>

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e))

async function desdeOverpass(frame: LocalFrame, area: Rect, f: typeof fetch): Promise<Contexto> {
  const b = localRectBBox(frame, area, MARGEN_CONTEXTO)
  const res = await f(OVERPASS_URL, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(consultaOverpass(b)),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Overpass respondió ${res.status}`)
  const j = (await res.json()) as OverpassRespuesta
  // Overpass puede responder 200 con datos parciales y el error en «remark» (p. ej. tiempo agotado)
  if (j.remark && /error|timed out/i.test(j.remark)) throw new Error(`Overpass: ${j.remark}`)
  return contextoDesdeOverpass(j, frame)
}

async function desdeTeselas(frame: LocalFrame, area: Rect, f: typeof fetch): Promise<Contexto> {
  const get = async (url: string) => {
    const r = await f(url, { signal: AbortSignal.timeout(15_000) })
    if (!r.ok) throw new Error(`OpenFreeMap respondió ${r.status} (${url})`)
    return r
  }
  const style = (await (await get(OFM_STYLE_URL)).json()) as { sources: Record<string, { url?: string }> }
  const tjUrl = style.sources.openmaptiles?.url
  if (!tjUrl) throw new Error('El estilo de OpenFreeMap no trae la fuente openmaptiles')
  const tj = (await (await get(tjUrl)).json()) as { tiles: string[] }
  const b = localRectBBox(frame, area, MARGEN_CONTEXTO)
  const teselas = await Promise.all(
    teselasDeBBox(b, ZOOM_TESELAS).map(async (t) => {
      const url = tj.tiles[0].replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y))
      return { ...t, data: new Uint8Array(await (await get(url)).arrayBuffer()) }
    }),
  )
  return contextoDesdeTeselas(teselas, frame)
}

/**
 * Edificaciones y vías del área + 50 m. Overpass es la fuente principal (un edificio por entidad, con height y
 * building:levels); si falla (límite de uso de la red de la sala, caída), se usan las teselas de OpenFreeMap.
 */
export async function cargarContexto(frame: LocalFrame, area: Rect, f: typeof fetch = fetch): Promise<ContextoCargado> {
  try {
    return { contexto: await desdeOverpass(frame, area, f) }
  } catch (e) {
    try {
      const contexto = await desdeTeselas(frame, area, f)
      return {
        contexto,
        aviso: `${msg(e)}: se usaron las teselas de OpenFreeMap. Los edificios vienen agrupados por altura y se cortan en el borde de cada tesela.`,
      }
    } catch (e2) {
      throw new Error(`No se pudo descargar el contexto. Overpass: ${msg(e)}. Teselas: ${msg(e2)}.`)
    }
  }
}
