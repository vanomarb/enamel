import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TEETH } from '../../lib/teeth.ts'
import { archLayout, canalCount, gumMesh, rootCount, toWorld, toothApices, toothLandmarks, toothLayers, toothShell, toothSizes, type MeshData, type Vec3 } from './anatomy-model.ts'

const ALL = TEETH.map((t) => t.fdi)
/** One of each kind: left and right partners share a mesh, so the right side covers all 16 shapes. */
const KINDS = ALL.filter((fdi) => [1, 4].includes(Math.floor(fdi / 10)))

/* Textbook counts from the brief. Upper second premolars have one or two canals; the model gives the common one. */
const ROOTS: Record<string, number> = { upper1: 1, upper2: 1, upper3: 1, upper4: 2, upper5: 1, upper6: 3, upper7: 3, upper8: 3, lower1: 1, lower2: 1, lower3: 1, lower4: 1, lower5: 1, lower6: 2, lower7: 2, lower8: 2 }
const CANALS: Record<string, number[]> = { upper1: [1], upper2: [1], upper3: [1], upper4: [2], upper5: [1, 2], upper6: [4], upper7: [3], upper8: [2, 3, 4], lower1: [1, 2], lower2: [1, 2], lower3: [1], lower4: [1], lower5: [1], lower6: [3, 4], lower7: [3], lower8: [2, 3] }
const kindOf = (fdi: number) => `${Math.floor(fdi / 10) <= 2 ? 'upper' : 'lower'}${fdi % 10}`

const point = (m: MeshData, i: number): Vec3 => [m.positions[3 * i], m.positions[3 * i + 1], m.positions[3 * i + 2]]
const triangle = (m: MeshData, t: number): [Vec3, Vec3, Vec3] => [point(m, m.indices[t]), point(m, m.indices[t + 1]), point(m, m.indices[t + 2])]
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** Every edge, once vertices at the same place are merged, is shared by exactly two triangles running opposite ways. */
function assertClosed(m: MeshData, name: string): void {
  const ids = new Map<string, number>()
  const id = (i: number) => {
    const key = point(m, i).map((v) => Math.round(v * 1e4)).join(',')
    if (!ids.has(key)) ids.set(key, ids.size)
    return ids.get(key)!
  }
  const edges = new Map<string, number>()
  for (let t = 0; t < m.indices.length; t += 3) {
    const v = [id(m.indices[t]), id(m.indices[t + 1]), id(m.indices[t + 2])]
    if (new Set(v).size < 3) continue
    for (let e = 0; e < 3; e++) edges.set(`${v[e]}>${v[(e + 1) % 3]}`, (edges.get(`${v[e]}>${v[(e + 1) % 3]}`) ?? 0) + 1)
  }
  for (const [edge, n] of edges) {
    const [a, b] = edge.split('>')
    assert.ok(n === 1 && edges.get(`${b}>${a}`) === 1, `${name}: edge ${edge} is open or doubled`)
  }
  let volume = 0
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = triangle(m, t)
    volume += dot(a, cross(b, c)) / 6
  }
  assert.ok(volume > 0, `${name}: faces outward`)
}

/** Inside a closed mesh, by counting crossings along a ray. */
function inside(m: MeshData, p: Vec3): boolean {
  const d: Vec3 = [0.5773, 0.6123, 0.5401]
  let hits = 0
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = triangle(m, t)
    const e1 = sub(b, a)
    const e2 = sub(c, a)
    const h = cross(d, e2)
    const det = dot(e1, h)
    if (Math.abs(det) < 1e-12) continue
    const s = sub(p, a)
    const u = dot(s, h) / det
    if (u < 0 || u > 1) continue
    const q = cross(s, e1)
    const v = dot(d, q) / det
    if (v < 0 || u + v > 1) continue
    if (dot(e2, q) / det > 1e-9) hits++
  }
  return hits % 2 === 1
}

/** Distance from p to the nearest point of the mesh's surface. */
function surfaceDistance(m: MeshData, p: Vec3): number {
  let best = Infinity
  for (let t = 0; t < m.indices.length; t += 3) {
    const [a, b, c] = triangle(m, t)
    const n = cross(sub(b, a), sub(c, a))
    const area = Math.hypot(...n)
    if (area < 1e-12) continue
    // Project onto the plane; if the projection falls inside the triangle that is the distance, else the nearest edge.
    const k = dot(sub(p, a), n) / (area * area)
    const q = sub(p, [n[0] * k, n[1] * k, n[2] * k])
    const insideTri = [[a, b], [b, c], [c, a]].every(([x, y]) => dot(cross(sub(y, x), sub(q, x)), n) >= 0)
    if (insideTri) best = Math.min(best, Math.abs(k) * area)
    else {
      for (const [x, y] of [[a, b], [b, c], [c, a]]) {
        const e = sub(y, x)
        const f = Math.max(0, Math.min(1, dot(sub(p, x), e) / dot(e, e)))
        best = Math.min(best, Math.hypot(...sub(p, [x[0] + e[0] * f, x[1] + e[1] * f, x[2] + e[2] * f])))
      }
    }
  }
  return best
}

