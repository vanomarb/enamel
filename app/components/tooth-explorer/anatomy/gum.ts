import { ROWS, type Arch } from '../arch.ts'
import { add, bell, cross, lerp, length, resample, scale, smooth, spline2, sub, type Vec3 } from './maths.ts'
import { CELL, finish, newPart, type MeshData, type Part } from './mesh.ts'
import { specOf } from './specs.ts'
import { shapeOf, shellOf, toothShell } from './tooth.ts'
import { archLayout, toWorld } from './layout.ts'

/* The gum and jaw bone around each arch's roots: one translucent body, scalloped at the gum line. Inside the arch it
   carries on as the roof of the mouth over the upper teeth, and as a filled, gently domed floor inside the lower.

   Only the gum line itself is drawn tooth by tooth. Everything under it is smoothed along the arch over about 12 mm, so
   the walls read as one calm surface, and the grid's long lines keep to one height up the walls, running level like
   the courses of a wall. */

/** Where the inside of the arch meets the gum's tongue side: a point per station, with each station's place along the
    arch in mm. */
export interface GumInside {
  at: number[]
  points: Vec3[]
}

const gums = new Map<Arch, { mesh: MeshData; inside: GumInside }>()

/**
 * One jaw's gum and bone as a closed, rounded horseshoe around the roots. Its top follows each tooth's neck with a
 * scalloped gum line, rising to a papilla between teeth.
 */
export const gumMesh = (arch: Arch): MeshData => gumOf(arch).mesh

/** The line the roof (upper) or the floor (lower) hangs from, along the gum's tongue side. */
export const gumInside = (arch: Arch): GumInside => gumOf(arch).inside

