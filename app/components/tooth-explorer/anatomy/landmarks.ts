import { DEG, TAU, add, lerp, normalize, scale, sub, cross, type Vec3 } from './maths.ts'
import { shapeKey, specOf } from './specs.ts'
import { shapeOf, shellOf } from './tooth.ts'

/* Named points on a tooth's surface (and lines for grooves, ridges, edges and the cementoenamel junction), computed
   from the same functions as the surface, so they sit on it. */

export interface Landmark {
  name: string
  /** Tooth-local point on the surface, and the way the surface faces there. */
  anchor: Vec3
  normal: Vec3
  /** Grooves, ridges, edges and the cementoenamel junction also have a short line along the surface. */
  line?: Vec3[]
}

const MR = 'Mesial marginal ridge'
const DR = 'Distal marginal ridge'

const landmarkCache = new Map<string, Landmark[]>()

/** Named points (and lines for grooves, ridges and edges) on a tooth's surface, in its own frame. */
export function toothLandmarks(fdi: number): Landmark[] {
  const key = shapeKey(fdi)
  const cached = landmarkCache.get(key)
  if (cached) return cached
  const spec = specOf(fdi)
  const shape = shapeOf(fdi)
  const shell = shellOf(fdi)
  const marks: Landmark[] = []
  const lift = (p: Vec3, n: Vec3) => add(p, scale(n, 0.05))
  const topNormal = (x: number, z: number): Vec3 => {
    const e = 0.08
    const dx = shape.surfaceAt(x + e, z)[1] - shape.surfaceAt(x - e, z)[1]
    const dz = shape.surfaceAt(x, z + e)[1] - shape.surfaceAt(x, z - e)[1]
    return normalize([-dx / (2 * e), 1, -dz / (2 * e)])
  }
  const wallNormal = (theta: number, t: number): Vec3 => {
    const e = 0.01
    const dT = sub(shape.wallPoint(theta + e, t), shape.wallPoint(theta - e, t))
    const dt = sub(shape.wallPoint(theta, Math.min(t + e, 1)), shape.wallPoint(theta, Math.max(t - e, 0)))
    return normalize(cross(dt, dT))
  }
  const onTop = (name: string, x: number, z: number) => {
    const p = shape.surfaceAt(x, z)
    marks.push({ name, anchor: p, normal: topNormal(x, z) })
  }
  const topLine = (name: string, pts: [number, number][]) => {
    const line: Vec3[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i]
      const [bx, bz] = pts[i + 1]
      const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.3))
      for (let k = i === 0 ? 0 : 1; k <= steps; k++) {
        const x = lerp(ax, bx, k / steps)
        const z = lerp(az, bz, k / steps)
        line.push(lift(shape.surfaceAt(x, z), topNormal(x, z)))
      }
    }
    const mid = line[Math.floor(line.length / 2)]
    const [mx, , mz] = mid
    marks.push({ name, anchor: shape.surfaceAt(mx, mz), normal: topNormal(mx, mz), line })
  }
  const onWall = (name: string, deg: number, t: number) => marks.push({ name, anchor: shape.wallPoint(deg * DEG, t), normal: wallNormal(deg * DEG, t) })
  const wallLine = (name: string, deg: number, from: number, to: number) => {
    const line: Vec3[] = []
    for (let k = 0; k <= 12; k++) {
      const t = lerp(from, to, k / 12)
      line.push(lift(shape.wallPoint(deg * DEG, t), wallNormal(deg * DEG, t)))
    }
    const t = (from + to) / 2
    marks.push({ name, anchor: shape.wallPoint(deg * DEG, t), normal: wallNormal(deg * DEG, t), line })
  }
  const palatal = spec.arch === 'upper'
  if (spec.top.kind === 'edge') {
    const a = shape.rim.a * 0.92
    topLine('Incisal edge', [[-a, shape.rim.cz], [a, shape.rim.cz]])
    wallLine(MR, 312, 0.32, 0.9)
    wallLine(DR, 228, 0.32, 0.9)
  } else if (spec.top.kind === 'point') {
    const tip = spec.top.tip
    onTop('Cusp tip', tip, shape.rim.cz)
    topLine('Mesial cusp ridge', [[tip + 0.3, shape.rim.cz], [shape.rim.a * 0.92, shape.rim.cz]])
    topLine('Distal cusp ridge', [[tip - 0.3, shape.rim.cz], [-shape.rim.a * 0.92, shape.rim.cz]])
    wallLine('Lingual ridge', 270, 0.38, 0.95)
  } else {
    for (const c of shape.cusps) onTop(c.name, c.x, c.z)
    for (const r of shape.ridges) topLine(r.name, [r.a, r.b])
    for (const g of shape.grooves) topLine(g.name, g.pts.map(([x, z]) => {
      // Keep groove lines on the biting surface, inside its rim.
      const [cx, cz] = shape.centre()
      const theta = Math.atan2(z - cz, x - cx)
      const [rx, rz] = shape.wallXZ(theta, 1)
      const limit = 0.88 * Math.hypot(rx - cx, rz - cz)
      const d = Math.hypot(x - cx, z - cz)
      return d > limit ? [cx + ((x - cx) * limit) / d, cz + ((z - cz) * limit) / d] : [x, z]
    }))
    for (const [name, fx, fz] of spec.fossae) {
      const p = shape.at([fx, fz])
      onTop(name, p.x, p.z)
    }
  }
  for (const [deg, , t, , , name] of spec.bumps) if (name) onWall(palatal && name === 'Lingual fossa' ? 'Palatal fossa' : name, deg, t)
  const cejLine: Vec3[] = []
  for (let k = 0; k <= 48; k++) cejLine.push(lift(shape.wallPoint((TAU * k) / 48, 0), wallNormal((TAU * k) / 48, 0)))
  marks.push({ name: 'Cementoenamel junction', anchor: shape.wallPoint(Math.PI / 2, 0), normal: wallNormal(Math.PI / 2, 0), line: cejLine })
  if (shell.furcation) marks.push({ name: 'Furcation', anchor: shell.furcation, normal: normalize([shell.furcation[0], 0, shell.furcation[2]]) })
  shell.apices.forEach((apex, i) => {
    const name = spec.roots.length === 1 ? 'Apex' : `${spec.roots[i][0]} apex`
    const axis = shell.axes[i]
    const before = axis.at(Math.max(axis.length - 1.2, 0))
    marks.push({ name, anchor: apex, normal: normalize(sub(apex, before)) })
  })
  landmarkCache.set(key, marks)
  return marks
}