/** Separate pieces of the shell cut by the plane y = level: one per root below the furcation. */
function piecesAt(m: MeshData, level: number): number {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    while (parent.get(x) !== x) x = parent.get(x)!
    return x
  }
  const key = (i: number) => point(m, i).map((v) => Math.round(v * 1e4)).join(',')
  const crossing: string[][] = []
  for (let t = 0; t < m.indices.length; t += 3) {
    const ys = [0, 1, 2].map((k) => point(m, m.indices[t + k])[1])
    if (Math.min(...ys) < level && Math.max(...ys) > level) crossing.push([0, 1, 2].map((k) => key(m.indices[t + k])))
  }
  for (const tri of crossing) for (const v of tri) if (!parent.has(v)) parent.set(v, v)
  for (const [a, b, c] of crossing) {
    parent.set(find(b), find(a))
    parent.set(find(c), find(a))
  }
  return new Set([...parent.keys()].map(find)).size
}

test('all 32 teeth are placed, each once', () => {
  const layout = archLayout()
  assert.equal(layout.length, 32)
  assert.deepEqual(layout.map((t) => t.fdi).sort(), [...ALL].sort())
})

test('each tooth has the textbook number of roots, and of canals', () => {
  for (const fdi of ALL) {
    assert.equal(rootCount(fdi), ROOTS[kindOf(fdi)], `${fdi}: roots`)
    assert.ok(CANALS[kindOf(fdi)].includes(canalCount(fdi)), `${fdi}: ${canalCount(fdi)} canals`)
  }
  for (const fdi of KINDS) {
    // The shell really splits that many ways: cut it halfway between the furcation and the shortest root's tip.
    const apices = toothApices(fdi)
    assert.equal(apices.length, ROOTS[kindOf(fdi)], `${fdi}: one apex per root`)
    const shortest = Math.max(...apices.map((a) => a[1]))
    assert.equal(piecesAt(toothShell(fdi), shortest * 0.82), ROOTS[kindOf(fdi)], `${fdi}: pieces near the root tips`)
    assert.equal(toothLayers(fdi).canals, canalCount(fdi), `${fdi}: one tube per canal`)
  }
})

test('every shell and inside layer is closed and faces outward, within the triangle budget', () => {
  let scene = gumMesh('upper').indices.length / 3 + gumMesh('lower').indices.length / 3
  for (const fdi of ALL) {
    const shell = toothShell(fdi)
    const triangles = shell.indices.length / 3
    assert.ok(triangles >= 4000 && triangles <= 9000, `${fdi}: ${triangles} triangles`)
    scene += triangles
  }
  assert.ok(scene < 300_000, `the scene has ${scene} triangles`)
  for (const fdi of KINDS) {
    assertClosed(toothShell(fdi), `${fdi} shell`)
    const layers = toothLayers(fdi)
    assertClosed(layers.enamel, `${fdi} enamel`)
    assertClosed(layers.dentin, `${fdi} dentin`)
    assertClosed(layers.pulp, `${fdi} pulp`)
  }
  assertClosed(gumMesh('upper'), 'upper gum')
  assertClosed(gumMesh('lower'), 'lower gum')
})

test('the pulp sits inside the dentin, and the dentin inside the tooth', () => {
  for (const fdi of KINDS) {
    const shell = toothShell(fdi)
    const { dentin, pulp } = toothLayers(fdi)
    for (let i = 0; i < dentin.positions.length / 3; i += 23) assert.ok(inside(shell, point(dentin, i)), `${fdi}: dentin point ${point(dentin, i)} outside the tooth`)
    for (let i = 0; i < pulp.positions.length / 3; i += 13) assert.ok(inside(dentin, point(pulp, i)), `${fdi}: pulp point ${point(pulp, i)} outside the dentin`)
  }
})

test('landmarks lie on the surface, and every tooth names its apex and cementoenamel junction', () => {
  for (const fdi of KINDS) {
    const shell = toothShell(fdi)
    const marks = toothLandmarks(fdi)
    assert.ok(marks.some((m) => m.name === 'Cementoenamel junction' && m.line), `${fdi}: junction line`)
    assert.ok(marks.some((m) => /apex$/i.test(m.name)), `${fdi}: apex`)
    for (const mark of marks) {
      assert.ok(mark.name.length > 2 && /^[A-Z]/.test(mark.name), `${fdi}: plain name ${mark.name}`)
      const d = surfaceDistance(shell, mark.anchor)
      assert.ok(d <= 0.3, `${fdi}: ${mark.name} is ${d.toFixed(2)} mm off the surface`)
    }
  }
  const names = (fdi: number) => toothLandmarks(fdi).map((m) => m.name)
  assert.ok(names(16).includes('Mesiobuccal cusp') && names(16).includes('Cusp of Carabelli') && names(16).includes('Furcation'))
  assert.ok(names(46).includes('Distal cusp') && names(46).includes('Central groove'))
  assert.ok(names(11).includes('Incisal edge') && names(11).includes('Cingulum'))
  assert.ok(names(13).includes('Cusp tip') && names(13).includes('Mesial cusp ridge'))
})

