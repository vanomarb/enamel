import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  NeutralToneMapping,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import type { Arch } from './arch.ts'
import { archLayout, gumMesh, shapeKey, toothLandmarks, toothLayers, toothShell, toothSizes, type MeshData, type PlacedTooth, type Vec3 } from './anatomy-model.ts'
import { FOV, archShown, cameraPosition, clampDistance, clampPitch, decay, easeInOut, easeOut, fitPoints, focusAngles, lerpView, restAngles, wrapYaw, type View } from './tooth-camera.ts'
import { bodyMaterial, layerMaterial, readPalette, sharedUniforms, toothMaterial, type GridMaterial } from './tooth-materials.ts'
import { mountOverlay, type InsideMode, type LandmarkSpot, type ScreenSpot } from './tooth-overlay.ts'
import type { ExplorerHost, ModelView } from './tooth-explorer.ts'

/* The 3D chart, loaded only when the explorer nears the viewport. It draws the explorer's state (arch, chosen tooth,
   keyboard focus) and hands picks back through host.select(), so the panel, the list and the announcements stay the
   explorer's. The flat SVG chart stays in the page, out of sight, as the keyboard and screen reader layer. Frames are
   drawn only while something moves. */

const DEG = Math.PI / 180
const FLY_MS = 700
const HOVER_MS = 150
const DRAG_SPEED = 0.006
/** A tap this close to a tooth (CSS px) picks it, so small front teeth are easy to hit with a finger. */
const NEAR_PX = 22
/** The open tooth turns this far about its long axis once it is out of its socket. */
const SPIN = 22 * DEG
/** The opening wave plays once per page load. */
let introPlayed = false

/** A number easing toward a target over a duration (0 for at once), optionally after a delay. */
class Anim {
  value: number
  private from: number
  private to: number
  private start = 0
  private ms = 0
  private ease: (t: number) => number
  constructor(value = 0, ease = easeInOut) {
    this.value = this.from = this.to = value
    this.ease = ease
  }
  set(to: number, ms: number, now: number, delay = 0): void {
    if (to === this.to && ms > 0) return
    this.from = this.value
    this.to = to
    this.start = now + delay
    this.ms = ms
    if (ms <= 0 && delay <= 0) this.value = to
  }
  /** Moves on to now; true while still moving. */
  step(now: number): boolean {
    if (this.value === this.to) return false
    const t = this.ms <= 0 ? (now >= this.start ? 1 : 0) : Math.min(Math.max((now - this.start) / this.ms, 0), 1)
    this.value = t >= 1 ? this.to : this.from + (this.to - this.from) * this.ease(t)
    return this.value !== this.to
  }
}

interface Tooth {
  placed: PlacedTooth
  seat: Group
  motion: Group
  shell: Mesh<BufferGeometry, GridMaterial>
  material: GridMaterial
  /** How far up its long axis it rises out of the socket when opened. */
  reach: number
  extract: Anim
  hover: Anim
  spin: Anim
  sink: Anim
  inside?: { enamel: Mesh<BufferGeometry, GridMaterial>; dentin: Mesh<BufferGeometry, GridMaterial>; pulp: Mesh<BufferGeometry, GridMaterial> }
}

