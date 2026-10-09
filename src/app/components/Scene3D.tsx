import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { XY } from '../../core/geo/local'
import type { HeightGrid } from '../../core/dem/grid'
import { gridStats, sampleBilinear } from '../../core/dem/grid'
import type { Isoline } from '../../core/contours/isolines'
import type { EnvelopeResult, EnvelopeContext } from '../../core/envelope/envelope'
import { GOV_MAX_HEIGHT } from '../../core/envelope/envelope'
import { outwardNormal, toCCW } from '../../core/envelope/polygon'
import { edgeColor, MAX_HEIGHT_COLOR } from '../model'

interface Props {
  dem: HeightGrid
  contours: Isoline[]
  indexInterval: number
  lot: XY[]
  envelope?: EnvelopeResult
  envCtx?: EnvelopeContext
  didactic: boolean
  selectedEdge: number | null
  exaggeration: number
  visible: boolean
}

/** Conversión local (x este, y norte, z cota) → three (X, Y arriba, Z sur). */
function useToThree(zRef: number, ex: number) {
  return useMemo(() => (x: number, y: number, z: number) => new THREE.Vector3(x, (z - zRef) * ex, -y), [zRef, ex])
}

function Terrain({ dem, zRef, ex }: { dem: HeightGrid; zRef: number; ex: number }) {
  const geom = useMemo(() => {
    const { nx, ny, cell, x0, y0, z } = dem
    const { min, max } = gridStats(dem)
    const pos = new Float32Array(nx * ny * 3)
    const col = new Float32Array(nx * ny * 3)
    const c = new THREE.Color()
    const low = new THREE.Color('#c9d8b6')
    const high = new THREE.Color('#b08f6a')
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i
        const v = Number.isNaN(z[k]) ? min : z[k]
        pos.set([x0 + i * cell, (v - zRef) * ex, -(y0 + j * cell)], k * 3)
        c.copy(low).lerp(high, max > min ? (v - min) / (max - min) : 0)
        col.set([c.r, c.g, c.b], k * 3)
      }
    const idx: number[] = []
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i
        const b = a + 1
        const d = a + nx
        const e = d + 1
        idx.push(a, d, b, b, d, e)
      }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    g.setIndex(idx)
    g.computeVertexNormals()
    return g
  }, [dem, zRef, ex])
  useEffect(() => () => geom.dispose(), [geom])
  return (
    <mesh geometry={geom} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  )
}