test('crowns and roots match the textbook sizes within 10%', () => {
  for (const fdi of KINDS) {
    const { crownHeight, rootLength, md, bl } = toothSizes(fdi)
    const m = toothShell(fdi)
    const ys: number[] = []
    const crownX: number[] = []
    const crownZ: number[] = []
    for (let i = 0; i < m.positions.length / 3; i++) {
      const [x, y, z] = point(m, i)
      ys.push(y)
      if (y > 0) {
        crownX.push(x)
        crownZ.push(z)
      }
    }
    const near = (got: number, want: number, what: string) => assert.ok(Math.abs(got - want) <= want * 0.1, `${fdi}: ${what} ${got.toFixed(2)} for ${want}`)
    near(Math.max(...ys), crownHeight, 'crown height')
    near(-Math.min(...ys), rootLength, 'root length')
    near(Math.max(...crownX) - Math.min(...crownX), md, 'mesiodistal width')
    near(Math.max(...crownZ) - Math.min(...crownZ), bl, 'cheek-to-tongue width')
  }
})

/* Textbook root length over crown height (Wheeler-style averages): about 1.2 on upper central incisors, up to nearly 1.9
   on lower first molars. */
const RATIO: Record<string, number> = { upper1: 1.24, upper2: 1.44, upper3: 1.7, upper4: 1.65, upper5: 1.65, upper6: 1.71, upper7: 1.71, upper8: 1.69, lower1: 1.39, lower2: 1.47, lower3: 1.45, lower4: 1.65, lower5: 1.81, lower6: 1.87, lower7: 1.86, lower8: 1.57 }

test('each kind of tooth has its textbook crown-to-root proportion', () => {
  for (const fdi of KINDS) {
    const m = toothShell(fdi)
    let top = -Infinity
    let bottom = Infinity
    for (let i = 1; i < m.positions.length; i += 3) {
      top = Math.max(top, m.positions[i])
      bottom = Math.min(bottom, m.positions[i])
    }
    const ratio = -bottom / top
    const want = RATIO[kindOf(fdi)]
    assert.ok(Math.abs(ratio / want - 1) <= 0.12, `${fdi}: root ${(-bottom).toFixed(1)} over crown ${top.toFixed(1)} is ${ratio.toFixed(2)}, textbook ${want}`)
  }
})

test('the cementoenamel junction curves further toward the biting edge on front teeth than on molars', () => {
  // The junction's rise from its facial point to its highest proximal point, over the crown's half-width cheek to tongue.
  const curvature = (fdi: number) => {
    const cej = toothLandmarks(fdi).find((m) => m.name === 'Cementoenamel junction')!
    const rise = Math.max(...cej.line!.map((p) => p[1])) - cej.anchor[1]
    return rise / (toothSizes(fdi).bl / 2)
  }
  const incisors = [11, 12, 31, 32].map(curvature)
  const molars = [16, 17, 18, 36, 37, 38].map(curvature)
  assert.ok(Math.min(...incisors) > 2 * Math.max(...molars), `incisors ${incisors.map((c) => c.toFixed(2))}, molars ${molars.map((c) => c.toFixed(2))}`)
  for (const c of incisors) assert.ok(c > 0.6, `an incisor's junction rises ${c.toFixed(2)} of its half-width`)
  for (const c of molars) assert.ok(c < 0.3, `a molar's junction rises ${c.toFixed(2)} of its half-width`)
})

test('the arch is symmetric, with the patient’s right on the viewer’s left and the front teeth nearest', () => {
  const layout = archLayout()
  const at = (fdi: number) => toWorld(layout.find((t) => t.fdi === fdi)!.matrix, [0, 0, 0])
  for (const [right, left] of [[1, 2], [4, 3]]) {
    for (let p = 1; p <= 8; p++) {
      const r = at(right * 10 + p)
      const l = at(left * 10 + p)
      assert.ok(r[0] < 0 && l[0] > 0, `${right}${p} is on the viewer’s left`)
      assert.ok(Math.abs(r[0] + l[0]) < 1e-9 && Math.abs(r[1] - l[1]) < 1e-9 && Math.abs(r[2] - l[2]) < 1e-9, `${right}${p} mirrors ${left}${p}`)
    }
  }
  assert.ok(at(11)[2] > at(13)[2] && at(13)[2] > at(16)[2] && at(16)[2] > at(18)[2], 'front to back')
  // Upper crowns point down to the biting plane and lower ones up to it; the upper incisors sit in front (overjet).
  const tip = (fdi: number) => toWorld(layout.find((t) => t.fdi === fdi)!.matrix, [0, toothSizes(fdi).crownHeight, 0])
  assert.ok(at(11)[1] > tip(11)[1] && at(41)[1] < tip(41)[1])
  assert.ok(tip(11)[2] > tip(41)[2] + 1, 'overjet')
  // Right-side upper teeth and left-side lower teeth are mirror images of the shapes.
  for (const t of layout) assert.equal(t.mirrored, [1, 3].includes(Math.floor(t.fdi / 10)), `${t.fdi} handedness`)
})
