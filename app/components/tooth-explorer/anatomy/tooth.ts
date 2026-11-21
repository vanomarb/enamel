import { DEG, bell, clamp, distance, lerp, mix, smooth, superRadius, wrapAngle, type Vec3 } from './maths.ts'
import { finish, flat, lathe, newPart, perimeter, ringByArc, CELL, type MeshData, type Part } from './mesh.ts'
import { Shape, type Layer } from './shape.ts'
import { shapeKey, specOf, type Kind, type Spec } from './specs.ts'

/* A tooth's closed surface, crown and roots as one mesh, sampled from its Shape in rings: from a pole in the middle of
   the biting surface out to the rim, down the crown's side to the cementoenamel junction, then down the root (or a
   trunk that splits into one tube per root) to each apex. */

const AROUND: Record<Kind, number> = { incisor: 64, canine: 64, premolar: 72, molar: 80 }
const TOP_RINGS: Record<Kind, number> = { incisor: 6, canine: 8, premolar: 14, molar: 16 }
const WALL_RINGS = 15

export interface Built {
  mesh: MeshData
  /** Root axes for the canals: the centre of each root at a depth, and how far down it goes. */
  axes: { name: string; at: (e: number) => Vec3; length: number; bl: number; canals: number }[]
  /** The crown's outer rings (rim to neck) and the neck ring, for the enamel cap. */
  crown: Part
  neck: Vec3[]
  apices: Vec3[]
  /** The split, where the roots part on the buccal side (or mesial, for the upper first premolar). */
  furcation: Vec3 | null
  /** Each split root's centre where it leaves the trunk: the dentin's roots are built round the shell's. */
  centres: Vec3[]
}

/** The crown (biting surface and sides) as rings from the middle of the biting surface down to the neck. */
function crownRings(shape: Shape): { rings: Vec3[][]; top: Vec3 } {
  const kind = shape.s.kind
  const count = AROUND[kind]
  const rim = ringByArc(count, (theta) => shape.wallXZ(theta, 1), (theta) => shape.rimPoint(theta))
  const rings: Vec3[][] = []
  const topRings = TOP_RINGS[kind]
  for (let k = 1; k <= topRings; k++) {
    const rho = k / topRings
    rings.push(rim.thetas.map((theta, i) => (k === topRings ? rim.pts[i] : shape.topPoint(theta, rho, rim.pts[i]))))
  }
  for (let k = 1; k <= WALL_RINGS; k++) {
    const t = 0.5 + 0.5 * Math.cos((Math.PI * k) / WALL_RINGS)
    rings.push(ringByArc(count, (theta) => shape.wallXZ(theta, t), (theta) => shape.wallPoint(theta, t)).pts)
  }
  const [cx, cz] = shape.centre()
  return { rings, top: [cx, shape.topHeight(cx, cz), cz] }
}

