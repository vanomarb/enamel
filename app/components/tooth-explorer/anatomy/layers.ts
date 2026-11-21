import { TAU, add, clamp, cross, lerp, normalize, scale, smooth, sub, superRadius, type Vec3 } from './maths.ts'
import { finish, lathe, newPart, perimeter, CELL, type MeshData, type Part } from './mesh.ts'
import { Shape } from './shape.ts'
import { shapeKey, specOf, type Spec } from './specs.ts'
import { buildTooth, shellOf, type Built } from './tooth.ts'

/* The inside of a tooth, built the first time it is opened up: the enamel cap over the crown, the dentin under the
   enamel and cementum, and the pulp, a chamber with horns under the cusps that narrows into one canal per root canal. */

export interface ToothLayers {
  /** The enamel cap: the crown's outer surface and the dentin under it, closed at the neck. */
  enamel: MeshData
  /** Dentin, crown and roots, inside the enamel and cementum. */
  dentin: MeshData
  /** The pulp chamber, with a horn under each cusp, and one tapered canal per expected canal. */
  pulp: MeshData
  canals: number
}

const layers = new Map<string, ToothLayers>()

/** The inside layers, built the first time a tooth is opened up, then kept. */
export function toothLayers(fdi: number): ToothLayers {
  const key = shapeKey(fdi)
  const cached = layers.get(key)
  if (cached) return cached
  const spec = specOf(fdi)
  const shell = shellOf(fdi)
  const dentin = buildTooth(spec, 'dentin', shell.centres)
  // The enamel cap: the shell's crown, the dentin's crown turned inside out, and a thin band joining them at the neck.
  const inner = dentin.crown
  const flipped: Part = { positions: inner.positions, grid: inner.grid, indices: [] }
  for (let i = 0; i < inner.indices.length; i += 3) flipped.indices.push(inner.indices[i], inner.indices[i + 2], inner.indices[i + 1])
  const band = newPart()
  const lines = Math.round(perimeter(shell.neck) / CELL)
  lathe(band, [shell.neck, dentin.neck], { lines, vAt: 0, v0: 0 })
  const enamel = finish([shell.crown, flipped, band])
  const { mesh: pulp, canals } = buildPulp(spec, shell)
  const result = { enamel, dentin: dentin.mesh, pulp, canals }
  layers.set(key, result)
  return result
}