function gumOf(arch: Arch): { mesh: MeshData; inside: GumInside } {
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
  const last = stationCount - 1
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
  /** Station values smoothed along the arch: a bell about reach mm across each way, about a 12 mm moving average. */
  const calm = (values: number[], reach = 5.5) =>
    values.map((_, k) => {
      let sum = 0
      let weight = 0
      for (let j = 0; j < stationCount; j++) {
        const d = (at[j] - at[k]) / reach
        if (d * d > 9) continue
        const w = Math.exp(-d * d)
        sum += w * values[j]
        weight += w
      }
      return sum / weight
    })
  // The gum line: each tooth's neck sits in a bowl that rises to a papilla between it and its neighbours. A soft
  // minimum joins the bowls, so the papillae come to rounded points rather than creases.
  const scallop = (a: number, side: 'mF' | 'mL') => {
    const heights = teeth.map((t, i) => t[side] + (side === 'mF' ? 1 : 0.85) * t.papilla * Math.min(Math.abs(a - toothAt[i]) / t.half, 1.3) ** 2.4)
    const m = Math.min(...heights)
    return m - 0.35 * Math.log(heights.reduce((sum, h) => sum + Math.exp(-(h - m) / 0.35), 0))
  }
  const gF = at.map((a) => scallop(a, 'mF'))
  const gL = at.map((a) => scallop(a, 'mL'))
  // At the gum line the body hugs each tooth's neck; a few mm down, its walls and gum lines are smoothed along the arch,
  // with at most a faint swell over a long root.
  const fNeck = at.map((a) => blended(a, (t) => t.f))
  const lNeck = at.map((a) => blended(a, (t) => t.l))
  const frRaw = at.map((a) => blended(a, (t) => t.fr))
  const lrRaw = at.map((a) => blended(a, (t) => t.lr))
  const f = calm(fNeck)
  const l = calm(lNeck)
  const gFs = calm(gF)
  const gLs = calm(gL)
  const swellF = calm(fNeck.map((x, k) => Math.max(x + 1.4, frRaw[k] + 1.4)))
  const footF = calm(fNeck.map((x, k) => Math.max(x * 0.45 + 0.6, frRaw[k] + 0.9)))
  const swellL = calm(lNeck.map((x, k) => Math.max(x + 1.3, lrRaw[k] + 1.4)))
  const swellL2 = calm(lNeck.map((x, k) => Math.max(x + 1.7, lrRaw[k] + 1.2)))
  const footL = calm(lNeck.map((x, k) => Math.max(x * 0.45 + 0.6, lrRaw[k] + 0.9)))
  // The jaw's lower edge: below every root tip, then smoothed along the arch so it reads as one rounded body.
  const deepAt = calm(at.map((a) => Math.min(...teeth.map((t, i) => t.deep + 2.5 * ((a - toothAt[i]) / 18) ** 2))), 7).map((d) => d - 0.6)
  // The inside hangs from a line a little under the tongue-side gum line's lowest points, smoothed so that the papillae
  // above it throw no ridges across the roof or floor.
  const valley = at.map((a) => {
    let low = Infinity
    for (let j = 0; j < stationCount; j++) if (Math.abs(at[j] - a) <= 6) low = Math.min(low, gL[j])
    return low
  })
  const hang = calm(valley, 4).map((h) => h - (arch === 'upper' ? 0.9 : 0.5))
  // Past the last teeth the body rounds off toward the middle of its section; the inside stops where that begins.
  const endFade = at.map((a) => Math.min(smooth(0, 5, a), smooth(0, 5, at[last] - a)))

  /* Each section is a closed curve through 16 control points, sampled at fixed places on the curve, so a point keeps its
     place from one section to the next and the walls stay smooth along the arch: the gum line's bumps stay at the top. */
  const PER = 4
  const CONTROLS = 16
  const SECTION = CONTROLS * PER
  const BOTTOM = 8 * PER
  // The facial and lingual walls about 4 mm under the gum line, where the grid's level lines are pinned.
  const FACIAL = 4 * PER
  const LINGUAL = 12 * PER
  const frames: { px: number; pz: number; nx: number; nz: number }[] = []
  const flats: [number, number][][] = []
  for (let k = 0; k < stationCount; k++) {
    const [px, pz] = stations[k]
    const [qx, qz] = stations[Math.min(k + 1, last)]
    const [ox, oz] = stations[Math.max(k - 1, 0)]
    const tl = Math.hypot(qx - ox, qz - oz)
    frames.push({ px, pz, nx: (qz - oz) / tl, nz: -(qx - ox) / tl })
    const a = at[k]
    const deep = deepAt[k]
    const mid = (l[k] - f[k]) / 2
    const between = smooth(0.6, 1, Math.min(...teeth.map((t, i) => Math.abs(a - toothAt[i]) / t.half)))
    const top = Math.max(gF[k], gL[k]) - 0.6 - 0.8 * between
    // A rounded alveolar body: gum lines hugging the neck, walls bulging a little over the roots, a rounded underside.
    const control: [number, number][] = [
      [mid, top],
      [-(fNeck[k] - 0.6), gF[k] + 0.2],
      [-fNeck[k], gF[k]],
      [-(lerp(fNeck[k], f[k], 0.5) + 0.75), gF[k] - 1.1],
      [-(f[k] + 1.5), gFs[k] - 4],
      [-(f[k] + 1.9), lerp(gFs[k], deep, 0.5)],
      [-swellF[k], lerp(gFs[k], deep, 0.8)],
      [-footF[k], deep + 0.8],
      [mid * 0.5, deep - 0.4],
      [footL[k], deep + 0.8],
      [swellL[k], lerp(gLs[k], deep, 0.8)],
      [swellL2[k], lerp(gLs[k], deep, 0.5)],
      [l[k] + 1.3, gLs[k] - 4],
      [lerp(lNeck[k], l[k], 0.5) + 0.7, gL[k] - 1.1],
      [lNeck[k], gL[k]],
      [lNeck[k] - 0.6, gL[k] + 0.2],
    ]
    const cy = (top + deep) / 2
    const closed = control.map(([w, h]) => [mid + (w - mid) * (0.25 + 0.75 * endFade[k]), cy + (h - cy) * (0.35 + 0.65 * endFade[k])] as [number, number])
    flats.push(loop(closed, PER))
  }

  /* The grid's long lines. Up the walls v is height, so each line keeps to one level all the way round the arch; under the
     jaw, where the body is nearly flat, and over the rolled lip at the gum line, it is length round the section, so the
     cells stay square. The two walls' levels are pinned to the same heights: the tongue side's lower wall, hidden behind
     the roof or under the floor, takes up the difference. */
  const FOOT = 9 * PER
  const steps = flats.map((section) =>
    section.map((_, i) => {
      const [w0, h0] = section[(i + SECTION - 1) % SECTION]
      const [w1, h1] = section[i]
      const ds = Math.hypot(w1 - w0, h1 - h0)
      const dh = Math.abs(h1 - h0)
      const wall = smooth(0.45, 0.75, dh / (ds || 1))
      return { ds, dv: wall * dh + (1 - wall) * ds }
    }),
  )
  const sum = (k: number, from: number, to: number) => {
    let total = 0
    for (let i = from + 1; i <= to; i++) total += steps[k][i].dv
    return total
  }
  // The levels' offset, chosen so the tongue side's lower wall is stretched as little as possible on average.
  let offset = 0
  let full = 0
  for (let k = 0; k < stationCount; k++) {
    if (endFade[k] < 1) continue
    offset += (sum(k, FACIAL, LINGUAL) - flats[k][FACIAL][1] - flats[k][LINGUAL][1]) / 2
    full++
  }
  offset /= full
  const vAround: number[][] = []
  const depths: number[][] = []
  for (let k = 0; k < stationCount; k++) {
    const section = flats[k]
    const step = steps[k]
    const level = new Array<number>(SECTION + 1)
    level[FACIAL] = -section[FACIAL][1] - offset
    for (let i = FACIAL; i > 0; i--) level[i - 1] = level[i] - step[i].dv
    for (let i = FACIAL + 1; i <= FOOT; i++) level[i] = level[i - 1] + step[i].dv
    const stretch = (section[LINGUAL][1] + offset - level[FOOT]) / sum(k, FOOT, LINGUAL)
    for (let i = FOOT + 1; i <= LINGUAL; i++) level[i] = level[i - 1] + stretch * step[i].dv
    for (let i = LINGUAL + 1; i <= SECTION; i++) level[i] = level[i - 1] + step[i % SECTION].dv
    // Where the body rounds off past the last teeth, the lines ease back to plain length round the section.
    const around = [0]
    for (let i = 1; i <= SECTION; i++) around.push(around[i - 1] + step[i % SECTION].ds)
    vAround.push(level.map((v, i) => lerp(around[i] - around[BOTTOM], v, endFade[k])))
    const gum = Math.max(gFs[k], gLs[k])
    depths.push(section.map(([, h]) => Math.max(0, gum - h)))
  }
  const world = (k: number, [w, h]: [number, number]): Vec3 => [frames[k].px + w * frames[k].nx, up * h, frames[k].pz + w * frames[k].nz]
  const sections = flats.map((section, k) => section.map((p) => world(k, p)))

  // Where the roof (upper) or the floor (lower) carries on from the gum's tongue side: on the wall itself, at the height
  // it hangs from, from where the body starts to round off at one end to the same place at the other.
  const inside: GumInside = { at: [], points: [] }
  for (let k = 0; k < stationCount; k++) {
    if (endFade[k] < 1) continue
    const section = flats[k]
    let p: [number, number] = section[14 * PER]
    for (let i = 14 * PER; i > BOTTOM; i--) {
      const [w0, h0] = section[i - 1]
      const [w1, h1] = section[i]
      if (h0 > hang[k] || h1 < hang[k]) continue
      p = [lerp(w0, w1, (hang[k] - h0) / (h1 - h0 || 1)), hang[k]]
      break
    }
    inside.at.push(at[k])
    inside.points.push(world(k, p))
  }

  // Along the arch, each long line measures its own length from the middle of the mouth, seen from above (so the
  // papillae's rise and fall does not bend the lines across), and cells stay even on the outer and inner walls alike.
  const middle = Math.floor(stationCount / 2)
  const uAlong: number[][] = sections.map(() => new Array(SECTION).fill(0))
  const flatGap = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[2] - q[2])
  for (let k = middle + 1; k < stationCount; k++) for (let i = 0; i < SECTION; i++) uAlong[k][i] = uAlong[k - 1][i] + flatGap(sections[k][i], sections[k - 1][i])
  for (let k = middle - 1; k >= 0; k--) for (let i = 0; i < SECTION; i++) uAlong[k][i] = uAlong[k + 1][i] - flatGap(sections[k][i], sections[k + 1][i])
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
  for (const [k, outward] of [[0, -1], [last, 1]] as const) {
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
  parts.push(innerPlate(inside.points, up, arch === 'upper' ? { depth: 0.38, most: 13, thick: 3, rise: false, power: 0.8 } : { depth: 0.1, most: 3, thick: 12, rise: true, power: 1 }))
  const built = { mesh: finish(parts), inside }
  gums.set(arch, built)
  return built
}

