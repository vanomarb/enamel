import { DEG, TAU, bell, clamp, lerp, polylineDistance, segmentDistance, smooth, softMax, superRadius, wrapAngle, type Vec3 } from './maths.ts'
import { ringByArc } from './mesh.ts'
import type { At, Profile, Spec } from './specs.ts'

/* One tooth's surface as functions: the crown's sides, its biting surface, and the root below the cementoenamel
   junction. buildTooth (tooth.ts) samples them into rings. The dentin layer is the same shape drawn inside the enamel
   and cementum. */

export type Layer = 'shell' | 'dentin'

/** The width along one axis at a height share t: a quick swell off the neck (the enamel's cervical bulge) up to the
    widest point, then in toward the rim. */
export function profile(t: number, half: number, [neck, peak, rim, fall]: Profile, swell = 2): number {
  if (t <= peak) return half * (neck + (1 - neck) * (1 - (1 - t / peak) ** swell))
  return half * (1 - (1 - rim) * ((t - peak) / (1 - peak)) ** fall)
}

interface CuspField {
  name: string
  x: number
  z: number
  h: number
  slope: number
  round: number
  stretch: number
  out: number
  /** Unit direction from the middle of the biting surface out through the tip. */
  ox: number
  oz: number
}

/** The span (mm) over which a cusp's dome falls by its slope times this span. */
const DOME = 2.4

export class Shape {
  readonly s: Spec
  readonly layer: Layer
  readonly bF: number
  readonly bL: number
  readonly cusps: CuspField[]
  readonly ridges: { name: string; a: [number, number]; b: [number, number]; h: number; slope: number; round: number }[]
  readonly grooves: { name: string; pts: [number, number][]; depth: number; width: number; box: number[] }[]
  readonly pits: [number, number, number, number][]
  /** The rim's half-widths (mesiodistal, facial, lingual) and centre. */
  readonly rim: { a: number; f: number; l: number; cz: number }
  private readonly scratch: Float64Array
  /** The angle of each cusp from the middle of the biting surface. */
  private readonly lobes: number[]

  constructor(spec: Spec, layer: Layer) {
    this.s = spec
    this.layer = layer
    this.bF = spec.bl * spec.facial
    this.bL = spec.bl * (1 - spec.facial)
    const a = profile(1, spec.md / 2, spec.mdP)
    this.rim = { a, f: profile(1, this.bF, spec.fP), l: profile(1, this.bL, spec.lP), cz: spec.shiftZ }
    const [cx, cz] = this.centre()
    const dentin = layer === 'dentin'
    this.cusps = spec.cusps.map(([name, fx, fz, h, slope, round, stretch = 1, out = slope * 1.5]) => {
      const p = this.at([fx, fz])
      const len = Math.hypot(p.x - cx, p.z - cz) || 1
      // Under the enamel the cusps are lower and blunter: the dentin horns.
      return { name, x: p.x, z: p.z, h: dentin ? h - spec.enamel[1] : h, slope, round: dentin ? round + 0.7 : round, stretch, out: dentin ? out * 0.85 : out, ox: (p.x - cx) / len, oz: (p.z - cz) / len }
    })
    this.ridges = spec.ridges.map(([name, from, to, h, slope, round]) => {
      const p = this.at(from)
      const q = this.at(to)
      return { name, a: [p.x, p.z] as [number, number], b: [q.x, q.z] as [number, number], h: dentin ? h - spec.enamel[1] : h, slope, round: dentin ? round + 0.5 : round }
    })
    // Grooves and pits read as valleys between the lobes rather than scratches: a little broader than drawn.
    this.grooves = spec.grooves.map(([name, path, depth, width]) => {
      const pts = path.map((f) => { const p = this.at(f); return [p.x, p.z] as [number, number] })
      const reach = 3 * width * 1.4
      const box = [Math.min(...pts.map((p) => p[0])) - reach, Math.max(...pts.map((p) => p[0])) + reach, Math.min(...pts.map((p) => p[1])) - reach, Math.max(...pts.map((p) => p[1])) + reach]
      return { name, pts, depth, width: width * 1.4, box }
    })
    // Each cusp swells the crown's side above it, so the outline from above is lobed and the developmental grooves
    // run down the sides between the lobes.
    this.lobes = this.cusps.map((c) => Math.atan2(c.z - this.rim.cz, c.x - spec.shear * c.z))
    this.scratch = new Float64Array(spec.cusps.length + spec.ridges.length + 1)
    this.pits = spec.pits.map(([fx, fz, depth, width]) => { const p = this.at([fx, fz]); return [p.x, p.z, depth, width * 1.4] })
  }

  /** A biting-surface position, from shares of the rim's half-widths to mm (with the rhomboid skew). */
  at([fx, fz]: At): { x: number; z: number } {
    const z = this.rim.cz + fz * (fz >= 0 ? this.rim.f : this.rim.l)
    return { x: fx * this.rim.a + this.s.shear * z, z }
  }

