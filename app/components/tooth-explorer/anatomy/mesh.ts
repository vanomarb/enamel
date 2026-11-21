import { TAU, type Vec3 } from './maths.ts'

/* Closed meshes stitched from rings of points, with the grid coordinates the shader draws its lines from. */

/** The grid's cell, in mm, on every surface. */
export const CELL = 0.6

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  /** Per vertex: u around and v along the surface in mm (a grid line every CELL), and w. On a tooth w is the spacing of
      the u lines in cells, below 1 where they crowd toward a pole; on the gum it is the depth below the gum line. */
  grid: Float32Array
  indices: Uint32Array
}

export interface Part {
  positions: number[]
  grid: number[]
  indices: number[]
}

export const newPart = (): Part => ({ positions: [], grid: [], indices: [] })

/** Evenly spaced points around a closed curve, by its length seen from above, starting at theta 0. flat gives a point's
    x and z alone (cheap, for measuring); at gives the full point. */
export function ringByArc(count: number, flat: (theta: number) => [number, number], at: (theta: number) => Vec3): { pts: Vec3[]; thetas: number[] } {
  const K = 72
  const lengths = [0]
  let [px, pz] = flat(0)
  for (let k = 1; k <= K; k++) {
    const [x, z] = flat((TAU * k) / K)
    lengths.push(lengths[k - 1] + Math.hypot(x - px, z - pz))
    px = x
    pz = z
  }
  const total = lengths[K]
  const pts: Vec3[] = []
  const thetas: number[] = []
  let j = 1
  for (let i = 0; i < count; i++) {
    const target = (i / count) * total
    while (j < K && lengths[j] < target) j++
    const f = (target - lengths[j - 1]) / (lengths[j] - lengths[j - 1] || 1)
    const theta = i === 0 ? 0 : (TAU * (j - 1 + f)) / K
    thetas.push(theta)
    pts.push(at(theta))
  }
  return { pts, thetas }
}

export const flat = (p: Vec3): [number, number] => [p[0], p[2]]
export const perimeter = (ring: Vec3[]) => {
  let sum = 0
  for (let i = 0; i < ring.length; i++) sum += Math.hypot(ring[(i + 1) % ring.length][0] - ring[i][0], ring[(i + 1) % ring.length][1] - ring[i][1], ring[(i + 1) % ring.length][2] - ring[i][2])
  return sum
}
const gap = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
const meanGap = (a: Vec3[], b: Vec3[]) => {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += gap(b[Math.min(i, b.length - 1)], a[i])
  return sum / a.length
}

/**
 * Stitches rings (all the same size, each ordered with increasing angle) into a tube, closed by poles at either end.
 * Each ring gets a duplicate of its first vertex for the grid's seam, and each pole one copy per triangle.
 * fractions: each vertex's share of the way around (for u); v0: v at ring vAt; lines: grid lines around.
 */
export function lathe(part: Part, rings: Vec3[][], opts: { top?: Vec3; bottom?: Vec3; lines: number; vAt: number; v0: number; fractions?: number[] }): number[] {
  const count = rings[0].length
  const fractions = opts.fractions ?? rings[0].map((_, i) => i / count)
  const gaps = rings.slice(1).map((ring, j) => meanGap(rings[j], ring))
  const vs = [0]
  for (const gap of gaps) vs.push(vs[vs.length - 1] - gap)
  const shift = opts.v0 - vs[opts.vAt]
  const v = vs.map((x) => x + shift)
  const base = part.positions.length / 3
  const uMax = opts.lines * CELL
  for (let j = 0; j < rings.length; j++) {
    const w = perimeter(rings[j]) / (opts.lines * CELL)
    for (let i = 0; i <= count; i++) {
      const p = rings[j][i % count]
      part.positions.push(p[0], p[1], p[2])
      part.grid.push(i === count ? uMax : fractions[i] * uMax, v[j], w)
    }
  }
  const row = count + 1
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < count; i++) {
      const a = base + j * row + i
      const b = a + 1
      const c = a + row
      const d = c + 1
      // Split each quad along its shorter diagonal, so creases (grooves, cusp ridges) fold cleanly.
      if (gap(rings[j][i], rings[j + 1][(i + 1) % count]) <= gap(rings[j][(i + 1) % count], rings[j + 1][i])) part.indices.push(a, b, d, a, d, c)
      else part.indices.push(a, b, c, b, d, c)
    }
  }
  const pole = (p: Vec3, ring: number, vPole: number, above: boolean) => {
    const start = part.positions.length / 3
    for (let i = 0; i < count; i++) {
      part.positions.push(p[0], p[1], p[2])
      part.grid.push(((fractions[i] + (i + 1 < count ? fractions[i + 1] : 1)) / 2) * uMax, vPole, 0)
    }
    for (let i = 0; i < count; i++) {
      const a = base + ring * row + i
      const b = a + 1
      if (above) part.indices.push(start + i, b, a)
      else part.indices.push(a, b, start + i)
    }
  }
  if (opts.top) pole(opts.top, 0, v[0] + meanGap([opts.top], rings[0]), true)
  if (opts.bottom) pole(opts.bottom, rings.length - 1, v[rings.length - 1] - meanGap([opts.bottom], rings[rings.length - 1]), false)
  return v
}