/** The pulp chamber follows the crown's shape, smaller, with horns reaching toward the cusps; canals run down each root. */
function buildPulp(spec: Spec, shell: Built): { mesh: MeshData; canals: number } {
  const shape = new Shape(spec, 'shell')
  const parts: Part[] = []
  const multi = spec.roots.length > 1
  const front = spec.kind === 'incisor' || spec.kind === 'canine'
  const [pa, pb] = front ? [0.34, 0.24] : spec.kind === 'premolar' ? [0.3, 0.32] : [0.42, 0.38]
  const bottomY = multi ? -spec.trunk + 3.1 : front ? -2.2 : -2.6
  const roofY = front ? spec.crownH * 0.42 : spec.kind === 'premolar' ? 2.2 : 1.5
  // Horns: under each cusp (scaled toward the middle), under the corners of an incisor's edge, or under a canine's tip.
  const horns: { x: number; z: number; h: number }[] = []
  if (spec.top.kind === 'edge') {
    const a = shape.rim.a * 0.5
    horns.push({ x: a, z: 0.15, h: spec.crownH - 3.9 }, { x: 0, z: 0.15, h: spec.crownH - 4.6 }, { x: -a, z: 0.15, h: spec.crownH - 4.1 })
  } else if (spec.top.kind === 'point') horns.push({ x: spec.top.tip * 0.5, z: 0, h: spec.crownH - 4.3 })
  else for (const c of shape.cusps) horns.push({ x: c.x * 0.55, z: c.z * 0.5, h: c.h - (spec.kind === 'premolar' ? 4.2 : 4) })
  const roof = (x: number, z: number) => {
    const heights = [roofY + 0.3, ...horns.map((hn) => hn.h - 1.5 * (Math.sqrt((x - hn.x) ** 2 + (z - hn.z) ** 2 + 0.09) - 0.3))]
    const m = Math.max(...heights)
    return m + 0.3 * Math.log(heights.reduce((sum, h) => sum + Math.exp((h - m) / 0.3), 0))
  }
  const count = 36
  const half = (theta: number, y: number) => {
    const k = lerp(1, 0.72, clamp((y - bottomY) / (roofY - bottomY), 0, 1))
    const a = (spec.md / 2) * spec.mdP[0] * pa * k
    const b = (Math.sin(theta) >= 0 ? spec.bl * spec.facial : spec.bl * (1 - spec.facial)) * pb * k
    return superRadius(Math.cos(theta), Math.sin(theta), a, b, 2.4)
  }
  const rings: Vec3[][] = []
  const wallTop = (theta: number) => {
    const r = half(theta, roofY)
    return roof(r * Math.cos(theta), r * Math.sin(theta)) - 0.25
  }
  const thetas = Array.from({ length: count }, (_, i) => (TAU * i) / count)
  const roofRings = 7
  for (let k = 1; k <= roofRings; k++) {
    const rho = k / roofRings
    rings.push(
      thetas.map((theta) => {
        const r = half(theta, roofY) * rho
        const x = r * Math.cos(theta)
        const z = r * Math.sin(theta)
        return [x, roof(x, z) - 0.25 * smooth(0.5, 1, rho), z]
      }),
    )
  }
  const wallSteps = 8
  for (let k = 1; k <= wallSteps; k++) {
    const f = k / wallSteps
    rings.push(
      thetas.map((theta) => {
        const y = lerp(wallTop(theta), bottomY, f)
        const r = half(theta, y) * (1 - 0.35 * smooth(0.7, 1, f))
        return [r * Math.cos(theta), y, r * Math.sin(theta)]
      }),
    )
  }
  const chamber = newPart()
  lathe(chamber, rings, { top: [0, roof(0, 0), 0], bottom: [0, bottomY - 0.5, 0], lines: 24, vAt: 0, v0: 0 })
  parts.push(chamber)

  // Canals: from inside the chamber's floor down each root's middle to an opening just short of the apex.
  let canals = 0
  for (const axis of shell.axes) {
    for (let c = 0; c < axis.canals; c++) {
      const spread = axis.canals === 2 ? (c === 0 ? 1 : -1) * 0.3 * axis.bl : 0
      const r0 = (front ? 0.55 : 0.42) * (c === 1 ? 0.8 : 1)
      const steps = 22
      const centres: Vec3[] = []
      const startY = bottomY + 0.5
      const top = axis.at(0)
      const orifice: Vec3 = [top[0] * 0.55, startY, top[2] * 0.55 + spread * 0.6]
      const run = axis.length - 1.5
      for (let k = 0; k <= steps; k++) {
        const f = k / steps
        if (f < 0.12 && multi) {
          const g = f / 0.12
          const along = axis.at(0)
          centres.push([lerp(orifice[0], along[0], g), lerp(orifice[1], along[1], g), lerp(orifice[2], along[2] + spread, g)])
        } else {
          const e = multi ? ((f - 0.12) / 0.88) * run : lerp(-startY, run, f)
          const p = axis.at(Math.max(e, 0))
          const y = multi ? p[1] : Math.min(p[1], startY)
          const u = clamp(e / axis.length, 0, 1)
          centres.push([p[0], y, p[2] + spread * (1 - 0.8 * u)])
        }
      }
      const tube: Vec3[][] = []
      for (let k = 0; k <= steps; k++) {
        const p = centres[k]
        const q = centres[Math.min(k + 1, steps)]
        const o = centres[Math.max(k - 1, 0)]
        const dir = normalize(sub(q, o))
        const side = normalize(cross(dir, [0, 0, 1]))
        const other = normalize(cross(side, dir))
        const r = r0 * (1 - 0.68 * (k / steps)) + 0.06
        tube.push(Array.from({ length: 10 }, (_, i) => {
          const a = (TAU * i) / 10
          return add(p, add(scale(side, r * Math.cos(a)), scale(other, r * Math.sin(a))))
        }))
      }
      const canal = newPart()
      const first = centres[0]
      const last = centres[steps]
      const dirEnd = normalize(sub(last, centres[steps - 1]))
      const dirStart = normalize(sub(centres[1], first))
      lathe(canal, tube, { top: sub(first, scale(dirStart, r0 * 0.8)), bottom: add(last, scale(dirEnd, 0.05)), lines: 8, vAt: 0, v0: 0 })
      parts.push(canal)
      canals++
    }
  }
  return { mesh: finish(parts), canals }
}