  /** Where the cementoenamel junction runs: higher on the mesial and distal sides, in a rounded V on front teeth and a
      gentle sweep on molars. */
  cejY(theta: number): number {
    const c = Math.cos(theta)
    const s = Math.abs(Math.sin(theta))
    const e = 0.2
    const soft = (Math.sqrt(s * s + e * e) - e) / (Math.sqrt(1 + e * e) - e)
    return (c >= 0 ? this.s.cej[0] : this.s.cej[1]) * Math.max(0, 1 - soft) ** this.s.cejSharp
  }

  enamelSide(t: number): number {
    return 0.18 + (this.s.enamel[0] - 0.18) * smooth(0, 0.45, t)
  }

  /** The crown side's distance from the axis in direction theta at height share t (0 neck, 1 rim). */
  wallRadius(theta: number, t: number): number {
    const s = this.s
    const c = Math.cos(theta)
    const sn = Math.sin(theta)
    const facial = sn >= 0
    // Front teeth and premolars flare almost straight from the neck to their contact areas; molars swell sooner.
    const swell = s.kind === 'molar' ? 2 : s.kind === 'incisor' ? 1.6 : 1.35
    const a = profile(t, s.md / 2, s.mdP, swell)
    const b = (facial ? profile(t, this.bF, s.fP) : profile(t, this.bL, s.lP)) * (1 - (s.narrow ?? 0) * Math.max(0, -c))
    const ns = facial ? s.nF : s.nL
    const n = lerp(lerp(ns[0], ns[1], smooth(0, 0.4, t)), ns[2], smooth(0.4, 1, t))
    let r = superRadius(c, sn, a, b, n)
    const soft = this.layer === 'dentin' ? 0.5 : 1
    for (const [deg, spread, bt, bw, amount] of s.bumps) {
      const da = wrapAngle(theta - deg * DEG)
      if (Math.abs(da) > 3 * spread * DEG || Math.abs(t - bt) > 3 * bw) continue
      r += soft * amount * bell(da, spread * DEG) * bell(t - bt, bw)
    }
    if (t > 0.25) for (const lobe of this.lobes) {
      const da = wrapAngle(theta - lobe)
      if (Math.abs(da) < 1.2) r += soft * 0.24 * bell(da, 0.4) * smooth(0.25, 0.95, t)
    }
    if (this.layer === 'dentin') r -= Math.min(this.enamelSide(t), 0.42 * r)
    return r
  }

  /** The crown side's point (x, z) before height, with its rhomboid skew fading in from the neck. */
  wallXZ(theta: number, t: number): [number, number] {
    const r = this.wallRadius(theta, t)
    const z = this.s.shiftZ * smooth(0, 1, t) + r * Math.sin(theta)
    return [r * Math.cos(theta) + this.s.shear * smooth(0, 0.6, t) * z, z]
  }

  shoulderDrop(rho: number): number {
    const depth = this.s.shoulder * (this.layer === 'dentin' ? 0.7 : 1)
    return rho <= 0.75 ? 0 : depth * ((rho - 0.75) / 0.25) ** 2
  }

  /** Height of the biting surface at (x, z), before the rounding near its rim. */
  topHeight(x: number, z: number): number {
    const s = this.s
    const dentin = this.layer === 'dentin'
    const lowered = dentin ? s.enamel[1] : 0
    const zr = (z - this.rim.cz) / Math.max(z >= this.rim.cz ? this.rim.f : this.rim.l, 0.3)
    if (s.top.kind === 'edge') {
      const x0 = 0.5 * this.rim.a
      const m = x > x0 ? s.top.drop[0] * ((x - x0) / (this.rim.a - x0)) ** 2.4 : 0
      const d = x < -x0 ? s.top.drop[1] * ((-x - x0) / (this.rim.a - x0)) ** 1.8 : 0
      return s.crownH - m - d - 0.3 * zr * zr - lowered
    }
    if (s.top.kind === 'point') {
      const tip = s.top.tip
      const slope = x > tip ? s.top.slopes[0] : s.top.slopes[1]
      const round = dentin ? s.top.round + 0.8 : s.top.round
      return s.crownH - slope * (Math.sqrt((x - tip) ** 2 + round ** 2) - round) - 0.45 * zr * zr - lowered
    }
    /* Back teeth: each cusp is a cone, steeper on its outer side than on its inner (triangular ridge) side, with its cusp
       ridges stretched along the outline; ridges are capsules. A soft maximum joins them, so the fossae and grooves
       form where the inclines meet, and the developmental grooves and pits are cut into those creases. */
    const heights = this.scratch
    const dome = dentin ? 1.15 : s.kind === 'molar' ? 1.35 : 1.12
    let n = 0
    for (const c of this.cusps) {
      const dx = x - c.x
      const dz = z - c.z
      let du = dx * c.ox + dz * c.oz
      const dv = (-dx * c.oz + dz * c.ox) / c.stretch
      if (du > 0) du *= c.out / c.slope
      // A dome rather than a cone: flatter near the tip and steeper toward the fossa, so each cusp reads as a lobe.
      const d = Math.sqrt(du * du + dv * dv + c.round * c.round) - c.round
      heights[n++] = c.h - c.slope * DOME * (d / DOME) ** dome
    }
    for (const r of this.ridges) {
      const d = segmentDistance(x, z, r.a, r.b)
      heights[n++] = r.h - r.slope * (Math.sqrt(d * d + r.round * r.round) - r.round)
    }
    const height = softMax(heights, dentin ? 0.55 : 0.13, n)
    if (dentin) return height
    let groove = 0
    for (const g of this.grooves) {
      if (x < g.box[0] || x > g.box[1] || z < g.box[2] || z > g.box[3]) continue
      const d = polylineDistance(x, z, g.pts)
      if (d < 3 * g.width) groove = Math.max(groove, g.depth * bell(d, g.width))
    }
    for (const [px, pz, depth, width] of this.pits) {
      const d = Math.hypot(x - px, z - pz)
      if (d < 3 * width) groove = Math.max(groove, depth * bell(d, width))
    }
    return height - groove
  }

