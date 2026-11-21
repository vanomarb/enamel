import type { Arch } from '../arch.ts'
import { DEG, add, scale, sub, type Vec3 } from './maths.ts'
import { SPECS, specAt } from './specs.ts'

/* All 32 teeth placed along the two arches. The world frame puts x to the viewer's right (the patient's left), y up and
   z toward the viewer, with the biting plane at y = 0. A tooth on one side is the mirror image of its partner. */

export interface PlacedTooth {
  fdi: number
  arch: Arch
  position: number
  /** Patient's right teeth are mirror images; their matrix flips handedness. */
  mirrored: boolean
  /** Tooth frame to world, as a 4 × 4 column-major matrix. */
  matrix: number[]
  /** Along the arch from the middle, in mm, for the opening wave. */
  along: number
  /** Where a number chip sits, in the tooth's frame: just past the biting edge, a little toward the lips. */
  chip: Vec3
}

/** The arch line through the biting edges: z = front - (a x² + b x⁴), with a and b found so the canine and the first
    molar land at typical widths. Upper sits a little forward of lower (overjet). */
const ARCH_FORM: Record<Arch, { front: number; canine: number; molar: number }> = {
  upper: { front: 2.8, canine: 17.2, molar: 24.6 },
  lower: { front: 0, canine: 13.4, molar: 22.2 },
}

/** Crown tilts in degrees: mesial tip and facial torque of the long axis. */
const TIP: Record<Arch, number[]> = { upper: [0, 4, 7, 9, 3, 3, 4, 4, 4], lower: [0, 2, 2, 5, 2, 2, 3, 3, 3] }
const TORQUE: Record<Arch, number[]> = { upper: [0, 16, 12, 7, 2, 1, 4, 4, 2], lower: [0, 12, 10, 5, -4, -7, -10, -12, -12] }

function archCurve(arch: Arch): { at: (s: number) => { x: number; z: number; tx: number; tz: number } } {
  const form = ARCH_FORM[arch]
  const widths = SPECS.filter((s) => s.arch === arch).sort((a, b) => a.position - b.position).map((s) => s.md)
  const sCanine = widths[0] + widths[1] + widths[2] / 2
  const sMolar = widths.slice(0, 5).reduce((a, b) => a + b, 0) + widths[5] / 2
  const xAt = (a: number, b: number, s: number) => {
    // Arc length of z = -(a x² + b x⁴) from 0 to x, inverted by stepping.
    let x = 0
    let acc = 0
    const h = 0.05
    while (acc < s) {
      const slope = 2 * a * (x + h / 2) + 4 * b * (x + h / 2) ** 3
      const step = h * Math.sqrt(1 + slope * slope)
      if (acc + step >= s) return x + (h * (s - acc)) / step
      acc += step
      x += h
    }
    return x
  }
  let a = 0.02
  let b = 3e-5
  for (let i = 0; i < 40; i++) {
    const f1 = xAt(a, b, sCanine) - form.canine
    const f2 = xAt(a, b, sMolar) - form.molar
    if (Math.abs(f1) + Math.abs(f2) < 1e-6) break
    const da = 1e-5
    const db = 1e-8
    const j11 = (xAt(a + da, b, sCanine) - form.canine - f1) / da
    const j12 = (xAt(a, b + db, sCanine) - form.canine - f1) / db
    const j21 = (xAt(a + da, b, sMolar) - form.molar - f2) / da
    const j22 = (xAt(a, b + db, sMolar) - form.molar - f2) / db
    const det = j11 * j22 - j12 * j21
    a -= (f1 * j22 - f2 * j12) / det
    b -= (j11 * f2 - j21 * f1) / det
  }
  return {
    at(s) {
      const x = xAt(a, b, s)
      const slope = 2 * a * x + 4 * b * x ** 3
      const len = Math.hypot(1, slope)
      return { x, z: form.front - (a * x * x + b * x ** 4), tx: 1 / len, tz: -slope / len }
    },
  }
}