/** Centripetal Catmull-Rom round a closed loop, per points to a segment. Unlike the even kind it never overshoots where a
    short segment meets a long one, so the roll at the gum line stays clean whatever the papilla does below it. */
function loop(points: [number, number][], per: number): [number, number][] {
  const n = points.length
  const out: [number, number][] = []
  const get = (i: number) => points[((i % n) + n) % n]
  const knot = (a: [number, number], b: [number, number]) => Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]) ** 0.5, 1e-4)
  const towards = (a: [number, number], b: [number, number], ta: number, tb: number, t: number): [number, number] => {
    const s = (t - ta) / (tb - ta)
    return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s]
  }
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [get(i - 1), get(i), get(i + 1), get(i + 2)]
    const t1 = knot(p0, p1)
    const t2 = t1 + knot(p1, p2)
    const t3 = t2 + knot(p2, p3)
    for (let s = 0; s < per; s++) {
      const t = t1 + ((t2 - t1) * s) / per
      const a1 = towards(p0, p1, 0, t1, t)
      const a2 = towards(p1, p2, t1, t2, t)
      const a3 = towards(p2, p3, t2, t3, t)
      out.push(towards(towards(a1, a2, 0, t2, t), towards(a2, a3, t1, t3, t), t1, t2, t))
    }
  }
  return out
}

