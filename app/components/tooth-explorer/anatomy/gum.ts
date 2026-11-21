import { ROWS, type Arch } from '../arch.ts'
import { add, bell, lerp, length, resample, scale, smooth, spline2, sub, type Vec3 } from './maths.ts'
import { finish, newPart, type MeshData, type Part } from './mesh.ts'
import { specOf } from './specs.ts'
import { shapeOf, shellOf, toothShell } from './tooth.ts'
import { archLayout, toWorld } from './layout.ts'

/* The gum and jaw bone around each arch's roots: one translucent body, scalloped at the gum line. */

const gums = new Map<Arch, MeshData>()

/**
 * One jaw's gum and bone as a closed, rounded horseshoe around the roots. Its top follows each tooth's neck with a
 * scalloped gum line, rising to a papilla between teeth.
 */
export function gumMesh(arch: Arch): MeshData {
  const cached = gums.get(arch)
  if (cached) return cached
  const up = arch === 'lower' ? 1 : -1
  const layout = archLayout()
  const row = ROWS[arch]
  const teeth = row.map((fdi) => {
    const t = layout.find((p) => p.fdi === fdi)!
    const spec = specOf(fdi)
    const shape = shapeOf(fdi)
    const neck = toWorld(t.matrix, [0, 0, 0])
    const deepest = Math.min(...shellOf(fdi).apices.map((a) => up * toWorld(t.matrix, a)[1]))
    // Gum line about 1 mm toward the biting edge from the junction, on the facial and lingual sides.
    const facialCej = up * toWorld(t.matrix, shape.wallPoint(Math.PI / 2, 0))[1]
    const lingualCej = up * toWorld(t.matrix, shape.wallPoint(-Math.PI / 2, 0))[1]
    // How far the roots reach toward the cheek and the tongue below the neck (an upper molar's palatal root flares).
    const shell = toothShell(fdi)
    let fr = 0
    let lr = 0
    for (let i = 0; i < shell.positions.length; i += 3) {
      if (shell.positions[i + 1] > -3) continue
      fr = Math.max(fr, shell.positions[i + 2])
      lr = Math.max(lr, -shell.positions[i + 2])
    }
    return {
      fr,
      lr,
      neck,
      half: spec.md / 2,
      f: shape.wallRadius(Math.PI / 2, 0.08) + 0.35,
      l: shape.wallRadius(-Math.PI / 2, 0.08) + 0.35,
      mF: facialCej + 1.1,
      mL: lingualCej + 1.1,
      papilla: spec.position <= 3 ? 3.6 : 2.6,
      deep: deepest - 3,
    }
  })
  // The centre line through the necks, a little past the last molars at both ends.
  const pts = teeth.map((t) => [t.neck[0], t.neck[2]] as [number, number])
  const ext = (a: [number, number], b: [number, number]): [number, number] => {
    const d = Math.hypot(a[0] - b[0], a[1] - b[1])
    return [a[0] + ((a[0] - b[0]) / d) * 7.5, a[1] + ((a[1] - b[1]) / d) * 7.5]
  }
  const line = spline2([ext(pts[0], pts[1]), ...pts, ext(pts[pts.length - 1], pts[pts.length - 2])], false, 12)
  const stationCount = 210
  const { pts: stations, at } = resample(line, stationCount, false)
  // Each tooth's place along the line.
  const toothAt = teeth.map((t) => {
    let best = 0
    for (let i = 1; i < stationCount; i++) if (Math.hypot(stations[i][0] - t.neck[0], stations[i][1] - t.neck[2]) < Math.hypot(stations[best][0] - t.neck[0], stations[best][1] - t.neck[2])) best = i
    return at[best]
  })
  const blended = (a: number, pick: (t: (typeof teeth)[number]) => number) => {
    let sum = 0
    let weight = 0
    teeth.forEach((t, i) => {
      const w = bell(a - toothAt[i], t.half * 1.2) + 1e-9
      sum += w * pick(t)
      weight += w
    })
    return sum / weight
  }
  // The gum line: each tooth's neck sits in a bowl that rises to a papilla between it and its neighbours. A soft
  // minimum joins the bowls, so the papillae come to rounded points rather than creases.
  const scallop = (a: number, side: 'mF' | 'mL') => {
    const heights = teeth.map((t, i) => t[side] + (side === 'mF' ? 1 : 0.85) * t.papilla * Math.min(Math.abs(a - toothAt[i]) / t.half, 1.3) ** 2.4)
    const m = Math.min(...heights)
    return m - 0.3 * Math.log(heights.reduce((sum, h) => sum + Math.exp(-(h - m) / 0.3), 0))
  }
  // The jaw's lower edge: below every root tip, then smoothed along the arch so it reads as one rounded body.
  const envelope = at.map((a) => Math.min(...teeth.map((t, i) => t.deep + 2.5 * ((a - toothAt[i]) / 18) ** 2)))
  const deepAt = envelope.map((_, k) => {
    let sum = 0
    let n = 0
    for (let j = 0; j < stationCount; j++) {
      if (Math.abs(at[j] - at[k]) > 10) continue
      sum += envelope[j]
      n++
    }
    return sum / n - 0.6
  })
  /* Each section is a closed curve through 16 control points, sampled at fixed places on the curve, so a point keeps its
     place from one section to the next and the walls stay smooth along the arch: the gum line's bumps stay at the top. */
  const PER = 3
  const CONTROLS = 16
  const SECTION = CONTROLS * PER
  const BOTTOM = 8 * PER
  const sections: Vec3[][] = []
  const depths: number[][] = []
  const vAround: number[][] = []
  for (let k = 0; k < stationCount; k++) {
    const [px, pz] = stations[k]
    const [qx, qz] = stations[Math.min(k + 1, stationCount - 1)]
    const [ox, oz] = stations[Math.max(k - 1, 0)]
    const tl = Math.hypot(qx - ox, qz - oz)
    const nx = (qz - oz) / tl
    const nz = -(qx - ox) / tl
    const a = at[k]
    const f = blended(a, (t) => t.f)
    const l = blended(a, (t) => t.l)
    const fr = blended(a, (t) => t.fr)
    const lr = blended(a, (t) => t.lr)
    const gF = scallop(a, 'mF')
    const gL = scallop(a, 'mL')
    const deep = deepAt[k]
    const mid = (l - f) / 2
    const between = smooth(0.6, 1, Math.min(...teeth.map((t, i) => Math.abs(a - toothAt[i]) / t.half)))
    const top = Math.max(gF, gL) - 0.6 - 0.8 * between
    // A rounded alveolar body: gum lines hugging the neck, walls bulging a little over the roots, a rounded underside.
    const control: [number, number][] = [
      [mid, top],
      [-(f - 0.6), gF + 0.2],
      [-f, gF],
      [-(f + 0.75), gF - 1.1],
      [-(f + 1.5), gF - 4],
      [-(f + 1.9), lerp(gF, deep, 0.5)],
      [-Math.max(f + 1.4, fr + 1.4), lerp(gF, deep, 0.8)],
      [-Math.max(f * 0.45 + 0.6, fr + 0.9), deep + 0.8],
      [mid * 0.5, deep - 0.4],
      [Math.max(l * 0.45 + 0.6, lr + 0.9), deep + 0.8],
      [Math.max(l + 1.3, lr + 1.4), lerp(gL, deep, 0.8)],
      [Math.max(l + 1.7, lr + 1.2), lerp(gL, deep, 0.5)],
      [l + 1.3, gL - 4],
      [l + 0.7, gL - 1.1],
      [l, gL],
      [l - 0.6, gL + 0.2],
    ]
    // Past the last teeth the body rounds off toward the middle of its section.
    const endFade = Math.min(smooth(0, 5, a), smooth(0, 5, at[stationCount - 1] - a))
    const cy = (top + deep) / 2
    const closed = control.map(([w, h]) => [mid + (w - mid) * (0.25 + 0.75 * endFade), cy + (h - cy) * (0.35 + 0.65 * endFade)] as [number, number])
    const section = spline2(closed, true, PER)
    sections.push(section.map(([w, h]) => [px + w * nx, up * h, pz + w * nz]))
    depths.push(section.map(([, h]) => Math.max(0, Math.max(gF, gL) - h)))
    // Around the section, measured both ways from the underside, so the grid's long lines run evenly along the walls.
    const around = [0]
    for (let i = 1; i <= SECTION; i++) around.push(around[i - 1] + Math.hypot(section[i % SECTION][0] - section[i - 1][0], section[i % SECTION][1] - section[i - 1][1]))
    vAround.push(around.map((v) => v - around[BOTTOM]))
  }
  // Along the arch, each long line measures its own length from the middle of the mouth, so cells stay even on the
  // outer and inner walls alike.
  const middle = Math.floor(stationCount / 2)
  const uAlong: number[][] = sections.map(() => new Array(SECTION).fill(0))
  for (let k = middle + 1; k < stationCount; k++) for (let i = 0; i < SECTION; i++) uAlong[k][i] = uAlong[k - 1][i] + length(sub(sections[k][i], sections[k - 1][i]))
  for (let k = middle - 1; k >= 0; k--) for (let i = 0; i < SECTION; i++) uAlong[k][i] = uAlong[k + 1][i] - length(sub(sections[k][i], sections[k + 1][i]))
  const parts: Part[] = []
  const body = newPart()
  for (let k = 0; k < stationCount; k++) {
    for (let i = 0; i <= SECTION; i++) {
      const p = sections[k][i % SECTION]
      body.positions.push(...p)
      body.grid.push(uAlong[k][i % SECTION], vAround[k][i], depths[k][i % SECTION])
    }
  }
  const rowSize = SECTION + 1
  for (let k = 0; k < stationCount - 1; k++) {
    for (let i = 0; i < SECTION; i++) {
      const a = k * rowSize + i
      const b = a + 1
      const c = a + rowSize
      const d = c + 1
      if (up > 0) body.indices.push(a, b, c, b, d, c)
      else body.indices.push(a, c, b, b, c, d)
    }
  }
  // Caps at both ends.
  for (const [k, outward] of [[0, -1], [stationCount - 1, 1]] as const) {
    const ring = sections[k]
    const centre = scale(ring.reduce((s2, p) => add(s2, p), [0, 0, 0] as Vec3), 1 / SECTION)
    const start = body.positions.length / 3
    body.positions.push(...centre)
    body.grid.push(uAlong[k][0], 0, 6)
    for (let i = 0; i < SECTION; i++) {
      const a = k * rowSize + i
      if ((outward > 0) === up > 0) body.indices.push(a, a + 1, start)
      else body.indices.push(a, start, a + 1)
    }
  }
  parts.push(body)
  const mesh = finish(parts)
  gums.set(arch, mesh)
  return mesh
}