type Mat3 = [Vec3, Vec3, Vec3]
/** Columns: where the tooth's x, y and z go. */
const rotX = (a: number): Mat3 => [[1, 0, 0], [0, Math.cos(a), Math.sin(a)], [0, -Math.sin(a), Math.cos(a)]]
const rotZ = (a: number): Mat3 => [[Math.cos(a), Math.sin(a), 0], [-Math.sin(a), Math.cos(a), 0], [0, 0, 1]]
const apply = (m: Mat3, v: Vec3): Vec3 => add(add(scale(m[0], v[0]), scale(m[1], v[1])), scale(m[2], v[2]))
const compose = (m: Mat3, n: Mat3): Mat3 => [apply(m, n[0]), apply(m, n[1]), apply(m, n[2])]

let layoutCache: PlacedTooth[] | null = null

/** All 32 teeth in place: the patient's right on the viewer's left, each tooth tipped and torqued a little. */
export function archLayout(): PlacedTooth[] {
  if (layoutCache) return layoutCache
  const placed: PlacedTooth[] = []
  for (const arch of ['upper', 'lower'] as const) {
    const curve = archCurve(arch)
    const up = arch === 'lower' ? 1 : -1
    let along = 0
    for (let position = 1; position <= 8; position++) {
      const spec = specAt(arch, position)
      const s = along + spec.md / 2
      along += spec.md
      const p = curve.at(s)
      // The patient's left side (x > 0); the right side is its mirror image.
      const mesial: Vec3 = [-p.tx, 0, -p.tz]
      const facial: Vec3 = [-p.tz, 0, p.tx]
      const basis: Mat3 = [mesial, [0, up, 0], facial]
      const rotation = compose(compose(basis, rotX(TORQUE[arch][position] * DEG)), rotZ(-TIP[arch][position] * DEG))
      // The biting reference (incisal edge or middle of the biting surface) sits on the arch line at the biting level.
      const front = position <= 3
      const reference: Vec3 = [0, spec.crownH - (front ? 0 : 1.2), spec.shiftZ]
      const level = (front ? (arch === 'upper' ? -1 : 1) : arch === 'upper' ? -0.3 : 0.3) + 0.0025 * Math.max(0, s - 20) ** 1.7
      const target: Vec3 = [p.x, level, p.z]
      const origin = sub(target, apply(rotation, reference))
      const chip: Vec3 = [0, spec.crownH + 2.6, spec.bl * spec.facial * 0.6]
      for (const side of ['left', 'right'] as const) {
        const quadrant = arch === 'upper' ? (side === 'right' ? 1 : 2) : side === 'right' ? 4 : 3
        const flip = side === 'right' ? -1 : 1
        const m = rotation.map((col) => [col[0] * flip, col[1], col[2]] as Vec3)
        const o: Vec3 = [origin[0] * flip, origin[1], origin[2]]
        const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[1][0] * (m[0][1] * m[2][2] - m[0][2] * m[2][1]) + m[2][0] * (m[0][1] * m[1][2] - m[0][2] * m[1][1])
        placed.push({
          fdi: quadrant * 10 + position,
          arch,
          position,
          mirrored: det < 0,
          matrix: [...m[0], 0, ...m[1], 0, ...m[2], 0, ...o, 1],
          along: s,
          chip,
        })
      }
    }
  }
  layoutCache = placed
  return placed
}

/** A tooth-frame point in the world. */
export function toWorld(matrix: number[], p: Vec3): Vec3 {
  return [
    matrix[0] * p[0] + matrix[4] * p[1] + matrix[8] * p[2] + matrix[12],
    matrix[1] * p[0] + matrix[5] * p[1] + matrix[9] * p[2] + matrix[13],
    matrix[2] * p[0] + matrix[6] * p[1] + matrix[10] * p[2] + matrix[14],
  ]
}

