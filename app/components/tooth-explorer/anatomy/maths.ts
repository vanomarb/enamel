/* Small vector and curve helpers shared by the anatomy modules. Units are millimetres throughout. */

export type Vec3 = [number, number, number]

export const DEG = Math.PI / 180
export const TAU = Math.PI * 2
export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
export const bell = (x: number, w: number) => Math.exp(-((x / w) ** 2))
/** An angle folded into (-π, π]. */
export const wrapAngle = (a: number) => a - TAU * Math.round(a / TAU)
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1))
export const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
export const distance = (a: Vec3, b: Vec3) => length(sub(a, b))

/** Distance from (x, z) to the segment from a to b. */
export function segmentDistance(x: number, z: number, a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const f = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1)
  return Math.hypot(x - a[0] - f * dx, z - a[1] - f * dz)
}

/** Distance from (x, z) to a polyline. */
export function polylineDistance(x: number, z: number, pts: [number, number][]): number {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const f = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1)
    best = Math.min(best, Math.hypot(x - ax - f * dx, z - az - f * dz))
  }
  return best
}

/** Radius of a superellipse in direction (c, s), with half-widths a along x and b along z. */
export const superRadius = (c: number, s: number, a: number, b: number, n: number) => (Math.abs(c / a) ** n + Math.abs(s / b) ** n) ** (-1 / n)

/** A soft maximum (log-sum-exp): k is how far, in mm, the blend reaches below the creases where two surfaces meet. */
export function softMax(values: ArrayLike<number>, k: number, count = values.length): number {
  let m = -Infinity
  for (let i = 0; i < count; i++) m = Math.max(m, values[i])
  let sum = 0
  for (let i = 0; i < count; i++) sum += Math.exp((values[i] - m) / k)
  return m + k * Math.log(sum)
}

/** Catmull-Rom through points, closed or open, sampled densely. */
export function spline2(points: [number, number][], closed: boolean, perSegment: number): [number, number][] {
  const out: [number, number][] = []
  const n = points.length
  const get = (i: number) => (closed ? points[((i % n) + n) % n] : points[clamp(i, 0, n - 1)])
  const segments = closed ? n : n - 1
  for (let i = 0; i < segments; i++) {
    const [p0, p1, p2, p3] = [get(i - 1), get(i), get(i + 1), get(i + 2)]
    for (let k = 0; k < perSegment; k++) {
      const t = k / perSegment
      const t2 = t * t
      const t3 = t2 * t
      out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)) as [number, number])
    }
  }
  if (!closed) out.push(points[n - 1])
  return out
}

/** Resamples a polyline (closed or open) to count points evenly spaced along it. */
export function resample(points: [number, number][], count: number, closed: boolean): { pts: [number, number][]; total: number; at: number[] } {
  const pts = closed ? [...points, points[0]] : points
  const lengths = [0]
  for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const total = lengths[lengths.length - 1]
  const out: [number, number][] = []
  const at: number[] = []
  let j = 1
  const n = closed ? count : count - 1
  for (let i = 0; i < count; i++) {
    const target = (i / n) * total
    while (j < pts.length - 1 && lengths[j] < target) j++
    const f = clamp((target - lengths[j - 1]) / (lengths[j] - lengths[j - 1] || 1), 0, 1)
    out.push([lerp(pts[j - 1][0], pts[j][0], f), lerp(pts[j - 1][1], pts[j][1], f)])
    at.push(target)
  }
  return { pts: out, total, at }
}