  /** The rim of the biting surface in direction theta. */
  rimPoint(theta: number): Vec3 {
    const [x, z] = this.wallXZ(theta, 1)
    return [x, this.topHeight(x, z) - this.shoulderDrop(1), z]
  }

  /** The middle of the biting surface. */
  centre(): [number, number] {
    return [this.s.shear * this.rim.cz, this.rim.cz]
  }

  private rimTable: Float64Array | null = null

  /** The rim's height in direction theta, read from a fine table (the walls ask for it at every vertex). */
  rimY(theta: number): number {
    const N = 360
    if (!this.rimTable) {
      this.rimTable = new Float64Array(N + 1)
      for (let i = 0; i <= N; i++) this.rimTable[i] = this.rimPoint((TAU * i) / N)[1]
    }
    const f = ((((theta / TAU) % 1) + 1) % 1) * N
    const i = Math.floor(f)
    return lerp(this.rimTable[i], this.rimTable[Math.min(i + 1, N)], f - i)
  }

  wallPoint(theta: number, t: number): Vec3 {
    const [x, z] = this.wallXZ(theta, t)
    return [x, t === 0 ? this.cejY(theta) : lerp(this.cejY(theta), this.rimY(theta), t), z]
  }

  /** A point on the biting surface: rho 1 is the rim, 0 the middle. */
  topPoint(theta: number, rho: number, rim?: Vec3): Vec3 {
    const r = rim ?? this.rimPoint(theta)
    const [cx, cz] = this.centre()
    const x = cx + rho * (r[0] - cx)
    const z = cz + rho * (r[2] - cz)
    return [x, this.topHeight(x, z) - this.shoulderDrop(rho), z]
  }

  /** The biting surface above (x, z), for landmarks placed by position. */
  surfaceAt(x: number, z: number): Vec3 {
    const [cx, cz] = this.centre()
    const theta = Math.atan2(z - cz, x - cx)
    const rim = this.wallXZ(theta, 1)
    const rho = clamp(Math.hypot(x - cx, z - cz) / Math.max(Math.hypot(rim[0] - cx, rim[1] - cz), 1e-6), 0, 1)
    return [x, this.topHeight(x, z) - this.shoulderDrop(rho), z]
  }

  /** A ring around the crown's side at a height share, for counting grid lines. */
  ringAt(t: number): Vec3[] {
    return ringByArc(64, (theta) => this.wallXZ(theta, t), (theta) => this.wallPoint(theta, t)).pts
  }

  private neckCache = new Map<number, number>()

  /** The crown side's radius at the neck, which the root carries on down; cached, as every root ring asks again. */
  neckRadius(theta: number): number {
    let r = this.neckCache.get(theta)
    if (r === undefined) {
      r = this.wallRadius(theta, 0)
      this.neckCache.set(theta, r)
    }
    return r
  }

  /** A root's narrowing toward its tip: k is the share lost by the middle, blunt how rounded the tip is. */
  static taper(u: number, k = 0.3, blunt = 0.55): number {
    return (1 - k * u - 0.12 * u * u) * Math.max(0, 1 - u ** 2.5) ** blunt
  }

  /** A point on a single root (or a split tooth's trunk) at depth d below the facial cementoenamel junction. */
  rootPoint(theta: number, d: number, length: number, curve: number, trunk = false): Vec3 {
    const u = clamp(d / length, 0, 1)
    const taper = trunk ? 1 - 0.05 * u : Shape.taper(u, this.s.taper[0], this.s.taper[1])
    let r = this.neckRadius(theta) * taper
    const hollow = this.s.hollow * Math.sin(Math.PI * Math.min(u * 1.6, 1)) * (bell(wrapAngle(theta), 0.42) + bell(wrapAngle(theta - Math.PI), 0.42))
    r = Math.max(r - hollow * taper, r * 0.45)
    if (this.layer === 'dentin' && !trunk) r = Math.max(r - Math.min(0.18, 0.4 * r) * (1 - taper), 0)
    const cx = trunk ? 0 : -curve * u ** 2.2
    return [cx + r * Math.cos(theta), this.cejY(theta) * (1 - smooth(0, 2.5, d)) - d, r * Math.sin(theta)]
  }
}