function geometryOf({ positions, normals, grid, indices }: MeshData): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setAttribute('grid', new BufferAttribute(grid, 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeBoundingSphere()
  return geometry
}

/** Gives the browser a turn between chunks of work, so building the model never blocks a frame for long. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const still = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

export async function mountToothView(host: ExplorerHost, lost: () => void): Promise<ModelView | null> {
  const { root, chart } = host
  const stage = document.createElement('div')
  stage.className = 'relative aspect-[5/4] w-full select-none'
  stage.dataset.model = ''
  stage.innerHTML = '<canvas class="block size-full cursor-grab touch-pan-y" aria-hidden="true"></canvas>'
  const canvas = stage.querySelector('canvas')!
  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  } catch {
    return null
  }
  renderer.toneMapping = NeutralToneMapping
  renderer.outputColorSpace = SRGBColorSpace
  renderer.setClearColor(0x000000, 0)

  const palette = readPalette(root)
  const shared = sharedUniforms(palette)
  const layout = archLayout()

  // Geometry, a few teeth at a time; mirror partners share one mesh.
  const shapes = new Map<string, BufferGeometry>()
  for (const placed of layout) {
    const key = shapeKey(placed.fdi)
    if (shapes.has(key)) continue
    shapes.set(key, geometryOf(toothShell(placed.fdi)))
    if (shapes.size % 3 === 0) await breathe()
  }
  const gumGeometry: Record<Arch, BufferGeometry> = { upper: geometryOf(gumMesh('upper')), lower: geometryOf(gumMesh('lower')) }
  if (!root.isConnected) {
    for (const g of [...shapes.values(), gumGeometry.upper, gumGeometry.lower]) g.dispose()
    renderer.dispose()
    return null
  }

  const scene = new Scene()
  const camera = new PerspectiveCamera(FOV, 1, 1, 2000)
  scene.add(camera)
  // Soft studio light: a white sky over a warm floor, a key from the upper left and a fill from the right, riding with the camera.
  scene.add(new HemisphereLight(new Color(1, 1, 1), palette.gum.clone(), 1.6))
  const aim = new Object3D()
  aim.position.set(0, 0, -1)
  const key = new DirectionalLight(new Color(1, 1, 1), 1.9)
  key.position.set(-0.6, 0.8, 0.5)
  key.target = aim
  const fill = new DirectionalLight(new Color(1, 1, 1), 0.7)
  fill.position.set(0.8, -0.2, 0.6)
  fill.target = aim
  camera.add(aim, key, fill)

  const teeth = new Map<number, Tooth>()
  const toothMatrix = new Matrix4()
  for (const placed of layout) {
    const seat = new Group()
    seat.matrixAutoUpdate = false
    seat.matrix.fromArray(placed.matrix)
    const motion = new Group()
    const material = toothMaterial(palette, shared)
    const shell = new Mesh(shapes.get(shapeKey(placed.fdi))!, material)
    shell.userData.fdi = placed.fdi
    motion.add(shell)
    seat.add(motion)
    scene.add(seat)
    const sizes = toothSizes(placed.fdi)
    teeth.set(placed.fdi, { placed, seat, motion, shell, material, reach: sizes.rootLength + 6.5, extract: new Anim(), hover: new Anim(), spin: new Anim(0, easeOut), sink: new Anim(0, easeOut) })
  }
  const gums: Record<Arch, Mesh<BufferGeometry, GridMaterial>> = {
    upper: new Mesh(gumGeometry.upper, bodyMaterial(palette, shared)),
    lower: new Mesh(gumGeometry.lower, bodyMaterial(palette, shared)),
  }
  for (const gum of [gums.upper, gums.lower]) {
    gum.renderOrder = 2
    scene.add(gum)
  }

  /* Points the camera fits: each whole jaw (the crowns, their chips, and the gum and bone around every root, so nothing
     runs off the canvas), or the open tooth out of its socket. */
  const world = (placed: PlacedTooth, p: Vec3, lift = 0) => new Vector3(p[0], p[1] + lift, p[2]).applyMatrix4(toothMatrix.fromArray(placed.matrix))
  const archPoints: Record<Arch, Vec3[]> = { upper: [], lower: [] }
  for (const placed of layout) {
    const { crownHeight: h, rootLength: r, md, bl } = toothSizes(placed.fdi)
    // The chip past the biting edge counts too, so no number is cut off at the edge.
    for (const p of [[md / 2, h, 0], [-md / 2, h, 0], [0, h, bl / 2 + 1], [0, h, -bl / 2], [0, -r, 0], placed.chip] as Vec3[]) archPoints[placed.arch].push(world(placed, p).toArray() as Vec3)
  }
  for (const arch of ['upper', 'lower'] as const) {
    const positions = gumGeometry[arch].getAttribute('position').array
    for (let i = 0; i < positions.length; i += 3 * 17) archPoints[arch].push([positions[i], positions[i + 1], positions[i + 2]])
  }
  const toothPoints = (tooth: Tooth): Vec3[] => {
    const { crownHeight: h, rootLength: r, md, bl } = toothSizes(tooth.placed.fdi)
    const radius = Math.max(md, bl) / 2
    const out: Vec3[] = []
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      for (const y of [h, -r * 0.2, -r]) out.push(world(tooth.placed, [radius * Math.cos(a), y, radius * Math.sin(a)], tooth.reach).toArray() as Vec3)
    }
    return out
  }

  /* Camera state: angles and zoom the visitor controls, aimed at what the camera fits (an arch, or the open tooth). */
  let shownArch: Arch = host.arch()
  let open: Tooth | null = null
  let saved: { yaw: number; pitch: number; zoom: number } | null = null
  let { yaw, pitch } = restAngles(shownArch)
  let zoom = 1
  let zoomGoal = 1
  const pan = new Vector3()
  const panGoal = new Vector3()
  let spinYaw = 0
  let spinPitch = 0
  let aspect = 1
  let fly: { from: View; start: number } | null = null
  let currentView: View = { target: [0, 0, 0], distance: 200, yaw, pitch }
  let fitDistance = 200
  const dim = new Anim()

  const subject = () => (open ? toothPoints(open) : archPoints[shownArch])
  const liveView = (): View => {
    // The controls sit outside the canvas, so a small margin is enough.
    const fit = fitPoints(subject(), yaw, pitch, aspect, open ? 0.1 : 0.04)
    fitDistance = fit.distance
    return { target: [fit.target[0] + pan.x, fit.target[1] + pan.y, fit.target[2] + pan.z], distance: fit.distance * zoom, yaw, pitch }
  }
  const startFly = (now: number) => {
    fly = still() ? null : { from: currentView, start: now }
  }
  const archOfPitch = () => currentView.pitch

  /* Overlay and the moves its controls ask for. */
  const project = (p: Vector3): ScreenSpot | null => {
    const depth = p.distanceTo(camera.position)
    const v = p.clone().project(camera)
    if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null
    return { x: ((v.x + 1) / 2) * stage.clientWidth, y: ((1 - v.y) / 2) * stage.clientHeight, depth }
  }
  const facingCamera = (object: Object3D, point: Vector3, normal: Vec3, slack = 0.15) => {
    const n = new Vector3(...normal).transformDirection(object.matrixWorld)
    return n.dot(camera.position.clone().sub(point).normalize()) > -slack
  }
  let inside: InsideMode = 'surface'
  let lines: LineSegments | null = null
  const lineMaterial = new LineBasicMaterial({ color: palette.grid.clone().multiplyScalar(0.55), transparent: true, opacity: 0.95 })

  const showInside = (tooth: Tooth, mode: InsideMode) => {
    if (mode !== 'surface' && !tooth.inside) {
      const built = toothLayers(tooth.placed.fdi)
      const make = (data: MeshData, kind: 'enamel' | 'dentin' | 'pulp') => {
        const mesh = new Mesh(geometryOf(data), layerMaterial(kind, palette, shared))
        mesh.visible = false
        tooth.motion.add(mesh)
        return mesh
      }
      tooth.inside = { enamel: make(built.enamel, 'enamel'), dentin: make(built.dentin, 'dentin'), pulp: make(built.pulp, 'pulp') }
      tooth.inside.enamel.renderOrder = 4
    }
    tooth.shell.visible = mode === 'surface'
    const layers = tooth.inside
    if (!layers) return
    layers.enamel.visible = mode !== 'surface'
    layers.enamel.material.opacity = mode === 'pulp' ? 0.12 : 0.22
    layers.dentin.visible = mode !== 'surface'
    const ghost = mode === 'pulp'
    const dentin = layers.dentin.material
    if (dentin.transparent !== ghost) {
      dentin.transparent = ghost
      dentin.depthWrite = !ghost
      dentin.needsUpdate = true
    }
    dentin.opacity = ghost ? 0.26 : 1
    layers.dentin.renderOrder = ghost ? 3 : 0
    layers.pulp.visible = mode === 'pulp'
  }

  const showLines = (on: boolean) => {
    if (lines) {
      lines.removeFromParent()
      lines.geometry.dispose()
      lines = null
    }
    if (!on || !open) return
    const pts: number[] = []
    for (const mark of toothLandmarks(open.placed.fdi)) {
      if (!mark.line) continue
      for (let i = 0; i < mark.line.length - 1; i++) pts.push(...mark.line[i], ...mark.line[i + 1])
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3))
    lines = new LineSegments(geometry, lineMaterial)
    lines.renderOrder = 5
    open.motion.add(lines)
  }

  let highlighted: number | null = null
  const overlay = mountOverlay(host, chart, {
    chip(fdi) {
      const tooth = teeth.get(fdi)
      if (!tooth || !archShown(tooth.placed.arch, archOfPitch()) || !tooth.seat.visible) return null
      // In the close-up the chip sits beside the crown, clear of the tools above it.
      const sizes = toothSizes(fdi)
      const anchor: Vec3 = tooth === open ? [sizes.md / 2 + 2.6, sizes.crownHeight * 0.55, 0] : tooth.placed.chip
      const p = new Vector3(...anchor).applyMatrix4(tooth.motion.matrixWorld)
      if (tooth !== open && !facingCamera(tooth.motion, p, [0, 1, 0.7], 0.2)) return null
      return project(p)
    },
    landmarks() {
      if (!open) return []
      const tooth = open
      const spots: LandmarkSpot[] = []
      for (const mark of toothLandmarks(tooth.placed.fdi)) {
        const p = new Vector3(...mark.anchor).applyMatrix4(tooth.motion.matrixWorld)
        const spot = project(p)
        const seeThrough = inside !== 'surface'
        // Tips and edges on the outline still count as seen; only marks well round the far side hide. A root tip is
        // hidden only when looking down the root from the crown end.
        const slack = /apex$/i.test(mark.name) ? 0.8 : 0.45
        spots.push({ name: mark.name, x: spot?.x ?? -100, y: spot?.y ?? -100, depth: spot?.depth ?? 1e6, visible: !!spot && (seeThrough || facingCamera(tooth.motion, p, mark.normal, slack)) })
      }
      return spots
    },
    focus(fdi, back) {
      const now = performance.now()
      const quick = still()
      if (open) {
        open.extract.set(0, quick ? 0 : FLY_MS, now)
        open.spin.set(0, quick ? 0 : FLY_MS, now)
        showInside(open, 'surface')
        showLines(false)
      }
      inside = 'surface'
      const next = fdi === null ? null : (teeth.get(fdi) ?? null)
      if (next && !open) saved = { yaw, pitch, zoom: zoomGoal }
      open = next
      if (next) {
        shownArch = next.placed.arch
        next.extract.set(1, quick ? 0 : FLY_MS, now)
        if (!quick) next.spin.set(SPIN, 1500, now, FLY_MS * 0.6)
        const facial = new Vector3(0, 0, 1).transformDirection(next.seat.matrix)
        ;({ yaw, pitch } = focusAngles([facial.x, facial.y, facial.z], next.placed.arch))
        dim.set(1, quick ? 0 : 400, now)
      } else {
        shownArch = host.arch()
        const rest = restAngles(shownArch)
        const back2 = back === 'previous' && saved ? saved : { ...rest, zoom: 1 }
        yaw = back2.yaw
        pitch = clampPitch(back2.pitch, shownArch)
        zoomGoal = back2.zoom
        saved = null
        dim.set(0, quick ? 0 : 400, now)
      }
      zoom = zoomGoal = next ? 1 : zoomGoal
      pan.set(0, 0, 0)
      panGoal.set(0, 0, 0)
      spinYaw = spinPitch = 0
      startFly(now)
      invalidate()
    },
    inside(mode) {
      inside = mode
      if (open) showInside(open, mode)
      invalidate()
    },
    showLandmarks(on) {
      showLines(on)
      invalidate()
    },
    zoom(factor) {
      zoomGoal = clampDistance(fitDistance * zoomGoal * factor, fitDistance) / fitDistance
      if (zoomGoal >= 0.999) panGoal.set(0, 0, 0)
      if (still()) zoom = zoomGoal
      invalidate()
    },
    highlight(fdi) {
      highlighted = fdi
      invalidate()
    },
  })

  const captions = root.querySelector<HTMLElement>('[data-model-captions]')
  let frame = 0
  let disposed = false
  let last = performance.now()
  function invalidate() {
    if (!frame && !disposed) frame = requestAnimationFrame(draw)
  }

  function draw(now: number) {
    frame = 0
    const dt = Math.min(now - last, 50)
    last = now
    let moving = false
    // Inertia after a drag, then the eased zoom and the aim sliding toward the pointer.
    if (spinYaw || spinPitch) {
      yaw = wrapYaw(yaw + spinYaw * dt)
      pitch = clampPitch(pitch + spinPitch * dt, shownArch)
      spinYaw = decay(spinYaw, dt)
      spinPitch = decay(spinPitch, dt)
      moving = true
    }
    const k = 1 - Math.exp(-dt / 90)
    if (Math.abs(zoomGoal - zoom) > 1e-4 || pan.distanceToSquared(panGoal) > 1e-4) {
      zoom += (zoomGoal - zoom) * k
      pan.lerp(panGoal, k)
      moving = true
    } else {
      zoom = zoomGoal
      pan.copy(panGoal)
    }
    for (const tooth of teeth.values()) {
      const lit = tooth.placed.fdi === highlighted && !open
      tooth.hover.set(lit ? 1 : 0, still() ? 0 : HOVER_MS, now)
      moving = tooth.extract.step(now) || moving
      moving = tooth.hover.step(now) || moving
      moving = tooth.spin.step(now) || moving
      moving = tooth.sink.step(now) || moving
    }
    moving = dim.step(now) || moving
    moving = grid.step(now) || moving
    shared.uGrid.value = grid.value
    // Where the camera is: the live view, or on the way to it.
    const live = liveView()
    if (fly) {
      const t = Math.min((now - fly.start) / FLY_MS, 1)
      currentView = lerpView(fly.from, live, easeInOut(t))
      if (t >= 1) fly = null
      else moving = true
    } else currentView = live
    camera.position.set(...cameraPosition(currentView))
    camera.lookAt(...currentView.target)
    camera.updateMatrixWorld()
    const chosen = host.selected()
    for (const tooth of teeth.values()) {
      const shown = archShown(tooth.placed.arch, currentView.pitch) || tooth === open
      tooth.seat.visible = shown
      tooth.motion.position.y = tooth.extract.value * tooth.reach + tooth.hover.value - tooth.sink.value
      tooth.motion.rotation.y = tooth.spin.value
      const grid = tooth.material.userData.grid
      grid.uHighlight.value = tooth.hover.value
      grid.uTintMix.value = tooth.placed.fdi === chosen && tooth !== open ? 0.4 : 0
      grid.uDim.value = tooth === open ? 0 : 0.7 * dim.value
    }
    for (const arch of ['upper', 'lower'] as const) {
      gums[arch].visible = archShown(arch, currentView.pitch)
      gums[arch].material.opacity = 0.4 - 0.3 * dim.value
    }
    renderer.render(scene, camera)
    overlay.place()
    captions?.toggleAttribute('data-turned', Math.abs(wrapYaw(currentView.yaw)) > 60 * DEG)
    if (moving) invalidate()
  }

  /* The opening: teeth rise into their sockets front to back as the grid fades in, once, when the model is first seen. */
  const grid = new Anim(1, easeOut)
  const playIntro = !introPlayed && !still()
  if (playIntro) {
    grid.set(0, 0, 0)
    shared.uGrid.value = 0
    for (const tooth of teeth.values()) tooth.sink.set(3.5, 0, 0)
  }
  const seen = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting) || introPlayed) return
      introPlayed = true
      seen.disconnect()
      const now = performance.now()
      const furthest = Math.max(...layout.map((p) => p.along))
      for (const tooth of teeth.values()) tooth.sink.set(0, 600, now, (tooth.placed.along / furthest) * 450)
      grid.set(1, 1000, now)
      invalidate()
    },
    { threshold: 0.35 },
  )
  if (playIntro) seen.observe(stage)

  const stopListening = host.onChange((change) => {
    if (change === 'arch' && host.arch() !== shownArch && !open) {
      shownArch = host.arch()
      ;({ yaw, pitch } = restAngles(shownArch))
      zoom = zoomGoal = 1
      pan.set(0, 0, 0)
      panGoal.set(0, 0, 0)
      spinYaw = spinPitch = 0
      startFly(performance.now())
    }
    invalidate()
  })

  /* Picking: the tooth under the pointer, or failing that the nearest one within a finger's width. */
  const raycaster = new Raycaster()
  const pointer = new Vector2()
  const castFrom = (event: { clientX: number; clientY: number }) => {
    const box = canvas.getBoundingClientRect()
    if (!box.width || !box.height) return null
    pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    return { x: event.clientX - box.left, y: event.clientY - box.top }
  }
  const pickable = () => [...teeth.values()].filter((t) => t.seat.visible && (!open || t === open)).map((t) => (t.shell.visible ? t.shell : t.inside!.enamel))
  const pick = (event: { clientX: number; clientY: number }): number | null => {
    const at = castFrom(event)
    if (!at) return null
    const hit = raycaster.intersectObjects(pickable(), false)[0]
    if (hit) return findFdi(hit.object)
    if (open) return null
    let best: number | null = null
    let bestGap = NEAR_PX
    for (const tooth of teeth.values()) {
      if (!tooth.seat.visible) continue
      const spot = project(new Vector3(0, toothSizes(tooth.placed.fdi).crownHeight / 2, 0).applyMatrix4(tooth.motion.matrixWorld))
      if (!spot) continue
      const gap = Math.hypot(spot.x - at.x, spot.y - at.y)
      if (gap < bestGap) {
        bestGap = gap
        best = tooth.placed.fdi
      }
    }
    return best
  }
  const findFdi = (object: Object3D) => [...teeth.values()].find((t) => t.motion === object.parent)?.placed.fdi ?? null

  /** The point under the pointer to zoom about: on the model if it is there, else on the plane through the aim. */
  const zoomPoint = (event: { clientX: number; clientY: number }): Vector3 | null => {
    if (!castFrom(event)) return null
    const hit = raycaster.intersectObjects([...pickable(), gums[shownArch]], false)[0]
    if (hit) return hit.point
    const target = new Vector3(...currentView.target)
    const normal = camera.getWorldDirection(new Vector3())
    const t = target.clone().sub(raycaster.ray.origin).dot(normal) / raycaster.ray.direction.dot(normal)
    return t > 0 ? raycaster.ray.at(t, new Vector3()) : null
  }
  const zoomBy = (factor: number, event?: { clientX: number; clientY: number }) => {
    const before = currentView.distance
    const goal = clampDistance(fitDistance * zoomGoal * factor, fitDistance)
    const point = event ? zoomPoint(event) : null
    if (point) {
      const shift = 1 - goal / before
      panGoal.add(point.sub(new Vector3(...currentView.target)).multiplyScalar(shift))
      panGoal.clampLength(0, open ? 18 : 32)
    }
    zoomGoal = goal / fitDistance
    if (zoomGoal >= 0.999) panGoal.set(0, 0, 0)
    if (still()) {
      zoom = zoomGoal
      pan.copy(panGoal)
    }
    invalidate()
  }

  /* Dragging turns the model; touch turns it sideways only and leaves vertical swipes to the page. Two fingers pinch. */
  const pointers = new Map<number, { x: number; y: number }>()
  let drag: { id: number; x: number; y: number; moved: boolean; touch: boolean; t: number } | null = null
  let pinch: { distance: number; zoom: number } | null = null
  let skipClick = false

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: zoomGoal }
      drag = null
      return
    }
    skipClick = false
    spinYaw = spinPitch = 0
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, touch: event.pointerType !== 'mouse', t: performance.now() }
    if (!drag.touch) canvas.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent) => {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const factor = pinch.distance / Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1)
      zoomBy((pinch.zoom * factor) / zoomGoal, { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 })
      skipClick = true
      return
    }
    if (drag && event.pointerId === drag.id) {
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      if (!drag.moved) {
        // A touch that sets off mostly vertical is the page scrolling, not a turn.
        if (drag.touch && Math.abs(dy) > Math.abs(dx)) return
        if (Math.hypot(dx, dy) < 6) return
        drag.moved = true
        fly = null
        canvas.style.cursor = 'grabbing'
      }
      const now = performance.now()
      const elapsed = Math.max(now - drag.t, 1)
      const turn = -dx * DRAG_SPEED
      const tilt = drag.touch ? 0 : dy * DRAG_SPEED
      yaw = wrapYaw(yaw + turn)
      pitch = clampPitch(pitch + tilt, shownArch)
      // Speed for inertia, smoothed over the last few moves.
      spinYaw = 0.6 * (turn / elapsed) + 0.4 * spinYaw
      spinPitch = 0.6 * (tilt / elapsed) + 0.4 * spinPitch
      Object.assign(drag, { x: event.clientX, y: event.clientY, t: now })
      invalidate()
      return
    }
    if (event.pointerType !== 'mouse' || event.buttons) return
    const fdi = pick(event)
    canvas.style.cursor = fdi === null ? '' : 'pointer'
    overlay.pointerHover(open ? null : fdi)
  }
  const onPointerUp = (event: PointerEvent) => {
    pointers.delete(event.pointerId)
    if (pointers.size < 2) pinch = null
    if (!drag || event.pointerId !== drag.id) return
    skipClick = skipClick || drag.moved
    const idle = performance.now() - drag.t > 80
    if (!drag.moved || idle || still()) spinYaw = spinPitch = 0
    drag = null
    canvas.style.cursor = ''
    invalidate()
  }
  const onPointerLeave = () => overlay.pointerHover(null)
  const onClick = (event: MouseEvent) => {
    if (skipClick) {
      skipClick = false
      return
    }
    const fdi = pick(event)
    if (fdi !== null) host.select(fdi)
    else if (overlay.focused() !== null) overlay.leaveFocus()
  }
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey && !event.metaKey) return overlay.wheelHint()
    event.preventDefault()
    zoomBy(Math.exp(event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0025)), event)
  }
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('click', onClick)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  const resize = new ResizeObserver(() => {
    const width = stage.clientWidth
    const height = stage.clientHeight
    if (!width || !height) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    renderer.setPixelRatio(ratio)
    renderer.setSize(width, height, false)
    shared.uWidth.value = 1
    aspect = camera.aspect = width / height
    camera.updateProjectionMatrix()
    invalidate()
  })
  resize.observe(stage)

  // If the browser takes the drawing context away (a GPU reset, too many contexts), go back to the flat chart.
  let contextGone = false
  const onLost = () => {
    contextGone = true
    dispose()
    lost()
  }
  canvas.addEventListener('webglcontextlost', onLost)

  function dispose() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    resize.disconnect()
    seen.disconnect()
    stopListening()
    overlay.dispose()
    canvas.removeEventListener('webglcontextlost', onLost)
    canvas.removeEventListener('wheel', onWheel)
    for (const g of [...shapes.values(), gumGeometry.upper, gumGeometry.lower]) g.dispose()
    for (const tooth of teeth.values()) {
      tooth.material.dispose()
      if (tooth.inside) for (const mesh of Object.values(tooth.inside)) {
        mesh.geometry.dispose()
        mesh.material.dispose()
      }
    }
    lines?.geometry.dispose()
    lineMaterial.dispose()
    gums.upper.material.dispose()
    gums.lower.material.dispose()
    renderer.dispose()
    if (!contextGone) renderer.forceContextLoss()
    stage.remove()
  }

  chart.prepend(stage)
  currentView = liveView()
  invalidate()
  return { dispose }
}
