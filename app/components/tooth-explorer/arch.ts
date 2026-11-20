/* Where each tooth sits on the chart. The flat SVG chart and the 3D model both lay the teeth out from here. */

export type Arch = 'upper' | 'lower'

/** Teeth left to right as drawn. The chart faces you, so the patient's right side is on the left. */
export const ROWS: Record<Arch, number[]> = {
  upper: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  lower: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
}

/* Chart units. Teeth sit on a half ellipse by arc length; position 1 is the central incisor, 8 the wisdom tooth. */
export const SIZE: Record<number, [number, number]> = { 1: [30, 34], 2: [26, 32], 3: [28, 34], 4: [28, 36], 5: [28, 36], 6: [36, 40], 7: [34, 39], 8: [31, 37] }
export const GAP = 3
export const RX = 127
export const RY = 205

export interface Placed {
  fdi: number
  x: number
  y: number
  w: number
  d: number
  angle: number
  /** Unit normal pointing into the arch, toward the tongue. */
  nx: number
  ny: number
  /** Arc length from the start of the half ellipse to the tooth's centre. */
  along: number
}

/** A point on the half ellipse: t runs from -π/2 (the patient's right end) through 0 (the front) to π/2. */
export const ellipsePoint = (t: number) => ({ x: RX * Math.sin(t), y: RY * (1 - Math.cos(t)) })

/** The half ellipse sampled finely, with the arc length up to each sample. */
export function sampleEllipse(steps = 1200): { points: { t: number; x: number; y: number }[]; lengths: number[] } {
  const points: { t: number; x: number; y: number }[] = []
  const lengths = [0]
  for (let i = 0; i <= steps; i++) {
    const t = -Math.PI / 2 + (Math.PI * i) / steps
    points.push({ t, ...ellipsePoint(t) })
    if (i > 0) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y))
  }
  return { points, lengths }
}

export function layArch(arch: Arch): Placed[] {
  const steps = 1200
  const { points, lengths } = sampleEllipse(steps)
  const row = ROWS[arch]
  const needed = row.reduce((sum, fdi) => sum + SIZE[fdi % 10][0], 0) + GAP * (row.length - 1)
  let along = (lengths[steps] - needed) / 2
  const pointAt = (target: number) => {
    let i = lengths.findIndex((l) => l >= target)
    if (i < 1) i = 1
    const f = (target - lengths[i - 1]) / (lengths[i] - lengths[i - 1])
    const a = points[i - 1]
    const b = points[i]
    return { t: a.t, x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y) }
  }
  return row.map((fdi) => {
    const [w, d] = SIZE[fdi % 10]
    const centre = along + w / 2
    const c = pointAt(centre)
    along += w + GAP
    const tx = RX * Math.cos(c.t)
    const ty = RY * Math.sin(c.t)
    const len = Math.hypot(tx, ty)
    const flip = arch === 'lower' ? -1 : 1
    return { fdi, x: c.x, y: flip * c.y, w, d, angle: (flip * Math.atan2(ty, tx) * 180) / Math.PI, nx: -ty / len, ny: (flip * tx) / len, along: centre }
  })
}