function Contours({ contours, indexInterval, zRef, ex }: { contours: Isoline[]; indexInterval: number; zRef: number; ex: number }) {
  const geom = useMemo(() => {
    const pos: number[] = []
    const col: number[] = []
    const minor = new THREE.Color('#7a4a24')
    const major = new THREE.Color('#3b200c')
    for (const c of contours) {
      const isIndex = Math.abs(c.level / indexInterval - Math.round(c.level / indexInterval)) < 1e-6
      const cc = isIndex ? major : minor
      const y = (c.level - zRef) * ex + 0.06
      const n = c.points.length
      const segs = c.closed ? n : n - 1
      for (let s = 0; s < segs; s++) {
        const a = c.points[s]
        const b = c.points[(s + 1) % n]
        pos.push(a.x, y, -a.y, b.x, y, -b.y)
        col.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    return g
  }, [contours, indexInterval, zRef, ex])
  useEffect(() => () => geom.dispose(), [geom])
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial vertexColors transparent opacity={0.8} />
    </lineSegments>
  )
}

function LotOutline({ lot, dem, zRef, ex }: { lot: XY[]; dem: HeightGrid; zRef: number; ex: number }) {
  const to = useToThree(zRef, ex)
  const edges = useMemo(
    () =>
      lot.map((a, k) => {
        const b = lot[(k + 1) % lot.length]
        const L = Math.hypot(b.x - a.x, b.y - a.y)
        const m = Math.max(2, Math.ceil(L / 0.5))
        const pts: THREE.Vector3[] = []
        for (let s = 0; s <= m; s++) {
          const x = a.x + ((b.x - a.x) * s) / m
          const y = a.y + ((b.y - a.y) * s) / m
          const v = to(x, y, sampleBilinear(dem, x, y))
          v.y += 0.15
          pts.push(v)
        }
        return pts
      }),
    [lot, dem, to],
  )
  return (
    <>
      {edges.map((pts, k) => (
        <Line key={k} points={pts} color={edgeColor(k)} lineWidth={4} />
      ))}
    </>
  )
}

function EnvelopeBlocks({ env, zRef, ex, selectedEdge }: { env: EnvelopeResult; zRef: number; ex: number; selectedEdge: number | null }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const cells = useMemo(() => {
    const out: number[] = []
    for (let k = 0; k < env.rel.length; k++) if (env.rel[k] > 0.01) out.push(k)
    return out
  }, [env])
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const c = new THREE.Color()
    cells.forEach((k, n) => {
      const i = k % env.nx
      const j = Math.floor(k / env.nx)
      const cx = env.x0 + i * env.cell
      const cy = env.y0 + j * env.cell
      const h = env.rel[k] * ex
      m.makeScale(env.cell, h, env.cell)
      m.setPosition(cx, (env.ground[k] - zRef) * ex + h / 2, -cy)
      mesh.setMatrixAt(n, m)
      const g = env.governing[k]
      c.set(g === GOV_MAX_HEIGHT ? MAX_HEIGHT_COLOR : edgeColor(g))
      if (selectedEdge !== null && g !== selectedEdge) c.lerp(new THREE.Color('#e5e7eb'), 0.75)
      mesh.setColorAt(n, c)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [cells, env, zRef, ex, selectedEdge])
  return (
    <instancedMesh key={cells.length} ref={ref} args={[undefined, undefined, cells.length]} castShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.7} />
    </instancedMesh>
  )
}

/** Planos de rasante: uno por lado con rasante, desde su origen (cota natural + arranque) hacia el interior. */
function RasantePlanes({ ctx, env, zRef, ex, selectedEdge }: { ctx: EnvelopeContext; env: EnvelopeResult; zRef: number; ex: number; selectedEdge: number | null }) {
  const to = useToThree(zRef, ex)
  const planes = useMemo(() => {
    const ccw = toCCW(ctx.lot)
    const reversed = ccw !== ctx.lot
    const reach = Math.max(env.stats.maxRel + 6, 12)
    return ctx.edges
      .filter((e) => e.rule.rasante)
      .map((e) => {
        const n0 = outwardNormal(e.a, e.b)
        const nIn = reversed ? n0 : { x: -n0.x, y: -n0.y } // normal hacia el interior
        const L = reach / Math.max(e.tan, 0.05)
        const pos: number[] = []
        const S = e.samples
        for (let s = 0; s < S.length - 1; s++) {
          const q0 = S[s]
          const q1 = S[s + 1]
          const z0 = q0.z + e.rule.startHeight
          const z1 = q1.z + e.rule.startHeight
          const a0 = to(q0.x, q0.y, z0)
          const a1 = to(q1.x, q1.y, z1)
          const b0 = to(q0.x + nIn.x * L, q0.y + nIn.y * L, z0 + L * e.tan)
          const b1 = to(q1.x + nIn.x * L, q1.y + nIn.y * L, z1 + L * e.tan)
          pos.push(...a0.toArray(), ...a1.toArray(), ...b1.toArray(), ...a0.toArray(), ...b1.toArray(), ...b0.toArray())
        }
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        g.computeVertexNormals()
        return { index: e.index, geom: g }
      })
  }, [ctx, env, to])
  return (
    <>
      {planes.map(({ index, geom }) => {
        const active = selectedEdge === null || selectedEdge === index
        return (
          <mesh key={index} geometry={geom} renderOrder={2}>
            <meshBasicMaterial color={edgeColor(index)} transparent opacity={active ? 0.28 : 0.05} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        )
      })}
    </>
  )
}

function CameraFit({ target, radius }: { target: THREE.Vector3; radius: number }) {
  const { camera, invalidate } = useThree()
  useEffect(() => {
    camera.position.set(target.x + radius * 1.1, target.y + radius * 0.9, target.z + radius * 1.3)
    camera.lookAt(target)
    camera.updateProjectionMatrix()
    // frameloop 'demand': un cambio imperativo de cámara debe pedir su cuadro.
    invalidate()
  }, [camera, invalidate, target, radius])
  return null
}

export function Scene3D(p: Props) {
  const { min } = useMemo(() => gridStats(p.dem), [p.dem])
  const zRef = min
  const ex = p.exaggeration
  const target = useMemo(() => {
    const c = p.lot.length
      ? { x: p.lot.reduce((s, q) => s + q.x, 0) / p.lot.length, y: p.lot.reduce((s, q) => s + q.y, 0) / p.lot.length }
      : { x: 0, y: 0 }
    const z = sampleBilinear(p.dem, c.x, c.y)
    return new THREE.Vector3(c.x, ((Number.isNaN(z) ? zRef : z) - zRef) * ex, -c.y)
  }, [p.lot, p.dem, zRef, ex])
  const radius = useMemo(() => {
    if (!p.lot.length) return (p.dem.nx * p.dem.cell) / 1.6
    const xs = p.lot.map((q) => q.x)
    const ys = p.lot.map((q) => q.y)
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
    return Math.max(25, span * 1.4)
  }, [p.lot, p.dem])

  return (
    <div className="absolute inset-0 bg-gradient-to-b from-slate-200 to-slate-50" data-testid="scene3d">
      <Canvas
        shadows
        camera={{ fov: 40, near: 0.5, far: 20000 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        // La escena es estática: se dibuja solo cuando algo cambia. Con 'always' se redibujaba sin pausa
        // (~0,6 s por cuadro con WebGL por software), saturando CPU en CI y en equipos sin GPU.
        frameloop={p.visible ? 'demand' : 'never'}
        id="geoarc-3d"
      >
        <ambientLight intensity={0.55} />
        <hemisphereLight args={['#ffffff', '#b9a98f', 0.5]} />
        <directionalLight position={[-120, 200, 80]} intensity={1.4} castShadow />
        <Terrain dem={p.dem} zRef={zRef} ex={ex} />
        <Contours contours={p.contours} indexInterval={p.indexInterval} zRef={zRef} ex={ex} />
        {p.lot.length > 2 && <LotOutline lot={p.lot} dem={p.dem} zRef={zRef} ex={ex} />}
        {p.envelope && <EnvelopeBlocks env={p.envelope} zRef={zRef} ex={ex} selectedEdge={p.selectedEdge} />}
        {p.didactic && p.envelope && p.envCtx && (
          <RasantePlanes ctx={p.envCtx} env={p.envelope} zRef={zRef} ex={ex} selectedEdge={p.selectedEdge} />
        )}
        <OrbitControls target={target} makeDefault maxPolarAngle={Math.PI / 2.05} />
        <CameraFit target={target} radius={radius} />
      </Canvas>
    </div>
  )
}