/** Joins parts into one mesh, with normals averaged across seams (vertices at the same place share a normal). */
export function finish(parts: Part[], flip = false): MeshData {
  let vertexTotal = 0
  let indexTotal = 0
  for (const part of parts) {
    vertexTotal += part.positions.length
    indexTotal += part.indices.length
  }
  const positions = new Float32Array(vertexTotal)
  const grid = new Float32Array(vertexTotal)
  const indices = new Uint32Array(indexTotal)
  let vOffset = 0
  let iOffset = 0
  for (const part of parts) {
    const base = vOffset / 3
    positions.set(part.positions, vOffset)
    grid.set(part.grid, vOffset)
    for (let i = 0; i < part.indices.length; i++) indices[iOffset + i] = part.indices[i] + base
    vOffset += part.positions.length
    iOffset += part.indices.length
  }
  if (flip) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]]
  const count = positions.length / 3
  // Vertices within a micrometre are the same place (seams and poles are exact copies): an open-addressed hash of the
  // rounded coordinates gives each place one group.
  const size = 1 << Math.ceil(Math.log2(count * 2 + 1))
  const slots = new Int32Array(size).fill(-1)
  const group = new Int32Array(count)
  const firstOf: number[] = []
  const q = (v: number) => Math.round(v * 1000)
  for (let i = 0; i < count; i++) {
    const x = q(positions[3 * i])
    const y = q(positions[3 * i + 1])
    const z = q(positions[3 * i + 2])
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & (size - 1)
    for (;;) {
      const g = slots[h]
      if (g < 0) {
        slots[h] = firstOf.length
        group[i] = firstOf.length
        firstOf.push(i)
        break
      }
      const j = firstOf[g]
      if (q(positions[3 * j]) === x && q(positions[3 * j + 1]) === y && q(positions[3 * j + 2]) === z) {
        group[i] = g
        break
      }
      h = (h + 1) & (size - 1)
    }
  }
  const groups = { size: firstOf.length }
  const sums = new Float64Array(groups.size * 3)
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]
    const b = indices[t + 1]
    const c = indices[t + 2]
    const ax = positions[3 * a]
    const ay = positions[3 * a + 1]
    const az = positions[3 * a + 2]
    const ux = positions[3 * b] - ax
    const uy = positions[3 * b + 1] - ay
    const uz = positions[3 * b + 2] - az
    const vx = positions[3 * c] - ax
    const vy = positions[3 * c + 1] - ay
    const vz = positions[3 * c + 2] - az
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    for (let k = 0; k < 3; k++) {
      const v = group[k === 0 ? a : k === 1 ? b : c]
      sums[3 * v] += nx
      sums[3 * v + 1] += ny
      sums[3 * v + 2] += nz
    }
  }
  const normals = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const g = group[i]
    const len = Math.hypot(sums[3 * g], sums[3 * g + 1], sums[3 * g + 2]) || 1
    normals[3 * i] = sums[3 * g] / len
    normals[3 * i + 1] = sums[3 * g + 1] / len
    normals[3 * i + 2] = sums[3 * g + 2] / len
  }
  return { positions, normals, grid, indices }
}