/**
 * The inside of the arch: a body from each station's tongue-side point to its partner across the mouth, from behind the
 * last molars to behind the front teeth. Its mouth side vaults away from the bite (the roof) or domes gently toward it
 * (the floor) by a share of the width (depth, at most most mm), in a smooth sine profile raised to power; it is thick mm
 * through at the middle. The two faces meet along the gum and are closed at both ends.
 */
function innerPlate(inner: Vec3[], up: number, vault: { depth: number; most: number; thick: number; rise: boolean; power: number }): Part {
  const plate = newPart()
  const last = inner.length - 1
  const rows = Math.floor(inner.length / 2)
  const ACROSS = 28
  const away: Vec3 = [0, -up, 0]
  const oral: Vec3[][] = []
  const nasal: Vec3[][] = []
  const across: number[][] = []
  const middles: Vec3[] = []
  // Over its last 12 mm the vault eases down toward the gum and thins, so its back edge is a low lip rather than a cliff.
  let fromBack = 0
  for (let r = 0; r < rows; r++) {
    const a = inner[r]
    const b = inner[last - r]
    if (r > 0) fromBack += length(sub(a, inner[r - 1]))
    const ease = smooth(0, 12, fromBack)
    const width = length(sub(b, a))
    const sink = Math.min(vault.most, vault.depth * width) * (vault.rise ? -1 : 1) * (0.12 + 0.88 * ease)
    const thick = Math.min(vault.thick, 0.15 * width) * (0.3 + 0.7 * ease)
    const row: Vec3[] = []
    const back: Vec3[] = []
    for (let i = 0; i <= ACROSS; i++) {
      const v = i / ACROSS
      const bulge = Math.sin(Math.PI * v)
      const p = add(lerp3(a, b, v), scale(away, sink * bulge ** vault.power))
      row.push(p)
      back.push(add(p, scale(away, thick * bulge)))
    }
    oral.push(row)
    nasal.push(back)
    const s = [0]
    for (let i = 1; i <= ACROSS; i++) s.push(s[i - 1] + length(sub(row[i], row[i - 1])))
    across.push(s.map((x) => x - s[ACROSS] / 2))
    middles.push(row[ACROSS / 2])
  }
  // Along the plate from the front teeth backward, in mm.
  const along = new Array(rows).fill(0)
  for (let r = rows - 2; r >= 0; r--) along[r] = along[r + 1] + length(sub(middles[r], middles[r + 1]))
  const index = (sheet: 'oral' | 'nasal', r: number, i: number) => (sheet === 'nasal' && i > 0 && i < ACROSS ? rows * (ACROSS + 1) + r * (ACROSS - 1) + i - 1 : r * (ACROSS + 1) + i)
  for (let r = 0; r < rows; r++) for (let i = 0; i <= ACROSS; i++) {
    plate.positions.push(...oral[r][i])
    plate.grid.push(along[r], across[r][i], 1.5)
  }
  // The far face, seen only through the mouth side or the gum, carries no grid (its coordinates sit between lines), so
  // the inside never shows two grids crossing, and keeps the gum's own colour, so it never reads as a dark band through
  // the gaps between the front teeth.
  for (let r = 0; r < rows; r++) for (let i = 1; i < ACROSS; i++) {
    plate.positions.push(...nasal[r][i])
    plate.grid.push(CELL / 2, CELL / 2, 1.5)
  }
  const at = (n: number): Vec3 => [plate.positions[3 * n], plate.positions[3 * n + 1], plate.positions[3 * n + 2]]
  const emitted = new Set<string>()
  const emit = (tris: [number, number, number][], flip: boolean) => {
    for (const [x, y, z] of tris) {
      if (x === y || y === z || x === z) continue
      const tri = flip ? [x, z, y] : [x, y, z]
      plate.indices.push(...tri)
      for (let e = 0; e < 3; e++) emitted.add(`${tri[e]}>${tri[(e + 1) % 3]}`)
    }
  }
  const sheetTris = (sheet: 'oral' | 'nasal') => {
    const tris: [number, number, number][] = []
    for (let r = 0; r < rows - 1; r++) for (let i = 0; i < ACROSS; i++) {
      const p = index(sheet, r, i)
      const q = index(sheet, r, i + 1)
      const s = index(sheet, r + 1, i)
      const u = index(sheet, r + 1, i + 1)
      tris.push([p, q, s], [q, u, s])
    }
    return tris
  }
  // The mouth side faces the bite; which way that winds is read off a triangle in the middle of the plate. The other face
  // and the closing strips wind against what is already there, so every edge is shared both ways.
  const oralTris = sheetTris('oral')
  const [a, b, c] = oralTris[(Math.floor(rows / 2) * ACROSS + ACROSS / 2) * 2]
  const oralFlip = dot(cross(sub(at(b), at(a)), sub(at(c), at(a))), away) > 0
  emit(oralTris, oralFlip)
  emit(sheetTris('nasal'), !oralFlip)
  for (const r of [0, rows - 1]) {
    const tris: [number, number, number][] = []
    for (let i = 0; i < ACROSS; i++) {
      const o0 = index('oral', r, i)
      const o1 = index('oral', r, i + 1)
      const n0 = index('nasal', r, i)
      const n1 = index('nasal', r, i + 1)
      tris.push([o0, o1, n0], [o1, n1, n0])
    }
    emit(tris, emitted.has(`${index('oral', r, ACROSS / 2)}>${index('oral', r, ACROSS / 2 + 1)}`))
  }
  return plate
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