export function buildTooth(spec: Spec, layer: Layer, rootCentres?: Vec3[]): Built {
  const shape = new Shape(spec, layer)
  const dentin = layer === 'dentin'
  const count = AROUND[spec.kind]
  const { rings: crown, top } = crownRings(shape)
  const neckIndex = crown.length - 1
  const lines = Math.round(perimeter(new Shape(spec, 'shell').ringAt(0.45)) / CELL)
  const part = newPart()
  const crownPart = newPart()
  const neck = crown[neckIndex]
  const apices: Vec3[] = []
  const axes: Built['axes'] = []
  const centres: Vec3[] = []
  const shrink = dentin ? 0.25 : 0

  if (spec.roots.length === 1) {
    const [name, , , , , length, curve, canals] = spec.roots[0]
    const L = length - shrink
    const rings = [...crown]
    // Both layers sample the same depths, so the dentin's rings stay inside the shell's between them.
    const steps = Math.max(10, Math.round(length / 0.9))
    for (let k = 1; k < steps; k++) {
      const d = length * (1 - (1 - k / steps) ** 1.25)
      if (d > L - 0.2) break
      rings.push(ringByArc(count, (theta) => flat(shape.rootPoint(theta, d, L, curve)), (theta) => shape.rootPoint(theta, d, L, curve)).pts)
    }
    const apex: Vec3 = [-curve, -L, 0]
    apices.push(apex)
    lathe(part, rings, { top, bottom: apex, lines, vAt: neckIndex, v0: 0 })
    lathe(crownPart, crown, { top, lines, vAt: neckIndex, v0: 0 })
    const neckR = Math.min(shape.wallRadius(0, 0), shape.wallRadius(Math.PI / 2, 0), shape.wallRadius(-Math.PI / 2, 0))
    axes.push({ name, at: (e) => [-curve * clamp(e / length, 0, 1) ** 2.2, -e, 0], length, bl: neckR, canals })
    return { mesh: finish([part]), axes, crown: crownPart, neck, apices, furcation: null, centres: [] }
  }

  // A split tooth: the crown and a trunk, then one tube per root, joined along bridges across the furcation.
  const trunkRings = 5
  const rings = [...crown]
  // The dentin's split sits a little higher than the shell's, so its furcation stays inside the tooth.
  const lift = dentin ? 1.2 : 0
  for (let k = 1; k <= trunkRings; k++) {
    const at = (theta: number) => shape.rootPoint(theta, ((spec.trunk - lift) * k) / trunkRings, spec.trunk * 4, 0, true)
    rings.push(ringByArc(count, (theta) => flat(at(theta)), at).pts)
  }
  const v = lathe(part, rings, { top, lines, vAt: neckIndex, v0: 0 })
  lathe(crownPart, crown, { top, lines, vAt: neckIndex, v0: 0 })
  const bottom = rings[rings.length - 1]
  const vBottom = v[v.length - 1]
  const yF = bottom.reduce((sum, p) => sum + p[1], 0) / count
  const angles = bottom.map((p) => Math.atan2(p[2], p[0]))
  const nearest = (deg: number) => {
    let best = 0
    for (let i = 1; i < count; i++) if (Math.abs(wrapAngle(angles[i] - deg * DEG)) < Math.abs(wrapAngle(angles[best] - deg * DEG))) best = i
    return best
  }
  const splitAt = spec.splits.map(nearest)
  const dome = dentin ? 0.9 : 0.45
  const middle: Vec3 = [bottom.reduce((s2, p) => s2 + p[0], 0) / count, yF + dome, bottom.reduce((s2, p) => s2 + p[2], 0) / count]
  // Two roots share one bridge; three meet in the middle.
  const bridges = splitAt.map((index) => {
    const from = bottom[index]
    const span = Math.hypot(middle[0] - from[0], middle[2] - from[2])
    const steps = Math.max(2, Math.round(span / 0.7))
    const pts: Vec3[] = []
    for (let k = 1; k < steps; k++) {
      const f = k / steps
      pts.push([lerp(from[0], middle[0], f), yF + dome * Math.sin((Math.PI / 2) * f), lerp(from[2], middle[2], f)])
    }
    return pts
  })
  spec.roots.forEach(([name, md, bl, driftX, driftZ, length, curve, canals, hollow], k) => {
    const start = splitAt[k]
    const end = splitAt[(k + 1) % splitAt.length]
    const top: Vec3[] = []
    for (let i = start; ; i = (i + 1) % count) {
      top.push(bottom[i])
      if (i === end) break
    }
    top.push(...bridges[(k + 1) % splitAt.length], middle, ...[...bridges[k]].reverse())
    const own: Vec3 = [top.reduce((s2, p) => s2 + p[0], 0) / top.length, yF, top.reduce((s2, p) => s2 + p[2], 0) / top.length]
    const c: Vec3 = rootCentres ? [rootCentres[k][0], yF, rootCentres[k][2]] : own
    centres.push(c)
    const phis = top.map((p) => Math.atan2(p[2] - c[2], p[0] - c[0]))
    const extent = length - spec.trunk
    const L = extent + lift - shrink
    // Measured from this layer's split; the shell's and the dentin's axes meet at the same heights.
    const axis = (e: number): Vec3 => {
      const u = clamp((e - lift) / extent, 0, 1)
      // The roots part from the furcation at once, as in a real V-shaped furcation, then run on more steadily.
      const splay = 1 - (1 - u) ** 1.8
      return [c[0] + driftX * splay - curve * u ** 2.2, yF - e, c[2] + driftZ * splay]
    }
    const steps = Math.max(9, Math.round(extent / 0.9))
    const tube: Vec3[][] = [top]
    for (let j = 1; j < steps; j++) {
      const e = lift + extent * (1 - (1 - j / steps) ** 1.25)
      if (e > L - 0.2) break
      const u = e / L
      const taper = Shape.taper(u, 0.25, 0.38)
      const centre = axis(e)
      const blend = smooth(0, 0.42 * extent, e - lift)
      const half = dentin ? 0.18 : 0
      tube.push(
        top.map((p, i) => {
          const phi = phis[i]
          const hollowed = 1 - hollow * bell(wrapAngle(phi), 0.45) - hollow * bell(wrapAngle(phi - Math.PI), 0.45)
          const r = Math.max(superRadius(Math.cos(phi), Math.sin(phi), Math.max(md - half, 0.2), Math.max(bl - half, 0.2), 2.3) * taper * hollowed, 0.01)
          const target: Vec3 = [centre[0] + r * Math.cos(phi), centre[1], centre[2] + r * Math.sin(phi)]
          // The dentin's outline also shrinks toward the root's middle, keeping it off the shell's furcal faces.
          const shrinkTo = dentin ? 1 - 0.24 * smooth(0, 0.35, e - lift) : 1
          const carried: Vec3 = [centre[0] + (p[0] - c[0]) * shrinkTo, p[1] - e, centre[2] + (p[2] - c[2]) * shrinkTo]
          return mix(carried, target, blend)
        }),
      )
    }
    const apex = axis(L)
    apices.push(apex)
    const arcs = [0]
    for (let i = 1; i <= top.length; i++) arcs.push(arcs[i - 1] + distance(top[i % top.length], top[i - 1]))
    const total = arcs[top.length]
    const tubeLines = Math.max(8, Math.round(perimeter(tube[Math.floor(tube.length / 2)]) / CELL))
    lathe(part, tube, { bottom: apex, lines: tubeLines, vAt: 0, v0: vBottom, fractions: top.map((_, i) => arcs[i] / total) })
    axes.push({ name, at: axis, length: L, bl: Math.min(md, bl), canals })
  })
  // The furcation's entrance on the cheek side, or on the mesial side where the roots split cheek and palate.
  const furcation = bottom[splitAt[Math.max(spec.splits.indexOf(90), 0)]]
  return { mesh: finish([part]), axes, crown: crownPart, neck, apices, furcation, centres }
}

const shapes = new Map<string, Shape>()
/** The outer surface's functions for a tooth, shared by the gum and the landmarks. */
export function shapeOf(fdi: number): Shape {
  const key = shapeKey(fdi)
  let shape = shapes.get(key)
  if (!shape) {
    shape = new Shape(specOf(fdi), 'shell')
    shapes.set(key, shape)
  }
  return shape
}

const shells = new Map<string, Built>()
export function shellOf(fdi: number): Built {
  const key = shapeKey(fdi)
  let built = shells.get(key)
  if (!built) {
    built = buildTooth(specOf(fdi), 'shell')
    shells.set(key, built)
  }
  return built
}

/** The tooth's outer surface, crown and roots as one closed mesh in its own frame. Mirror partners share it. */
export function toothShell(fdi: number): MeshData {
  return shellOf(fdi).mesh
}

/** Root tips, for checks. */
export function toothApices(fdi: number): Vec3[] {
  return shellOf(fdi).apices
}
